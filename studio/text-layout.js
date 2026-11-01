// Layout inside horizontal slices of an inset shape. Size is honored first;
// fitting falls back to smaller type only after all available lines are exhausted.
export function textHalfWidth(shape, radius, y) {
  if (shape === 'square') return Math.abs(y) <= radius * Math.SQRT1_2 ? radius * Math.SQRT1_2 : 0;
  if (shape === 'triangle') return y >= -radius && y <= radius / 2 ? (y + radius) / Math.sqrt(3) : 0;
  return Math.abs(y) <= radius ? Math.sqrt(Math.max(0, radius * radius - y * y)) : 0;
}

export function layoutText(text, shape, radius, requestedSize, measure) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { fontSize: requestedSize, lines: [] };
  const centerY = shape === 'triangle' ? radius / 8 : 0;
  const height = radius * (shape === 'triangle' ? 1.5 : shape === 'square' ? Math.SQRT2 : 2);
  const attempt = fontSize => {
    const lineHeight = fontSize * 1.2;
    const maxLines = Math.min(Array.from(text).length, Math.floor(height / lineHeight));
    for (let count = 1; count <= maxLines; count++) {
      const remaining = [...words], lines = [];
      let valid = true;
      for (let row = 0; row < count && remaining.length; row++) {
        const y = centerY + (row - (count - 1) / 2) * lineHeight;
        const width = 2 * Math.min(textHalfWidth(shape, radius, y - lineHeight / 2), textHalfWidth(shape, radius, y + lineHeight / 2));
        if (width <= 0) { valid = false; break; }
        let line = '';
        while (remaining.length) {
          const word = remaining[0], candidate = line ? `${line} ${word}` : word;
          if (measure(candidate, fontSize) <= width) { line = candidate; remaining.shift(); continue; }
          if (line) break;
          // A single unbroken token still has to stay within the shape.
          const characters = Array.from(word);
          let prefix = '';
          while (characters.length && measure(prefix + characters[0], fontSize) <= width) prefix += characters.shift();
          if (!prefix) { valid = false; break; }
          line = prefix;
          if (characters.length) remaining[0] = characters.join(''); else remaining.shift();
          break;
        }
        if (!valid) break;
        lines.push({ text: line, y, width });
      }
      if (valid && !remaining.length) return { fontSize, lines, lineHeight };
    }
    return null;
  };
  const requested = attempt(requestedSize);
  if (requested) return requested;
  let low = Math.min(1, requestedSize), high = requestedSize;
  let best = attempt(low);
  for (let step = 0; step < 12; step++) {
    const size = (low + high) / 2, result = attempt(size);
    if (result) { low = size; best = result; } else high = size;
  }
  return best ?? { fontSize: low, lines: [] };
}
