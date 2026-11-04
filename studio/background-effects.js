/** Deterministic background layers shared by the preview and export renderer. */
export function drawBackgroundEffects(ctx, width, height, settings, motion, time) {
  const scale = Math.min(width / 854, height / 480), x = width / 2, y = height / 2;
  const bass = Math.min(1, Math.max(0, motion.bass)), beat = Math.min(1, motion.flash);
  const travel = time + (motion.travel ?? 0);
  const amount = name => settings[name] ? (settings[name + 'Strength'] ?? 0) / 100 : 0;
  ctx.save();
  try {
    const nebula = amount('nebula');
    if (nebula) for (let i = 0; i < 3; i++) {
      const px = width * (.5 + .36 * Math.sin(time * .08 + i * 2.1));
      const py = height * (.5 + .32 * Math.cos(time * .06 + i * 1.7));
      const radius = (210 + bass * 30) * scale;
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, i % 2 ? settings.secondary : settings.primary);
      gradient.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(.4, nebula * (.08 + bass * .05));
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    }
    const aurora = amount('aurora');
    if (aurora) {
      ctx.lineCap = 'round';
      for (let ribbon = 0; ribbon < 3; ribbon++) {
        ctx.strokeStyle = ribbon % 2 ? settings.primary : settings.secondary;
        for (const [lineWidth, opacity] of [[18, .025], [6, .055], [1.5, .16]]) {
          ctx.lineWidth = lineWidth * scale;
          ctx.globalAlpha = Math.min(.6, aurora * opacity * (1 + beat * .7));
          ctx.beginPath();
          for (let step = 0; step <= 64; step++) {
            const px = step / 64 * width;
            const py = height * (.22 + ribbon * .27) + Math.sin(step / 64 * 7 + travel * .18 + ribbon * 1.5) * (24 + bass * 18) * scale + Math.sin(step / 64 * 13 - time * .13) * 12 * scale;
            if (!step) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      }
    }
    const constellation = amount('constellation');
    if (constellation) {
      const points = Array.from({ length: 34 }, (_, i) => ({
        x: ((i * .618034 + .035 * Math.sin(travel * .1 + i * 2)) % 1 + 1) % 1 * width,
        y: ((i * .414214 + .05 * Math.cos(travel * .12 + i)) % 1 + 1) % 1 * height,
      }));
      ctx.strokeStyle = settings.secondary; ctx.fillStyle = settings.primary; ctx.lineWidth = scale;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        ctx.globalAlpha = Math.min(.8, constellation * (.22 + beat * .25));
        ctx.beginPath(); ctx.arc(point.x, point.y, (1 + beat) * scale, 0, Math.PI * 2); ctx.fill();
        for (let j = i + 1; j < points.length; j++) {
          const other = points[j], distance = Math.hypot(point.x - other.x, point.y - other.y);
          if (distance > 130 * scale) continue;
          ctx.globalAlpha = Math.min(.5, constellation * (1 - distance / (130 * scale)) * (.14 + beat * .2));
          ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(other.x, other.y); ctx.stroke();
        }
      }
    }
    const grid = amount('grid');
    if (grid) {
      ctx.strokeStyle = settings.secondary; ctx.lineWidth = scale;
      for (const ceiling of [false, true]) {
        const horizon = height * (ceiling ? .43 : .57), edge = ceiling ? 0 : height;
        ctx.globalAlpha = Math.min(.45, grid * (.1 + bass * .08)) * (ceiling ? .65 : 1);
        for (let i = -8; i <= 8; i++) {
          ctx.beginPath(); ctx.moveTo(x + i * 9 * scale, horizon); ctx.lineTo(x + i * 95 * scale, edge); ctx.stroke();
        }
        for (let i = 0; i < 12; i++) {
          const phase = ((i + travel * .5) % 12) / 12;
          const py = horizon + phase * phase * (edge - horizon);
          ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(width, py); ctx.stroke();
        }
      }
    }
    const flies = amount('fireflies');
    if (flies) for (let i = 0; i < 26; i++) {
      const px = ((i * .618034 + .04 * Math.sin(travel * .13 + i)) % 1) * width;
      const py = ((i * .414214 + .06 * Math.cos(travel * .17 + i * 2)) % 1) * height;
      const radius = (6 + 3 * Math.sin(time + i) + beat * 4) * scale;
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, i % 2 ? settings.primary : settings.secondary); gradient.addColorStop(1, 'transparent');
      ctx.globalAlpha = Math.min(.8, flies * (.18 + beat * .35)); ctx.fillStyle = gradient;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
    const scan = amount('scanlines');
    if (scan) {
      ctx.fillStyle = settings.primary; ctx.globalAlpha = Math.min(.15, scan * (.025 + beat * .025));
      const spacing = 7 * scale, offset = (time * 8 * scale) % spacing;
      for (let py = offset; py < height; py += spacing) ctx.fillRect(0, py, width, Math.max(1, scale));
    }
  } finally { ctx.restore(); }
}
