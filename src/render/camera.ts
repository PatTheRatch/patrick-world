import type { Bounds } from '../plan/types';
import type { Point } from '../world/types';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Flight {
  from: { x: number; y: number; k: number };
  to: { x: number; y: number; k: number };
  start: number;
  duration: number;
  /** How far the arc pulls out mid-flight, as a zoom factor below the straight path. */
  lift: number;
}

/** World↔screen transform with inertial panning and eased flights. `k` is pixels per world unit. */
export class Camera {
  x = 0;
  y = 0;
  k = 1;
  width = 1;
  height = 1;
  minK = 0.05;
  maxK = 16;
  /** Insets (px) the framing should keep clear of, e.g. the edition dial. */
  pad = { top: 40, right: 40, bottom: 96, left: 40 };

  private vx = 0;
  private vy = 0;
  private flight: Flight | null = null;
  reducedMotion = false;

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  toScreen(p: Point): Point {
    return { x: (p.x - this.x) * this.k + this.width / 2, y: (p.y - this.y) * this.k + this.height / 2 };
  }
  toWorld(p: Point): Point {
    return { x: (p.x - this.width / 2) / this.k + this.x, y: (p.y - this.height / 2) / this.k + this.y };
  }

  /** Visible world rectangle, grown by `margin` world units. */
  view(margin = 0): Bounds {
    const w = this.width / this.k;
    const h = this.height / this.k;
    return { x: this.x - w / 2 - margin, y: this.y - h / 2 - margin, w: w + margin * 2, h: h + margin * 2 };
  }

  sees(b: Bounds, margin = 0): boolean {
    const v = this.view(margin);
    return b.x < v.x + v.w && b.x + b.w > v.x && b.y < v.y + v.h && b.y + b.h > v.y;
  }

  get moving(): boolean {
    return this.flight !== null || Math.abs(this.vx) + Math.abs(this.vy) > 0.02;
  }

  panBy(dxPx: number, dyPx: number) {
    this.flight = null;
    this.x -= dxPx / this.k;
    this.y -= dyPx / this.k;
  }

  fling(vxPx: number, vyPx: number) {
    this.vx = vxPx;
    this.vy = vyPx;
  }

  stop() {
    this.vx = 0;
    this.vy = 0;
    this.flight = null;
  }

  zoomAt(screen: Point, factor: number) {
    this.flight = null;
    const before = this.toWorld(screen);
    this.k = clamp(this.k * factor, this.minK, this.maxK);
    const after = this.toWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** The zoom and centre that frame `b` inside the padded viewport. */
  framing(b: Bounds, maxK = this.maxK): { x: number; y: number; k: number } {
    const availW = Math.max(120, this.width - this.pad.left - this.pad.right);
    const availH = Math.max(120, this.height - this.pad.top - this.pad.bottom);
    const k = clamp(Math.min(availW / b.w, availH / b.h), this.minK, maxK);
    const cx = b.x + b.w / 2 + (this.pad.right - this.pad.left) / 2 / k;
    const cy = b.y + b.h / 2 + (this.pad.bottom - this.pad.top) / 2 / k;
    return { x: cx, y: cy, k };
  }

  jumpTo(target: { x: number; y: number; k: number }) {
    this.stop();
    this.x = target.x;
    this.y = target.y;
    this.k = clamp(target.k, this.minK, this.maxK);
  }

  /** Fly along an arc that pulls out before coming in, so distance is felt. */
  flyTo(target: { x: number; y: number; k: number }, now: number) {
    const to = { ...target, k: clamp(target.k, this.minK, this.maxK) };
    if (this.reducedMotion) return this.jumpTo(to);
    this.vx = this.vy = 0;
    const distPx = Math.hypot(to.x - this.x, to.y - this.y) * Math.min(this.k, to.k);
    const zoomSpan = Math.abs(Math.log(to.k / this.k));
    const travel = distPx / Math.max(this.width, this.height);
    const lift = clamp(travel - 0.6, 0, 2.2) * 0.42;
    const duration = clamp(420 + 260 * zoomSpan + 300 * Math.min(travel, 3), 420, 1500);
    this.flight = { from: { x: this.x, y: this.y, k: this.k }, to, start: now, duration, lift };
  }

  /** Advance animation. Returns true if anything moved. */
  tick(now: number, dt: number): boolean {
    if (this.flight) {
      const f = this.flight;
      const raw = clamp((now - f.start) / f.duration, 0, 1);
      const t = easeInOut(raw);
      const logK = Math.log(f.from.k) + (Math.log(f.to.k) - Math.log(f.from.k)) * t;
      const k = Math.exp(logK - f.lift * Math.sin(Math.PI * t));
      // Move the centre faster while pulled out: weight progress by inverse zoom.
      this.k = clamp(k, this.minK, this.maxK);
      this.x = f.from.x + (f.to.x - f.from.x) * t;
      this.y = f.from.y + (f.to.y - f.from.y) * t;
      if (raw >= 1) this.flight = null;
      return true;
    }
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.02) {
      this.x -= (this.vx * dt) / this.k;
      this.y -= (this.vy * dt) / this.k;
      const decay = Math.pow(0.994, dt);
      this.vx *= decay;
      this.vy *= decay;
      return true;
    }
    return false;
  }

  /** Keep the centre within the sheet plus a little table. */
  constrain(world: { width: number; height: number }) {
    const slackX = (this.width / this.k) * 0.35;
    const slackY = (this.height / this.k) * 0.35;
    this.x = clamp(this.x, -slackX + 0, world.width + slackX);
    this.y = clamp(this.y, -slackY + 0, world.height + slackY);
  }
}
