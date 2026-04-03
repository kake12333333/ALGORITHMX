(function () {
  // ===== CITIZEN COMMON SCRIPT =====
  // THIS SCRIPT HANDLES GLOBAL UI EFFECTS USED ACROSS PAGES.

  // TICKER DATA SOURCE
  const defaultTicker = [
    { col: 'red', text: 'HIGH ALERT — Structure fire reported in Andheri West' },
    { col: 'yellow', text: 'MEDIUM — Flood watch active in Bandra East' },
    { col: 'green', text: 'RESOLVED — Power outage fixed in Dadar' },
    { col: 'red', text: 'HIGH ALERT — Building collapse risk in Kurla' },
    { col: 'yellow', text: 'MEDIUM — Traffic incident on Western Express Hwy' },
    { col: 'green', text: 'RESOLVED — Medical emergency handled in Colaba' }
  ];

  // HANDLE PARTICLE AND ATMOSPHERIC BACKGROUND
  function initBackground() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 0.8 + 0.2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      a: Math.random()
    }));

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function draw() {
      ctx.fillStyle = 'rgba(2,8,24,0.13)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        p.a = Math.abs(Math.sin(Date.now() / 3000 + p.x));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(77,159,255,${p.a * 0.68})`;
        ctx.fill();
      });
      const t = Date.now() / 8000;
      [[.2, .3, '#1a6fff', 190], [.7, .6, '#00ff9d', 130], [.5, .8, '#ff4444', 90]].forEach(([cx, cy, col, r]) => {
        const gx = canvas.width * (cx + Math.sin(t) * 0.04);
        const gy = canvas.height * (cy + Math.cos(t) * 0.04);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, col + '2a');
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
      const depth = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.45, 20, canvas.width * 0.5, canvas.height * 0.45, canvas.height * 0.8);
      depth.addColorStop(0, 'rgba(26,111,255,0.05)');
      depth.addColorStop(1, 'transparent');
      ctx.fillStyle = depth;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    draw();
  }

  // HANDLE GLOWING EARTH CANVAS ANIMATION
  function initEarth() {
    const canvas = document.getElementById('earth-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 400, cy = 400, r = 300;
    let rot = 0;
    function draw() {
      ctx.clearRect(0, 0, 800, 800);
      rot += 0.002;
      const sphere = ctx.createRadialGradient(350, 320, 20, cx, cy, r);
      sphere.addColorStop(0, '#0a2a6e');
      sphere.addColorStop(0.5, '#051535');
      sphere.addColorStop(1, '#020818');
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = sphere;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = 'rgba(26,111,255,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 18; i++) {
        const angle = i / 18 * Math.PI * 2 + rot;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * Math.abs(Math.cos(angle)), r, angle, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      const glow = ctx.createRadialGradient(cx, cy, r - 10, cx, cy, r + 40);
      glow.addColorStop(0, 'rgba(26,111,255,0.25)');
      glow.addColorStop(0.5, 'rgba(0,255,157,0.1)');
      glow.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, r + 40, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      requestAnimationFrame(draw);
    }
    draw();
  }

  // HANDLE BOTTOM ALERT TICKER RENDERING
  function buildTicker(items = defaultTicker) {
    const ticker = document.getElementById('ticker');
    if (!ticker) return;
    const content = [...items, ...items].map(d => `
      <span class="ticker-item">
        <span class="ticker-dot ${d.col}"></span>
        ${d.text}
      </span>
    `).join('');
    ticker.innerHTML = content;
  }

  // HANDLE PAGE TRANSITION ANIMATION ON LINK CLICK
  function attachPageTransition() {
    document.querySelectorAll('a[href$=".html"]').forEach(link => {
      link.addEventListener('click', () => {
        document.body.classList.add('page-leaving');
      });
    });
  }

  window.VP = {
    initBackground,
    initEarth,
    buildTicker,
    attachPageTransition,
    defaultTicker
  };

  // INITIALIZE ALL GLOBAL FEATURES ON PAGE LOAD
  document.addEventListener('DOMContentLoaded', () => {
    initBackground();
    initEarth();
    buildTicker();
    attachPageTransition();
  });
})();
