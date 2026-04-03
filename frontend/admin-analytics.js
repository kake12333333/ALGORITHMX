const analyticsData = {
  priority: [
    { label: 'High Priority', value: 72, className: 'high' },
    { label: 'Medium Priority', value: 54, className: 'medium' },
    { label: 'Low Priority', value: 31, className: 'low' }
  ],
  zones: [
    { label: 'Andheri Cluster', value: 78 },
    { label: 'Bandra Cluster', value: 61 },
    { label: 'Kurla Cluster', value: 56 },
    { label: 'South Zone', value: 38 }
  ]
};

function renderChart(containerId, data, withClass) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = data.map((item) => `
    <div class="admin-bar">
      <div class="admin-bar-label">${item.label} (${item.value}%)</div>
      <div class="admin-bar-track">
        <div class="admin-bar-fill ${withClass && item.className ? item.className : ''}" style="width:${item.value}%;"></div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', function () {
  renderChart('priority-chart', analyticsData.priority, true);
  renderChart('zone-chart', analyticsData.zones, false);
});
