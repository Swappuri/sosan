"use strict";

const particles = Array.from({ length: 100 }, (_, i) => ({ x: fract(Math.sin(i * 127.1 + 3) * 43758.5453), y: fract(Math.sin(i * 311.7 + 9) * 43758.5453), size: 0.6 + fract(Math.sin(i * 41.9) * 43758.5453) * 1.4, phase: i * 2.7 }));
function fract(n) { return n - Math.floor(n); }

function rgba(hex, alpha) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${v >> 8 & 255},${v & 255},${alpha})`; }
function blend(a, b, ratio) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round((x >> s & 255) * (1 - ratio) + (y >> s & 255) * ratio)).join(',')})`; }


export function renderScene(ctx, width, height, settings, motion, songTime, logo, title) {
  const scale = Math.min(width / 854, height / 480);
  const x = width / 2, y = height / 2;
  ctx.fillStyle = settings.background; ctx.fillRect(0, 0, width, height);
  const aura = ctx.createRadialGradient(x, y, 0, x, y, 360 * scale);
  aura.addColorStop(0, rgba(settings.primary, .09 + (settings.flashes ? motion.flash * .1 : 0)));
  aura.addColorStop(.55, rgba(settings.secondary, .025)); aura.addColorStop(1, rgba(settings.background, 0));
  ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
  // A restrained star field drifts outwards with the song clock.
  if (settings.particles) {
    for (const p of particles) {
      const px = fract(p.x + Math.cos(p.phase) * songTime * .003) * width;
      const py = fract(p.y - songTime * .004 * (p.size / 2)) * height;
      ctx.globalAlpha = .15 + .3 * (0.5 + 0.5 * Math.sin(songTime * .8 + p.phase));
      ctx.fillStyle = settings.primary; ctx.beginPath(); ctx.arc(px, py, p.size * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const pulse = settings.pulse ? Math.min(1, motion.bass) * 12 : 0;
  const radius = (settings.radius + pulse) * scale;
  const count = settings.bars;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const index = i < count / 2 ? i : count - i - 1;
    const level = motion.levels[index] || 0;
    const angle = i / count * Math.PI * 2 - Math.PI / 2 + (settings.rotation ?? 0) * Math.PI / 180;
    const length = (3 + Math.pow(level, 1.9) * 67) * scale;
    const color = blend(settings.primary, settings.secondary, index / (count / 2));
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.shadowColor = color; ctx.shadowBlur = settings.glow ? (9 + level * 9) * scale : 0;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * (radius + 8 * scale), y + Math.sin(angle) * (radius + 8 * scale));
    ctx.lineTo(x + Math.cos(angle) * (radius + 8 * scale + length), y + Math.sin(angle) * (radius + 8 * scale + length)); ctx.stroke();
  }
  ctx.shadowColor = settings.primary; ctx.shadowBlur = settings.glow ? 16 * scale : 0;
  ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = settings.primary;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(settings.secondary, .4); ctx.lineWidth = scale;
  ctx.beginPath(); ctx.arc(x, y, radius - 5 * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = settings.background; ctx.beginPath(); ctx.arc(x, y, radius - 9 * scale, 0, Math.PI * 2); ctx.fill();
  if (logo && logo.width > 0 && logo.height > 0) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius - 16 * scale, 0, Math.PI * 2); ctx.clip();
    const size = (radius - 20 * scale) * 2;
    const factor = Math.min(size / logo.width, size / logo.height);
    try {
      ctx.drawImage(logo, x - logo.width * factor / 2, y - logo.height * factor / 2, logo.width * factor, logo.height * factor);
    } finally {
      ctx.restore();
    }
  } else if (title) {
    let fontSize = Math.min(21 * scale, radius * .21);
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`;
    const maxWidth = radius * 1.55;
    if (ctx.measureText(title).width > maxWidth) fontSize *= maxWidth / ctx.measureText(title).width;
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eeeff2'; ctx.fillText(title, x, y);
  }
}
