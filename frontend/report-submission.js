// ===== REPORT SUBMISSION HANDLER =====
// Connects report form to backend API with localStorage fallback

(function () {
  const API_BASE_URL = 'http://localhost:5000/api'; // Update for production
  const DEMO_STORAGE_KEY = 'veriPulse_demo_incidents'; // localStorage key for demo mode

  /**
   * Get stored demo incidents from localStorage
   */
  function getDemoIncidents() {
    try {
      const stored = localStorage.getItem(DEMO_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.error('[Report] Failed to read localStorage:', err);
      return [];
    }
  }

  /**
   * Save demo incident to localStorage
   */
  function saveDemoIncident(incident) {
    try {
      const existing = getDemoIncidents();
      const demoIncident = {
        ...incident,
        id: 'DEMO-' + Date.now() + Math.random().toString(36).substr(2, 9),
        createdAt: new Date().toISOString(),
        isDemoData: true,
        // Transform field names to match backend schema
        type: incident.incidentType,
        trust_score: Math.floor(Math.random() * 40) + 60, // Random 60-100
        priority: calculatePriority(incident.incidentType),
        status: 'Active',
        report_count: 1
      };
      
      existing.push(demoIncident);
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(existing));
      console.log('[Report] Demo incident saved to localStorage:', demoIncident.id);
      return demoIncident;
    } catch (err) {
      console.error('[Report] Failed to save to localStorage:', err);
      return null;
    }
  }

  /**
   * Calculate priority based on incident type
   */
  function calculatePriority(incidentType) {
    const highPriorityTypes = ['Fire', 'Medical', 'Crime'];
    return highPriorityTypes.includes(incidentType) ? 'High' : 'Medium';
  }

  /**
   * Submit report to backend API
   */
  async function submitReportToBackend(payload) {
    try {
      console.log('[Report] Submitting to backend:', payload);
      
      // Transform payload to backend format
      const backendPayload = {
        type: payload.incidentType,
        description: payload.description,
        location: payload.location,
        reporterName: payload.reporterName || payload.name || '',
        reporterEmail: payload.reporterEmail || payload.email || ''
      };

      const hasMedia = Array.isArray(payload.mediaFiles) && payload.mediaFiles.length > 0;
      let response;

      if (hasMedia) {
        const formData = new FormData();
        formData.append('type', backendPayload.type);
        formData.append('description', backendPayload.description);
        formData.append('location', backendPayload.location);
        formData.append('reporterName', backendPayload.reporterName || '');
        formData.append('reporterEmail', backendPayload.reporterEmail || '');

        const firstMedia = payload.mediaFiles[0]?.file;
        if (firstMedia instanceof File) {
          formData.append('media', firstMedia, firstMedia.name);
        }

        if (payload.mediaFiles.length > 1) {
          console.warn('[Report] Multiple media selected. Backend currently accepts one media file per incident; first file was uploaded.');
        }

        response = await fetch(`${API_BASE_URL}/incidents`, {
          method: 'POST',
          body: formData
        });
      } else {
        response = await fetch(`${API_BASE_URL}/incidents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(backendPayload)
        });
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Backend error: ${response.status} ${error}`);
      }

      const result = await response.json();
      console.log('[Report] Backend accepted incident:', result.id);
      return { success: true, incident: result };
    } catch (err) {
      console.error('[Report] Backend submission failed:', err);
      return { success: false, error: err };
    }
  }

  /**
   * Handle report submission - try backend first, fallback to localStorage
   */
  async function handleReportSubmission(payload) {
    console.log('[Report] Processing submission...', payload);

    // Try to submit to backend
    const backendResult = await submitReportToBackend(payload);
    
    if (backendResult.success) {
      console.log('[Report] ✓ Saved to Firebase via backend');
      return {
        success: true,
        source: 'backend',
        incident: backendResult.incident,
        message: 'Report saved to Firebase'
      };
    }

    // Backend failed, fallback to localStorage for demo
    console.log('[Report] Backend unavailable, using localStorage fallback');
    const demoIncident = saveDemoIncident(payload);
    
    if (demoIncident) {
      console.log('[Report] ✓ Saved to localStorage (demo mode)');
      // Notify dashboard to refresh
      window.dispatchEvent(new CustomEvent('incidentSubmitted', {
        detail: { incident: demoIncident, source: 'localStorage' }
      }));
      
      return {
        success: true,
        source: 'localStorage',
        incident: demoIncident,
        message: 'Report saved locally (backend unavailable)'
      };
    }

    return {
      success: false,
      error: 'Failed to save report',
      message: 'Could not save report to backend or local storage'
    };
  }

  /**
   * Check if demo data exists
   */
  function hasDemoData() {
    return getDemoIncidents().length > 0;
  }

  /**
   * Clear demo data (for testing)
   */
  function clearDemoData() {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
      console.log('[Report] Demo data cleared');
    } catch (err) {
      console.error('[Report] Failed to clear demo data:', err);
    }
  }

  // ===== EXPORT API =====
  window.ReportSubmission = {
    handleReportSubmission,
    getDemoIncidents,
    saveDemoIncident,
    hasDemoData,
    clearDemoData,
    submitReportToBackend
  };

  console.log('[Report] Submission handler loaded. Use window.ReportSubmission for API access.');
})();
