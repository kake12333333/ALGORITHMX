// ===== DASHBOARD FIREBASE INTEGRATION =====
// Fetches real-time incident data from the backend (Firestore) and
// drives the dashboard state + rendering declared in dashboard.html.

(function () {
  const API_BASE = 'http://localhost:5000/api';
  const REFRESH_INTERVAL = 6000; // 6 s polling
  const CACHE_DURATION   = 3000; // 3 s cache guard

  let lastFetchTime  = 0;
  let cachedRaw      = []; // raw API payloads
  let refreshTimer   = null;
  let isLoading      = false;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function escapeHtml(text) {
    if (text == null) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function getRelativeTime(ts) {
    if (!ts) return 'Unknown';
    const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (secs < 60)  return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  /**
   * Map the compact API shape (from toDashboardReport) to the shape
   * the dashboard UI expects.
   *
   * API fields (from incidentController.js → toDashboardReport):
   *   id, title, description, status ('verified'|'pending'), priority ('high'|'low'),
   *   createdAt, type, location, trust_score, reporter_name, reporter_email
   */
  function transformIncident(inc) {
    // --- status ---
    const rawStatus = String(inc.status || 'pending').toLowerCase();
    let verificationStatus = 'Pending';
    if (rawStatus.includes('verified'))  verificationStatus = 'Verified';
    else if (rawStatus.includes('suspicious')) verificationStatus = 'Suspicious';
    else if (rawStatus.includes('fake'))       verificationStatus = 'Fake';
    else if (rawStatus.includes('active'))     verificationStatus = 'Active';

    // Fallback: derive from trust_score when status is just 'pending'
    let trustScore = Number(inc.trust_score ?? 0);
    if (trustScore > 0 && trustScore <= 1.0) trustScore = Math.round(trustScore * 100);
    if (rawStatus === 'pending') {
      if (trustScore > 80)      verificationStatus = 'Verified';
      else if (trustScore >= 50) verificationStatus = 'Suspicious';
    }

    // --- priority ---
    const rawPriority = String(inc.priority || 'low').toLowerCase();
    let priorityLevel = 'Low';
    if (rawPriority.includes('high'))   priorityLevel = 'High';
    else if (rawPriority.includes('medium')) priorityLevel = 'Medium';

    // --- reporter name ---
    const userName =
      (inc.reporter_name && inc.reporter_name.trim()) ||
      (inc.type ? `${inc.type} Reporter` : 'Anonymous');

    // --- title ---
    const title = inc.title || (inc.type ? `${inc.type} Report` : 'Incident Report');

    return {
      id:                 inc.id,
      userName,
      title,
      description:        inc.description || '',
      location:           inc.location    || 'Location not specified',
      time:               getRelativeTime(inc.createdAt),
      createdAt:          inc.createdAt   || null,
      trustScore,
      verificationStatus,
      priorityLevel,
      type:               inc.type  || null,
      status:             verificationStatus,
      reportCount:        inc.report_count || 1,
    };
  }

  // ─── localStorage demo fallback ─────────────────────────────────────────────

  function getDemoIncidents() {
    try {
      const stored = localStorage.getItem('veriPulse_demo_incidents');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  function mergeWithDemo(apiIncidents) {
    const demos = getDemoIncidents();
    if (!demos.length) return apiIncidents;
    const seen = new Set(apiIncidents.map(i => i.id));
    const extra = demos.filter(d => !seen.has(d.id));
    return [...apiIncidents, ...extra].sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  }

  // ─── UI helpers ─────────────────────────────────────────────────────────────

  function showLoading() {
    isLoading = true;
    const list = document.getElementById('dashboard-list');
    if (list) list.innerHTML = `
      <div class="vp-dashboard-loading">
        <div class="vp-spinner"></div>
        <p>Connecting to live feed…</p>
      </div>`;
  }

  function showError(msg) {
    const list = document.getElementById('dashboard-list');
    if (list) list.innerHTML = `
      <div class="vp-dashboard-error">
        <p>⚠️ Unable to load reports</p>
        <small>${escapeHtml(msg)}</small>
        <small style="margin-top:6px;opacity:.6">Retrying every ${REFRESH_INTERVAL / 1000}s…</small>
      </div>`;
    console.error('[Dashboard]', msg);
  }

  // ─── Incident card ──────────────────────────────────────────────────────────

  function priorityClass(p) {
    const l = String(p).toLowerCase();
    return l === 'high' ? 'high' : l === 'medium' ? 'medium' : 'low';
  }

  function renderCard(inc) {
    const pc = priorityClass(inc.priorityLevel);
    const sc = String(inc.verificationStatus).toLowerCase().replace(/\s+/g, '-');

    // Trust-score bar colour
    const barColor = inc.trustScore > 80
      ? 'var(--green-glow)'
      : inc.trustScore >= 50
        ? 'var(--yellow-warn)'
        : 'var(--red-alert)';

    return `
      <article class="vp-alert-card-shell" data-id="${escapeHtml(inc.id)}">
        <div class="vp-alert-left">
          <div class="vp-alert-id">#${escapeHtml(inc.id ? inc.id.slice(-8).toUpperCase() : '—')}</div>
          <div class="vp-alert-reporter">Reported by
            <span class="vp-reporter-name">${escapeHtml(inc.userName)}</span>
          </div>
          <h2 class="vp-alert-title">${escapeHtml(inc.title)}</h2>
          ${inc.description ? `<div class="vp-alert-desc">${escapeHtml(inc.description)}</div>` : ''}
          <div class="vp-alert-location">📍 ${escapeHtml(inc.location)}</div>
          <div class="vp-alert-time">
            <span class="vp-time-icon" aria-hidden="true">
              <svg viewBox="0 0 20 20" focusable="false">
                <circle cx="10" cy="10" r="7.2"></circle>
                <path d="M10 5.8v4.4l2.9 1.6"></path>
              </svg>
            </span>${escapeHtml(inc.time)}
          </div>
        </div>
        <div class="vp-alert-right">
          <div class="vp-trust-row">
            <span class="vp-trust-text">Trust ${inc.trustScore}%</span>
            <div class="vp-trust-track">
              <div class="vp-trust-fill" style="width:${inc.trustScore}%; background:${barColor};"></div>
            </div>
          </div>
          <div class="vp-alert-stats">
            <div class="vp-stat-group">
              <span class="vp-stat-label">Type</span>
              <span class="vp-stat-value">${escapeHtml(inc.type || 'N/A')}</span>
            </div>
            <div class="vp-stat-group">
              <span class="vp-stat-label">Priority</span>
              <span class="vp-stat-value priority-${pc}">${escapeHtml(inc.priorityLevel)}</span>
            </div>
            <div class="vp-stat-group">
              <span class="vp-stat-label">Status</span>
              <span class="vp-stat-value status-${sc}">${escapeHtml(inc.verificationStatus)}</span>
            </div>
          </div>
        </div>
      </article>`;
  }

  // ─── Core render ────────────────────────────────────────────────────────────

  /**
   * Populate window.dashboardState and trigger the page's own renderDashboard().
   * The inline script in dashboard.html owns the filter logic; we just feed the data.
   */
  function applyToDashboard(transformed) {
    if (!window.dashboardState) return;

    window.dashboardState.incidents = transformed;

    // Update summary counts (use all data, not filtered view)
    const total      = transformed.length;
    const verified   = transformed.filter(i => i.verificationStatus === 'Verified').length;
    const highPri    = transformed.filter(i => i.priorityLevel      === 'High').length;
    const suspicious = transformed.filter(i => i.verificationStatus === 'Suspicious').length;

    document.getElementById('summary-total').textContent      = String(total);
    document.getElementById('summary-verified').textContent   = String(verified);
    document.getElementById('summary-high').textContent       = String(highPri);
    document.getElementById('summary-suspicious').textContent = String(suspicious);

    // Delegate rendering to the inline renderDashboard() defined in dashboard.html
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    } else {
      // Fallback: render directly if the inline function isn't available
      const filter = window.dashboardState.selectedFilter || 'all';
      let list = transformed;
      if (filter === 'verified')   list = transformed.filter(i => i.verificationStatus === 'Verified');
      else if (filter === 'high')  list = transformed.filter(i => i.priorityLevel      === 'High');
      else if (filter === 'suspicious') list = transformed.filter(i => i.verificationStatus === 'Suspicious');

      const el = document.getElementById('dashboard-list');
      if (!el) return;
      el.innerHTML = list.length
        ? list.map(renderCard).join('')
        : '<div class="vp-dashboard-empty">No incidents found for this filter.</div>';
    }

    isLoading = false;
  }

  // ─── API calls ──────────────────────────────────────────────────────────────

  async function fetchAndRender() {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_DURATION && cachedRaw.length) {
      // Use cache but still re-render (filter may have changed)
      applyToDashboard(cachedRaw.map(transformIncident));
      return;
    }

    // Only show loading spinner on the very first load (no data yet)
    const isFirstLoad = cachedRaw.length === 0 && !isLoading;
    if (isFirstLoad) showLoading();

    try {
      const res = await fetch(`${API_BASE}/incidents`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const raw = await res.json();
      cachedRaw = mergeWithDemo(Array.isArray(raw) ? raw : []);
      lastFetchTime = Date.now();

      console.log(`[Dashboard] ${cachedRaw.length} incidents loaded (${raw.length} from API)`);
      applyToDashboard(cachedRaw.map(transformIncident));

    } catch (err) {
      console.error('[Dashboard] Fetch failed:', err);
      // If we have cached data, keep showing it silently; otherwise show error
      if (cachedRaw.length) {
        applyToDashboard(cachedRaw.map(transformIncident));
      } else {
        const demos = getDemoIncidents();
        if (demos.length) {
          console.warn('[Dashboard] Backend unreachable – showing demo data');
          cachedRaw = demos;
          applyToDashboard(cachedRaw.map(transformIncident));
        } else {
          showError(err.message || 'Failed to connect to server');
          isLoading = false;
        }
      }
    }
  }

  // ─── Initialise ─────────────────────────────────────────────────────────────

  function init() {
    console.log('[Dashboard] Integration initialised – polling every', REFRESH_INTERVAL, 'ms');
    fetchAndRender();
    refreshTimer = setInterval(fetchAndRender, REFRESH_INTERVAL);
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  window.DashboardFirebase = {
    refresh: () => { lastFetchTime = 0; cachedRaw = []; fetchAndRender(); },
    getCache: () => cachedRaw,
    transformIncident,
  };

  // ─── Event listeners ────────────────────────────────────────────────────────

  // New incident submitted from report.html → immediate refresh
  window.addEventListener('incidentSubmitted', () => {
    console.log('[Dashboard] incidentSubmitted event – refreshing');
    lastFetchTime = 0;
    cachedRaw = [];
    fetchAndRender();
  });

  // Demo data updated from another tab
  window.addEventListener('storage', e => {
    if (e.key === 'veriPulse_demo_incidents') {
      console.log('[Dashboard] demo storage updated – refreshing');
      lastFetchTime = 0;
      fetchAndRender();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
