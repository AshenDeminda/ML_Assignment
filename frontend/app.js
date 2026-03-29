const API = 'http://127.0.0.1:8000';

// ── Check API status on load ─────────────────────────────
async function checkAPI() {
  const badge = document.getElementById('api-badge');
  try {
    const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      badge.textContent = '● API Online';
      badge.classList.remove('offline');
    } else throw new Error();
  } catch {
    badge.textContent = '● API Offline';
    badge.classList.add('offline');
  }
}
checkAPI();

// ── Gauge animation ──────────────────────────────────────
function setGauge(pct, color) {
  const fill = document.getElementById('gaugeFill');
  const totalLength = 283;
  const offset = totalLength - (totalLength * pct / 100);
  fill.style.strokeDashoffset = offset;
  fill.style.stroke = color;
}

// ── Render result ────────────────────────────────────────
function renderResult(data) {
  document.getElementById('resultEmpty').style.display = 'none';
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.classList.add('animate-in');

  // Gauge
  document.getElementById('gaugeLabel').textContent = `${data.risk_percent}%`;
  document.getElementById('gaugeLabel').style.color = data.risk_color;
  setTimeout(() => setGauge(data.risk_percent, data.risk_color), 100);

  // Risk badge
  const badge = document.getElementById('riskBadge');
  badge.textContent = data.risk_level;
  badge.style.background = data.risk_color + '18';
  badge.style.color = data.risk_color;
  badge.style.border = `1px solid ${data.risk_color}40`;

  // Decision box
  const decBox = document.getElementById('decisionBox');
  const decColors = { APPROVE: '#10b981', CONDITIONAL: '#f59e0b', DECLINE: '#ef4444' };
  const c = decColors[data.decision] || '#3b82f6';
  decBox.style.borderLeftColor = c;
  decBox.style.background = c + '0d';
  document.getElementById('decLabel').textContent = data.decision;
  document.getElementById('decLabel').style.color = c;
  const decTexts = {
    APPROVE: 'This applicant shows strong repayment likelihood. Recommend approval.',
    CONDITIONAL: 'Approval possible with additional conditions and higher interest rate.',
    DECLINE: 'Default risk is too high. Recommend declining at this time.'
  };
  document.getElementById('decText').textContent = decTexts[data.decision];

  // Comparison bars (backend may only return a single score)
  const rfScore = (typeof data.rf_score === 'number') ? data.rf_score : data.risk_score;
  const lrScore = (typeof data.lr_score === 'number') ? data.lr_score : null;

  document.getElementById('rfPct').textContent = (typeof rfScore === 'number')
    ? `${(rfScore * 100).toFixed(1)}%`
    : '—';

  const lrRow = document.getElementById('lrRow');
  if (lrScore === null) {
    lrRow.style.display = 'none';
  } else {
    lrRow.style.display = '';
    document.getElementById('lrPct').textContent = `${(lrScore * 100).toFixed(1)}%`;
  }

  setTimeout(() => {
    document.getElementById('rfBar').style.width = (typeof rfScore === 'number')
      ? `${rfScore * 100}%`
      : '0%';
    if (lrScore !== null) {
      document.getElementById('lrBar').style.width = `${lrScore * 100}%`;
    }
  }, 200);

  // Risk factors
  const fw = document.getElementById('factorsWrap');
  fw.innerHTML = '';
  data.key_risk_factors.forEach(f => {
    const tag = document.createElement('span');
    const isNone = f.toLowerCase().includes('no major');
    tag.className = 'factor-tag' + (isNone ? ' none' : '');
    tag.textContent = (isNone ? '✓ ' : '⚠ ') + f;
    fw.appendChild(tag);
  });

  // Advice
  const ul = document.getElementById('adviceList');
  ul.innerHTML = '';
  data.advice.forEach(a => {
    const li = document.createElement('li');
    li.textContent = a;
    ul.appendChild(li);
  });
}

// ── Show error in result panel ───────────────────────────
function showError(msg) {
  document.getElementById('resultEmpty').style.display = 'none';
  const card = document.getElementById('resultCard');
  card.style.display = 'block';
  card.innerHTML = `
    <div style="text-align:center;padding:40px 20px;color:#ef4444">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-weight:600;margin-bottom:6px">API Error</div>
      <div style="font-size:13px;color:#7c8ba1">${msg}</div>
      <div style="margin-top:16px;font-size:12px;color:#4b5563">Make sure uvicorn is running on port 8000</div>
    </div>`;
}

// ── Form submit ──────────────────────────────────────────
document.getElementById('riskForm').addEventListener('submit', async (e) => {
  e.preventDefault();

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

  // Loading state
  const btn = document.getElementById('submitBtn');
  const spinner = document.getElementById('spinner');
  btn.disabled = true;
  spinner.style.display = 'inline-block';
  btn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;vertical-align:middle"></span> Analysing…';

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

  try {
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
    btn.innerHTML = 'Assess Credit Risk';
  }
});

// ── Remove invalid class on input ────────────────────────
document.querySelectorAll('input,select').forEach(el => {
  el.addEventListener('input', () => el.classList.remove('invalid'));
});
