// ===== ADMIN REPORTS — Live Firestore Integration =====

const API_BASE = 'http://localhost:5000/api';
const REFRESH_MS = 8000;

// ── helpers ──────────────────────────────────────────────────────────────────

function esc(t) {
  if (t == null) return '';
  const m = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
  return String(t).replace(/[&<>"']/g, c => m[c]);
}

function relTime(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)  return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24)  return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function priorityClass(p) {
  const l = String(p || '').toLowerCase();
  if (l === 'high')   return 'report-priority-high';
  if (l === 'medium') return 'report-priority-medium';
  return 'report-priority-low';
}

function trustChip(score) {
  let n = Number(score ?? 0);
  if (n > 0 && n <= 1) n = Math.round(n * 100);
  if (n >= 85) return '<span class="admin-chip ok">'   + n + '%</span>';
  if (n >= 60) return '<span class="admin-chip warn">' + n + '%</span>';
  return '<span class="admin-chip danger">' + n + '%</span>';
}

function statusChip(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('verified') || s.includes('active'))  return '<span class="admin-chip ok">Verified</span>';
  if (s.includes('escalat'))  return '<span class="admin-chip danger">Escalated</span>';
  if (s.includes('assign'))   return '<span class="admin-chip ok">Assigned</span>';
  if (s.includes('pending'))  return '<span class="admin-chip warn">Pending</span>';
  return '<span class="admin-chip">' + esc(status || 'Pending') + '</span>';
}

// ── render ────────────────────────────────────────────────────────────────────

function renderReportsTable(incidents) {
  const wrap = document.getElementById('reports-table-wrap');
  if (!wrap) return;

  if (!incidents || !incidents.length) {
    wrap.innerHTML = '<p style="color:var(--white-dim);padding:24px 0;">No reports submitted yet.</p>';
    return;
  }

  const rows = incidents.map((inc, i) => {
    const shortId     = esc(inc.id ? '#' + inc.id.slice(-8).toUpperCase() : '#' + String(i + 1).padStart(4, '0'));
    const reporter    = esc(inc.reporter_name  || '—');
    const reporterEmail = esc(inc.reporter_email || '—');
    const title       = esc(inc.title || (inc.type ? inc.type + ' Report' : 'Incident Report'));
    const location    = esc(inc.location || '—');
    const time        = relTime(inc.createdAt);
    const priority    = esc(inc.priority || 'Low');
    const status      = inc.status || 'Pending';
    const score       = Number(inc.trust_score ?? 0);
    const description = esc(inc.description || '—');

    return `
      <tr>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--blue-bright)">${shortId}</td>
        <td>
          <div style="font-weight:600">${reporter}</div>
          <div style="font-size:11px;color:var(--white-dim)">${reporterEmail}</div>
        </td>
        <td>
          <div>${title}</div>
          <div style="font-size:11px;color:var(--white-dim);margin-top:3px">${description}</div>
        </td>
        <td>📍 ${location}</td>
        <td>${trustChip(score)}</td>
        <td><span class="${priorityClass(priority)}">${priority}</span></td>
        <td style="font-size:11px;color:var(--white-dim)">${time}</td>
        <td>${statusChip(status)}</td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Report ID</th>
          <th>Reporter</th>
          <th>Incident</th>
          <th>Location</th>
          <th>Trust Score</th>
          <th>Priority</th>
          <th>Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── loading / error states ────────────────────────────────────────────────────

function showLoading() {
  const wrap = document.getElementById('reports-table-wrap');
  if (wrap) wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;padding:32px;color:var(--white-dim);
                font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase">
      <div style="width:20px;height:20px;border:2px solid rgba(77,159,255,0.2);
                  border-top-color:var(--blue-bright);border-radius:50%;
                  animation:spin 0.8s linear infinite"></div>
      Loading reports from Firestore…
    </div>`;
}

// ── fetch & refresh ───────────────────────────────────────────────────────────

let firstLoad = true;

async function fetchReports() {
  if (firstLoad) { showLoading(); firstLoad = false; }
  try {
    const res = await fetch(API_BASE + '/incidents/all');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderReportsTable(Array.isArray(data) ? data : []);
  } catch (err) {
    console.warn('[Admin Reports] Fetch failed:', err.message);
  }
}

// ── init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  fetchReports();
  setInterval(fetchReports, REFRESH_MS);
});
