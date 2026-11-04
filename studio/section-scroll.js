// Separate new wheel input from a continuous trackpad momentum tail.
export class SectionGesture {
  constructor() { this.lastEvent = -Infinity; this.lastMove = -Infinity; this.total = 0; this.locked = false; this.previous = 0; this.direction = 0; }
  take(delta, now, { discrete = false } = {}) {
    const magnitude = Math.abs(delta), direction = Math.sign(delta);
    const idle = now - this.lastEvent;
    const reversal = direction !== this.direction && magnitude >= 8 && now - this.lastMove > 100;
    const renewed = now - this.lastMove > 180 && this.previous < 10 && magnitude > Math.max(16, this.previous * 3);
    if (idle > 110 || reversal || renewed || (discrete && now - this.lastMove >= 90)) {
      this.locked = false; this.total = 0;
    }
    this.lastEvent = now; this.previous = magnitude;
    if (this.locked) return 0;
    this.total += delta;
    if (Math.abs(this.total) < 8) return 0;
    this.locked = true; this.lastMove = now; this.direction = Math.sign(this.total);
    return this.direction;
  }
}
export const SECTION_TRANSITION_MS = 220;
export function sectionEase(progress) {
  const t = Math.max(0, Math.min(1, progress));
  return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
