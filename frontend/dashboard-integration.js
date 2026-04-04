// ===== DASHBOARD FIREBASE INTEGRATION =====
// Handles real-time data fetching from Firebase via API
// Transforms incident data to dashboard format
// Manages loading states and error handling

(function () {
  const API_BASE_URL = 'http://localhost:5000/api'; // Update for production
  const REFRESH_INTERVAL = 5000; // Refresh every 5 seconds for real-time updates
  const CACHE_DURATION = 3000; // Cache results for 3 seconds to avoid excessive requests

  let lastFetchTime = 0;
  let cachedIncidents = [];
  let isLoading = false;

  // ===== LOCALSTORAGE DEMO MODE (Fallback for backend unavailability) =====

  /**
   * Get demo incidents from localStorage
   * Used when backend is unavailable or for demo mode
   */
  function getDemoIncidents() {
    try {
      const stored = localStorage.getItem('veriPulse_demo_incidents');
      if (stored) {
        const demos = JSON.parse(stored);
        console.log(`[Dashboard] Loaded ${demos.length} demo incidents from localStorage`);
        return demos;
      }
    } catch (err) {
      console.warn('[Dashboard] localStorage read error:', err);
    }
    return [];
  }

  /**
   * Merge Firebase data with demo/localStorage data
   * Firebase data takes precedence, but demo data is included if available
   */
  function mergeIncidentsWithDemo(firebaseIncidents) {
    const demoIncidents = getDemoIncidents();
    if (demoIncidents.length === 0) {
      return firebaseIncidents;
    }

    console.log(`[Dashboard] Merging ${firebaseIncidents.length} Firebase + ${demoIncidents.length} demo incidents`);

    // Combine Firebase and demo incidents
    const combined = [...firebaseIncidents, ...demoIncidents];

    // Remove duplicates by ID (prioritize Firebase over demo)
    const seen = new Set();
    const unique = combined.filter(inc => {
      if (seen.has(inc.id)) return false;
      seen.add(inc.id);
      return true;
    });

    // Sort by creation time (newest first)
    return unique.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }

  // ===== DATA TRANSFORMATION FUNCTIONS =====

  /**
   * Categorize incident by trust score
   * >80 → Verified
   * 50–80 → Suspicious
   * <50 → Fake
   */
  function getVerificationStatus(trustScore) {
    if (trustScore == null) return 'Unknown';
    if (trustScore > 80) return 'Verified';
    if (trustScore >= 50) return 'Suspicious';
    return 'Fake';
  }

  /**
   * Get priority level from incident data
   */
  function getPriorityLevel(incident) {
    if (incident.priority) {
      const p = String(incident.priority).toLowerCase();
      if (p === 'high') return 'High';
      if (p === 'medium') return 'Medium';
      return 'Low';
    }
    // Fallback based on trust score
    if (incident.trust_score > 75) return 'High';
    if (incident.trust_score > 50) return 'Medium';
    return 'Low';
  }

  /**
   * Calculate relative time from timestamp
   */
  function getRelativeTime(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  /**
   * Generate user name from incident data
   * Uses description or generates placeholder
   */
  function extractReporterName(incident) {
    // Try to extract from description or type
    return incident.type ? incident.type + ' Reporter' : 'Anonymous';
  }

  /**
   * Transform Firebase incident to dashboard format
   */
  function transformIncident(firestoreIncident) {
    const trustScore = firestoreIncident.trust_score ?? 0;
    const verificationStatus = firestoreIncident.status
      ? String(firestoreIncident.status).toLowerCase()
      : getVerificationStatus(trustScore).toLowerCase();
    const priorityLevel = firestoreIncident.priority
      ? String(firestoreIncident.priority)
      : getPriorityLevel(firestoreIncident);

    const normalizedPriority = priorityLevel.toLowerCase() === 'high' ? 'High' : 'Low';
    const normalizedStatus = verificationStatus.includes('verified') ? 'Verified' : 'Pending';

    return {
      id: firestoreIncident.id,
      userName: extractReporterName(firestoreIncident),
      title: firestoreIncident.title || (firestoreIncident.type ? `${firestoreIncident.type} Report` : 'Incident Report'),
      description: firestoreIncident.description || '',
      location: firestoreIncident.location || 'Location not specified',
      time: getRelativeTime(firestoreIncident.createdAt),
      trustScore: trustScore,
      verificationStatus: normalizedStatus,
      priorityLevel: normalizedPriority,
      // Additional fields for reference
      type: firestoreIncident.type,
      status: normalizedStatus,
      reportCount: firestoreIncident.report_count || 1
    };
  }

  /**
   * Show loading indicator
   */
  function showLoading() {
    isLoading = true;
    const list = document.getElementById('dashboard-list');
    if (list) {
      list.innerHTML = '<div class="vp-dashboard-loading"><div class="vp-spinner"></div><p>Loading...</p></div>';
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const list = document.getElementById('dashboard-list');
    if (list) {
      list.innerHTML = `<div class="vp-dashboard-error">
        <p>⚠️ Unable to load data</p>
        <small>${message}</small>
      </div>`;
    }
    console.error('[Dashboard Error]', message);
  }

  // ===== MAIN API FUNCTIONS =====

  /**
   * Fetch incidents from API with caching
   */
  async function fetchIncidentsFromAPI() {
    try {
      showLoading();

      const response = await fetch(`${API_BASE_URL}/incidents`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const incidents = await response.json();
      lastFetchTime = Date.now();
      console.log('[Dashboard] Raw incident payload:', incidents);
      
      // Merge Firebase incidents with demo/localStorage data
      const merged = mergeIncidentsWithDemo(Array.isArray(incidents) ? incidents : []);
      cachedIncidents = merged;

      console.log(`[Dashboard] Fetched ${incidents.length} from Firebase + merged with demo data = ${cachedIncidents.length} total`);
      return cachedIncidents;
    } catch (err) {
      console.error('[Dashboard] Failed to fetch incidents:', err);
      
      // If backend fails, try to show demo incidents from localStorage
      if (cachedIncidents.length === 0) {
        const demoIncidents = getDemoIncidents();
        if (demoIncidents.length > 0) {
          console.log(`[Dashboard] Backend unavailable. Showing ${demoIncidents.length} demo incidents from localStorage`);
          cachedIncidents = demoIncidents;
          isLoading = false;
          return cachedIncidents;
        }
        showError(err.message || 'Failed to connect to server');
      }
      return cachedIncidents; // Return cached data if fetch fails
    }
  }

  /**
   * Get incidents with intelligent caching
   */
  async function getIncidents() {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_DURATION && cachedIncidents.length > 0) {
      return cachedIncidents;
    }
    return await fetchIncidentsFromAPI();
  }

  /**
   * Calculate dashboard statistics
   */
  function calculateStats(incidents) {
    const transformed = incidents.map(transformIncident);

    return {
      total: transformed.length,
      verified: transformed.filter(i => i.verificationStatus === 'Verified').length,
      suspicious: transformed.filter(i => i.verificationStatus === 'Suspicious').length,
      fake: transformed.filter(i => i.verificationStatus === 'Fake').length,
      highPriority: transformed.filter(i => i.priorityLevel === 'High').length,
      medium: transformed.filter(i => i.priorityLevel === 'Medium').length,
      incidents: transformed
    };
  }

  /**
   * Update dashboard with real data
   */
  async function updateDashboard() {
    try {
      const summaryResponse = await fetch(`${API_BASE_URL}/incidents/summary`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      let summary = null;
      if (summaryResponse.ok) {
        summary = await summaryResponse.json();
      } else {
        console.warn('[Dashboard] Summary endpoint failed, falling back to calculated stats.');
      }

      const incidents = await getIncidents();
      const stats = calculateStats(incidents);

      // Update summary cards
      document.getElementById('summary-total').textContent = String(summary?.totalAlerts ?? stats.total ?? 0);
      document.getElementById('summary-verified').textContent = String(summary?.verified ?? stats.verified ?? 0);
      document.getElementById('summary-high').textContent = String(summary?.highPriority ?? stats.highPriority ?? 0);
      document.getElementById('summary-suspicious').textContent = String(summary?.suspicious ?? stats.suspicious ?? 0);

      // Update filter tabs
      updateFilterTabs(stats);

      // Update incident list based on current filter
      if (window.dashboardState) {
        renderDashboardWithData(stats);
      }

      isLoading = false;
    } catch (err) {
      console.error('[Dashboard] Error updating dashboard:', err);
      if (!isLoading) {
        showError('Failed to update dashboard data');
      }
    }
  }

  /**
   * Update filter tab counts
   */
  function updateFilterTabs(stats) {
    const filterTabs = document.querySelectorAll('.vp-filter-tab');
    filterTabs.forEach(tab => {
      const filter = tab.dataset.filter;
      let count = 0;

      if (filter === 'verified') count = stats.verified;
      else if (filter === 'high') count = stats.highPriority;
      else if (filter === 'suspicious') count = stats.suspicious;
      else if (filter === 'all') count = stats.total;

      const label = filter === 'high' ? 'High Priority' : filter.charAt(0).toUpperCase() + filter.slice(1);
      tab.textContent = `${label} (${count})`;
    });
  }

  /**
   * Render dashboard with real data
   */
  function renderDashboardWithData(stats) {
    if (!window.dashboardState) return;

    const filter = window.dashboardState.selectedFilter;
    let filtered = stats.incidents;

    if (filter === 'verified') {
      filtered = stats.incidents.filter(i => i.verificationStatus === 'Verified');
    } else if (filter === 'high') {
      filtered = stats.incidents.filter(i => i.priorityLevel === 'High');
    } else if (filter === 'suspicious') {
      filtered = stats.incidents.filter(i => i.verificationStatus === 'Suspicious');
    }

    const dashboardList = document.getElementById('dashboard-list');
    if (!dashboardList) return;

    if (filtered.length === 0) {
      dashboardList.innerHTML = '<div class="vp-dashboard-empty">No incidents found for this filter.</div>';
      return;
    }

    // Update dashboardState with real incidents
    window.dashboardState.incidents = stats.incidents;

    // Render incident cards
    dashboardList.innerHTML = filtered.map(incident => renderIncidentCard(incident)).join('');
  }

  /**
   * Render a single incident card
   */
  function renderIncidentCard(incident) {
    const priorityClass = getPriorityClass(incident.priorityLevel);

    return `
      <article class="vp-alert-card-shell" data-id="${incident.id}">
        <div class="vp-alert-left">
          <div class="vp-alert-reporter">Reported by <span class="vp-reporter-name">${escapeHtml(incident.userName)}</span></div>
          <h2 class="vp-alert-title">${escapeHtml(incident.title)}</h2>
          <div class="vp-alert-location">${escapeHtml(incident.location)}</div>
          <div class="vp-alert-time"><span class="vp-time-icon" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="10" cy="10" r="7.2"></circle><path d="M10 5.8v4.4l2.9 1.6"></path></svg></span>${incident.time}</div>
        </div>
        <div class="vp-alert-right">
          <div class="vp-alert-stats">
            <div class="vp-stat-group">
              <span class="vp-stat-label">Trust Score</span>
              <span class="vp-stat-value">${incident.trustScore}%</span>
            </div>
            <div class="vp-stat-group">
              <span class="vp-stat-label">Priority</span>
              <span class="vp-stat-value priority-${priorityClass}">${incident.priorityLevel}</span>
            </div>
            <div class="vp-stat-group">
              <span class="vp-stat-label">Status</span>
              <span class="vp-stat-value status-${incident.verificationStatus.toLowerCase()}">${incident.verificationStatus}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  /**
   * Utility: Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Utility: Get priority CSS class
   */
  function getPriorityClass(priorityLevel) {
    const p = priorityLevel.toLowerCase();
    if (p === 'high') return 'high';
    if (p === 'medium') return 'medium';
    return 'low';
  }

  // ===== INITIALIZATION =====

  /**
   * Initialize dashboard with real-time updates
   */
  function initializeDashboard() {
    console.log('[Dashboard] Initializing Firebase integration...');

    // First update
    updateDashboard();

    // Set up periodic updates for real-time behavior
    setInterval(() => {
      updateDashboard();
    }, REFRESH_INTERVAL);

    console.log('[Dashboard] Real-time updates enabled (interval: ' + REFRESH_INTERVAL + 'ms)');
  }

  // ===== EXPORT API FOR EXTERNAL USE =====

  window.DashboardFirebase = {
    updateDashboard,
    getIncidents,
    calculateStats,
    transformIncident,
    updateFilterTabs,
    getDemoIncidents,
    mergeIncidentsWithDemo
  };

  // ===== LISTEN FOR EXTERNAL EVENTS =====

  /**
   * Listen for incident submitted events from report-submission.js
   * Immediately refresh dashboard when new incident is submitted
   */
  window.addEventListener('incidentSubmitted', (event) => {
    console.log('[Dashboard] Incident submitted event received:', event.detail);
    // Force immediate refresh
    lastFetchTime = 0; // Clear cache
    cachedIncidents = []; // Clear cache
    updateDashboard(); // Trigger immediate update
  });

  /**
   * Listen for storage changes from other tabs/windows
   * Useful for demo mode when incidents are added from another window
   */
  window.addEventListener('storage', (event) => {
    if (event.key === 'veriPulse_demo_incidents') {
      console.log('[Dashboard] Storage changed (demo incidents updated from another tab)');
      lastFetchTime = 0;
      cachedIncidents = [];
      updateDashboard();
    }
  });

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
  } else {
    initializeDashboard();
  }
})();
