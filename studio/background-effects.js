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
    const rays = amount('lightRays');
    if (rays) {
      ctx.lineCap = 'round'; ctx.strokeStyle = settings.secondary;
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2 + time * .025;
        ctx.globalAlpha = Math.min(.3, rays * (.025 + beat * .065));
        ctx.lineWidth = (6 + bass * 10) * scale;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 145 * scale, y + Math.sin(angle) * 145 * scale);
        ctx.lineTo(x + Math.cos(angle) * width, y + Math.sin(angle) * width); ctx.stroke();
      }
    }
    const trails = amount('starTrails');
    if (trails) {
      ctx.strokeStyle = settings.primary; ctx.lineWidth = scale;
      for (let i = 0; i < 48; i++) {
        const angle = i * 2.399963, phase = ((i * .618034 + travel * .04) % 1);
        const radius = (40 + phase * 480) * scale;
        const length = (3 + bass * 24) * scale * phase;
        ctx.globalAlpha = Math.min(.8, trails * phase * (.18 + beat * .3));
        ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        ctx.lineTo(x + Math.cos(angle) * (radius + length), y + Math.sin(angle) * (radius + length)); ctx.stroke();
      }
    }
    const grid = amount('grid');
    if (grid) {
      const horizon = height * .57;
      ctx.strokeStyle = settings.secondary; ctx.lineWidth = scale;
      ctx.globalAlpha = Math.min(.45, grid * (.1 + bass * .08));
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(x + i * 9 * scale, horizon); ctx.lineTo(x + i * 95 * scale, height); ctx.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const phase = ((i + travel * .5) % 12) / 12;
        const py = horizon + phase * phase * (height - horizon);
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(width, py); ctx.stroke();
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
