const API_BASE = 'http://localhost:5000/api';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function priorityClass(priority) {
  const p = String(priority).toLowerCase();
  if (p === 'high' || p === 'critical') return 'alert-priority-high';
  if (p === 'medium') return 'alert-priority-medium';
  return 'alert-priority-low';
}

function statusChipClass(status) {
  const s = String(status).toLowerCase();
  if (s === 'pending') return 'warn';
  if (s === 'escalated') return 'danger';
  if (s === 'verified') return 'ok';
  if (s === 'active') return 'ok';
  if (s === 'fake' || s === 'closed' || s === 'removed') return 'danger';
  return '';
}

function renderAlertCard(inc) {
  const dt = inc.createdAt ? new Date(inc.createdAt) : new Date();
  const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const rawStatus = inc.status || 'Pending';
  
  let trustScore = Number(inc.trust_score ?? 0);
  if (trustScore > 0 && trustScore <= 1.0) trustScore = Math.round(trustScore * 100);

  return `
    <article class="admin-card" data-alert-id="${escapeHtml(inc.id)}">
      <div class="admin-card-top">
        <h3 class="admin-card-title">${escapeHtml(inc.type || 'Emergency Request')}</h3>
      </div>
      <div class="alert-user-row">
        <span class="user-name">User: ${escapeHtml(inc.reporter_name || 'Anonymous')}</span>
        <span class="status-wrap"><span class="admin-chip status-chip ${statusChipClass(rawStatus)}">${escapeHtml(rawStatus).toUpperCase()}</span></span>
      </div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--white-dim);margin-top:6px;margin-bottom:12px;line-height:1.4;">${escapeHtml(inc.description || '')}</div>
      <div class="admin-meta">
        <div class="admin-meta-item"><div class="admin-meta-label">Location</div><div class="admin-meta-value">${escapeHtml(inc.location || 'Unknown')}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Time</div><div class="admin-meta-value">${timeStr}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Trust Score</div><div class="admin-meta-value">${trustScore}%</div></div>
      </div>
      <div class="alert-priority-row">Priority: <strong class="${priorityClass(inc.priority)}">${escapeHtml(inc.priority || 'Low').toUpperCase()}</strong></div>
      <div class="admin-actions">
        <button class="admin-btn" onclick="updateIncidentStatus('${inc.id}', 'verified')">Approve</button>
        <button class="admin-btn danger" onclick="updateIncidentStatus('${inc.id}', 'fake')">Mark Fake</button>
        <button class="admin-btn danger" onclick="updateIncidentStatus('${inc.id}', 'closed')">Close Alert</button>
      </div>
    </article>
  `;
}

async function renderAlerts() {
  const list = document.getElementById('alerts-list');
  if (!list) return;

  list.innerHTML = '<div style="color:var(--white-dim);font-family:\'JetBrains Mono\',monospace;font-size:11px;padding:24px;">Loading live database...</div>';

  try {
    const res = await fetch(API_BASE + '/incidents/all');
    if (!res.ok) throw new Error('API fetch failed');
    const incidents = await res.json();
    
    // Sort by most recent
    incidents.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (!incidents.length) {
       list.innerHTML = '<div style="color:var(--white-dim);padding:24px;">No alerts found in the database.</div>';
       return;
    }
    
    list.innerHTML = incidents.map(renderAlertCard).join('');
  } catch (err) {
    console.error('Failed to load alerts:', err);
    list.innerHTML = '<div style="color:var(--red-alert);padding:24px;">Failed to load alerts from backend. Check connection.</div>';
  }
}

window.updateIncidentStatus = async function(id, newStatus) {
  try {
    const res = await fetch(API_BASE + '/incidents/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    
    if (res.ok) {
       renderAlerts(); // Refresh the list
    } else {
       const txt = await res.text();
       alert("Action failed: " + txt);
    }
  } catch(err) {
    alert("Connection Error: " + err);
  }
}

document.addEventListener('DOMContentLoaded', renderAlerts);
