const API_BASE = 'http://localhost:5000/api';

function esc(t) {
  if (t == null) return '';
  const m = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
  return String(t).replace(/[&<>"']/g, c => m[c]);
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'ok';
  if (s === 'pending') return 'warn';
  if (s === 'rejected') return 'danger';
  if (s === 'standby') return 'warn';
  if (s === 'blocked') return 'danger';
  return '';
}

async function fetchVolunteers() {
  try {
    const res = await fetch(API_BASE + '/volunteers');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Failed to fetch volunteers:', err);
    return [];
  }
}

async function updateStatus(volunteerId, status) {
  try {
    const res = await fetch(API_BASE + '/volunteers/' + volunteerId + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    renderVolunteers();
  } catch (err) {
    console.error('Update err:', err);
    alert('Failed to update volunteer status: ' + err.message);
  }
}

async function renderVolunteers() {
  const list = document.getElementById('volunteers-list');
  if (!list) return;

  list.innerHTML = `<div style="color:var(--white-dim);padding:24px;font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;">Loading volunteers...</div>`;

  let volunteers = await fetchVolunteers();

  // Filter out rejected and blocked volunteers
  volunteers = volunteers.filter(v => {
    const s = String(v.status || 'pending').trim().toLowerCase();
    return s !== 'rejected' && s !== 'blocked';
  });

  if (!volunteers.length) {
    list.innerHTML = `<div style="color:var(--white-dim);padding:24px;">No volunteers found.</div>`;
    return;
  }

  list.innerHTML = volunteers.map((v) => {
    const rawStatus = v.status || 'pending';
    const statusValue = String(rawStatus).trim().toLowerCase();
    const isPending = statusValue === 'pending';
    let actionsHtml = '';
    
    if (isPending) {
      actionsHtml = `
        <button class="admin-btn ok" data-action="approve" data-volunteer-id="${esc(v.id)}" style="border-color:rgba(0,255,157,0.5);background:rgba(0,255,157,0.12);color:var(--green-glow);">Approve</button>
        <button class="admin-btn danger" data-action="reject" data-volunteer-id="${esc(v.id)}">Reject</button>
      `;
    } else if (statusValue === 'active') {
      actionsHtml = `
        <button class="admin-btn warn" data-action="block" data-volunteer-id="${esc(v.id)}">Block/Deactivate</button>
      `;
    }

    return `
      <article class="admin-card" data-volunteer-id="${esc(v.id)}">
        <div class="admin-card-top">
          <div class="volunteer-name-wrap">
            <h3 class="admin-card-title">${esc(v.name)}</h3>
            <span class="volunteer-sub">Volunteer ID: ${esc(v.id.slice(-8).toUpperCase())}</span>
          </div>
          <span class="admin-chip status-chip ${statusClass(statusValue)}">${esc(String(rawStatus).toUpperCase())}</span>
        </div>
        <div class="admin-meta">
          <div class="admin-meta-item"><div class="admin-meta-label">Age</div><div class="admin-meta-value">${esc(v.age)}</div></div>
          <div class="admin-meta-item"><div class="admin-meta-label">Skills</div><div class="admin-meta-value" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(v.skills)}</div></div>
          <div class="admin-meta-item"><div class="admin-meta-label">Location</div><div class="admin-meta-value" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(v.location)}</div></div>
        </div>
        <div class="vol-stat-row">
          <div class="vol-stat"><div class="label">Missions Completed</div><div class="value">${v.tasks_completed || 0}</div></div>
          <div class="vol-stat" style="grid-column: span 2"><div class="label">Reason to Join</div><div class="value" style="font-size:11px;color:var(--white-dim);white-space:normal;">${esc(v.reason || 'None provided')}</div></div>
        </div>
        ${actionsHtml ? `<div class="admin-actions" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">${actionsHtml}</div>` : ''}
      </article>
    `;
  }).join('');

  list.querySelectorAll('[data-action="approve"]').forEach((button) => {
    button.addEventListener('click', function () {
      updateStatus(button.getAttribute('data-volunteer-id'), 'active');
    });
  });

  list.querySelectorAll('[data-action="reject"]').forEach((button) => {
    button.addEventListener('click', function () {
      updateStatus(button.getAttribute('data-volunteer-id'), 'rejected');
    });
  });

  list.querySelectorAll('[data-action="block"]').forEach((button) => {
    button.addEventListener('click', function () {
      if (confirm('Are you sure you want to block this volunteer?')) {
        updateStatus(button.getAttribute('data-volunteer-id'), 'blocked');
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', renderVolunteers);
