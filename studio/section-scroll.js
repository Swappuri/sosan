// Treat a wheel burst and its trackpad momentum tail as a single gesture.
export class SectionGesture {
  constructor() { this.lastEvent = -Infinity; this.lastMove = -Infinity; this.total = 0; this.locked = false; }
  take(delta, now) {
    if (now - this.lastEvent > 200 && now - this.lastMove > 350) { this.locked = false; this.total = 0; }
    this.lastEvent = now;
    if (this.locked) return 0;
    this.total += delta;
    if (Math.abs(this.total) < 8) return 0;
    this.locked = true; this.lastMove = now;
    return Math.sign(this.total);
  }
}
