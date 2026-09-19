export class ThrowGesture {
  begin(id, x, y, power, height) {
    if (this.active) { this.cancel(); return false; }
    this.active = { id, x, y, power, height: Math.max(1, height), distance: 0 }; return true;
  }
  move(id, x, y) {
    const a = this.active; if (!a || a.id !== id) return null;
    a.distance = Math.max(a.distance, Math.hypot(x - a.x, y - a.y));
    return { armed: a.distance >= 14, power: Math.round(Math.max(25, Math.min(100, a.power + (y - a.y) / a.height * 140))) };
  }
  end(id, x, y, inside) {
    const state = this.move(id, x, y); this.cancel();
    return !state || !inside ? 'cancel' : state.armed ? 'throw' : 'tap';
  }
  cancel() { this.active = null; }
}
