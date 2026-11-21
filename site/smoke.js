/* haven — the live smoke background. A fixed, full-viewport canvas behind the whole
   page: soft plum-blue plumes drifting slowly upward, composited additively so they
   read as smoke on near-black. Animates only while the tab is visible; a single
   settled frame under reduced motion. */
'use strict';

(function () {
  const canvas = document.querySelector('.page-smoke');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(1.5, devicePixelRatio || 1);

  let visible = !document.hidden, raf = 0, last = 0, w = 0, h = 0;

  function resize() {
    const dpr = reduceMotion ? 1 : DPR;
    w = canvas.width = Math.round(innerWidth * dpr);
    h = canvas.height = Math.round(innerHeight * dpr);
  }
  resize();
  addEventListener('resize', () => { resize(); if (reduceMotion) drawSettled(); });

  // Pre-rendered puff sprites: irregular clusters of soft radial blobs in three tints
  // (milk, plum-blue, a whisper of the accent), so no puff reads as a perfect circle.
  function makeSprite(size, tint) {
    const s = document.createElement('canvas');
    s.width = s.height = size;
    const g = s.getContext('2d');
    for (let i = 0; i < 7; i++) {
      const bx = size * (0.3 + Math.random() * 0.4);
      const by = size * (0.3 + Math.random() * 0.4);
      const br = size * (0.16 + Math.random() * 0.2);
      const grad = g.createRadialGradient(bx, by, 0, bx, by, br);
      grad.addColorStop(0, `rgba(${tint}, ${0.5 + Math.random() * 0.3})`);
      grad.addColorStop(1, `rgba(${tint}, 0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    }
    const soft = document.createElement('canvas');
    soft.width = soft.height = size;
    const sg = soft.getContext('2d');
    sg.filter = `blur(${size * 0.06}px)`;
    sg.drawImage(s, 0, 0);
    return soft;
  }

  const TINTS = ['150, 170, 214', '120, 140, 190', '170, 190, 228'];
  const sprites = TINTS.map(t => makeSprite(260, t));
  let puffs = [];

  function spawn(anywhere) {
    puffs.push({
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 120,
      vx: (Math.random() * 0.5 + 0.15) * DPR * (Math.random() < 0.5 ? -1 : 1),
      vy: -(Math.random() * 0.3 + 0.07) * DPR,
      scale: (0.9 + Math.random() * 2.6) * DPR,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.00025,
      life: 0,
      ttl: 30 + Math.random() * 26,
      alpha: 0.05 + Math.random() * 0.075,
    });
  }

  function draw(now) {
    if (!visible) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    if (puffs.length < 20 && Math.random() < 0.4) spawn(false);

    for (const p of puffs) {
      p.life += dt;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.rot += p.vr * dt;
      const fadeIn = Math.min(1, p.life / 7);
      const fadeOut = Math.min(1, Math.max(0, (p.ttl - p.life) / 7));
      const alpha = p.alpha * fadeIn * fadeOut;
      const size = p.sprite.width * p.scale * (1 + p.life * 0.01);
      if (alpha > 0.003) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(p.sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }
    puffs = puffs.filter(p => p.life < p.ttl && p.y > -p.sprite.width * 2);

    raf = requestAnimationFrame(draw);
  }

  function drawSettled() {
    // one composed frame so reduced-motion users still get the texture
    for (let i = 0; i < 900; i += 3) draw(i * 50);
  }

  document.addEventListener('visibilitychange', () => {
    if (reduceMotion) return;
    if (document.visibilityState === 'visible') { visible = true; last = 0; if (!raf) raf = requestAnimationFrame(draw); }
    else { visible = false; cancelAnimationFrame(raf); raf = 0; }
  });

  resize();
  for (let i = 0; i < 15; i++) spawn(true);   // pre-fill so the page never starts empty
  if (reduceMotion) drawSettled();
  else raf = requestAnimationFrame(draw);
})();
