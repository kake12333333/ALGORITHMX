(function () {
  const ADMIN_SESSION_KEY = 'vpAdminSession';

  function guardAdminPage() {
    const isAdmin = localStorage.getItem(ADMIN_SESSION_KEY) === 'active';
    if (!isAdmin) {
      window.location.href = 'auth.html';
    }
  }

  function markActiveNav() {
    const file = window.location.pathname.split('/').pop();
    const links = document.querySelectorAll('.admin-link[data-page]');
    links.forEach((link) => {
      if (link.getAttribute('data-page') === file) {
        link.classList.add('active');
      }
    });
  }

  function attachLogout() {
    const logout = document.getElementById('admin-logout');
    if (!logout) return;
    logout.addEventListener('click', function () {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.setItem('vpRole', 'citizen');
      window.location.href = 'auth.html';
    });
  }

  function attachActionFeedback() {
    document.querySelectorAll('.admin-btn[data-action]').forEach((btn) => {
      btn.addEventListener('click', function () {
        const action = btn.getAttribute('data-action');
        const card = btn.closest('.admin-card');
        if (!card) return;
        const statusChip = card.querySelector('.admin-chip.status-chip');
        if (!statusChip) return;
        if (action === 'approve') {
          statusChip.textContent = 'Approved';
          statusChip.className = 'admin-chip status-chip ok';
        } else if (action === 'reject' || action === 'fake') {
          statusChip.textContent = 'Rejected';
          statusChip.className = 'admin-chip status-chip danger';
        } else if (action === 'escalate') {
          statusChip.textContent = 'Escalated';
          statusChip.className = 'admin-chip status-chip warn';
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    guardAdminPage();
    markActiveNav();
    attachLogout();
    attachActionFeedback();
  });
})();
