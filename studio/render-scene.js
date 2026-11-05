import { spectrumPass } from './spectrum-pass.js';
import { drawBackgroundEffects } from './background-effects.js';
import { ECHO_LIFETIME } from './effect-motion.js';
import { TEXT_FAMILIES } from './text-fonts.js';
import { layoutText } from './text-layout.js';
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
  // Sharpen real frequency differences at the low end, then blend adjacent
  // bands progressively. Square the slider position to spread the contrast
  // transition across the first half without changing either endpoint. Shared by preview and browser video export.
  const amount = 200 * (Math.min(200, Math.max(0, smoothing)) / 200) ** 2;
  const passes = (amount / 50) ** 2;
  const contrast = 1 + 1.2 * Math.max(0, 1 - amount / 50);
  const mean = levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length);
  const weights = [1, 4, 6, 4, 1];
  let result = Float32Array.from(levels, value => Math.max(0, Math.min(1, mean + (value - mean) * contrast)));
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

export function renderScene(ctx, width, height, settings, motion, songTime, logo, title, backgroundImage = null) {
  const scale = Math.min(width / 854, height / 480);
  const x = width / 2, y = height / 2;
  ctx.fillStyle = settings.background; ctx.fillRect(0, 0, width, height);
  if (backgroundImage && backgroundImage.width > 0 && backgroundImage.height > 0) {
    const placement = backgroundPlacement(width, height, backgroundImage.width, backgroundImage.height, settings.backgroundFit, settings.backgroundZoom, settings.backgroundX, settings.backgroundY);
    ctx.save();
    try {
      ctx.globalAlpha = (settings.backgroundOpacity ?? 100) / 100;
      ctx.drawImage(backgroundImage, placement.x, placement.y, placement.width, placement.height);
    } finally { ctx.restore(); }
  }
  const strength = name => (settings[name + 'Strength'] ?? 100) / 100;
  const ambient = (settings.aura ?? true) ? strength('aura') : 0;
  const flashLight = settings.flashes ? motion.flash * .18 * strength('flashes') : 0;
  if (ambient || flashLight > 0) {
    const aura = ctx.createRadialGradient(x, y, 0, x, y, 360 * scale);
    aura.addColorStop(0, rgba(settings.primary, Math.min(.9, .09 * ambient + flashLight)));
    aura.addColorStop(.55, rgba(settings.secondary, Math.min(.7, .025 * ambient + flashLight * .6)));
    aura.addColorStop(1, rgba(settings.background, 0));
    ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
  }
  drawBackgroundEffects(ctx, width, height, settings, motion, songTime);
  const particleClock = songTime + (motion.travel ?? 0);
  // A restrained star field drifts outwards with the song clock.
  if (settings.particles) {
    for (const p of particles) {
      const px = fract(p.x + Math.cos(p.phase) * particleClock * .003) * width;
      const py = fract(p.y - particleClock * .004 * (p.size / 2)) * height;
      ctx.globalAlpha = Math.min(1, (.15 + .3 * (0.5 + .5 * Math.sin(songTime * .8 + p.phase))) * strength('particles') * (1 + Math.min(1, motion.flash) * 1.5));
      ctx.fillStyle = settings.primary; ctx.beginPath(); ctx.arc(px, py, p.size * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const pulse = settings.pulse ? Math.min(1, motion.bass) * 12 * strength('pulse') : 0;
  const radius = (settings.radius + pulse) * scale;
  const shape = settings.shape ?? 'circle';
  if (settings.echoRings && strength('echoRings') > 0) {
    ctx.save();
    for (const [ring, beat] of (motion.echoes ?? []).entries()) {
      const age = songTime - beat.time;
      if (age < 0 || age >= ECHO_LIFETIME) continue;
      const phase = age / ECHO_LIFETIME;
      ctx.strokeStyle = rgba(ring % 2 ? settings.secondary : settings.primary, Math.min(1, (1 - phase) ** 2 * beat.strength * .55 * strength('echoRings')));
      ctx.lineWidth = 1.2 * scale;
      // The pulse begins inside the silhouette; the foreground fill masks it until it emerges.
      traceShape(ctx, shape, x, y, settings.radius * scale * .92 + phase * 130 * scale); ctx.stroke();
    }
    ctx.restore();
  }
  const count = shape === 'circle' && settings.style === 'wave' ? Math.max(512, settings.bars) : settings.bars;
  const levels = smoothSpectrum(motion.levels, settings.smoothing);
  const layers = settings.extendSpectrum ? Math.ceil((Math.hypot(width / 2, height / 2) * (shape === 'triangle' ? 2 : shape === 'square' ? Math.SQRT2 : 1) - radius) / (100 * scale)) + 1 : 1;
  const spectrum = spectrumPass(ctx, scale, settings.glow ? strength('glow') : 0);
  ctx.lineCap = 'round';
  for (let layer = 0; layer < layers; layer++) {
    const wave = [];
    for (let i = 0; i < count; i++) {
      const bands = settings.bars / 2;
      const position = (i + .5) / count;
      const sideIndex = Math.max(0, Math.min(bands - 1, (position < .5 ? position : 1 - position) * settings.bars - .5));
      const index = spectrumBandPosition(sideIndex, bands, settings.rotation);
      const first = Math.floor(index), fraction = index - first;
      const level = (levels[first] || 0) * (1 - fraction) + (levels[Math.min(first + 1, bands - 1)] || 0) * fraction;
      const angle = (i + .5) / count * Math.PI * 2 - Math.PI / 2;
      const boundary = shapeRadius(shape, radius + layer * 100 * scale, angle);
      const length = (3 + Math.pow(level, 1.35) * 67) * scale;
      const color = blend(settings.primary, settings.secondary, index / bands);
      if (settings.style === 'wave') {
        wave.push({ x: x + Math.cos(angle) * (boundary + 8 * scale + length), y: y + Math.sin(angle) * (boundary + 8 * scale + length), color, level, position: index / bands });
        continue;
      }
      spectrum.draw({ color, level, position: index / bands,
        start: [x + Math.cos(angle) * (boundary + 8 * scale), y + Math.sin(angle) * (boundary + 8 * scale)],
        end: [x + Math.cos(angle) * (boundary + 8 * scale + length), y + Math.sin(angle) * (boundary + 8 * scale + length)] });
    }
    // Quadratic segments meet at shared midpoints for one continuous wavy outline.
    for (let i = 0; i < wave.length; i++) {
      const point = wave[i], previous = wave[(i + wave.length - 1) % wave.length], next = wave[(i + 1) % wave.length];
      spectrum.draw({ color: point.color, level: point.level, position: point.position,
        start: [(previous.x + point.x) / 2, (previous.y + point.y) / 2], control: [point.x, point.y],
        end: [(point.x + next.x) / 2, (point.y + next.y) / 2] });
    }
  }
  spectrum.finish();
  ctx.shadowBlur = 0;
  ctx.fillStyle = settings.innerFill ?? '#0b1114'; traceShape(ctx, shape, x, y, radius); ctx.fill();
  if (logo && logo.width > 0 && logo.height > 0) {
    ctx.save(); traceShape(ctx, shape, x, y, radius); ctx.clip();
    const placement = logoPlacement(shape, radius, logo.width, logo.height, settings.logoFit, settings.logoZoom, settings.logoX, settings.logoY);
    try {
      ctx.globalAlpha = (settings.logoOpacity ?? 100) / 100;
      ctx.drawImage(logo, x + placement.x, y + placement.y, placement.width, placement.height);
    } finally {
      ctx.restore();
    }
  }
  if (title) {
    const family = TEXT_FAMILIES[settings.textFont ?? 'poppins'] ?? TEXT_FAMILIES.poppins;
    const inset = radius * .9;
    const layout = layoutText(title, shape, inset, 21 * scale * (settings.textSize ?? 100) / 100, (text, size) => {
      ctx.font = `600 ${size}px ${family}`; return ctx.measureText(text).width;
    });
    ctx.save();
    try {
      traceShape(ctx, shape, x, y, inset); ctx.clip();
      ctx.font = `600 ${layout.fontSize}px ${family}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = settings.textColor ?? '#eeeff2';
      for (const line of layout.lines) ctx.fillText(line.text, x, y + line.y);
    } finally { ctx.restore(); }
  }
  // Fill and logo reach the primary outline; the optional secondary rim overlays them.
  ctx.shadowColor = settings.primary; ctx.shadowBlur = settings.glow ? 16 * scale * strength('glow') : 0;
  ctx.lineWidth = 1.5 * scale; ctx.strokeStyle = settings.primary;
  traceShape(ctx, shape, x, y, radius); ctx.stroke();
  ctx.shadowBlur = 0;
  if (settings.innerRing ?? true) {
    ctx.strokeStyle = rgba(settings.secondary, .4); ctx.lineWidth = scale;
    const insetRadius = radius - 5 * scale / (shape === 'triangle' ? .5 : shape === 'square' ? Math.SQRT1_2 : 1);
    traceShape(ctx, shape, x, y, insetRadius); ctx.stroke();
  }

  if (settings.orbitLights && strength('orbitLights') > 0) {
    const reach = orbitRadius(radius, levels, scale, settings.glow, settings.glowStrength ?? 100);
    ctx.save();
    for (let light = 0; light < 2; light++) {
      const color = light ? settings.secondary : settings.primary;
      for (let trail = 12; trail >= 0; trail--) {
        const angle = songTime * .7 + light * Math.PI - trail * .025;
        const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach;
        const alpha = Math.min(1, (1 - trail / 13) * (.35 + Math.min(1, motion.bass) * .65) * strength('orbitLights'));
        ctx.fillStyle = rgba(color, alpha); ctx.beginPath();
        ctx.arc(px, py, (trail === 0 ? 3 : 1.4) * scale, 0, Math.PI * 2); ctx.fill();
        if (trail === 0) {
          const halo = ctx.createRadialGradient(px, py, 0, px, py, 14 * scale);
          halo.addColorStop(0, rgba(color, alpha * .5)); halo.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = halo; ctx.fillRect(px - 14 * scale, py - 14 * scale, 28 * scale, 28 * scale);
        }
      }
    }
    ctx.restore();
  }
  if (settings.vignette) {
    const edge = ctx.createRadialGradient(x, y, 0, x, y, Math.hypot(x, y));
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.35, 'rgba(0,0,0,0)'); edge.addColorStop(1, `rgba(0,0,0,${Math.min(.9, .6 * strength('vignette'))})`);
    ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height);
  }

}

export function backgroundPlacement(width, height, imageWidth, imageHeight, fit = 'cover', zoom = 100, offsetX = 0, offsetY = 0) {
  const factor = (fit === 'contain' ? Math.min : Math.max)(width / imageWidth, height / imageHeight) * zoom / 100;
  return { x: (width - imageWidth * factor) / 2 + offsetX / 100 * width / 2, y: (height - imageHeight * factor) / 2 + offsetY / 100 * height / 2, width: imageWidth * factor, height: imageHeight * factor };
}

export function orbitRadius(radius, levels, scale, glow = true, glowStrength = 100) {
  const peak = Math.max(0, ...levels);
  const longest = 3 + peak ** 1.35 * 67;
  const clearance = 24 + (glow ? 18 * glowStrength / 100 : 0);
  return radius + (8 + longest + clearance) * scale;
}
