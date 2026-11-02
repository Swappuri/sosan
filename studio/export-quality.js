// Share the size estimate and encoder quality so the browser memory guard stays accurate.
export function exportBitrate(height, fps) {
  const base = height >= 2160 ? 28_000_000 : height >= 1440 ? 14_000_000 : height >= 1080 ? 7_000_000 : height >= 720 ? 3_800_000 : height >= 480 ? 1_800_000 : 900_000;
  return Math.round(base * Math.max(.6, fps / 30) ** .65);
}
