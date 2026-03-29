# CreditIQ — Setup Guide
## Credit Risk Assessment Web App (FastAPI + HTML/CSS/JS)

---

## PROJECT FOLDER STRUCTURE

```
credit-risk-app/
│
├── backend/
│   ├── main.py                  ← FastAPI server
│   ├── requirements.txt         ← Python packages
│   ├── save_models_colab.py     ← Run this in Colab to export models
│   │
│   ├── best_rf_model.pkl        ← (you download from Colab)
│   ├── lr_model.pkl             ← (you download from Colab)
│   ├── scaler.pkl               ← (you download from Colab)
│   ├── imputer.pkl              ← (you download from Colab)
│   ├── le_reason.pkl            ← (you download from Colab)
│   └── le_job.pkl               ← (you download from Colab)
│
└── frontend/
    └── index.html               ← The full UI
```

---

## STEP 1 — Export Models from Google Colab

1. Open your existing Colab notebook
2. Add a new cell at the very end
3. Paste the entire contents of `save_models_colab.py`
4. Run the cell — it will auto-download 6 .pkl files to your computer
5. Move all 6 .pkl files into the `backend/` folder in VS Code

---

## STEP 2 — Set Up Python Environment in VS Code

Open VS Code terminal and run these commands one by one:

```bash
# Go into the backend folder
cd credit-risk-app/backend

# Create a virtual environment (keeps packages isolated)
python -m venv venv

# Activate it:
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install all required packages
pip install -r requirements.txt
```

You should see "(venv)" in your terminal prompt when it's active.

---

## STEP 3 — Start the FastAPI Server

While still inside `backend/` with venv active:

```bash
uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
✅ All models loaded successfully!
```

Test it by opening: http://127.0.0.1:8000/docs
(This is the automatic API documentation page FastAPI generates)

---

## STEP 4 — Open the Frontend

Simply open `frontend/index.html` directly in your browser:
- Double-click the file in VS Code Explorer, then click "Open with Live Server"
- OR right-click → Open with → Chrome/Firefox
- OR in VS Code: install the "Live Server" extension and click "Go Live"

The green "● API Online" badge at the top-right should appear if the backend is running.

---

## STEP 5 — Test the App

Fill in the form with a sample applicant:

| Field           | Low Risk Example | High Risk Example |
|-----------------|-----------------|------------------|
| Loan Amount     | 15000           | 45000            |
| Property Value  | 120000          | 95000            |
| Mortgage Owed   | 60000           | 90000            |
| Reason          | HomeImp         | DebtCon          |
| Job             | Manager         | Self-Employed    |
| Years at Job    | 9               | 1                |
| Delinquencies   | 0               | 5                |
| Derogatory      | 0               | 3                |
| Credit Inquiries| 1               | 8                |
| Credit Lines    | 15              | 4                |
| Oldest Credit   | 200             | 30               |
| Debt-to-Income  | 18              | 72               |

---

## COMMON ERRORS & FIXES

**"API Offline" badge showing**
→ The FastAPI server isn't running. Go to your terminal and run `uvicorn main:app --reload` inside the `backend/` folder.

**"Model loading error" in terminal**
→ The .pkl files are missing from the `backend/` folder. Run `save_models_colab.py` in Colab and re-download them.

**CORS error in browser console**
→ Already handled in main.py with `allow_origins=["*"]`. Make sure you're opening the HTML file directly (not from a different port).

**"Invalid category value" error**
→ The LabelEncoder was fitted on specific category strings. Make sure REASON is exactly "HomeImp" or "DebtCon" and JOB is exactly one of: Mgr, Office, ProfExe, Sales, Self, Other.

**Packages version mismatch warning**
→ The scikit-learn version used to train the model must match the one installed here. Check with `python -c "import sklearn; print(sklearn.__version__)"` in your Colab and in VS Code — they should match.

---

## HOW IT WORKS (end to end)

```
User fills form
     ↓
index.html (JavaScript)
     ↓  POST /predict  (JSON with 12 fields)
FastAPI server (main.py)
     ↓
Loads .pkl files → encode → impute → scale
     ↓
Random Forest → probability score
Logistic Regression → comparison score
     ↓
Returns: risk_score, risk_level, decision, advice, factors
     ↓
index.html renders gauge, bars, advice cards
```
