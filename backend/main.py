"""
Credit Risk Assessment — FastAPI Backend
=========================================
Run with:  uvicorn main:app --reload
API docs:  http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import os
from typing import Any

app = FastAPI(
    title="Credit Risk Assessment API",
    description="Predicts loan default risk using Random Forest trained on HMEQ dataset",
    version="2.0.0"
)

# ── CORS: allow the HTML frontend to call this API ──────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load saved models ────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(__file__)


def _is_numeric_string_encoder(enc: Any) -> bool:
    """Detect a mis-saved LabelEncoder that was fitted on stringified codes like '0','1',...'n'."""
    classes = getattr(enc, "classes_", None)
    if classes is None:
        return False
    try:
        # classes_ can contain numpy scalar strings (e.g. np.str_) which are not instances of `str`.
        return all(str(c).isdigit() for c in classes)
    except TypeError:
        return False


# Fallback mappings (used when encoders were saved with numeric-string classes)
REASON_TO_CODE = {
    "DebtCon": 0,
    "HomeImp": 1,
    "Unknown": 2,
}

JOB_TO_CODE = {
    "Mgr": 0,
    "Office": 1,
    "Other": 2,
    "ProfExe": 3,
    "Sales": 4,
    "Self": 5,
    "Unknown": 6,
}


def _encode_reason(value: str) -> int:
    v = (value or "").strip()
    if v.isdigit():
        return int(v)
    # tolerate UI-friendly labels
    aliases = {
        "Home Improvement": "HomeImp",
        "Debt Consolidation": "DebtCon",
    }
    v = aliases.get(v, v)
    if v not in REASON_TO_CODE:
        allowed = ", ".join(["HomeImp", "DebtCon"])
        raise HTTPException(status_code=422, detail=f"Invalid reason. Use one of: {allowed}")
    return REASON_TO_CODE[v]


def _encode_job(value: str) -> int:
    v = (value or "").strip()
    if v.isdigit():
        return int(v)
    aliases = {
        "Manager": "Mgr",
        "Professional / Executive": "ProfExe",
        "Self-Employed": "Self",
    }
    v = aliases.get(v, v)
    if v not in JOB_TO_CODE:
        allowed = ", ".join(["Mgr", "Office", "ProfExe", "Sales", "Self", "Other"])
        raise HTTPException(status_code=422, detail=f"Invalid job. Use one of: {allowed}")
    return JOB_TO_CODE[v]

try:
    best_rf   = joblib.load(os.path.join(BASE_DIR, "best_rf_model.pkl"))
    imputer   = joblib.load(os.path.join(BASE_DIR, "imputer.pkl"))
    le_reason = joblib.load(os.path.join(BASE_DIR, "le_reason.pkl"))
    le_job    = joblib.load(os.path.join(BASE_DIR, "le_job.pkl"))
    print("✅ Core models loaded (RF + imputer + encoders)")
except Exception as e:
    print(f"⚠️  Model loading error: {e}")
    print("   Make sure all 4 .pkl files are in the backend/ folder")
    best_rf = imputer = le_reason = le_job = None

# Optional: load Logistic Regression model + scaler for comparison
try:
    lr_model = joblib.load(os.path.join(BASE_DIR, "lr_model.pkl"))
    scaler   = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))
    print("✅ LR model + scaler loaded for comparison")
except Exception as e:
    print(f"ℹ️  LR model not loaded (optional): {e}")
    lr_model = scaler = None


# ── Request schema ───────────────────────────────────────────────────────────
class LoanApplication(BaseModel):
    loan:    float = Field(..., gt=0,  description="Loan amount requested (USD)")
    mortdue: float = Field(..., gt=0,  description="Amount due on existing mortgage (USD)")
    value:   float = Field(..., gt=0,  description="Current property value (USD)")
    reason:  str   = Field(...,        description="Loan reason: HomeImp or DebtCon")
    job:     str   = Field(...,        description="Job type: Mgr, Office, ProfExe, Sales, Self, Other")
    yoj:     float = Field(..., ge=0,  description="Years at current job")
    derog:   float = Field(..., ge=0,  description="Number of major derogatory reports")
    delinq:  float = Field(..., ge=0,  description="Number of delinquent credit lines")
    clage:   float = Field(..., ge=0,  description="Age of oldest credit line (months)")
    ninq:    float = Field(..., ge=0,  description="Number of recent credit inquiries")
    clno:    float = Field(..., ge=0,  description="Number of existing credit lines")
    debtinc: float = Field(..., ge=0,  description="Debt-to-income ratio (%)")

    class Config:
        json_schema_extra = {
            "example": {
                "loan": 15000, "mortdue": 80000, "value": 120000,
                "reason": "HomeImp", "job": "Mgr", "yoj": 7,
                "derog": 0, "delinq": 0, "clage": 180,
                "ninq": 2, "clno": 15, "debtinc": 25.0
            }
        }


# ── Response schema ──────────────────────────────────────────────────────────
class RiskResult(BaseModel):
    risk_score:       float
    risk_percent:     float
    risk_level:       str
    risk_color:       str
    decision:         str
    advice:           list[str]
    key_risk_factors: list[str]
    rf_score:         float
    lr_score:         float | None = None


# ── Helper: build advice and detect risk factors ─────────────────────────────
def build_advice(risk_prob: float, data: LoanApplication):
    factors = []

    if data.delinq >= 2:
        factors.append(f"High delinquencies ({int(data.delinq)} missed payments)")
    if data.derog >= 1:
        factors.append(f"Major derogatory records ({int(data.derog)})")
    if data.debtinc > 40:
        factors.append(f"High debt-to-income ratio ({data.debtinc:.1f}%)")
    if data.yoj < 2:
        factors.append(f"Short employment history ({data.yoj:.0f} years)")
    if data.ninq > 4:
        factors.append(f"Many recent credit inquiries ({int(data.ninq)})")
    equity = data.value - data.mortdue
    if equity < data.loan:
        factors.append(f"Low property equity (${equity:,.0f})")

    if risk_prob < 0.30:
        decision = "APPROVE"
        advice = [
            "Applicant shows strong repayment likelihood.",
            "Offer standard or preferential interest rate.",
            "Proceed with normal verification process.",
            "Consider loyalty rewards for long-term customers."
        ]
    elif risk_prob < 0.60:
        decision = "CONDITIONAL"
        advice = [
            "Approval recommended with extra conditions.",
            "Apply a higher interest rate to offset risk.",
            "Request additional collateral or a guarantor.",
            "Advise applicant to reduce existing debts.",
            "Schedule a 6-month review of repayment performance."
        ]
    else:
        decision = "DECLINE"
        advice = [
            "High default risk — do not approve at this time.",
            "Advise applicant to clear all delinquent accounts.",
            "Target debt-to-income ratio below 40% before re-applying.",
            "Build a clean credit history for at least 6–12 months.",
            "Consider a smaller loan amount after improvement.",
            "Re-evaluate application after financial situation improves."
        ]

    if not factors:
        factors = ["No major individual risk factors detected"]

    return decision, advice, factors


# ── Main prediction endpoint ─────────────────────────────────────────────────
@app.post("/predict", response_model=RiskResult)
def predict(application: LoanApplication):
    if best_rf is None:
        raise HTTPException(status_code=503, detail="Models not loaded. Check .pkl files in backend/ folder.")

    # Build dataframe from input
    df = pd.DataFrame([{
        "LOAN":    application.loan,
        "MORTDUE": application.mortdue,
        "VALUE":   application.value,
        "REASON":  application.reason,
        "JOB":     application.job,
        "YOJ":     application.yoj,
        "DEROG":   application.derog,
        "DELINQ":  application.delinq,
        "CLAGE":   application.clage,
        "NINQ":    application.ninq,
        "CLNO":    application.clno,
        "DEBTINC": application.debtinc,
    }])

    # Encode categorical columns
    # NOTE: Some provided encoder artifacts were saved after categories were already converted to
    # numeric-string codes (e.g. classes_ == ['0','1',...]). In that case, we accept the UI labels
    # and convert them to the expected codes.
    try:
        if le_reason is None or le_job is None:
            raise HTTPException(status_code=503, detail="Encoders not loaded. Check .pkl files in backend/ folder.")

        if _is_numeric_string_encoder(le_reason):
            df["REASON"] = df["REASON"].astype(str).map(_encode_reason)
        else:
            df["REASON"] = le_reason.transform(df["REASON"].astype(str))

        if _is_numeric_string_encoder(le_job):
            df["JOB"] = df["JOB"].astype(str).map(_encode_job)
        else:
            df["JOB"] = le_job.transform(df["JOB"].astype(str))
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid category value: {e}")

    # Impute missing values
    df_imputed = pd.DataFrame(imputer.transform(df), columns=df.columns)

    # Predict with Random Forest (primary model — trained on unscaled data)
    rf_prob = float(best_rf.predict_proba(df_imputed)[0][1])

    # Predict with Logistic Regression if available (trained on scaled data)
    lr_prob = None
    if lr_model is not None and scaler is not None:
        try:
            df_scaled = pd.DataFrame(scaler.transform(df_imputed), columns=df_imputed.columns)
            lr_prob = float(lr_model.predict_proba(df_scaled)[0][1])
        except Exception as e:
            print(f"⚠️  LR prediction failed: {e}")
            lr_prob = None

    # Determine risk level and color
    if rf_prob < 0.30:
        level = "Low Risk"
        color = "#1D9E75"
    elif rf_prob < 0.60:
        level = "Medium Risk"
        color = "#BA7517"
    else:
        level = "High Risk"
        color = "#E24B4A"

    decision, advice, factors = build_advice(rf_prob, application)

    return RiskResult(
        risk_score       = round(rf_prob, 4),
        risk_percent     = round(rf_prob * 100, 1),
        risk_level       = level,
        risk_color       = color,
        decision         = decision,
        advice           = advice,
        key_risk_factors = factors,
        rf_score         = round(rf_prob, 4),
        lr_score         = round(lr_prob, 4) if lr_prob is not None else None,
    )


# ── Health check endpoints ───────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Credit Risk Assessment API is running!", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": best_rf is not None}