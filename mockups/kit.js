// The kit under the mockup of the new world: a small world you can turn, tilt and drop into,
// drawn with Canvas 2D and no library.
//
// Only its first half is used (build.mjs cuts it at a marker): the maths, the hour, the
// camera, the geometry builder, the building types and the shared drawing helpers. The rest
// is the first round's engine, kept because the cut is by marker and it does no harm.
//
// A mockup, not the app's renderer. Expects two globals: DATA (a world) and THEME (a look).

(() => {
  const W = DATA;
  const T = THEME;
  // The specimen's places are spread for a flat sheet. Drawn as a model they want to stand
  // closer together, so the whole country is drawn in toward its middle.
  const SQUEEZE = 0.56;
  {
    const mx = W.size.width / 2;
    const my = W.size.height / 2;
    for (const p of W.places) {
      p.x = mx + (p.x - mx) * SQUEEZE;
      p.y = my + (p.y - my) * SQUEEZE;
    }
    for (const r of W.regions) {
      r.x = mx + (r.x - mx) * SQUEEZE;
      r.y = my + (r.y - my) * SQUEEZE;
      r.r *= SQUEEZE;
    }
  }
  const cv = document.getElementById('world');
  const ctx = cv.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ───────────────────────── small maths ─────────────────────────

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h ^ (h >>> 15)) >>> 0;
  }
  function rng(seed) {
    let a = hash(String(seed)) || 1;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ───────────────────────── the hour ─────────────────────────
  // The sky follows the viewer's clock. `?hour=21` overrides it, for looking at night by day.

  const q = new URLSearchParams(location.search);
  const now = new Date();
  const HOUR = q.has('hour') ? Number(q.get('hour')) : now.getHours() + now.getMinutes() / 60;
  const dayT = clamp((HOUR - 6) / 13, 0, 1); // 0 at six in the morning, 1 at seven in the evening
  const NIGHT = HOUR < 5.5 || HOUR > 19.5;
  // The sun crosses from one side to the other and is highest at midday.
  const sunEl = NIGHT ? 0.75 : 0.32 + 0.6 * Math.sin(dayT * Math.PI);
  const sunAz = NIGHT ? -2.2 : lerp(-2.7, -0.5, dayT);
  const L = [Math.cos(sunAz) * Math.cos(sunEl), Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl)];
  const SHADOW = [-L[0] / L[2], -L[1] / L[2]];

  // ───────────────────────── camera ─────────────────────────

  const cam = { yaw: -0.5, pitch: 0.72, zoom: 0.3, tx: W.size.width / 2, ty: W.size.height / 2 };
  let vw = 0;
  let vh = 0;
  let cs = 1;
  let sn = 0;
  let sp = 1;
  let cp = 0;
  function camTrig() {
    cs = Math.cos(cam.yaw);
    sn = Math.sin(cam.yaw);
    sp = Math.sin(cam.pitch);
    cp = Math.cos(cam.pitch);
  }
  /** How much larger than life a city is drawn: from far away it would be a speck. */
  const swell = () => clamp(1.3 / cam.zoom, 1, 2.3);
  /** World point to screen. Returns [x, y, depth]; larger depth is nearer the eye. */
  function proj(x, y, z) {
    const dx = x - cam.tx;
    const dy = y - cam.ty;
    const rx = dx * cs - dy * sn;
    const ry = dx * sn + dy * cs;
    return [vw / 2 + rx * cam.zoom, vh * 0.54 + (ry * sp - z * cp) * cam.zoom, ry * cp + z * sp];
  }
  /** Screen point back to the ground plane. */
  function unproj(sx, sy) {
    const rx = (sx - vw / 2) / cam.zoom;
    const ry = (sy - vh * 0.54) / cam.zoom / sp;
    return [cam.tx + rx * cs + ry * sn, cam.ty - rx * sn + ry * cs];
  }

  // ───────────────────────── geometry builder ─────────────────────────
  // An object is a list of faces and lines in its own coordinates, about an origin on the
  // ground. `tone` names what a face is made of; the theme turns tone and light into colour.

  function Obj(ox, oy, rot = 0) {
    const o = { ox, oy, faces: [], lines: [], foot: [], top: 0, maxZ: Infinity, rot, kind: 'thing' };
    const rc = Math.cos(rot);
    const rs = Math.sin(rot);
    const P = (x, y, z) => [x * rc - y * rs, x * rs + y * rc, z];
    const N = (x, y, z) => [x * rc - y * rs, x * rs + y * rc, z];
    o.face = (pts, n, tone, tint = 0, lift = 0) => {
      o.faces.push({ p: pts.map((q) => P(q[0], q[1], q[2])), n: N(n[0], n[1], n[2]), tone, tint, lift });
      for (const q of pts) if (q[2] > o.top) o.top = q[2];
    };
    o.line = (a, b, tone, w = 1) => o.lines.push({ a: P(a[0], a[1], a[2]), b: P(b[0], b[1], b[2]), tone, w });
    o.shadow = (pts, h) => o.foot.push({ p: pts.map((q) => P(q[0], q[1], 0)), h });

    /** A box standing on z0. Clipped at maxZ, so a half-built building stops where the work has. */
    o.box = (x, y, w, d, z0, h, tone, tint = 0, noTop = false) => {
      if (z0 >= o.maxZ) return 0;
      h = Math.min(h, o.maxZ - z0);
      const x1 = x + w;
      const y1 = y + d;
      const z1 = z0 + h;
      o.face([[x, y1, z0], [x1, y1, z0], [x1, y1, z1], [x, y1, z1]], [0, 1, 0], tone, tint);
      o.face([[x1, y, z0], [x, y, z0], [x, y, z1], [x1, y, z1]], [0, -1, 0], tone, tint);
      o.face([[x1, y1, z0], [x1, y, z0], [x1, y, z1], [x1, y1, z1]], [1, 0, 0], tone, tint);
      o.face([[x, y, z0], [x, y1, z0], [x, y1, z1], [x, y, z1]], [-1, 0, 0], tone, tint);
      if (!noTop) o.face([[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], [0, 0, 1], tone === 'wall' ? 'ledge' : tone, tint);
      if (z0 === 0) o.shadow([[x, y], [x1, y], [x1, y1], [x, y1]], h);
      return z1;
    };
    /** Rows of windows on one side of a box. side: 0 front (+y), 1 right (+x), 2 back, 3 left. */
    o.windows = (x, y, w, d, z0, h, side, cols, rows, tone = 'window') => {
      const e = 0.06;
      for (let r = 0; r < rows; r++) {
        const za = z0 + (h * (r + 0.28)) / rows;
        const zb = z0 + (h * (r + 0.78)) / rows;
        if (zb > o.maxZ) break;
        for (let c = 0; c < cols; c++) {
          const span = side % 2 === 0 ? w : d;
          const a = (span * (c + 0.24)) / cols;
          const b = (span * (c + 0.76)) / cols;
          if (side === 0) o.face([[x + a, y + d + e, za], [x + b, y + d + e, za], [x + b, y + d + e, zb], [x + a, y + d + e, zb]], [0, 1, 0], tone, 0, 1);
          else if (side === 2) o.face([[x + b, y - e, za], [x + a, y - e, za], [x + a, y - e, zb], [x + b, y - e, zb]], [0, -1, 0], tone, 0, 1);
          else if (side === 1) o.face([[x + w + e, y + b, za], [x + w + e, y + a, za], [x + w + e, y + a, zb], [x + w + e, y + b, zb]], [1, 0, 0], tone, 0, 1);
          else o.face([[x - e, y + a, za], [x - e, y + b, za], [x - e, y + b, zb], [x - e, y + a, zb]], [-1, 0, 0], tone, 0, 1);
        }
      }
    };
    /** A pitched roof. along 'x': the ridge runs along x. */
    o.gable = (x, y, w, d, z0, h, tone, along = 'x') => {
      if (z0 >= o.maxZ - 0.01) return;
      const x1 = x + w;
      const y1 = y + d;
      const zr = z0 + h;
      if (along === 'x') {
        const ym = y + d / 2;
        const k = Math.hypot(d / 2, h);
        o.face([[x, y1, z0], [x1, y1, z0], [x1, ym, zr], [x, ym, zr]], [0, h / k, d / 2 / k], tone);
        o.face([[x1, y, z0], [x, y, z0], [x, ym, zr], [x1, ym, zr]], [0, -h / k, d / 2 / k], tone);
        o.face([[x1, y1, z0], [x1, y, z0], [x1, ym, zr]], [1, 0, 0], 'wall');
        o.face([[x, y, z0], [x, y1, z0], [x, ym, zr]], [-1, 0, 0], 'wall');
      } else {
        const xm = x + w / 2;
        const k = Math.hypot(w / 2, h);
        o.face([[x1, y1, z0], [x1, y, z0], [xm, y, zr], [xm, y1, zr]], [h / k, 0, w / 2 / k], tone);
        o.face([[x, y, z0], [x, y1, z0], [xm, y1, zr], [xm, y, zr]], [-h / k, 0, w / 2 / k], tone);
        o.face([[x, y1, z0], [x1, y1, z0], [xm, y1, zr]], [0, 1, 0], 'wall');
        o.face([[x1, y, z0], [x, y, z0], [xm, y, zr]], [0, -1, 0], 'wall');
      }
    };
    o.pyramid = (x, y, w, d, z0, h, tone) => {
      if (z0 >= o.maxZ - 0.01) return;
      const x1 = x + w;
      const y1 = y + d;
      const a = [x + w / 2, y + d / 2, z0 + h];
      const kx = Math.hypot(w / 2, h);
      const ky = Math.hypot(d / 2, h);
      o.face([[x, y1, z0], [x1, y1, z0], a], [0, h / ky, d / 2 / ky], tone);
      o.face([[x1, y, z0], [x, y, z0], a], [0, -h / ky, d / 2 / ky], tone);
      o.face([[x1, y1, z0], [x1, y, z0], a], [h / kx, 0, w / 2 / kx], tone);
      o.face([[x, y, z0], [x, y1, z0], a], [-h / kx, 0, w / 2 / kx], tone);
    };
    /** A sawtooth roof: the mark of a place where things are made. */
    o.sawtooth = (x, y, w, d, z0, h, n, tone) => {
      if (z0 >= o.maxZ - 0.01) return;
      const tw = w / n;
      const y1 = y + d;
      const k = Math.hypot(tw, h);
      for (let i = 0; i < n; i++) {
        const xa = x + i * tw;
        const xb = xa + tw;
        o.face([[xa, y, z0], [xa, y1, z0], [xb, y1, z0 + h], [xb, y, z0 + h]], [-h / k, 0, tw / k], tone);
        o.face([[xb, y1, z0], [xb, y, z0], [xb, y, z0 + h], [xb, y1, z0 + h]], [1, 0, 0], 'glass', 0, 0);
        o.face([[xa, y1, z0], [xb, y1, z0], [xb, y1, z0 + h]], [0, 1, 0], 'wall');
        o.face([[xb, y, z0], [xa, y, z0], [xb, y, z0 + h]], [0, -1, 0], 'wall');
      }
    };
    /** A round tower; r1 lets it taper. cap: 'flat' | 'cone' | 'dome' | none. */
    o.cyl = (cx, cy, r0, z0, h, tone, cap = 'flat', r1 = r0, segs = 10, capTone = tone) => {
      if (z0 >= o.maxZ) return 0;
      const full = h;
      h = Math.min(h, o.maxZ - z0);
      const rt = lerp(r0, r1, h / full);
      const ring = [];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU;
        const a1 = ((i + 1) / segs) * TAU;
        const am = (a0 + a1) / 2;
        o.face(
          [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, z0], [cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0, z0], [cx + Math.cos(a1) * rt, cy + Math.sin(a1) * rt, z0 + h], [cx + Math.cos(a0) * rt, cy + Math.sin(a0) * rt, z0 + h]],
          [Math.cos(am), Math.sin(am), 0],
          tone,
        );
        ring.push([cx + Math.cos(a0) * rt, cy + Math.sin(a0) * rt, z0 + h]);
      }
      if (z0 === 0) o.shadow(ring.map((p) => [cx + (p[0] - cx) * (r0 / rt), cy + (p[1] - cy) * (r0 / rt)]), h);
      const z1 = z0 + h;
      if (h < full) {
        o.face(ring, [0, 0, 1], 'ledge');
        return z1;
      }
      if (cap === 'flat') o.face(ring, [0, 0, 1], capTone === 'wall' ? 'ledge' : capTone);
      else if (cap === 'cone') {
        const ch = rt * 0.9;
        for (let i = 0; i < segs; i++) {
          const am = ((i + 0.5) / segs) * TAU;
          const k = Math.hypot(rt, ch);
          o.face([ring[i], ring[(i + 1) % segs], [cx, cy, z1 + ch]], [(Math.cos(am) * ch) / k, (Math.sin(am) * ch) / k, rt / k], capTone);
        }
      } else if (cap === 'dome') {
        let prev = ring;
        const rings = 3;
        for (let j = 1; j <= rings; j++) {
          const t = (j / rings) * (Math.PI / 2);
          const rr = rt * Math.cos(t);
          const zz = z1 + rt * Math.sin(t);
          const next = [];
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * TAU;
            next.push([cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr, zz]);
          }
          const tm = ((j - 0.5) / rings) * (Math.PI / 2);
          for (let i = 0; i < segs; i++) {
            const am = ((i + 0.5) / segs) * TAU;
            const n = [Math.cos(am) * Math.cos(tm), Math.sin(am) * Math.cos(tm), Math.sin(tm)];
            if (j === rings) o.face([prev[i], prev[(i + 1) % segs], [cx, cy, zz]], n, capTone);
            else o.face([prev[i], prev[(i + 1) % segs], next[(i + 1) % segs], next[i]], n, capTone);
          }
          prev = next;
        }
      }
      return z1;
    };
    return o;
  }

  // ───────────────────────── buildings ─────────────────────────
  // What a feature is decides the structure; how much work is in it decides how developed
  // the structure is (three tiers); its stage decides how much of it stands.

  const STAGES = ['concept', 'planned', 'designed', 'building', 'working', 'mature'];
  const tierOf = (st) => (st <= 2 ? 1 : st <= 5 ? 2 : 3);
  const sizeOf = (f) => clamp(6.4 + f.st * 0.62, 6.4, 11.6);
  const heightOf = (f) => 3.4 + f.st * 1.35;

  const KIND = {
    // What people see and touch: a hall with an arcade front, and at its grandest a clock tower.
    frontage(o, s, H, t) {
      const h1 = H * (t === 1 ? 0.62 : 0.5);
      o.box(-s / 2, -s / 2, s, s, 0, h1, 'wall');
      o.windows(-s / 2, -s / 2, s, s, 0, h1, 0, t + 2, 1, 'door');
      o.windows(-s / 2, -s / 2, s, s, 0, h1, 1, t + 1, t === 1 ? 1 : 2);
      o.windows(-s / 2, -s / 2, s, s, 0, h1, 3, t + 1, t === 1 ? 1 : 2);
      o.box(-s / 2 - 0.3, s / 2, s + 0.6, 1.5, h1 * 0.56, 0.32, 'awning', 1);
      if (t === 1) return o.gable(-s / 2 - 0.3, -s / 2 - 0.3, s + 0.6, s + 0.6, h1, H * 0.34, 'roof');
      const i = s * 0.12;
      const h2 = H * 0.32;
      o.box(-s / 2 + i, -s / 2 + i, s - 2 * i, s - 2 * i, h1, h2, 'wall');
      o.windows(-s / 2 + i, -s / 2 + i, s - 2 * i, s - 2 * i, h1, h2, 0, t + 1, 1);
      o.windows(-s / 2 + i, -s / 2 + i, s - 2 * i, s - 2 * i, h1, h2, 1, t + 1, 1);
      o.gable(-s / 2 + i - 0.3, -s / 2 + i - 0.3, s - 2 * i + 0.6, s - 2 * i + 0.6, h1 + h2, H * 0.22, 'roof');
      if (t === 3) {
        const tw = s * 0.26;
        o.box(-s / 2, -s / 2, tw, tw, h1, H * 0.72, 'wall');
        o.windows(-s / 2, -s / 2, tw, tw, h1 + H * 0.42, H * 0.3, 0, 1, 1, 'clock');
        o.windows(-s / 2, -s / 2, tw, tw, h1 + H * 0.42, H * 0.3, 3, 1, 1, 'clock');
        o.pyramid(-s / 2 - 0.25, -s / 2 - 0.25, tw + 0.5, tw + 0.5, h1 + H * 0.72, H * 0.3, 'roof');
      }
    },
    // Where the project's own work is done: a mill with a sawtooth roof and a chimney.
    works(o, s, H, t) {
      const h1 = H * 0.5;
      const d = s * 0.82;
      o.box(-s / 2, -d / 2, s, d, 0, h1, 'wall');
      o.windows(-s / 2, -d / 2, s, d, 0, h1, 0, t + 2, 1);
      o.windows(-s / 2, -d / 2, s, d, 0, h1, 2, t + 2, 1);
      o.sawtooth(-s / 2, -d / 2, s, d, h1, H * 0.2, t + 1, 'roof');
      if (t >= 2) {
        o.cyl(s / 2 - 1.3, -d / 2 + 1.3, 0.85, 0, H * 1.05, 'brick', 'flat', 0.6, 8, 'soot');
      }
      if (t === 3) {
        o.box(-s / 2 - s * 0.3, -d / 2 + d * 0.2, s * 0.3, d * 0.6, 0, h1 * 0.66, 'wall');
        o.gable(-s / 2 - s * 0.3 - 0.2, -d / 2 + d * 0.2 - 0.2, s * 0.3 + 0.2, d * 0.6 + 0.4, h1 * 0.66, H * 0.14, 'roof', 'y');
      }
    },
    // Where data is gathered or kept: tanks, and with growth a water tower and silos.
    reservoir(o, s, H, t) {
      const r = s * (t === 1 ? 0.36 : 0.28);
      if (t === 1) return o.cyl(0, 0, r, 0, H * 0.6, 'tank', 'cone', r, 12, 'roof');
      o.cyl(-s * 0.2, s * 0.14, r, 0, H * 0.55, 'tank', 'cone', r, 12, 'roof');
      // A water tower on legs.
      const tx = s * 0.24;
      const ty = -s * 0.2;
      const lr = s * 0.17;
      const lz = H * 0.62;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        if (lz < o.maxZ) o.line([tx + a * lr * 0.9, ty + b * lr * 0.9, 0], [tx + a * lr * 0.55, ty + b * lr * 0.55, lz], 'metal', 1.6);
      }
      o.cyl(tx, ty, lr * 1.15, lz, H * 0.34, 'tank', 'cone', lr * 1.15, 10, 'roof');
      o.shadow([[tx - lr, ty - lr], [tx + lr, ty - lr], [tx + lr, ty + lr], [tx - lr, ty + lr]], H);
      if (t === 3) {
        o.cyl(s * 0.2, s * 0.26, r * 0.62, 0, H * 0.86, 'tank', 'dome', r * 0.62, 10, 'tank');
        o.cyl(-s * 0.28, -s * 0.28, r * 0.62, 0, H * 0.74, 'tank', 'dome', r * 0.62, 10, 'tank');
      }
    },
    // Where things are judged, analysed or learned: a dome on a drum, open to the sky.
    observatory(o, s, H, t) {
      const b = s * 0.86;
      const h1 = H * (t === 1 ? 0.34 : 0.3);
      o.box(-b / 2, -b / 2, b, b, 0, h1, 'wall');
      o.windows(-b / 2, -b / 2, b, b, 0, h1, 0, t + 1, 1);
      o.windows(-b / 2, -b / 2, b, b, 0, h1, 1, t + 1, 1);
      const r = b * (t === 1 ? 0.4 : 0.36);
      const dz = o.cyl(0, 0, r, h1, H * (t === 1 ? 0.14 : 0.3), 'wall', 'dome', r, 12, 'dome');
      // The slit the telescope looks through.
      if (dz >= h1 + H * 0.1 && dz < o.maxZ) {
        o.face([[-r * 0.16, r * 0.98, dz], [r * 0.16, r * 0.98, dz], [r * 0.14, r * 0.42, dz + r * 0.9], [-r * 0.14, r * 0.42, dz + r * 0.9]], [0, 0.7, 0.7], 'slit', 0, 1);
      }
      if (t === 3) {
        const tw = s * 0.24;
        const tz = o.box(b / 2 - tw, -b / 2, tw, tw, h1, H * 0.62, 'wall');
        o.windows(b / 2 - tw, -b / 2, tw, tw, h1, H * 0.62, 1, 1, 3);
        if (tz < o.maxZ) {
          o.cyl(b / 2 - tw / 2, -b / 2 + tw / 2, tw * 0.5, tz, 0.2, 'wall', 'dome', tw * 0.5, 8, 'dome');
          o.line([b / 2 - tw / 2, -b / 2 + tw / 2, tz + tw * 0.5], [b / 2 - tw / 2, -b / 2 + tw / 2, tz + tw * 0.5 + H * 0.3], 'metal', 1.4);
        }
      }
    },
    // What the rest runs on: a powerhouse with stacks, a mast and, at scale, a cooling tower.
    utility(o, s, H, t) {
      const h1 = H * 0.36;
      const d = s * 0.6;
      o.box(-s / 2, -d / 2 + s * 0.14, s * 0.72, d, 0, h1, 'wall');
      o.windows(-s / 2, -d / 2 + s * 0.14, s * 0.72, d, 0, h1, 0, t + 1, 1);
      o.box(-s / 2 - 0.2, -d / 2 + s * 0.14 - 0.2, s * 0.72 + 0.4, d + 0.4, h1, 0.5, 'roof');
      // A lattice mast.
      const mx = s * 0.36;
      const my = s * 0.3;
      const mh = H * (0.9 + t * 0.12);
      if (mh < o.maxZ + 99) {
        const top = Math.min(mh, o.maxZ);
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([mx + a * 0.9, my + b * 0.9, 0], [mx, my, top], 'metal', 1.3);
        for (let k = 1; k <= 3; k++) {
          const z = (top * k) / 4;
          const w = 0.9 * (1 - k / 4);
          o.line([mx - w, my - w, z], [mx + w, my - w, z], 'metal', 1);
          o.line([mx + w, my - w, z], [mx + w, my + w, z], 'metal', 1);
          o.line([mx + w, my + w, z], [mx - w, my + w, z], 'metal', 1);
        }
        o.shadow([[mx - 0.4, my - 0.4], [mx + 0.4, my - 0.4], [mx + 0.4, my + 0.4], [mx - 0.4, my + 0.4]], top);
      }
      if (t >= 2) {
        o.cyl(-s * 0.3, -s * 0.24, 0.75, h1 + 0.5, H * 0.42, 'brick', 'flat', 0.6, 8, 'soot');
        o.cyl(-s * 0.08, -s * 0.24, 0.75, h1 + 0.5, H * 0.34, 'brick', 'flat', 0.6, 8, 'soot');
      }
      if (t === 3) o.cyl(s * 0.2, -s * 0.26, s * 0.24, 0, H * 0.7, 'tank', 'flat', s * 0.15, 12, 'soot');
    },
    // A wonder: the thing a release was named for.
    wonder(o, s, H) {
      const b = s * 1.25;
      let z = o.box(-b / 2, -b / 2, b, b, 0, H * 0.16, 'stone');
      z = o.box(-b * 0.36, -b * 0.36, b * 0.72, b * 0.72, z, H * 0.16, 'stone');
      z = o.box(-b * 0.24, -b * 0.24, b * 0.48, b * 0.48, z, H * 0.9, 'stone');
      o.windows(-b * 0.24, -b * 0.24, b * 0.48, b * 0.48, H * 0.32, H * 0.9, 0, 1, 4);
      o.windows(-b * 0.24, -b * 0.24, b * 0.48, b * 0.48, H * 0.32, H * 0.9, 1, 1, 4);
      z = o.box(-b * 0.16, -b * 0.16, b * 0.32, b * 0.32, z, H * 0.3, 'stone');
      o.pyramid(-b * 0.19, -b * 0.19, b * 0.38, b * 0.38, z, H * 0.42, 'gold');
    },
  };

  /** One feature on its lot. Returns the object, which remembers the feature it stands for. */
  function building(ox, oy, rot, f, district) {
    const o = Obj(ox, oy, rot);
    o.kind = 'building';
    o.f = f;
    o.district = district;
    const s = sizeOf(f);
    const H = heightOf(f) * (f.lm ? 1.25 : 1);
    const stage = STAGES.indexOf(f.s);
    const h = s / 2;
    const frame = (top, tone) => {
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([a * h, b * h, 0], [a * h, b * h, top], tone, 1.2);
      for (let z = top; z > 0.5; z -= 2.6) {
        o.line([-h, -h, z], [h, -h, z], tone, 1);
        o.line([h, -h, z], [h, h, z], tone, 1);
        o.line([h, h, z], [-h, h, z], tone, 1);
        o.line([-h, h, z], [-h, -h, z], tone, 1);
      }
    };
    if (stage === 0) {
      // Staked out: four pegs, a string between them, a small flag.
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([a * h, b * h, 0], [a * h, b * h, 1.3], 'stake', 2);
      o.line([-h, -h, 1.1], [h, -h, 1.1], 'string', 0.8);
      o.line([h, -h, 1.1], [h, h, 1.1], 'string', 0.8);
      o.line([h, h, 1.1], [-h, h, 1.1], 'string', 0.8);
      o.line([-h, h, 1.1], [-h, -h, 1.1], 'string', 0.8);
      o.top = 1.3;
      return o;
    }
    if (stage === 1 || stage === 2) {
      // Planned: a slab with the plan drawn on it. Designed: the frame is up as well.
      o.box(-h, -h, s, s, 0, 0.45, 'slab');
      o.line([-h * 0.5, -h, 0.5], [-h * 0.5, h, 0.5], 'string', 0.8);
      o.line([-h, h * 0.2, 0.5], [h, h * 0.2, 0.5], 'string', 0.8);
      if (stage === 2) frame(H * 0.8, 'frame');
      return o;
    }
    const make = f.lm ? KIND.wonder : KIND[f.k] ?? KIND.works;
    if (stage === 3) {
      // Being built: it stands as far as the work has got, inside its scaffold, under a crane.
      o.maxZ = Math.max(1.6, H * clamp(f.pr, 0.18, 0.92));
      make(o, s, H, tierOf(f.st));
      frame(o.maxZ + 1.4, 'scaffold');
      o.crane = { x: h + 1.2, y: -h - 1.2, h: H + 7, arm: s * 0.95, phase: (hash(f.id) % 628) / 100 };
      o.top = H + 7;
      return o;
    }
    make(o, s, H, tierOf(f.st));
    if (stage === 5) {
      // Long standing and returned to: a flag flies over it.
      o.line([0, 0, o.top], [0, 0, o.top + 3.2], 'metal', 1.2);
      o.face([[0, 0, o.top + 3.2], [1.9, 0, o.top + 2.75], [0, 0, o.top + 2.3]], [0, 1, 0], 'flag', 1, 1);
      o.face([[0, 0, o.top + 2.3], [1.9, 0, o.top + 2.75], [0, 0, o.top + 3.2]], [0, -1, 0], 'flag', 1, 1);
    }
    if (f.h > 0.3) {
      // Finished, and being worked on again: a scaffold up one side.
      const top = Math.min(o.top, H * 0.75);
      for (let x = -h; x <= h + 0.01; x += s / 3) o.line([x, h + 0.9, 0], [x, h + 0.9, top], 'scaffold', 1.1);
      for (let z = 2.2; z < top; z += 2.4) o.line([-h, h + 0.9, z], [h, h + 0.9, z], 'scaffold', 1.1);
      o.repair = true;
    }
    return o;
  }

  // ───────────────────────── a city ─────────────────────────

  const LOT = 13.5;
  const RANKS = ['spark', 'site', 'outpost', 'settlement', 'town', 'city', 'major'];

  function layoutCity(p) {
    const r = rng(p.id);
    const rot = (r() - 0.5) * 0.9;
    const city = { p, rot, objs: [], plots: [], radius: 14, districts: [] };
    // Districts are the wards; a feature with no ward joins the district of its kind.
    const byName = new Map();
    for (const f of p.f) {
      const name = f.w ?? { frontage: 'Frontage', works: 'Works', reservoir: 'Stores', observatory: 'Observatory', utility: 'Utilities' }[f.k];
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(f);
    }
    const blocks = [...byName].map(([name, fs], i) => {
      const cols = Math.ceil(Math.sqrt(fs.length * 1.4));
      const rows = Math.ceil(fs.length / cols);
      return { name, fs, cols, rows, w: cols * LOT + 3, d: rows * LOT + 3, i };
    });
    // The square at the middle, and each district set down as near to it as it will go.
    const placed = [{ x: -8, y: -8, w: 16, d: 16 }];
    const free = (b, x, y) => placed.every((q) => x + b.w + 3.5 <= q.x || q.x + q.w + 3.5 <= x || y + b.d + 3.5 <= q.y || q.y + q.d + 3.5 <= y);
    for (const b of blocks.slice().sort((a, c) => c.w * c.d - a.w * a.d)) {
      let best = null;
      for (let i = 0; i < 900 && !best; i++) {
        const a = i * 2.39996 + r() * 0.3;
        const rad = 4 + Math.sqrt(i) * 3.2;
        const x = Math.cos(a) * rad - b.w / 2;
        const y = Math.sin(a) * rad - b.d / 2;
        if (free(b, x, y)) best = [x, y];
      }
      b.x = best ? best[0] : 0;
      b.y = best ? best[1] : 0;
      placed.push(b);
    }
    const rc = Math.cos(rot);
    const rs = Math.sin(rot);
    const at = (x, y) => [p.x + x * rc - y * rs, p.y + x * rs + y * rc];
    for (const b of blocks) {
      city.districts.push({ name: b.name, i: b.i, n: b.fs.length });
      city.plots.push({ pts: [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.d], [b.x, b.y + b.d]], i: b.i, name: b.name });
      b.fs.forEach((f, k) => {
        const lx = b.x + 1.5 + (k % b.cols) * LOT + LOT / 2;
        const ly = b.y + 1.5 + Math.floor(k / b.cols) * LOT + LOT / 2;
        const o = building(lx, ly, 0, f, b.i);
        o.local = [lx, ly];
        city.objs.push(o);
        city.radius = Math.max(city.radius, Math.hypot(lx, ly) + LOT);
      });
    }
    // The square: a column for a town, a taller one for a city. A bare flag where little stands.
    const sq = Obj(0, 0, 0);
    sq.kind = 'square';
    const rank = RANKS.indexOf(p.rank);
    if (rank >= 3) {
      sq.box(-1.6, -1.6, 3.2, 3.2, 0, 0.9, 'stone');
      sq.cyl(0, 0, 0.55, 0.9, 3 + rank * 1.3, 'stone', 'cone', 0.45, 8, 'gold');
    } else if (p.f.length > 0 || rank >= 1) {
      sq.line([0, 0, 0], [0, 0, 5], 'metal', 1.4);
      sq.face([[0, 0, 5], [2.4, 0, 4.4], [0, 0, 3.8]], [0, 1, 0], 'flag', 1, 1);
      sq.face([[0, 0, 3.8], [2.4, 0, 4.4], [0, 0, 5]], [0, -1, 0], 'flag', 1, 1);
    } else {
      // An idea and nothing more: a cairn.
      sq.cyl(0, 0, 1.3, 0, 0.9, 'stone', 'dome', 1.0, 6, 'stone');
    }
    sq.local = [0, 0];
    city.objs.push(sq);
    // Houses round the edge: a town's mass follows the work in it.
    const houses = Math.min(34, Math.round(p.commits / 55));
    const core = city.radius;
    city.core = core;
    for (let i = 0, tries = 0; i < houses && tries < 600; tries++) {
      const a = r() * TAU;
      const rad = core * (0.42 + r() * 0.58);
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      const b = { w: 5, d: 5 };
      if (!free(b, x - 2.5, y - 2.5)) continue;
      placed.push({ x: x - 2.5, y: y - 2.5, w: 5, d: 5 });
      const o = Obj(x, y, Math.round(r() * 3) * (Math.PI / 2));
      o.kind = 'house';
      const w = 3 + r() * 1.4;
      const d = 2.6 + r() * 1.2;
      const hh = 2 + r() * 1.3;
      o.box(-w / 2, -d / 2, w, d, 0, hh, 'wall');
      o.gable(-w / 2 - 0.2, -d / 2 - 0.2, w + 0.4, d + 0.4, hh, 1.4, 'roof2');
      o.local = [x, y];
      city.objs.push(o);
      city.radius = Math.max(city.radius, rad + 5);
      i++;
    }
    // Turn every object once into the city's own bearing.
    for (const o of city.objs) {
      for (const f of o.faces) {
        f.p = f.p.map((q) => [q[0] * rc - q[1] * rs, q[0] * rs + q[1] * rc, q[2]]);
        f.n = [f.n[0] * rc - f.n[1] * rs, f.n[0] * rs + f.n[1] * rc, f.n[2]];
      }
      for (const l of o.lines) {
        l.a = [l.a[0] * rc - l.a[1] * rs, l.a[0] * rs + l.a[1] * rc, l.a[2]];
        l.b = [l.b[0] * rc - l.b[1] * rs, l.b[0] * rs + l.b[1] * rc, l.b[2]];
      }
      for (const sh of o.foot) sh.p = sh.p.map((q) => [q[0] * rc - q[1] * rs, q[0] * rs + q[1] * rc, 0]);
      if (o.crane) [o.crane.x, o.crane.y] = [o.crane.x * rc - o.crane.y * rs, o.crane.x * rs + o.crane.y * rc];
    }
    city.at = at;
    return city;
  }

  // ───────────────────────── the world ─────────────────────────

  const cities = W.places.map(layoutCity);
  const cityOf = new Map(cities.map((c) => [c.p.id, c]));
  const CX = W.size.width / 2;
  const CY = W.size.height / 2;

  // The land: one island, with a coast that wanders.
  const LAND_X = 2150 * SQUEEZE * 1.04;
  const LAND_Y = 1560 * SQUEEZE * 1.08;
  const coast = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const k = 0.93 + 0.05 * Math.sin(3 * a + 1.1) + 0.035 * Math.sin(7 * a + 2.3) + 0.02 * Math.sin(13 * a + 0.4);
    coast.push([CX + Math.cos(a) * LAND_X * k, CY + Math.sin(a) * LAND_Y * k]);
  }

  // Roads between cities. A gentle bend each, so that no two lie on top of each other.
  const roads = W.links.map((l) => {
    const a = cityOf.get(l.a).p;
    const b = cityOf.get(l.b).p;
    const r = rng(l.a + l.b);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const bend = (r() - 0.5) * len * 0.28;
    const c = [mx - ((b.y - a.y) / len) * bend, my + ((b.x - a.x) / len) * bend];
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      pts.push([(1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c[0] + t * t * b.x, (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c[1] + t * t * b.y]);
    }
    const lively = (id) => ['building', 'settled'].includes(cityOf.get(id).p.live);
    return { l, pts, len, traffic: l.g === 'road' && (lively(l.a) || lively(l.b)), phase: r() };
  });

  // Scenery: woods and hills, kept clear of cities and roads.
  const scenery = [];
  {
    const r = rng('scenery');
    const inLand = (x, y) => {
      const dx = (x - CX) / LAND_X;
      const dy = (y - CY) / LAND_Y;
      return dx * dx + dy * dy < 0.74;
    };
    const clear = (x, y, gap) => cities.every((c) => Math.hypot(c.p.x - x, c.p.y - y) > c.radius * 2.5 + gap) && roads.every((rd) => rd.pts.every((q) => Math.hypot(q[0] - x, q[1] - y) > gap));
    for (let i = 0; i < 40; i++) {
      const x = CX + (r() - 0.5) * LAND_X * 1.9;
      const y = CY + (r() - 0.5) * LAND_Y * 1.9;
      if (!inLand(x, y) || !clear(x, y, 60)) continue;
      const o = Obj(x, y, r() * TAU);
      o.kind = 'hill';
      const R = 22 + r() * 26;
      const levels = 2 + Math.floor(r() * 3);
      let z = 0;
      for (let k = 0; k < levels; k++) {
        const rr = R * (1 - k / (levels + 0.6));
        const offx = (r() - 0.5) * R * 0.2;
        const offy = (r() - 0.5) * R * 0.2;
        const ring = [];
        const top = [];
        const n = 14;
        const wob = Array.from({ length: n }, () => 0.82 + r() * 0.3);
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU;
          ring.push([offx + Math.cos(a) * rr * wob[j], offy + Math.sin(a) * rr * wob[j] * 0.8]);
        }
        const hh = 2.6 + r() * 1.6;
        for (let j = 0; j < n; j++) {
          const p0 = ring[j];
          const p1 = ring[(j + 1) % n];
          const am = ((j + 0.5) / n) * TAU;
          o.face([[p0[0], p0[1], z], [p1[0], p1[1], z], [p1[0], p1[1], z + hh], [p0[0], p0[1], z + hh]], [Math.cos(am), Math.sin(am), 0], 'hillside');
          top.push([p0[0], p0[1], z + hh]);
        }
        o.face(top, [0, 0, 1], 'hill', k);
        if (k === 0) o.shadow(ring, hh);
        z += hh;
      }
      scenery.push(o);
    }
    for (let i = 0; i < 520; i++) {
      const x = CX + (r() - 0.5) * LAND_X * 2;
      const y = CY + (r() - 0.5) * LAND_Y * 2;
      if (!inLand(x, y) || !clear(x, y, 22)) continue;
      // Trees gather into woods: most of them stand near another.
      const n = 1 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        const o = Obj(x + (r() - 0.5) * 34, y + (r() - 0.5) * 34, r() * TAU);
        o.kind = 'tree';
        const hh = 5 + r() * 4;
        const rr = 2.2 + r() * 1.3;
        o.line([0, 0, 0], [0, 0, hh * 0.4], 'trunk', 1.4);
        if (T.tree === 'cone') o.cyl(0, 0, rr, hh * 0.28, 0.01, 'tree', 'cone', rr, 6, 'tree');
        else if (T.tree === 'card') {
          o.face([[-rr, 0, hh * 0.25], [rr, 0, hh * 0.25], [0, 0, hh * 1.25]], [0, 1, 0], 'tree');
          o.face([[rr, 0, hh * 0.25], [-rr, 0, hh * 0.25], [0, 0, hh * 1.25]], [0, -1, 0], 'tree');
          o.face([[0, -rr, hh * 0.25], [0, rr, hh * 0.25], [0, 0, hh * 1.25]], [1, 0, 0], 'tree');
          o.face([[0, rr, hh * 0.25], [0, -rr, hh * 0.25], [0, 0, hh * 1.25]], [-1, 0, 0], 'tree');
        } else o.cyl(0, 0, rr, hh * 0.3, 0.6, 'tree', 'dome', rr, 7, 'tree');
        if (T.tree === 'cone') {
          // A cone drawn as a pyramid of faces from the canopy's base.
          o.faces.length = 0;
          o.pyramid(-rr, -rr, rr * 2, rr * 2, hh * 0.25, hh, 'tree');
        }
        o.shadow([[-rr, -rr], [rr, -rr], [rr, rr], [-rr, rr]], hh * 0.7);
        o.scale = 0.8 + r() * 0.5;
        scenery.push(o);
      }
    }
  }

  // ───────────────────────── drawing ─────────────────────────

  let hover = null;
  let focus = null; // the city the camera has gone into
  let picked = null; // the building whose card is open
  const hits = []; // what was drawn where, for the pointer

  /** Add a shape to the current path, always wound the same way round. */
  function wound(q) {
    let area = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      const b = q[(i + 1) % q.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area < 0) q.reverse();
    ctx.moveTo(q[0][0], q[0][1]);
    for (let j = 1; j < q.length; j++) ctx.lineTo(q[j][0], q[j][1]);
    ctx.closePath();
  }
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  /** A flat shape lying on the ground, given in world coordinates. */
  function ground(pts, fill, stroke, lw) {
    poly(pts.map((p) => proj(p[0], p[1], 0)));
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }
  /** Set the canvas so that drawing in world units lands on the ground plane. */
  function onGround(fn) {
    ctx.save();
    const z = cam.zoom;
    ctx.transform(cs * z, sn * z * sp, -sn * z, cs * z * sp, vw / 2 - (cam.tx * cs - cam.ty * sn) * z, vh * 0.54 - (cam.tx * sn + cam.ty * cs) * z * sp);
    fn();
    ctx.restore();
  }

  function drawObject(o, ox, oy, k, t) {
    // Which faces look toward the eye, far ones first.
    const vis = [];
    for (const f of o.faces) {
      const nry = f.n[0] * sn + f.n[1] * cs;
      if (nry * cp + f.n[2] * sp <= 0.001) continue;
      let d = 0;
      const pts = f.p.map((p) => {
        const s = proj(ox + p[0] * k, oy + p[1] * k, p[2] * k);
        d += s[2];
        return s;
      });
      vis.push({ f, pts, d: d / pts.length + f.lift * 0.4 });
    }
    vis.sort((a, b) => a.d - b.d);
    for (const v of vis) {
      const lit = clamp(v.f.n[0] * L[0] + v.f.n[1] * L[1] + v.f.n[2] * L[2], 0, 1);
      poly(v.pts);
      T.paint(ctx, v.f.tone, lit, o, v.f, v.pts);
    }
    for (const l of o.lines) {
      const a = proj(ox + l.a[0] * k, oy + l.a[1] * k, l.a[2] * k);
      const b = proj(ox + l.b[0] * k, oy + l.b[1] * k, l.b[2] * k);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      T.stroke(ctx, l.tone, Math.max(0.6, l.w * cam.zoom * k * 0.22));
    }
    if (o.crane) {
      // The crane turns: the one thing in a city that moves, and only where work is going on.
      const c = o.crane;
      const a = c.phase + t * 0.00035;
      const base = proj(ox + c.x * k, oy + c.y * k, 0);
      const top = proj(ox + c.x * k, oy + c.y * k, c.h * k);
      const tip = proj(ox + (c.x + Math.cos(a) * c.arm) * k, oy + (c.y + Math.sin(a) * c.arm) * k, c.h * k);
      const tail = proj(ox + (c.x - Math.cos(a) * c.arm * 0.35) * k, oy + (c.y - Math.sin(a) * c.arm * 0.35) * k, c.h * k);
      const hook = proj(ox + (c.x + Math.cos(a) * c.arm * 0.8) * k, oy + (c.y + Math.sin(a) * c.arm * 0.8) * k, (c.h - 4 - Math.sin(t * 0.0008 + c.phase) * 1.6) * k);
      const hookTop = proj(ox + (c.x + Math.cos(a) * c.arm * 0.8) * k, oy + (c.y + Math.sin(a) * c.arm * 0.8) * k, c.h * k);
      const w = Math.max(0.8, cam.zoom * k * 0.34);
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.moveTo(tail[0], tail[1]);
      ctx.lineTo(tip[0], tip[1]);
      T.stroke(ctx, 'crane', w);
      ctx.beginPath();
      ctx.moveTo(hookTop[0], hookTop[1]);
      ctx.lineTo(hook[0], hook[1]);
      T.stroke(ctx, 'string', Math.max(0.5, w * 0.4));
    }
  }

  function draw(t) {
    camTrig();
    const k = swell();
    T.zoom = cam.zoom * k;
    hits.length = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    T.sky(ctx, vw, vh, { hour: HOUR, night: NIGHT });

    // The sea's edge of the land, then the land itself, lifted a little to give it thickness.
    const thick = T.landThickness ?? 14;
    poly(coast.map((p) => proj(p[0], p[1], -thick)));
    T.fill(ctx, 'cliff');
    poly(coast.map((p) => proj(p[0], p[1], 0)));
    T.fill(ctx, 'land');
    ctx.save();
    poly(coast.map((p) => proj(p[0], p[1], 0)));
    ctx.clip();
    T.landDetail?.(ctx, { proj, onGround, regions: W.regions, cam, vw, vh, coast });
    // The countries, lettered across the ground they cover.
    onGround(() => {
      for (const rg of W.regions) T.regionName?.(ctx, rg, cam);
    });

    // Roads: how strongly two cities are tied shows in what joins them.
    for (const rd of roads) {
      const pts = rd.pts.map((p) => proj(p[0], p[1], 0));
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      T.road(ctx, rd.l.g, cam.zoom * k);
    }
    // City ground: the plate the city stands on, then each district's plot.
    for (const c of cities) {
      const R = (c.radius + 4) * k;
      const ring = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const wob = 1 + 0.06 * Math.sin(a * 5 + (hash(c.p.id) % 7));
        ring.push([c.p.x + Math.cos(a) * R * wob, c.p.y + Math.sin(a) * R * wob]);
      }
      poly(ring.map((p) => proj(p[0], p[1], 0)));
      T.fill(ctx, 'cityGround', c);
      const rc = Math.cos(c.rot);
      const rs = Math.sin(c.rot);
      for (const pl of c.plots) {
        poly(pl.pts.map((q) => proj(c.p.x + (q[0] * rc - q[1] * rs) * k, c.p.y + (q[0] * rs + q[1] * rc) * k, 0)));
        T.fill(ctx, 'plot', c, pl.i);
      }
    }
    ctx.restore();

    // Everything that stands, far to near. What is off the screen is not drawn at all.
    const list = [];
    const seen = (x, y, reach) => {
      const s = proj(x, y, 0);
      return s[0] > -reach && s[0] < vw + reach && s[1] > -reach && s[1] < vh + reach;
    };
    for (const c of cities) {
      if (!seen(c.p.x, c.p.y, (c.radius + 30) * k * cam.zoom + 60)) continue;
      const rc = Math.cos(c.rot);
      const rs = Math.sin(c.rot);
      for (const o of c.objs) {
        const x = c.p.x + (o.local[0] * rc - o.local[1] * rs) * k;
        const y = c.p.y + (o.local[0] * rs + o.local[1] * rc) * k;
        if (!seen(x, y, (o.top + 14) * k * cam.zoom + 30)) continue;
        list.push({ o, x, y, k, c, d: (x - cam.tx) * sn + (y - cam.ty) * cs });
      }
    }
    const sk = clamp(k * 0.75, 1, 2.6);
    for (const o of scenery) {
      const kk = sk * (o.scale ?? 1);
      if (!seen(o.ox, o.oy, 60 * kk * cam.zoom + 30)) continue;
      list.push({ o, x: o.ox, y: o.oy, k: kk, c: null, d: (o.ox - cam.tx) * sn + (o.oy - cam.ty) * cs });
    }
    list.sort((a, b) => a.d - b.d);

    // Shadows first, all of them, so that nothing's shadow falls across a nearer wall.
    ctx.save();
    T.shadowStyle(ctx, NIGHT);
    ctx.beginPath();
    for (const it of list) {
      const { o, x, y, k: kk } = it;
      for (const s of o.foot) {
        const base = s.p.map((p) => [x + p[0] * kk, y + p[1] * kk]);
        const cast = base.map((p) => [p[0] + SHADOW[0] * s.h * kk, p[1] + SHADOW[1] * s.h * kk]);
        // The swept shape: each edge of the footprint dragged along the shadow's direction.
        // Every piece is wound the same way, so that together they fill as one shape.
        for (let i = 0; i < base.length; i++) {
          const a = base[i];
          const b = base[(i + 1) % base.length];
          wound([proj(a[0], a[1], 0), proj(b[0], b[1], 0), proj(cast[(i + 1) % base.length][0], cast[(i + 1) % base.length][1], 0), proj(cast[i][0], cast[i][1], 0)]);
        }
        wound(cast.map((p) => proj(p[0], p[1], 0)));
      }
    }
    ctx.fill('nonzero');
    ctx.restore();

    // Traffic: small, and only on a road where something flows and work is current.
    for (const rd of roads) {
      if (!rd.traffic) continue;
      for (let i = 0; i < 3; i++) {
        const u = (rd.phase + i / 3 + t * 0.000018 * (1400 / rd.len)) % 1;
        const f = u * (rd.pts.length - 1);
        const a = rd.pts[Math.floor(f)];
        const b = rd.pts[Math.min(rd.pts.length - 1, Math.floor(f) + 1)];
        const x = lerp(a[0], b[0], f % 1);
        const y = lerp(a[1], b[1], f % 1);
        // On the open road only: inside a city the traffic is lost among the houses.
        if (cities.some((c) => Math.hypot(c.p.x - x, c.p.y - y) < (c.radius + 4) * k)) continue;
        const s = proj(x, y, 1.2 * k);
        T.vehicle(ctx, s[0], s[1], clamp(cam.zoom * k * 1.5, 1.6, 5));
      }
    }

    for (const it of list) {
      const { o, x, y, k: kk } = it;
      drawObject(o, x, y, kk, t);
      if (o.kind === 'building') {
        const s = proj(x, y, o.top * kk * 0.5);
        hits.push({ o, c: it.c, x: s[0], y: s[1], r: Math.max(8, LOT * 0.5 * cam.zoom * kk) });
      }
    }

    if (NIGHT) T.night?.(ctx, vw, vh);
    // The grain of the paper is laid on once the view is still: it is the costliest stroke.
    if (t - lastMove > 140 && !flight) T.finish?.(ctx, vw, vh, DPR);
    else owed = true;

    // Names: little writing. The larger places from far off; every place once you are near.
    // The largest are lettered first, and a name that would cover another is left off.
    const taken = [];
    for (const c of cities.slice().sort((a, b) => RANKS.indexOf(b.p.rank) - RANKS.indexOf(a.p.rank))) {
      const rank = RANKS.indexOf(c.p.rank);
      const near = cam.zoom > 0.9;
      const hot = hover?.c === c && !hover.o;
      if (!near && rank < 4 && !hot) continue;
      if (focus && focus !== c && cam.zoom > 2) continue;
      if (focus === c && cam.zoom > 2.5) continue; // its name is on the overview card already
      const top = c.objs.reduce((m, o) => Math.max(m, o.top), 0);
      const foot = proj(c.p.x, c.p.y, top * k * 0.6);
      const s = proj(c.p.x, c.p.y, top * k + 9 * k);
      s[1] = Math.min(s[1], foot[1] - 22);
      const box = { x: s[0] - c.p.name.length * 5 - 16, y: s[1] - 28, w: c.p.name.length * 10 + 32, h: 30 };
      if (!hot && taken.some((q) => box.x < q.x + q.w && q.x < box.x + box.w && box.y < q.y + q.h && q.y < box.y + box.h)) continue;
      taken.push(box);
      ctx.beginPath();
      ctx.moveTo(foot[0], foot[1]);
      ctx.lineTo(s[0], s[1]);
      T.stroke(ctx, 'pole', 1);
      T.label(ctx, c.p.name, s[0], s[1], rank, hot);
    }
    // Every city can be pointed at, named or not.
    for (const c of cities) {
      const s = proj(c.p.x, c.p.y, 0);
      hits.push({ c, x: s[0], y: s[1], r: Math.max(18, c.core * cam.zoom * k * 0.9), city: true });
    }
    if (hover?.o) {
      const h = hits.find((q) => q.o === hover.o);
      if (h) T.tip(ctx, hover.o.f.n, h.x, h.y - hover.o.top * cam.zoom * k * 0.5 - 12);
    }
  }

  // ───────────────────────── moving about ─────────────────────────

  let DPR = 1;
  let dirty = true;
  let flight = null;
  let lastMove = -1e9; // when the view last moved under the hand
  let owed = false; // a still, finished drawing is owed once it stops
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    vw = cv.clientWidth;
    vh = cv.clientHeight;
    cv.width = Math.round(vw * DPR);
    cv.height = Math.round(vh * DPR);
    dirty = true;
  }
  const HOME = () => ({ yaw: -0.5, pitch: 0.74, zoom: Math.min(vw / (LAND_X * 2.5), vh / (LAND_Y * 2.2)), tx: CX, ty: CY + 20 });
  function fly(to, ms = 1100) {
    flight = { from: { ...cam }, to, t0: performance.now(), ms };
  }
  function enter(c) {
    focus = c;
    picked = null;
    fly({ yaw: cam.yaw + 0.5, pitch: 0.46, zoom: clamp(Math.min(vw, vh) / (c.core * 1.55), 3.4, 12), tx: c.p.x, ty: c.p.y - c.core * 0.12 });
    document.body.classList.add('in-city');
    showCity(c);
  }
  function leave() {
    focus = null;
    picked = null;
    document.body.classList.remove('in-city');
    fly(HOME());
    showCity(null);
  }

  const animated = () => cities.some((c) => c.objs.some((o) => o.crane)) || roads.some((r) => r.traffic);
  function frame(t) {
    if (flight) {
      const u = clamp((t - flight.t0) / flight.ms, 0, 1);
      const e = 1 - Math.pow(1 - u, 4);
      for (const key of ['yaw', 'pitch', 'tx', 'ty']) cam[key] = lerp(flight.from[key], flight.to[key], e);
      cam.zoom = Math.exp(lerp(Math.log(flight.from.zoom), Math.log(flight.to.zoom), e));
      if (u === 1) flight = null;
      dirty = true;
    }
    if (owed && !flight && t - lastMove > 160) {
      owed = false;
      dirty = true;
    }
    // The cranes and the traffic are slow: twenty frames a second is plenty for them.
    if (dirty || (animated() && !STILL && t - last > 50)) {
      draw(t);
      last = t;
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  let last = 0;
  const STILL = q.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Pointer: drag to turn and tilt, wheel to come closer, click a city to go in.
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, tx: cam.tx, ty: cam.ty, moved: false, pan: e.shiftKey || e.button === 2 };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      flight = null;
      lastMove = performance.now();
      if (drag.pan) {
        const rx = -dx / cam.zoom;
        const ry = -dy / cam.zoom / sp;
        cam.tx = drag.tx + rx * cs + ry * sn;
        cam.ty = drag.ty - rx * sn + ry * cs;
      } else {
        cam.yaw = drag.yaw - dx * 0.006;
        cam.pitch = clamp(drag.pitch + dy * 0.005, 0.1, 1.5);
      }
      dirty = true;
      return;
    }
    const r = cv.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if ((h?.o ?? null) !== (hover?.o ?? null) || (h?.c ?? null) !== (hover?.c ?? null)) {
      hover = h;
      cv.style.cursor = h ? 'pointer' : 'grab';
      dirty = true;
    }
  });
  cv.addEventListener('pointerup', (e) => {
    const was = drag;
    drag = null;
    if (!was || was.moved) return;
    const r = cv.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (!h) {
      if (picked) showBuilding(null);
      return;
    }
    if (h.o && focus === h.c) showBuilding(h.o, h.c);
    else enter(h.c);
  });
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const before = unproj(e.clientX - r.left, e.clientY - r.top);
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0016), 0.12, 16);
      camTrig();
      const after = unproj(e.clientX - r.left, e.clientY - r.top);
      cam.tx += before[0] - after[0];
      cam.ty += before[1] - after[1];
      flight = null;
      lastMove = performance.now();
      dirty = true;
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === '0') leave();
    const step = 60 / cam.zoom;
    if (e.key === 'ArrowLeft') (cam.tx -= step * cs), (cam.ty += step * sn), (dirty = true);
    if (e.key === 'ArrowRight') (cam.tx += step * cs), (cam.ty -= step * sn), (dirty = true);
    if (e.key === 'ArrowUp') (cam.tx -= step * sn), (cam.ty -= step * cs), (dirty = true);
    if (e.key === 'ArrowDown') (cam.tx += step * sn), (cam.ty += step * cs), (dirty = true);
  });
  addEventListener('resize', resize);

  function pick(x, y) {
    // A building, when you are in its city; otherwise the city.
    let best = null;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (h.city) continue;
      if (focus !== h.c) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && (!best || d < best.d)) best = { ...h, d };
    }
    if (best) return best;
    for (const h of hits) {
      if (!h.city) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && (!best || d < best.d)) best = { ...h, d };
    }
    return best;
  }

  // ───────────────────────── the few words ─────────────────────────

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const built = (f) => STAGES.indexOf(f.s) >= 4;
  const STAGE_WORDS = {
    concept: 'Staked out. Nothing built yet.',
    planned: 'Planned. The ground is laid.',
    designed: 'Designed. The frame is up.',
    building: 'Being built.',
    working: 'Standing and in use.',
    mature: 'Long standing, and returned to.',
  };
  const KIND_WORDS = { frontage: 'What people see and touch', works: 'Where the work is done', reservoir: 'Where data is kept', observatory: 'Where things are judged and learned', utility: 'What the rest runs on' };

  function showCity(c) {
    const el = $('city');
    showBuilding(null);
    if (!c) {
      el.hidden = true;
      $('back').hidden = true;
      return;
    }
    const p = c.p;
    const going = p.f.filter((f) => f.s === 'building').length;
    const meant = p.f.filter((f) => STAGES.indexOf(f.s) < 3).length;
    const standing = p.f.filter(built).length;
    const parts = [];
    if (standing) parts.push(`${standing} standing`);
    if (going) parts.push(`${going} going up`);
    if (meant) parts.push(`${meant} planned`);
    el.innerHTML =
      `<h2>${esc(p.name)}</h2><p class="what">${esc(p.note)}</p>` +
      `<p class="tally">${parts.length ? parts.join(' · ') : 'An idea. Nothing built.'}</p>` +
      (c.districts.length
        ? `<ul>${c.districts.map((d) => `<li><i style="background:${T.districtColor(d.i)}"></i>${esc(d.name)}<b>${d.n}</b></li>`).join('')}</ul>`
        : '');
    el.hidden = false;
    $('back').hidden = false;
  }
  function showBuilding(o, c) {
    const el = $('building');
    picked = o;
    if (!o) {
      el.hidden = true;
      return;
    }
    const f = o.f;
    const pct = f.s === 'building' ? ` ${Math.round(f.pr * 100)}% of the way up.` : '';
    const again = o.repair ? ' Being worked on again.' : '';
    el.innerHTML =
      `<h3>${esc(f.n)}</h3><p class="kind">${f.lm ? 'A wonder: a release was named for it' : KIND_WORDS[f.k]} · ${esc(c.districts.find((d) => d.i === o.district)?.name ?? '')}</p>` +
      `<p>${STAGE_WORDS[f.s]}${pct}${again}</p>` +
      `<p class="facts">${plural(f.c, 'commit', 'commits')}${f.last ? ` · last worked on ${esc(f.last)}` : ''}</p>` +
      (f.note ? `<p class="note">${esc(f.note)}</p>` : '');
    el.hidden = false;
  }
  $('back').addEventListener('click', leave);
  $('tally').textContent = `${plural(W.places.length, 'place', 'places')} · ${plural(
    W.places.reduce((n, p) => n + p.f.length, 0),
    'building',
    'buildings',
  )} · ${plural(W.links.length, 'road', 'roads')}`;

  // ───────────────────────── begin ─────────────────────────

  resize();
  Object.assign(cam, HOME());
  if (q.has('city')) {
    const c = cities.find((x) => x.p.id === q.get('city') || x.p.name.toLowerCase().startsWith(q.get('city').toLowerCase()));
    if (c) {
      focus = c;
      Object.assign(cam, { yaw: -0.42, pitch: 0.46, zoom: clamp(Math.min(vw, vh) / (c.core * 1.55), 3.4, 12), tx: c.p.x, ty: c.p.y });
      document.body.classList.add('in-city');
      showCity(c);
    }
  } else if (!STILL) {
    // One authored moment: the world settles into view from above.
    const home = HOME();
    Object.assign(cam, { ...home, pitch: 1.35, zoom: home.zoom * 0.82, yaw: home.yaw - 0.35 });
    fly(home, 1900);
  }
  requestAnimationFrame(frame);
})();
