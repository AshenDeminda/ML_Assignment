const API = 'http://127.0.0.1:8000';

// ── Check API status ─────────────────────────────────────
async function checkAPI() {
  const badge = document.getElementById('api-badge');
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      badge.textContent = '';
      badge.innerHTML = '<span class="status-dot"></span> Online';
      badge.className = 'api-status online';
    } else throw new Error();
  } catch {
    badge.textContent = '';
    badge.innerHTML = '<span class="status-dot"></span> Offline';
    badge.className = 'api-status offline';
  }
}
checkAPI();

// ── Score ring animation ─────────────────────────────────
function setScore(pct, color) {
  const ring = document.getElementById('scoreRing');
  const circumference = 327; // 2 * PI * 52
  const offset = circumference - (circumference * pct / 100);
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = color;
}

// ── Render result ────────────────────────────────────────
function renderResult(data) {
  document.getElementById('resultEmpty').style.display = 'none';
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.className = 'animate-in';

  // Score ring
  const scoreVal = document.getElementById('scoreValue');
  scoreVal.textContent = `${data.risk_percent}%`;
  scoreVal.style.color = data.risk_color;
  setTimeout(() => setScore(data.risk_percent, data.risk_color), 100);

  // Risk pill
  const riskPill = document.getElementById('riskPill');
  riskPill.style.background = data.risk_color + '14';
  riskPill.style.color = data.risk_color;
  riskPill.querySelector('.pill-dot').style.background = data.risk_color;
  document.getElementById('riskText').textContent = data.risk_level;

  // Decision pill
  const decPill = document.getElementById('decisionPill');
  const decColors = { APPROVE: '#30d158', CONDITIONAL: '#ff9f0a', DECLINE: '#ff453a' };
  const dc = decColors[data.decision] || '#0a84ff';
  decPill.style.background = dc + '14';
  decPill.style.color = dc;
  document.getElementById('decisionText').textContent = data.decision;

  // Model comparison
  const rfScore = (typeof data.rf_score === 'number') ? data.rf_score : data.risk_score;
  const lrScore = (typeof data.lr_score === 'number') ? data.lr_score : null;

  const rfName = document.getElementById('rfName');
  const lrRow = document.getElementById('lrRow');

  if (lrScore !== null) {
    // For risk: lower score = better model at detecting safe applicants
    // The "BEST" badge goes on the model that is considered primary (RF, since it has higher AUC)
    rfName.innerHTML = 'Random Forest <span class="best-tag">PRIMARY</span>';
    lrRow.style.display = '';
    document.getElementById('lrName').textContent = 'Logistic Regression';
    document.getElementById('lrPct').textContent = `${(lrScore * 100).toFixed(1)}%`;
  } else {
    rfName.textContent = 'Random Forest';
    lrRow.style.display = 'none';
  }

  document.getElementById('rfPct').textContent = `${(rfScore * 100).toFixed(1)}%`;

  setTimeout(() => {
    document.getElementById('rfBar').style.width = `${rfScore * 100}%`;
    if (lrScore !== null) {
      document.getElementById('lrBar').style.width = `${lrScore * 100}%`;
    }
  }, 200);

  // Risk factors
  const fw = document.getElementById('factorsWrap');
  fw.innerHTML = '';
  data.key_risk_factors.forEach(f => {
    const tag = document.createElement('span');
    const isOk = f.toLowerCase().includes('no major');
    tag.className = 'factor-tag' + (isOk ? ' ok' : '');
    tag.textContent = f;
    fw.appendChild(tag);
  });

  // Advice
  const ul = document.getElementById('adviceList');
  ul.innerHTML = '';
  data.advice.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<svg class="advice-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>${a}`;
    ul.appendChild(li);
  });
}

// ── Show error ───────────────────────────────────────────
function showError(msg) {
  document.getElementById('resultCard').style.display = 'none';
  const empty = document.getElementById('resultEmpty');
  empty.style.display = 'flex';
  empty.innerHTML = `
    <div style="text-align:center">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ff453a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <div style="font-weight:600;color:#ff453a;margin-bottom:4px">Connection Error</div>
      <div style="font-size:12px;color:#6e6e73">${msg}</div>
      <div style="font-size:11px;color:#3a3a3c;margin-top:12px">Ensure the backend is running on port 8000</div>
    </div>`;
}

// ── Form submit ──────────────────────────────────────────
document.getElementById('riskForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  const get = id => document.getElementById(id).value;

  // Validate
  const fields = ['loan', 'value', 'mortdue', 'reason', 'job', 'yoj', 'delinq', 'derog', 'ninq', 'clno', 'clage', 'debtinc'];
  let valid = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el.value || el.value === '') {
      el.classList.add('invalid');
      valid = false;
    } else {
      el.classList.remove('invalid');
    }
  });
  if (!valid) return;

  // Loading
  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite"></span> Analysing…';

  try {
    const payload = {
      loan: parseFloat(get('loan')),
      mortdue: parseFloat(get('mortdue')),
      value: parseFloat(get('value')),
      reason: get('reason'),
      job: get('job'),
      yoj: parseFloat(get('yoj')),
      derog: parseFloat(get('derog')),
      delinq: parseFloat(get('delinq')),
      clage: parseFloat(get('clage')),
      ninq: parseFloat(get('ninq')),
      clno: parseFloat(get('clno')),
      debtinc: parseFloat(get('debtinc'))
    };

    const res = await fetch(`${API}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderResult(data);
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Assess Credit Risk';
  }
});

// ── Input helpers ────────────────────────────────────────
document.querySelectorAll('input,select').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('invalid'));
  if (el.tagName === 'INPUT') {
    el.addEventListener('focus', () => el.select());
  }
});

// ── Presets ───────────────────────────────────────────────
const PRESETS = {
  low:  { loan: 15000, value: 120000, mortdue: 60000, reason: 'HomeImp', job: 'Mgr',  yoj: 9, delinq: 0, derog: 0, ninq: 1, clno: 15, clage: 200, debtinc: 18 },
  high: { loan: 45000, value: 95000,  mortdue: 90000, reason: 'DebtCon', job: 'Self', yoj: 1, delinq: 5, derog: 3, ninq: 8, clno: 4,  clage: 30,  debtinc: 72 }
};

function fillPreset(type) {
  const data = PRESETS[type];
  Object.entries(data).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) { el.value = val; el.classList.remove('invalid'); }
  });
}

document.getElementById('presetLow').addEventListener('click', () => fillPreset('low'));
document.getElementById('presetHigh').addEventListener('click', () => fillPreset('high'));
