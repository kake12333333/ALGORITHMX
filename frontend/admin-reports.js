// Dummy logged-in user object.
// Backend can later replace this with authenticated session/user profile payload.
const dummyLoggedInUser = {
  email: 'sapna@email.com',
  name: 'Sapna Rathore'
};

function getLoggedInUser() {
  // Prefer persisted session user when available; otherwise use dummy fallback.
  const cached = localStorage.getItem('vpCurrentUser');
  if (!cached) return dummyLoggedInUser;
  try {
    const parsed = JSON.parse(cached);
    if (parsed && parsed.email && parsed.name) {
      return parsed;
    }
  } catch (error) {
    // Ignore parse errors and fallback to dummy data.
  }
  return dummyLoggedInUser;
}

// Backend-ready report payload shape.
// Required fields: email, name, incidentTitle, location, time, trustScore, priority.
const submittedReportsPayload = [
  {
    incidentTitle: 'Chemical Spill',
    location: 'Saki Naka',
    time: '10:28 AM',
    trustScore: 91,
    priority: 'High',
    status: 'Open'
  },
  {
    incidentTitle: 'Road Obstruction',
    location: 'Bandra Linking Road',
    time: '10:12 AM',
    trustScore: 77,
    priority: 'Medium',
    status: 'Assigned'
  },
  {
    incidentTitle: 'Power Failure',
    location: 'Chembur East',
    time: '09:48 AM',
    trustScore: 62,
    priority: 'Low',
    status: 'Monitoring'
  },
  {
    incidentTitle: 'Flooded Street',
    location: 'Dadar TT',
    time: '09:20 AM',
    trustScore: 86,
    priority: 'High',
    status: 'Escalated'
  }
];

function buildReportRows() {
  const loggedInUser = getLoggedInUser();
  return submittedReportsPayload.map((report) => ({
    email: loggedInUser.email,
    name: loggedInUser.name,
    incidentTitle: report.incidentTitle,
    location: report.location,
    time: report.time,
    trustScore: report.trustScore,
    priority: report.priority,
    status: report.status
  }));
}

function priorityClass(priority) {
  if (priority === 'High') return 'report-priority-high';
  if (priority === 'Medium') return 'report-priority-medium';
  return 'report-priority-low';
}

function statusChip(status) {
  if (status === 'Open') return '<span class="admin-chip warn">Open</span>';
  if (status === 'Escalated') return '<span class="admin-chip danger">Escalated</span>';
  if (status === 'Assigned') return '<span class="admin-chip ok">Assigned</span>';
  return '<span class="admin-chip">Monitoring</span>';
}

function renderReportsTable() {
  const wrap = document.getElementById('reports-table-wrap');
  if (!wrap) return;
  const reportRows = buildReportRows();

  wrap.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Report ID</th>
          <th>Reporter</th>
          <th>Incident</th>
          <th>Location</th>
          <th>Priority</th>
          <th>Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${reportRows.map((r) => `
          <tr>
            <td>${r.email}</td>
            <td>${r.name}</td>
            <td>${r.incidentTitle}</td>
            <td>${r.location}</td>
            <td><span class="${priorityClass(r.priority)}">${r.priority}</span></td>
            <td>${r.time}</td>
            <td>${statusChip(r.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.addEventListener('DOMContentLoaded', renderReportsTable);
