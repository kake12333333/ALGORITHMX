const volunteerStore = {
  volunteers: [
    {
      id: 'VOL-110',
      name: 'Anjali Singh',
      age: 27,
      skills: ['Medical', 'First Aid'],
      status: 'Active',
      missionsCompleted: 18,
      pointsEarned: 1260
    },
    {
      id: 'VOL-111',
      name: 'Rohit Kumar',
      age: 32,
      skills: ['Rescue', 'Logistics'],
      status: 'Active',
      missionsCompleted: 24,
      pointsEarned: 1710
    },
    {
      id: 'VOL-112',
      name: 'Priya Nair',
      age: 24,
      skills: ['Coordination', 'Crowd Support'],
      status: 'Standby',
      missionsCompleted: 9,
      pointsEarned: 690
    },
    {
      id: 'VOL-113',
      name: 'Kunal Verma',
      age: 30,
      skills: ['Fire Safety', 'Evacuation'],
      status: 'Under Review',
      missionsCompleted: 6,
      pointsEarned: 420
    },
    {
      id: 'VOL-114',
      name: 'Meera Shah',
      age: 29,
      skills: ['Search Ops', 'Communications'],
      status: 'Active',
      missionsCompleted: 31,
      pointsEarned: 2160
    }
  ]
};

function getVolunteersData() {
  return volunteerStore.volunteers;
}

function statusClass(status) {
  if (status === 'Active') return 'ok';
  if (status === 'Standby') return 'warn';
  if (status === 'Under Review') return 'danger';
  return '';
}

function removeVolunteer(volunteerId) {
  const index = volunteerStore.volunteers.findIndex((v) => v.id === volunteerId);
  if (index === -1) return;
  volunteerStore.volunteers.splice(index, 1);
  renderVolunteers();
}

function renderVolunteers() {
  const list = document.getElementById('volunteers-list');
  if (!list) return;

  const volunteers = getVolunteersData();

  list.innerHTML = volunteers.map((v) => `
    <article class="admin-card" data-volunteer-id="${v.id}">
      <div class="admin-card-top">
        <div class="volunteer-name-wrap">
          <h3 class="admin-card-title">${v.name}</h3>
          <span class="volunteer-sub">Volunteer ID: ${v.id}</span>
        </div>
        <span class="admin-chip status-chip ${statusClass(v.status)}">${v.status}</span>
      </div>
      <div class="admin-meta">
        <div class="admin-meta-item"><div class="admin-meta-label">Age</div><div class="admin-meta-value">${v.age}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Status</div><div class="admin-meta-value">${v.status}</div></div>
        <div class="admin-meta-item"><div class="admin-meta-label">Track</div><div class="admin-meta-value">Volunteer</div></div>
      </div>
      <div class="vol-skill-list">${v.skills.map((skill) => `<span class="vol-skill">${skill}</span>`).join('')}</div>
      <div class="vol-stat-row">
        <div class="vol-stat"><div class="label">Missions Completed</div><div class="value">${v.missionsCompleted}</div></div>
        <div class="vol-stat"><div class="label">Points Earned</div><div class="value">${v.pointsEarned}</div></div>
      </div>
      <div class="admin-actions" style="margin-top:10px;">
        <button class="admin-btn danger" data-action="remove" data-volunteer-id="${v.id}">Remove</button>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-action="remove"]').forEach((button) => {
    button.addEventListener('click', function () {
      const volunteerId = button.getAttribute('data-volunteer-id');
      removeVolunteer(volunteerId);
    });
  });
}

document.addEventListener('DOMContentLoaded', renderVolunteers);
