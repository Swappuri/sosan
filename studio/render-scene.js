"use strict";

const particles = Array.from({ length: 100 }, (_, i) => ({ x: fract(Math.sin(i * 127.1 + 3) * 43758.5453), y: fract(Math.sin(i * 311.7 + 9) * 43758.5453), size: 0.6 + fract(Math.sin(i * 41.9) * 43758.5453) * 1.4, phase: i * 2.7 }));
function fract(n) { return n - Math.floor(n); }

function rgba(hex, alpha) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${v >> 8 & 255},${v & 255},${alpha})`; }
function blend(a, b, ratio) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round((x >> s & 255) * (1 - ratio) + (y >> s & 255) * ratio)).join(',')})`; }


// A continuous distance from the bass position, never a wrapped bass/treble seam.
export function spectrumBandPosition(position, bands, rotation = 0) {
  const last = bands - 1;
  const bass = Math.min(180, Math.max(0, rotation)) / 180 * last;
  return Math.abs(position - bass) / Math.max(bass, last - bass, 1) * last;
}

export function smoothSpectrum(levels, smoothing = 50) {
  // Zero keeps the original peaks; 50% matches the previous default filter.
  const passes = (Math.min(100, Math.max(0, smoothing)) / 50) ** 2;
  const weights = [1, 4, 6, 4, 1];
  let result = levels;
  for (let pass = 0; pass < Math.ceil(passes); pass++) {
    const blend = Math.min(1, passes - pass);
    const previous = result;
    result = Float32Array.from(previous, (value, index) => {
      const filtered = weights.reduce((sum, weight, offset) =>
        sum + weight * previous[Math.max(0, Math.min(previous.length - 1, index + offset - 2))], 0) / 16;
      return value + (filtered - value) * blend;
    });
  }
  return result;
}

export function shapeRadius(shape, radius, angle) {
  if (shape === 'square') return radius / Math.SQRT2 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
  if (shape === 'triangle') return radius * .5 / Math.max(...[0, 1, 2].map(i => Math.cos(angle - (-Math.PI / 6 + i * Math.PI * 2 / 3))));
  return radius;
}

// Walk the actual perimeter at a constant speed; polygon bars use edge normals.
export function perimeterPoint(shape, radius, progress) {
  if (shape !== 'square' && shape !== 'triangle') {
    const angle = progress * Math.PI * 2 - Math.PI / 2;
    const nx = Math.cos(angle), ny = Math.sin(angle);
    return { x: nx * radius, y: ny * radius, nx, ny };
  }
  const sides = shape === 'square' ? 4 : 3;
  const start = shape === 'square' ? -Math.PI * .75 : -Math.PI / 2;
  const distance = ((progress * sides + (shape === 'square' ? .5 : 0)) % sides + sides) % sides;
  const edge = Math.floor(distance), t = distance - edge;
  const a = start + edge * Math.PI * 2 / sides, b = a + Math.PI * 2 / sides;
  const ax = Math.cos(a) * radius, ay = Math.sin(a) * radius;
  const dx = Math.cos(b) * radius - ax, dy = Math.sin(b) * radius - ay;
  const length = Math.hypot(dx, dy);
  return { x: ax + dx * t, y: ay + dy * t, nx: dy / length, ny: -dx / length };
}

// Sample a rounded offset perimeter, including the full arc around every corner.
export function spectrumPoint(shape, radius, progress, offset) {
  if (shape !== 'square' && shape !== 'triangle') return perimeterPoint(shape, radius + offset, progress);
  const sides = shape === 'square' ? 4 : 3, turn = Math.PI * 2 / sides;
  const start = shape === 'square' ? -Math.PI * .75 : -Math.PI / 2;
  const edgeLength = 2 * radius * Math.sin(Math.PI / sides), arcLength = offset * turn;
  const segment = edgeLength + arcLength;
  const origin = shape === 'square' ? arcLength + edgeLength / 2 : arcLength / 2;
  const distance = ((progress * sides * segment + origin) % (sides * segment) + sides * segment) % (sides * segment);
  const vertex = Math.floor(distance / segment), local = distance - vertex * segment;
  const angle = start + vertex * turn;
  let nx, ny, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
  if (local < arcLength) {
    const normal = angle - turn / 2 + local / offset;
    nx = Math.cos(normal); ny = Math.sin(normal);
  } else {
    const normal = angle + turn / 2, t = (local - arcLength) / edgeLength;
    nx = Math.cos(normal); ny = Math.sin(normal);
    x += (Math.cos(angle + turn) * radius - x) * t;
    y += (Math.sin(angle + turn) * radius - y) * t;
  }
  return { x: x + nx * offset, y: y + ny * offset, nx, ny };
}

// Space polygon samples along the actual animated outer contour, rather than
// the short inner corner arcs whose diverging normals leave wide gaps at the tips.
export function spectrumSamples(shape, radius, count, bars, levels, rotation, scale) {
  const bands = bars / 2;
  const referenceLength = (3 + levels.reduce((sum, value) => sum + Math.pow(value, 1.35), 0) / Math.max(1, levels.length) * 67) * scale;
  const sample = position => {
    const side = Math.max(0, Math.min(bands - 1, (position < .5 ? position : 1 - position) * bars - .5));
    const index = spectrumBandPosition(side, bands, rotation);
    const first = Math.floor(index), fraction = index - first;
    const level = (levels[first] || 0) * (1 - fraction) + (levels[Math.min(first + 1, bands - 1)] || 0) * fraction;
    const point = spectrumPoint(shape, radius, position, 8 * scale + referenceLength);
    point.x -= point.nx * referenceLength; point.y -= point.ny * referenceLength;
    const length = (3 + Math.pow(level, 1.35) * 67) * scale;
    return { ...point, index, level, length, tipX: point.x + point.nx * length, tipY: point.y + point.ny * length };
  };
  if (shape !== 'square' && shape !== 'triangle') return Array.from({ length: count }, (_, i) => sample((i + .5) / count));
  const resolution = 2048, cumulative = new Float64Array(resolution + 1);
  let previous = sample(0);
  for (let i = 1; i <= resolution; i++) {
    const point = sample(i / resolution);
    cumulative[i] = cumulative[i - 1] + Math.hypot(point.tipX - previous.tipX, point.tipY - previous.tipY);
    previous = point;
  }
  let cursor = 1;
  return Array.from({ length: count }, (_, i) => {
    const distance = (i + .5) / count * cumulative[resolution];
    while (cursor < resolution && cumulative[cursor] < distance) cursor++;
    const fraction = (distance - cumulative[cursor - 1]) / (cumulative[cursor] - cumulative[cursor - 1] || 1);
    return sample((cursor - 1 + fraction) / resolution);
  });
}

// Image placement is independent of the preview size and shared with MP4 rendering.
export function logoPlacement(shape, radius, width, height, fit = 'cover', zoom = 100, offsetX = 0, offsetY = 0) {
  let factor, centerY = 0;
  if (fit === 'contain') {
    if (shape === 'triangle') {
      factor = 1.5 * radius / (height + Math.sqrt(3) * width / 2);
      centerY = radius / 2 - height * factor / 2;
    } else if (shape === 'square') factor = Math.min(Math.SQRT2 * radius / width, Math.SQRT2 * radius / height);
    else factor = 2 * radius / Math.hypot(width, height);
  } else {
    const boxWidth = radius * (shape === 'triangle' ? Math.sqrt(3) : shape === 'square' ? Math.SQRT2 : 2);
    const boxHeight = radius * (shape === 'triangle' ? 1.5 : shape === 'square' ? Math.SQRT2 : 2);
    factor = Math.max(boxWidth / width, boxHeight / height);
    if (shape === 'triangle') centerY = -radius / 4;
  }
  const w = width * factor * zoom / 100, h = height * factor * zoom / 100;
  return { x: radius * offsetX / 100 - w / 2, y: centerY + radius * offsetY / 100 - h / 2, width: w, height: h };
}

function traceShape(ctx, shape, x, y, radius) {
  ctx.beginPath();
  if (shape !== 'square' && shape !== 'triangle') { ctx.arc(x, y, radius, 0, Math.PI * 2); return; }
  const sides = shape === 'square' ? 4 : 3;
  const start = shape === 'square' ? -Math.PI * .75 : -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const angle = start + i * Math.PI * 2 / sides;
    const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

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
  const shape = settings.shape ?? 'circle';
  const contentRadius = radius * (shape === 'triangle' ? .5 : shape === 'square' ? Math.SQRT1_2 : 1);
  const count = settings.style === 'wave' ? Math.max(512, settings.bars) : settings.bars;
  const levels = smoothSpectrum(motion.levels, settings.smoothing);
  const wave = [];
  ctx.lineCap = 'round';
  for (const point of spectrumSamples(shape, radius, count, settings.bars, levels, settings.rotation, scale)) {
    const { index, level, length } = point;
    const bands = settings.bars / 2;
    const color = blend(settings.primary, settings.secondary, index / bands);
    if (settings.style === 'wave') {
      wave.push({ x: x + point.x + point.nx * length, y: y + point.y + point.ny * length, color, level });
      continue;
    }
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.shadowColor = color; ctx.shadowBlur = settings.glow ? (9 + level * 9) * scale : 0;
    ctx.beginPath(); ctx.moveTo(x + point.x, y + point.y);
    ctx.lineTo(x + point.x + point.nx * length, y + point.y + point.ny * length); ctx.stroke();
  }
  // Quadratic segments meet at shared midpoints for one continuous wavy outline.
  for (let i = 0; i < wave.length; i++) {
    const point = wave[i], previous = wave[(i + wave.length - 1) % wave.length], next = wave[(i + 1) % wave.length];
    ctx.strokeStyle = point.color; ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.shadowColor = point.color; ctx.shadowBlur = settings.glow ? (9 + point.level * 9) * scale : 0;
    ctx.beginPath(); ctx.moveTo((previous.x + point.x) / 2, (previous.y + point.y) / 2);
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = settings.innerFill ?? '#0b1114'; traceShape(ctx, shape, x, y, radius); ctx.fill();
  if (logo && logo.width > 0 && logo.height > 0) {
    ctx.save(); traceShape(ctx, shape, x, y, radius); ctx.clip();
    const placement = logoPlacement(shape, radius, logo.width, logo.height, settings.logoFit, settings.logoZoom, settings.logoX, settings.logoY);
    try {
      ctx.drawImage(logo, x + placement.x, y + placement.y, placement.width, placement.height);
    } finally {
      ctx.restore();
    }
  } else if (title) {
    let fontSize = Math.min(21 * scale, contentRadius * .21);
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`;
    const maxWidth = contentRadius * 1.55;
    if (ctx.measureText(title).width > maxWidth) fontSize *= maxWidth / ctx.measureText(title).width;
    ctx.font = `600 ${fontSize}px Tektur, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#eeeff2'; ctx.fillText(title, x, y);
  }
  // Fill and logo reach the primary outline; the optional secondary rim overlays them.
  ctx.shadowColor = settings.primary; ctx.shadowBlur = settings.glow ? 16 * scale : 0;
  ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = settings.primary;
  traceShape(ctx, shape, x, y, radius); ctx.stroke();
  ctx.shadowBlur = 0;
  if (settings.innerRing ?? true) {
    ctx.strokeStyle = rgba(settings.secondary, .4); ctx.lineWidth = scale;
    const insetRadius = radius - 5 * scale / (shape === 'triangle' ? .5 : shape === 'square' ? Math.SQRT1_2 : 1);
    traceShape(ctx, shape, x, y, insetRadius); ctx.stroke();
  }

}
