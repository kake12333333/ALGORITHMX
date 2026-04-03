const alertsStore = {
  items: [
    {
      id: 'ALT-901',
      userName: 'Aarav Mehta',
      incidentTitle: 'Building Fire',
      location: 'Andheri West',
      time: '10:12 AM',
      trustScore: 92,
      priority: 'High',
      status: 'Pending'
    },
    {
      id: 'ALT-902',
      userName: 'Ritika Rao',
      incidentTitle: 'Road Accident',
      location: 'Kurla Flyover',
      time: '09:58 AM',
      trustScore: 85,
      priority: 'Medium',
      status: 'Pending'
    },
    {
      id: 'ALT-903',
      userName: 'Naman Shah',
      incidentTitle: 'Gas Leak Report',
      location: 'Powai Sector 5',
      time: '09:43 AM',
      trustScore: 63,
      priority: 'High',
      status: 'Review'
    },
    {
      id: 'ALT-904',
      userName: 'Kiran Joshi',
      incidentTitle: 'Water Logging',
      location: 'Bandra East',
      time: '09:15 AM',
      trustScore: 76,
      priority: 'Low',
      status: 'Pending'
    },
    {
      id: 'ALT-905',
      userName: 'Vikas Patil',
      incidentTitle: 'Transformer Spark Event',
      location: 'Vashi Sector 8',
      time: '09:02 AM',
      trustScore: 58,
      priority: 'Medium',
      status: 'Escalated'
    }
  ]
};

function getAlertsData() {
  return alertsStore.items;
}

function priorityClass(priority) {
  if (priority === 'High') return 'alert-priority-high';
  if (priority === 'Medium') return 'alert-priority-medium';
  return 'alert-priority-low';
}

function statusChipClass(status) {
  if (status === 'Pending') return 'warn';
  if (status === 'Escalated') return 'danger';
  if (status === 'Approved') return 'ok';
  return '';
}

function renderAlertCard(alert) {
  return `
    <article class="admin-card" data-alert-id="${alert.id}">
      <div class="admin-card-top">
        <h3 class="admin-card-title">${alert.incidentTitle}</h3>
      </div>
      <div class="alert-user-row">
        <span class="user-name">User: ${alert.userName}</span>
        <span class="status-wrap"><span class="admin-chip status-chip ${statusChipClass(alert.status)}">${alert.status}</span></span>
      </div>
      <div class="admin-meta">
        <div class="admin-meta-item"><div class="admin-meta-label">Location</div><div class="admin-meta-value">${alert.location}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Time</div><div class="admin-meta-value">${alert.time}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Trust Score</div><div class="admin-meta-value">${alert.trustScore}%</div></div>
      </div>
      <div class="alert-priority-row">Priority: <strong class="${priorityClass(alert.priority)}">${alert.priority}</strong></div>
      <div class="admin-actions">
        <button class="admin-btn" data-action="approve">Approve</button>
        <button class="admin-btn danger" data-action="fake">Mark Fake</button>
        <button class="admin-btn warn" data-action="escalate">Escalate</button>
      </div>
    </article>
  `;
}

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  if (!list) return;

  const alerts = getAlertsData();
  list.innerHTML = alerts.map(renderAlertCard).join('');
}

document.addEventListener('DOMContentLoaded', renderAlerts);
