  // ───────────────────────── the board ─────────────────────────
  // The whole world is one small carved board of square tiles: an object with an edge and a
  // thickness, standing on a table, that you turn in your hands. A project holds a square
  // patch of tiles around its seat, carved as a low stepped hill: one, two or three terraces
  // by the work in it. Its seat is a tower with a brass ring for every level. Every tile
  // carries one thing: a feature, or a field, a wood, a hill. Each of the four domains builds
  // in its own manner. Ties between projects are brass inlaid in the seams of the board.
  // What has not been started lies under cloud; an idea is one tile, seen dimly.

  const N = 21;
  const MID = (N - 1) / 2;
  const TS = 16; // one tile
  const HALF = (N * TS) / 2;
  const TH = 12; // how thick the board is
  const K = 1.24; // everything stands a little larger than the kit draws it
  const RANKS = ['spark', 'site', 'outpost', 'settlement', 'town', 'city', 'major'];
  const DOMS = W.regions.map((r) => r.id);
  const wxy = (i, j) => [(i - MID) * TS, (j - MID) * TS];
  const cells = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) cells.push({ i, j, h: null, thing: null, ward: -1, road: false, cloud: false });
  const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N ? null : cells[j * N + i]);
  /** Is there a tile passing the test within d tiles of this one? */
  function near(i, j, test, d = 1) {
    for (let b = -d; b <= d; b++) {
      for (let a = -d; a <= d; a++) {
        const c = at(i + a, j + b);
        if (c && test(c)) return true;
      }
    }
    return false;
  }

  const hoods = W.places.map((p) => {
    const n = p.f.length;
    return { p, n, dom: Math.max(0, DOMS.indexOf(p.region)), ring: n === 0 ? 0 : n <= 8 ? 1 : n <= 24 ? 2 : 3, level: Math.max(1, RANKS.indexOf(p.rank)), quiet: p.live === 'dormant' || p.live === 'ruins', wards: [], ci: 0, cj: 0, x: 0, y: 0 };
  });
  const hoodOf = new Map(hoods.map((h) => [h.p.id, h]));
  {
    // Where each stood on the old sheet decides roughly where it stands here. The board is
    // seen corner-on, so the sheet's left and right become the board's two side corners.
    const xs = W.places.map((p) => p.x);
    const ys = W.places.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    for (const h of hoods) {
      const a = ((h.p.x - x0) / (x1 - x0)) * 2 - 1;
      const b = ((h.p.y - y0) / (y1 - y0)) * 2 - 1;
      h.di = MID + (b - a) * MID * 0.5;
      h.dj = MID - (a + b) * MID * 0.5;
    }
  }
  // The largest take their ground first. No territory reaches the rim of the board.
  for (const h of hoods.filter((x) => x.ring > 0).sort((a, b) => b.ring - a.ring || b.n - a.n)) {
    let best = null;
    for (let r = h.ring; r >= 1 && !best; r--) {
      for (let cj = 1 + r; cj <= N - 2 - r; cj++) {
        for (let ci = 1 + r; ci <= N - 2 - r; ci++) {
          if (near(ci, cj, (c) => c.h, r)) continue;
          const cost = (ci - h.di) ** 2 + (cj - h.dj) ** 2;
          if (!best || cost < best.cost) best = { ci, cj, r, cost };
        }
      }
    }
    if (!best) continue;
    h.ring = best.r;
    h.ci = best.ci;
    h.cj = best.cj;
    [h.x, h.y] = wxy(h.ci, h.cj);
    const slots = [];
    for (let b = -h.ring; b <= h.ring; b++) {
      for (let a = -h.ring; a <= h.ring; a++) {
        const c = at(h.ci + a, h.cj + b);
        c.h = h;
        if (a === 0 && b === 0) c.thing = 'seat';
        else slots.push({ c, ang: Math.atan2(b, a), ring: Math.max(Math.abs(a), Math.abs(b)) });
      }
    }
    // A ward is a wedge of the territory, like a slice of it. Its features stand nearest the
    // seat; what is left of the wedge is the domain's own country.
    slots.sort((s, t) => s.ang - t.ang);
    const wards = new Map();
    for (const f of h.p.f.slice(0, slots.length)) {
      const name = f.w ?? 'The quarter';
      if (!wards.has(name)) wards.set(name, []);
      wards.get(name).push(f);
    }
    const list = [...wards];
    const count = list.reduce((s, [, fs]) => s + fs.length, 0);
    const spare = slots.length - count;
    const roll = rng(h.p.id);
    let given = 0;
    let k0 = 0;
    list.forEach(([name, fs], w) => {
      const extra = w === list.length - 1 ? spare - given : Math.min(spare - given, Math.round((spare * fs.length) / count));
      given += extra;
      const mine = slots.slice(k0, k0 + fs.length + extra).sort((s, t) => s.ring - t.ring || s.ang - t.ang);
      k0 += fs.length + extra;
      let sx = 0;
      let sy = 0;
      mine.forEach((s, k) => {
        s.c.ward = w;
        if (k < fs.length) {
          s.c.thing = 'feature';
          s.c.f = fs[k];
        } else {
          const v = roll();
          s.c.thing = v < 0.42 ? 'field' : v < 0.8 ? 'wood' : 'hill';
        }
        const [x, y] = wxy(s.c.i, s.c.j);
        sx += x;
        sy += y;
      });
      h.wards.push({ name, n: fs.length, x: sx / mine.length, y: sy / mine.length });
    });
  }
  // An idea is a single tile out in the cloud, as near as it can be to where it belongs.
  for (const h of hoods.filter((x) => x.ring === 0)) {
    let best = null;
    for (const c of cells) {
      if (near(c.i, c.j, (x) => x.h)) continue;
      const cost = (c.i - h.di) ** 2 + (c.j - h.dj) ** 2;
      if (!best || cost < best.cost) best = { c, cost };
    }
    if (!best) continue;
    best.c.h = h;
    best.c.thing = 'idea';
    h.ci = best.c.i;
    h.cj = best.c.j;
    [h.x, h.y] = wxy(h.ci, h.cj);
  }


  // How high each tile stands. A territory is carved as a low stepped hill: its outer ring
  // one step above the bare board, each ring inside it a step higher, the seat on top.
  const STEP = 2.2;
  for (const c of cells) {
    c.z = 0;
    if (c.h && c.thing !== 'idea') c.z = STEP * (c.h.ring - Math.max(Math.abs(c.i - c.h.ci), Math.abs(c.j - c.h.cj)) + 1);
  }

  // Ties are brass, inlaid in the seams between the tiles, so that a road never runs under
  // what is built. It leaves one seat's tile at a corner and comes to the other's, turns as
  // seldom as it can, and follows an inlay that is already there.
  const NN = N + 1;
  const STEPS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  /** The two tiles on either side of the seam that leaves corner (a, b) in direction d. */
  const flank = (a, b, d) => (d === 0 ? [at(a, b - 1), at(a, b)] : d === 1 ? [at(a - 1, b), at(a, b)] : d === 2 ? [at(a - 1, b - 1), at(a - 1, b)] : [at(a - 1, b - 1), at(a, b - 1)]);
  const seamKey = (a, b, d) => (d === 0 ? `h${a},${b}` : d === 2 ? `h${a - 1},${b}` : d === 1 ? `v${a},${b}` : `v${a},${b - 1}`);
  const corner = (a, b) => [(a - MID - 0.5) * TS, (b - MID - 0.5) * TS];
  const laid = new Set();
  const held = (c) => c && c.h && c.thing !== 'idea';
  function seamToll(p, q, A, B) {
    if (!p || !q) return 9; // the rim of the board belongs to its trim
    let t = 1;
    for (const c of [p, q]) if ((c.thing === 'seat' || c.thing === 'idea') && c.h !== A && c.h !== B) t += 6;
    if (held(p) && held(q) && p.h === q.h) t += p.h === A || p.h === B ? 0.25 : 1.6;
    return t;
  }
  function route(A, B) {
    const S = NN * NN * 4;
    const dist = new Float64Array(S).fill(Infinity);
    const prev = new Int32Array(S).fill(-1);
    const done = new Uint8Array(S);
    const corners = (h) => [[h.ci, h.cj], [h.ci + 1, h.cj], [h.ci, h.cj + 1], [h.ci + 1, h.cj + 1]];
    const goal = new Set(corners(B).map(([a, b]) => b * NN + a));
    for (const [a, b] of corners(A)) for (let d = 0; d < 4; d++) dist[(b * NN + a) * 4 + d] = 0;
    let end = -1;
    for (;;) {
      let u = -1;
      for (let k = 0; k < S; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
      if (u < 0) break;
      const un = u >> 2;
      if (goal.has(un)) {
        end = u;
        break;
      }
      done[u] = 1;
      const ua = un % NN;
      const ub = (un - ua) / NN;
      const ud = u & 3;
      for (let d = 0; d < 4; d++) {
        if (d === (ud + 2) % 4) continue;
        const a = ua + STEPS[d][0];
        const b = ub + STEPS[d][1];
        if (a < 0 || b < 0 || a > N || b > N) continue;
        const [p, q] = flank(ua, ub, d);
        const cost = seamToll(p, q, A, B) * (laid.has(seamKey(ua, ub, d)) ? 0.4 : 1) + (d === ud ? 0 : 1.2);
        const v = (b * NN + a) * 4 + d;
        if (dist[u] + cost < dist[v]) {
          dist[v] = dist[u] + cost;
          prev[v] = u;
        }
      }
    }
    const nodes = [];
    for (let u = end; u >= 0; u = prev[u]) nodes.push([(u >> 2) % NN, Math.floor((u >> 2) / NN), u & 3]);
    return nodes.reverse();
  }
  const GRADE = { road: 0, track: 1, surveyed: 2 };
  const ties = new Map(hoods.map((h) => [h, []]));
  const roads = W.links
    .slice()
    .sort((a, b) => GRADE[a.g] - GRADE[b.g])
    .map((l) => {
      const A = hoodOf.get(l.a);
      const B = hoodOf.get(l.b);
      const nodes = route(A, B);
      const first = corner(nodes[0][0], nodes[0][1]);
      const pts = [[first[0], first[1], at(A.ci, A.cj).z + 0.06]];
      for (let k = 1; k < nodes.length; k++) {
        const [a0, b0] = nodes[k - 1];
        const d = nodes[k][2];
        const [p, q] = flank(a0, b0, d);
        laid.add(seamKey(a0, b0, d));
        // A road or a track is known ground: the cloud is off the tiles on either side of it.
        if (l.g !== 'surveyed') for (const c of [p, q]) if (c) c.road = true;
        const z = Math.max(p?.z ?? 0, q?.z ?? 0) + 0.06;
        const s = corner(a0, b0);
        const e = corner(nodes[k][0], nodes[k][1]);
        pts.push([s[0], s[1], z], [e[0], e[1], z]);
      }
      const last = pts[pts.length - 1];
      pts.push([last[0], last[1], at(B.ci, B.cj).z + 0.06]);
      // How far along it each point lies, for the lights that travel it.
      const run = [0];
      for (let k = 1; k < pts.length; k++) run.push(run[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      ties.get(A).push({ other: B, l });
      ties.get(B).push({ other: A, l });
      return { l, g: GRADE[l.g], a: A, b: B, pts, run, len: run[run.length - 1] };
    });
  // Cloud lies on every tile that no territory touches and no road passes.
  for (const c of cells) c.cloud = c.thing === 'idea' || (!c.h && !c.road && !near(c.i, c.j, (x) => x.h && x.thing !== 'idea'));

  // ───────────────────────── four manners of building ─────────────────────────
  // The kind of a feature decides the body of its building. The domain decides the roof it
  // wears, the colour of its walls, and the trees, hills and fields around it.
  //   0  pitched roofs, pines, peaked hills, furrows
  //   1  domes, round trees, round hills, long beds
  //   2  steep four-sided roofs, tall thin trees, flat-topped hills, squares
  //   3  flat stepped roofs, flat-crowned trees, ridges, a walled plot

  let M = 0;
  function cap(o, x, y, w, d, z0, h) {
    if (z0 >= o.maxZ - 0.01) return;
    if (M === 0) o.gable(x - 0.35, y - 0.35, w + 0.7, d + 0.7, z0, h, 'roof', w >= d ? 'x' : 'y');
    else if (M === 1) {
      const r = Math.min(w, d) * 0.5;
      o.cyl(x + w / 2, y + d / 2, r, z0, 0.25, 'roof', 'dome', r, 8, 'roof');
    } else if (M === 2) o.pyramid(x - 0.5, y - 0.5, w + 1, d + 1, z0, h * 1.6, 'roof');
    else {
      o.box(x - 0.6, y - 0.6, w + 1.2, d + 1.2, z0, 0.6, 'roof');
      o.box(x + w * 0.2, y + d * 0.2, w * 0.6, d * 0.6, z0 + 0.6, h * 0.5, 'wall');
      o.box(x + w * 0.2 - 0.4, y + d * 0.2 - 0.4, w * 0.6 + 0.8, d * 0.6 + 0.8, z0 + 0.6 + h * 0.5, 0.5, 'roof');
    }
  }
  /** The same, for something round. */
  function roundCap(o, cx, cy, r, z0, h) {
    if (z0 >= o.maxZ - 0.01) return;
    if (M === 0) o.cyl(cx, cy, r + 0.3, z0, 0.01, 'roof', 'cone', r + 0.3, 10, 'roof');
    else if (M === 1) o.cyl(cx, cy, r, z0, 0.2, 'roof', 'dome', r, 10, 'roof');
    else if (M === 2) o.pyramid(cx - r - 0.2, cy - r - 0.2, 2 * r + 0.4, 2 * r + 0.4, z0, h * 1.5, 'roof');
    else o.cyl(cx, cy, r + 0.5, z0, 0.6, 'roof', 'flat', r + 0.5, 10, 'roof');
  }
  /** Every building stands on a course of darker stone. */
  const plinth = (o, x, y, w, d) => o.box(x - 0.45, y - 0.45, w + 0.9, d + 0.9, 0, 0.55, 'base');
  // A hall: broad, with a row of doors. It gains a storey, then a corner tower.
  KIND.frontage = (o, s, H, t) => {
    const d = s * 0.8;
    plinth(o, -s / 2, -d / 2, s, d);
    const h1 = H * (t === 1 ? 0.56 : 0.44);
    o.box(-s / 2, -d / 2, s, d, 0, h1, 'wall');
    o.windows(-s / 2, -d / 2, s, d, 0, h1, 0, t + 2, 1, 'door');
    o.windows(-s / 2, -d / 2, s, d, 0, h1, 3, 2, 1);
    if (t === 1) return cap(o, -s / 2, -d / 2, s, d, h1, H * 0.34);
    const i = s * 0.13;
    const h2 = H * 0.3;
    o.box(-s / 2 - 0.3, -d / 2 - 0.3, s + 0.6, d + 0.6, h1, 0.35, 'ledge');
    o.box(-s / 2 + i, -d / 2 + i, s - 2 * i, d - 2 * i, h1 + 0.35, h2, 'wall');
    o.windows(-s / 2 + i, -d / 2 + i, s - 2 * i, d - 2 * i, h1 + 0.35, h2, 0, t + 1, 1);
    o.windows(-s / 2 + i, -d / 2 + i, s - 2 * i, d - 2 * i, h1 + 0.35, h2, 3, 2, 1);
    cap(o, -s / 2 + i, -d / 2 + i, s - 2 * i, d - 2 * i, h1 + 0.35 + h2, H * 0.24);
    if (t === 3) {
      const tw = s * 0.3;
      o.box(-s / 2, d / 2 - tw, tw, tw, 0, H * 1.02, 'wall');
      o.windows(-s / 2, d / 2 - tw, tw, tw, H * 0.7, H * 0.3, 0, 1, 1, 'clock');
      cap(o, -s / 2, d / 2 - tw, tw, tw, H * 1.02, H * 0.2);
    }
  };
  // A mill: a long shed and a chimney, then a second chimney and a wing.
  KIND.works = (o, s, H, t) => {
    const d = s * 0.66;
    plinth(o, -s / 2, -d / 2, s, d);
    const h1 = H * 0.5;
    o.box(-s / 2, -d / 2, s, d, 0, h1, 'wall');
    o.windows(-s / 2, -d / 2, s, d, 0, h1, 0, t + 2, 1);
    o.windows(-s / 2, -d / 2, s, d, 0, h1, 3, 2, 1);
    cap(o, -s / 2, -d / 2, s, d, h1, H * 0.26);
    o.cyl(s / 2 - 1.2, -d / 2 - 0.9, 0.95, 0, H * 1.08, 'brick', 'flat', 0.62, 8, 'soot');
    if (t >= 2) o.cyl(s / 2 - 3.6, -d / 2 - 0.9, 0.85, 0, H * 0.86, 'brick', 'flat', 0.58, 8, 'soot');
    if (t === 3) {
      o.box(-s / 2, d / 2, s * 0.44, s * 0.2, 0, h1 * 0.62, 'wall');
      cap(o, -s / 2, d / 2, s * 0.44, s * 0.2, h1 * 0.62, H * 0.12);
    }
  };
  // Tanks: one, then two, then three, each under a round roof.
  KIND.reservoir = (o, s, H, t) => {
    const r = s * (t === 1 ? 0.36 : 0.27);
    if (t === 1) {
      const z = o.cyl(0, 0, r, 0, H * 0.6, 'tank', 'none');
      return roundCap(o, 0, 0, r, z, H * 0.3);
    }
    let z = o.cyl(-s * 0.2, -s * 0.16, r, 0, H * 0.82, 'tank', 'none');
    roundCap(o, -s * 0.2, -s * 0.16, r, z, H * 0.26);
    z = o.cyl(s * 0.22, s * 0.16, r, 0, H * 0.52, 'tank', 'none');
    roundCap(o, s * 0.22, s * 0.16, r, z, H * 0.26);
    if (t === 3) {
      z = o.cyl(s * 0.26, -s * 0.28, r * 0.7, 0, H * 0.66, 'tank', 'none');
      roundCap(o, s * 0.26, -s * 0.28, r * 0.7, z, H * 0.2);
    }
  };
  // A look-out: a slim tower on a low base, taller than anything near it, with a gallery.
  KIND.observatory = (o, s, H, t) => {
    const b = s * 0.82;
    plinth(o, -b / 2, -b / 2, b, b);
    const h1 = H * 0.26;
    o.box(-b / 2, -b / 2, b, b, 0, h1, 'wall');
    o.windows(-b / 2, -b / 2, b, b, 0, h1, 0, t + 1, 1);
    o.windows(-b / 2, -b / 2, b, b, 0, h1, 3, t + 1, 1);
    o.box(-b / 2 - 0.3, -b / 2 - 0.3, b + 0.6, b + 0.6, h1, 0.35, 'ledge');
    const tw = b * 0.46;
    const th = H * (0.62 + t * 0.12);
    const z = o.box(-tw / 2, -tw / 2, tw, tw, h1 + 0.35, th, 'wall');
    o.windows(-tw / 2, -tw / 2, tw, tw, h1 + 0.35, th, 0, 1, t + 1);
    o.windows(-tw / 2, -tw / 2, tw, tw, h1 + 0.35, th, 3, 1, t + 1);
    if (t >= 2) o.box(-tw / 2 - 0.7, -tw / 2 - 0.7, tw + 1.4, tw + 1.4, h1 + th * 0.74, 0.4, 'ledge');
    cap(o, -tw / 2, -tw / 2, tw, tw, z, H * 0.22);
    if (z < o.maxZ) o.line([0, 0, z + H * 0.2], [0, 0, z + H * 0.2 + 3], 'metal', 1.3);
  };
  // A powerhouse: a low shed and a lattice mast, then stacks.
  KIND.utility = (o, s, H, t) => {
    const h1 = H * 0.34;
    const d = s * 0.56;
    plinth(o, -s / 2, -d / 2, s * 0.7, d);
    o.box(-s / 2, -d / 2, s * 0.7, d, 0, h1, 'wall');
    o.windows(-s / 2, -d / 2, s * 0.7, d, 0, h1, 0, t + 1, 1);
    o.windows(-s / 2, -d / 2, s * 0.7, d, 0, h1, 3, 2, 1);
    cap(o, -s / 2, -d / 2, s * 0.7, d, h1, H * 0.16);
    const mx = s * 0.34;
    const my = s * 0.1;
    const top = Math.min(H * (0.95 + t * 0.14), o.maxZ);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([mx + a * 1.1, my + b * 1.1, 0], [mx, my, top], 'metal', 1.5);
    for (let k = 1; k <= 3; k++) {
      const z = (top * k) / 4;
      const w = 1.1 * (1 - k / 4);
      o.line([mx - w, my - w, z], [mx + w, my - w, z], 'metal', 1);
      o.line([mx + w, my - w, z], [mx + w, my + w, z], 'metal', 1);
      o.line([mx + w, my + w, z], [mx - w, my + w, z], 'metal', 1);
      o.line([mx - w, my + w, z], [mx - w, my - w, z], 'metal', 1);
    }
    o.shadow([[mx - 0.4, my - 0.4], [mx + 0.4, my - 0.4], [mx + 0.4, my + 0.4], [mx - 0.4, my + 0.4]], top);
    if (t >= 2) o.cyl(-s * 0.3, -d / 2 - 0.9, 0.8, 0, H * 0.7, 'brick', 'flat', 0.6, 8, 'soot');
    if (t === 3) o.cyl(-s * 0.08, -d / 2 - 0.9, 0.8, 0, H * 0.58, 'brick', 'flat', 0.6, 8, 'soot');
  };
  // A monument, for the thing a release was named after: a stone needle tipped with brass.
  // It is fine, and it is never taller than the seat of its project.
  KIND.wonder = (o, s, H) => {
    const b = s * 0.92;
    let z = o.box(-b / 2, -b / 2, b, b, 0, 0.9, 'base');
    z = o.box(-b * 0.36, -b * 0.36, b * 0.72, b * 0.72, z, 0.9, 'stone');
    const w = b * 0.3;
    z = o.box(-w / 2, -w / 2, w, w, z, H * 0.5, 'stone');
    z = o.box(-w / 2 - 0.3, -w / 2 - 0.3, w + 0.6, w + 0.6, z, 0.4, 'brass');
    z = o.box(-w * 0.36, -w * 0.36, w * 0.72, w * 0.72, z, H * 0.14, 'stone');
    o.pyramid(-w * 0.42, -w * 0.42, w * 0.84, w * 0.84, z, w * 1.1, 'brass');
  };
  const retone = (o, from, to) => {
    for (const f of o.faces) if (f.tone === from) f.tone = to;
  };
  /** A feature's building, in the manner of the domain it belongs to. */
  function raise(x, y, f, dom) {
    M = dom;
    const o = building(x, y, Math.PI, f, dom);
    retone(o, 'wall', `wall${dom}`);
    return o;
  }


  function tree(o, x, y, s) {
    if (M === 0) {
      o.line([x, y, 0], [x, y, 1.6], 'trunk', 1.4);
      o.cyl(x, y, 2.3 * s, 1.4, 6.6 * s, 'tree0', 'flat', 0.1, 6);
    } else if (M === 1) {
      o.line([x, y, 0], [x, y, 2.4], 'trunk', 1.4);
      o.cyl(x, y, 2.5 * s, 2.2, 0.9, 'tree1', 'dome', 2.5 * s, 7);
    } else if (M === 2) {
      o.cyl(x, y, 1.3 * s, 0.9, 8.4 * s, 'tree2', 'cone', 0.9 * s, 6);
      o.line([x, y, 0], [x, y, 1], 'trunk', 1.4);
    } else {
      o.line([x, y, 0], [x, y, 4.6], 'trunk', 1.4);
      o.cyl(x, y, 3 * s, 4.4, 1, 'tree3', 'flat', 3 * s, 7);
      o.cyl(x, y, 1.8 * s, 5.4, 0.9, 'tree3', 'flat', 1.8 * s, 7);
    }
    const r = 2 * s;
    o.shadow([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], 5 * s);
  }
  /** What stands on a tile that has no feature: a field, a wood or a hill, in the domain's manner. */
  function country(x, y, what, dom, r) {
    M = dom;
    const o = Obj(x, y, 0);
    o.kind = 'country';
    if (what === 'wood') {
      for (const [a, b] of [[-3.2, -2.4], [3, -2.9], [0.4, 3]]) tree(o, a + (r() - 0.5) * 1.4, b + (r() - 0.5) * 1.4, 0.75 + r() * 0.3);
    } else if (what === 'hill') {
      const tone = `rock${dom}`;
      if (dom === 0) o.pyramid(-5.6, -5.6, 11.2, 11.2, 0, 6, tone);
      else if (dom === 1) o.cyl(0, 0, 5, 0, 0.3, tone, 'dome', 5, 8, tone);
      else if (dom === 2) {
        o.box(-5.6, -5.6, 11.2, 11.2, 0, 2.3, tone);
        o.box(-3.2, -3.2, 6.4, 6.4, 2.3, 2.2, tone);
      } else {
        o.gable(-5.6, -4.2, 11.2, 8.4, 0, 5.2, tone, 'x');
        retone(o, 'wall', tone);
      }
      o.shadow([[-5, -5], [5, -5], [5, 5], [-5, 5]], 3.4);
    } else {
      const tone = `crop${dom}`;
      if (dom === 0) for (let k = 0; k < 4; k++) o.box(-5.6, -5.4 + k * 3, 11.2, 1.7, 0, 0.4, tone);
      else if (dom === 1) for (let k = 0; k < 3; k++) o.box(-5.6 + k * 4, -5.6, 3.1, 11.2, 0, 0.5, tone);
      else if (dom === 2) for (const [a, b] of [[-5.6, -5.6], [0.5, 0.5], [-5.6, 0.5], [0.5, -5.6]]) o.box(a, b, 5.1, 5.1, 0, a === b ? 0.7 : 0.3, tone);
      else {
        o.box(-5.6, -5.6, 11.2, 11.2, 0, 0.3, tone);
        o.box(-5.6, -5.6, 11.2, 0.7, 0.3, 0.6, 'stone');
        o.box(-5.6, 4.9, 11.2, 0.7, 0.3, 0.6, 'stone');
        o.box(-5.6, -5.6, 0.7, 11.2, 0.3, 0.6, 'stone');
        o.box(4.9, -5.6, 0.7, 11.2, 0.3, 0.6, 'stone');
      }
    }
    return o;
  }
  /** An idea: four pegs, a string round them and a board. Nothing built. */
  /** A window on a round tower, facing outward at an angle. */
  function roundWindow(o, r, ang, z0, z1) {
    if (z1 > o.maxZ) return;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const hw = 0.5;
    const px = c * (r + 0.05);
    const py = s * (r + 0.05);
    o.face([[px + s * hw, py - c * hw, z0], [px - s * hw, py + c * hw, z0], [px - s * hw, py + c * hw, z1], [px + s * hw, py - c * hw, z1]], [c, s, 0], 'window', 0, 1);
  }
  /**
   * The seat of a project: a tower on a stepped base, the tallest and finest thing in its
   * territory. It has a storey for every level the project has reached, and a brass ring
   * round the head of each storey, so that the rings can be counted. A lantern hangs over it;
   * the lantern is lit while the project is being worked on.
   */
  function seat(x, y, h) {
    M = h.dom;
    const o = Obj(x, y, Math.PI);
    o.kind = 'building';
    o.district = h.dom;
    o.seat = true;
    if (h.p.live === 'ruins') o.maxZ = 6.2; // only the stump of it is left
    let z = o.box(-6, -6, 12, 12, 0, 0.8, 'base');
    z = o.box(-4.9, -4.9, 9.8, 9.8, z, 0.8, 'stone');
    let w = 5.2 + h.level * 0.22;
    const sh = 3.1;
    for (let k = 0; k < h.level; k++) {
      if (M === 1) {
        o.cyl(0, 0, w / 2, z, sh, 'wall', 'none', w / 2, 12);
        for (let a = 0; a < 6; a++) roundWindow(o, w / 2, (a / 6) * TAU + 0.3, z + sh * 0.3, z + sh * 0.78);
      } else {
        o.box(-w / 2, -w / 2, w, w, z, sh, 'wall');
        for (let side = 0; side < 4; side++) o.windows(-w / 2, -w / 2, w, w, z, sh, side, k === 0 && side === 0 ? 1 : 2, 1, k === 0 && side === 0 ? 'door' : 'window');
      }
      z += sh;
      if (z >= o.maxZ) break;
      // The ring that marks a level.
      if (M === 1) o.cyl(0, 0, w / 2 + 0.34, z, 0.46, 'brass', 'flat', w / 2 + 0.34, 12, 'brass');
      else o.box(-w / 2 - 0.34, -w / 2 - 0.34, w + 0.68, w + 0.68, z, 0.46, 'brass');
      z += 0.46;
      w *= M === 3 ? 0.86 : M === 2 ? 0.93 : 0.96;
    }
    if (z < o.maxZ) {
      if (M === 1) roundCap(o, 0, 0, w / 2, z, 3);
      else cap(o, -w / 2, -w / 2, w, w, z, 3.2);
      const t = o.top;
      o.line([0, 0, t - 0.3], [0, 0, t + 2.4], 'brass', 1.4);
      o.lantern = t + 2.6;
      o.top = t + 3;
    }
    retone(o, 'wall', `wall${h.dom}`);
    return o;
  }
  /** An idea: four pegs, a cord round them, and one brass pin in the middle. Nothing built. */
  function claim(x, y) {
    const o = Obj(x, y, Math.PI);
    o.kind = 'idea';
    const e = 5;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([a * e, b * e, 0], [a * e, b * e, 1.8], 'stake', 2.2);
    o.line([-e, -e, 1.5], [e, -e, 1.5], 'string', 1);
    o.line([e, -e, 1.5], [e, e, 1.5], 'string', 1);
    o.line([e, e, 1.5], [-e, e, 1.5], 'string', 1);
    o.line([-e, e, 1.5], [-e, -e, 1.5], 'string', 1);
    o.line([0, 0, 0], [0, 0, 4.2], 'brass', 1.6);
    o.cyl(0, 0, 0.8, 4.2, 0.9, 'brass', 'flat', 0.8, 6, 'brass');
    o.top = 5.4;
    return o;
  }

  // What stands on each tile, and the cloud that lies on some.
  const things = [];
  const number = (o) => {
    o.faces.forEach((fc, i) => {
      fc.roll = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
    });
    return o;
  };
  for (const c of cells) {
    const [x, y] = wxy(c.i, c.j);
    const h = c.h;
    c.x = x;
    c.y = y;
    c.tone = 0.95 + 0.1 * rng(`tile/${c.i}/${c.j}`)();
    let o = null;
    if (c.thing === 'feature') {
      o = raise(x, y, c.f, h.dom);
      // Work going on now is light: every window of a thing being worked on is lit. After
      // dark the rest of a living project shows a few lights; a dormant one shows none.
      o.glow = c.f.h > 0.3 && c.f.s !== 'building' ? 1 : NIGHT && !h.quiet && STAGES.indexOf(c.f.s) >= 4 ? (h.p.live === 'building' ? 0.55 : 0.3) : 0;
    } else if (c.thing === 'seat') {
      o = seat(x, y, h);
      o.glow = h.p.live === 'building' ? 0.999 : NIGHT && !h.quiet ? 0.3 : 0;
      if (h.p.live !== 'building') o.lanternOut = true;
    } else if (c.thing === 'idea') o = claim(x, y);
    else if (c.thing) o = country(x, y, c.thing, h.dom, rng(`${h.p.id}/${c.i}/${c.j}`));
    if (o) {
      o.hood = h;
      o.dim = h.quiet;
      c.o = number(o);
      if (c.thing === 'seat') h.seat = o;
      things.push({ o, x, y, z: c.z, h });
    }
    if (c.cloud) {
      const r = rng(`cloud/${c.i}/${c.j}`);
      const thin = c.thing === 'idea';
      const puffs = [];
      const spread = () => (r() - 0.5) * TS;
      if (thin) for (let k = 0; k < 3; k++) puffs.push({ dx: spread() * 1.1, dy: spread() * 1.1, z: 7 + r() * 2, r: TS * (0.5 + r() * 0.12), sq: 0.66, lit: 0.6, ph: r() * TAU });
      else {
        puffs.push({ dx: spread() * 0.3, dy: spread() * 0.3, z: 2.6, r: TS * (0.84 + r() * 0.2), sq: 0.5, lit: 0, ph: r() * TAU });
        for (let k = 0; k < 2; k++) puffs.push({ dx: spread() * 0.9, dy: spread() * 0.9, z: 5 + r() * 2.5, r: TS * (0.6 + r() * 0.24), sq: 0.62, lit: 0.6, ph: r() * TAU });
        if (r() < 0.7) puffs.push({ dx: spread() * 0.7, dy: spread() * 0.7, z: 9 + r() * 3.5, r: TS * (0.42 + r() * 0.24), sq: 0.68, lit: 1, ph: r() * TAU });
      }
      things.push({ cloud: puffs, thin, x, y, z: 0, h });
    }
  }
  // Four loose pieces lie on the table beside the board, one for each domain: how it builds
  // and what grows there. They say nothing until you point at one.
  const SPECIMEN = { id: 'specimen', n: '', k: 'frontage', s: 'working', st: 4, pr: 1, h: 0, c: 0 };
  const pieces = W.regions.map((rg, m) => {
    const x0 = (-5.6 + m * 3.2) * TS + (m % 2) * 5;
    const y0 = -HALF - (2.5 + (m % 2) * 0.5 + (m === 3 ? 0.3 : 0)) * TS;
    const objs = [raise(x0 + TS * 0.5, y0 + TS * 0.5, SPECIMEN, m), country(x0 + TS * 1.5, y0 + TS * 0.5, 'wood', m, rng(`piece${m}`))];
    for (const o of objs) number(o).glow = 0;
    return { rg, m, x0, y0, objs };
  });

  // ───────────────────────── the light ─────────────────────────
  // A small carved board on a dark table in a dim room, late in the day. One warm lamp
  // stands low to the left, a little toward you; the board is the only lit thing, and the
  // table falls away into the dark. After dark the lamp is out and the board lights itself:
  // windows, lanterns, and the brass of the roads.
  //
  // The lamp belongs to the room, not to the board, so it stays where it is when the board
  // is turned.

  const PAL = Object.fromEntries(
    Object.entries({
      wall: '#d6c4a4', wall0: '#dbc5a0', wall1: '#cfcab4', wall2: '#d8c497', wall3: '#cfbdae',
      ledge: '#e2d1b2', base: '#8d8270', stone: '#b9ac92', slab: '#a79b83',
      door: '#4a382c', brick: '#b0826a', soot: '#3a3432', tank: '#cdc2ab', metal: '#5d5a56',
      brass: '#d9a640', gold: '#d9a640', flag: '#d9a640',
      stake: '#5e4830', string: '#6b5338', frame: '#7b6246', scaffold: '#75593a', crane: '#4f3d2a', trunk: '#59452f',
      tree0: '#3d5742', tree1: '#6f8750', tree2: '#7b8147', tree3: '#57716b',
      rock0: '#a39480', rock1: '#959b82', rock2: '#ae9f76', rock3: '#9d928c',
      crop0: '#bca173', crop1: '#98a676', crop2: '#c9ae62', crop3: '#aa9a8a',
    }).map(([k, v]) => [k, hex(v)]),
  );
  const ROOF = ['#9f5b43', '#6a8982', '#8f6f4b', '#7f687a'].map(hex);
  const GROUND = [['#dccaa6', '#cfbc98'], ['#c2c7a2', '#b5bb96'], ['#e2cf9a', '#d4c08a'], ['#cfc4b8', '#c2b7ac']].map((p) => p.map(hex));
  const BARE = hex('#7b756a');
  const DULL = hex('#9b9484');
  const RISER = hex('#6c6252');
  const WOOD = [hex('#5d3f2c'), hex('#553928')];
  const HAZE = NIGHT ? [10, 14, 28] : [34, 42, 70];
  const GLASS = new Set(['window', 'door', 'glass', 'clock', 'slit']);
  const METALS = new Set(['brass', 'gold', 'flag']);
  const ROOFS = new Set(['roof', 'awning', 'dome']);

  let LAMP = [0, 0, 1];
  let CAST = [0, 0];
  let lampX = 0;
  let lampY = 0;
  function setLight() {
    const a = NIGHT ? [0.6, -0.55] : [-0.86, 0.5]; // across the screen, and toward you
    const el = NIGHT ? 0.95 : 0.55;
    const dx = cs * a[0] + sn * a[1];
    const dy = -sn * a[0] + cs * a[1];
    const n = Math.hypot(dx, dy);
    LAMP = [(dx / n) * Math.cos(el), (dy / n) * Math.cos(el), Math.sin(el)];
    CAST = [-LAMP[0] / LAMP[2], -LAMP[1] / LAMP[2]];
    lampX = -0.12 * vw;
    lampY = 0.4 * vh;
  }
  /** How much of the lamp reaches a point on the screen. */
  const lampAt = (sx, sy) => (NIGHT ? 1 : clamp(1.26 - (0.66 * Math.hypot(sx - lampX, sy - lampY)) / vw, 0.42, 1.2));
  /** How far back on the board a point is, 0 at the middle and nearer, 1 at the far corner. */
  const farOf = (x, y) => clamp(-(x * sn + y * cs) / (HALF * 1.42), 0, 1);
  /** A colour in this light: warm where the lamp falls, blue where it does not. */
  function shade(base, key, f, far) {
    let r;
    let g;
    let b;
    if (NIGHT) {
      r = base[0] * (0.12 + 0.17 * key);
      g = base[1] * (0.16 + 0.22 * key);
      b = base[2] * (0.28 + 0.36 * key);
    } else {
      const a = 0.7 + 0.3 * f;
      const k = key * f;
      r = base[0] * (0.4 * a + 1.16 * k);
      g = base[1] * (0.44 * a + 0.88 * k);
      b = base[2] * (0.6 * a + 0.56 * k);
    }
    const t = far * (NIGHT ? 0.3 : 0.2);
    return [r + (HAZE[0] - r) * t, g + (HAZE[1] - g) * t, b + (HAZE[2] - b) * t];
  }
  const keyOf = (nx, ny, nz) => Math.max(0, nx * LAMP[0] + ny * LAMP[1] + nz * LAMP[2]);

  function sprite(size, fn) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    fn(c.getContext('2d'), size);
    return c;
  }
  const radial = (g, s, cx, cy, r, stops) => {
    const grad = g.createRadialGradient(cx * s, cy * s, 0, cx * s, cy * s, r * s);
    for (const [at0, colour] of stops) grad.addColorStop(at0, colour);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  };
  const GLOW = sprite(64, (g, s) => radial(g, s, 0.5, 0.5, 0.5, [[0, 'rgba(255,208,124,0.9)'], [0.3, 'rgba(255,172,84,0.34)'], [1, 'rgba(255,150,60,0)']]));
  const SOFT = sprite(64, (g, s) => radial(g, s, 0.5, 0.5, 0.5, [[0, 'rgba(18,20,52,0.5)'], [0.55, 'rgba(18,20,52,0.3)'], [1, 'rgba(18,20,52,0)']]));
  const puff = (stops) =>
    sprite(128, (g, s) => {
      radial(g, s, 0.4, 0.36, 0.72, stops);
      g.globalCompositeOperation = 'destination-in';
      radial(g, s, 0.5, 0.5, 0.5, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.96)'], [0.78, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
    });
  // Cloud in the lamp, cloud out of its reach, and cloud after dark.
  const PUFF = puff([[0, '#e2d0ac'], [0.5, '#d0ba98'], [0.8, '#a08e8e'], [1, '#6a6684']]);
  const PUFF_FAR = puff([[0, '#6a6c88'], [0.5, '#484c6c'], [1, '#2b3052']]);
  const PUFF_NIGHT = puff([[0, '#3c4566'], [0.5, '#242b48'], [1, '#12172c']]);
  const NOISE = sprite(128, (g, s) => {
    const r = rng('grain');
    for (let y = 0; y < s; y += 2) {
      for (let x = 0; x < s; x += 2) {
        const v = r();
        g.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.5 - v) * 0.5})` : `rgba(255,255,255,${(v - 0.5) * 0.4})`;
        g.fillRect(x, y, 2, 2);
      }
    }
  });
  let grain = null;
  const blooms = [4, 8, 16].map(() => document.createElement('canvas'));
  /** The bright things spread a little into the air of the room. */
  function bloom() {
    blooms.forEach((c, k) => {
      const w = Math.ceil(cv.width / (4 << k));
      const h = Math.ceil(cv.height / (4 << k));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'copy';
      g.drawImage(k === 0 ? cv : blooms[k - 1], 0, 0, w, h);
      if (k === 0) {
        // Squared, so that only what is bright is left to spread.
        g.globalCompositeOperation = 'multiply';
        g.drawImage(c, 0, 0);
      }
    });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = NIGHT ? 0.5 : 0.2;
    ctx.drawImage(blooms[1], 0, 0, cv.width, cv.height);
    ctx.globalAlpha = NIGHT ? 0.45 : 0.2;
    ctx.drawImage(blooms[2], 0, 0, cv.width, cv.height);
    ctx.restore();
  }
  function glow(x, y, r, a = 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(GLOW, x - r, y - r, 2 * r, 2 * r);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ───────────────────────── drawing ─────────────────────────

  const lit = (h) => hover?.h === h || focus === h;
  function tileColour(c) {
    let g = BARE;
    if (c.h) {
      g = GROUND[c.h.dom][c.ward > 0 ? c.ward % 2 : 0];
      if (c.thing === 'idea') g = mix(g, BARE, 0.6);
      else if (c.h.quiet) g = mix(g, DULL, 0.6);
      if (lit(c.h)) g = mix(g, [255, 236, 196], 0.16);
    }
    return [g[0] * c.tone, g[1] * c.tone, g[2] * c.tone];
  }
  const quad = (x0, y0, x1, y1, z = 0) => [proj(x0, y0, z), proj(x1, y0, z), proj(x1, y1, z), proj(x0, y1, z)];
  const fillWith = (c) => {
    ctx.fillStyle = ctx.strokeStyle = css(c);
    ctx.lineWidth = 0.7;
    ctx.fill();
    ctx.stroke();
  };
  /** Add to the current path the shadow of a flat shape standing h high on ground at zb. */
  function castInto(base, h, zb) {
    const far = base.map((p) => [p[0] + CAST[0] * h, p[1] + CAST[1] * h]);
    for (let i = 0; i < base.length; i++) {
      const a = base[i];
      const b = base[(i + 1) % base.length];
      const c = far[(i + 1) % base.length];
      const d = far[i];
      wound([proj(a[0], a[1], zb), proj(b[0], b[1], zb), proj(c[0], c[1], zb), proj(d[0], d[1], zb)]);
    }
    wound(far.map((p) => proj(p[0], p[1], zb)));
  }
  const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  /** The shadow a slab throws on the table, and the two of its edges that face the eye. */
  function slabSides(x0, y0, nx, ny, colourAt, big) {
    const x1 = x0 + nx * TS;
    const y1 = y0 + ny * TS;
    ctx.save();
    ctx.shadowColor = 'rgba(2,4,10,0.85)';
    ctx.shadowBlur = (big ? 34 : 12) * DPR;
    ctx.fillStyle = '#04070d';
    ctx.beginPath();
    if (NIGHT) wound(quad(x0, y0, x1, y1, -TH - 1));
    else castInto(square(x0, y0, x1, y1), TH + 2, -TH - 1);
    ctx.fill('nonzero');
    ctx.restore();
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (ax * sn + ay * cs <= 0) continue;
      const key = keyOf(ax, ay, 0) + 0.05;
      const n = ax !== 0 ? ny : nx;
      for (let k = 0; k < n; k++) {
        const xa = ax !== 0 ? (ax > 0 ? x1 : x0) : x0 + k * TS;
        const xb = ax !== 0 ? xa : xa + TS;
        const ya = ay !== 0 ? (ay > 0 ? y1 : y0) : y0 + k * TS;
        const yb = ay !== 0 ? ya : ya + TS;
        const mid = proj((xa + xb) / 2, (ya + yb) / 2, -TH / 2);
        const f = lampAt(mid[0], mid[1]);
        const band = (za, zb, c, kk = key) => {
          poly([proj(xa, ya, za), proj(xb, yb, za), proj(xb, yb, zb), proj(xa, ya, zb)]);
          fillWith(shade(c, kk, f, 0));
        };
        // Stone on top, a line of brass, the wood of the board, and its dark foot.
        band(0, -1.5, mix(colourAt(ax !== 0 ? (ax > 0 ? nx - 1 : 0) : k, ay !== 0 ? (ay > 0 ? ny - 1 : 0) : k), RISER, 0.45));
        band(-2.3, -TH + 1.3, WOOD[k % 2]);
        band(-TH + 1.3, -TH, [38, 27, 22]);
        band(-1.5, -2.3, PAL.brass, key * 1.3 + 0.12);
      }
      const xa = ax !== 0 ? (ax > 0 ? x1 : x0) : x0;
      const xb = ax !== 0 ? xa : x1;
      const ya = ay !== 0 ? (ay > 0 ? y1 : y0) : y0;
      const yb = ay !== 0 ? ya : y1;
      const a0 = proj(xa, ya, -TH - 2);
      const b0 = proj(xb, yb, -TH - 2);
      const a1 = proj(xa, ya, -2 * TH - 2);
      const b1 = proj(xb, yb, -2 * TH - 2);
      const c = shade(WOOD[0], key, lampAt((a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2), 0);
      const g = ctx.createLinearGradient(0, Math.min(a0[1], b0[1]), 0, Math.max(a1[1], b1[1]));
      g.addColorStop(0, css(c, big ? 0.34 : 0.24));
      g.addColorStop(1, css(c, 0));
      poly([a0, b0, b1, a1]);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  function drawTiles() {
    const order = cells.slice().sort((a, b) => a.x * sn + a.y * cs - (b.x * sn + b.y * cs));
    const e = TS / 2;
    for (const c of order) {
      const s = proj(c.x, c.y, c.z);
      const f = lampAt(s[0], s[1]);
      const far = farOf(c.x, c.y);
      const tc = tileColour(c);
      if (c.z > 0) {
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (ax * sn + ay * cs <= 0) continue;
          const nz = at(c.i + ax, c.j + ay)?.z ?? 0;
          if (nz >= c.z) continue;
          const xa = ax !== 0 ? c.x + ax * e : c.x - e;
          const xb = ax !== 0 ? xa : c.x + e;
          const ya = ay !== 0 ? c.y + ay * e : c.y - e;
          const yb = ay !== 0 ? ya : c.y + e;
          poly([proj(xa, ya, c.z), proj(xb, yb, c.z), proj(xb, yb, nz), proj(xa, ya, nz)]);
          fillWith(shade(mix(tc, RISER, 0.35), keyOf(ax, ay, 0) + 0.05, f, far));
        }
      }
      poly(quad(c.x - e, c.y - e, c.x + e, c.y + e, c.z));
      ctx.fillStyle = css(shade(tc, LAMP[2], f, far));
      ctx.fill();
      ctx.strokeStyle = NIGHT ? 'rgba(4,6,14,0.5)' : 'rgba(34,28,26,0.26)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  // Brass: bright toward the lamp, dull away from it. After dark it is lit from within.
  let brass = null;
  function pathOf(pts, ox = 0, oy = 0) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = proj(p[0], p[1], p[2]);
      if (i === 0) ctx.moveTo(s[0] + ox, s[1] + oy);
      else ctx.lineTo(s[0] + ox, s[1] + oy);
    });
  }
  const strokeOf = (style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  function drawRoads(spill) {
    if (spill) return drawSpill();
    brass = ctx.createLinearGradient(0, 0, vw, 0);
    if (NIGHT) {
      brass.addColorStop(0, '#6a5226');
      brass.addColorStop(1, '#6a5226');
    } else {
      brass.addColorStop(0, '#ffe296');
      brass.addColorStop(0.45, '#eebc54');
      brass.addColorStop(1, '#b98a3a');
    }
    const recess = NIGHT ? 'rgba(3,4,10,0.8)' : 'rgba(30,20,14,0.72)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const fine = clamp(cam.zoom * 0.58, 1.7, 3);
    const broad = clamp(cam.zoom * 1.9, 5, 8);
    // A fine frame of brass round every seat's tile: the roads come to it.
    for (const h of hoods) {
      if (h.ring === 0) continue;
      const e = TS / 2;
      poly(quad(h.x - e, h.y - e, h.x + e, h.y + e, at(h.ci, h.cj).z + 0.06));
      strokeOf(recess, fine + 1.6);
      strokeOf(brass, fine);
    }
    for (const g of [2, 1, 0]) {
      for (const rd of roads) {
        if (rd.g !== g) continue;
        const mine = lit(rd.a) || lit(rd.b);
        if (g === 2) {
          // The loosest tie: a line of studs.
          const r = Math.max(1.5, cam.zoom * 0.5);
          const dots = [];
          for (let k = 1; k < rd.pts.length; k++) {
            const a = rd.pts[k - 1];
            const b = rd.pts[k];
            if (rd.run[k] === rd.run[k - 1]) continue;
            for (const u of [1 / 6, 0.5, 5 / 6]) dots.push(proj(lerp(a[0], b[0], u), lerp(a[1], b[1], u), a[2]));
          }
          for (const [rr, style] of [[r + 0.9, recess], [r, brass]]) {
            ctx.beginPath();
            for (const s of dots) {
              ctx.moveTo(s[0] + rr, s[1]);
              ctx.arc(s[0], s[1], rr, 0, TAU);
            }
            ctx.fillStyle = style;
            ctx.fill();
          }
          if (NIGHT || mine) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            for (const s of dots) {
              ctx.moveTo(s[0] + r * 0.8, s[1]);
              ctx.arc(s[0], s[1], r * 0.8, 0, TAU);
            }
            ctx.fillStyle = mine ? 'rgba(255,226,160,0.8)' : 'rgba(255,196,110,0.55)';
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
          }
          continue;
        }
        const w = g === 0 ? broad : fine;
        pathOf(rd.pts);
        strokeOf(recess, w + (g === 0 ? 3.4 : 2));
        strokeOf(brass, w);
        if (!NIGHT && g === 0) {
          // The edge of a broad inlay catches the lamp.
          pathOf(rd.pts, -w * 0.22, -w * 0.22);
          strokeOf('rgba(255,240,190,0.6)', Math.max(0.9, w * 0.22));
        }
        ctx.globalCompositeOperation = 'lighter';
        pathOf(rd.pts);
        if (NIGHT) {
          strokeOf(g === 0 ? 'rgba(255,150,50,0.11)' : 'rgba(255,160,60,0.1)', w * (g === 0 ? 5.5 : 5));
          strokeOf(g === 0 ? 'rgba(255,180,84,0.32)' : 'rgba(255,186,96,0.3)', w * (g === 0 ? 1.9 : 2));
          strokeOf(g === 0 ? 'rgba(255,226,160,0.95)' : 'rgba(255,214,140,0.8)', Math.max(0.9, w * (g === 0 ? 0.42 : 0.6)));
        } else {
          strokeOf(g === 0 ? 'rgba(255,160,60,0.2)' : 'rgba(255,160,60,0.14)', w * (g === 0 ? 3.2 : 3.8));
          strokeOf(g === 0 ? 'rgba(255,176,70,0.26)' : 'rgba(255,186,90,0.26)', w);
        }
        if (mine) strokeOf('rgba(255,222,150,0.5)', w * 1.3);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  /** What the brass gives back to the room: a soft light on whatever stands along a road. */
  function drawSpill() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const broad = clamp(cam.zoom * 1.9, 5, 8);
    for (const rd of roads) {
      if (rd.g === 2) continue;
      const w = rd.g === 0 ? broad : broad * 0.5;
      const k = (rd.g === 0 ? 1 : 0.6) * (lit(rd.a) || lit(rd.b) ? 1.8 : 1);
      pathOf(rd.pts);
      strokeOf(`rgba(255,${NIGHT ? 168 : 186},${NIGHT ? 76 : 96},${(NIGHT ? 0.075 : 0.045) * k})`, w * 3.4);
      if (NIGHT) strokeOf(`rgba(255,196,110,${0.13 * k})`, w * 0.9);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  /** Small lights travel the broad roads, slowly, out from the larger seat to the smaller. */
  function drawLights(t) {
    for (const rd of roads) {
      if (rd.g !== 0 || rd.len === 0) continue;
      const busy = rd.a.p.heat > 0.5 || rd.b.p.heat > 0.5;
      const n = Math.max(1, Math.round(rd.len / (TS * (busy ? 3 : 5))));
      const phase = (hash(rd.l.a + rd.l.b) % 100) / 100;
      for (let k = 0; k < n; k++) {
        const along = ((k + phase + (STILL ? 0 : (t * 0.0045) / TS)) / n) % 1;
        const u = rd.b.n > rd.a.n ? 1 - along : along;
        const want = u * rd.len;
        let i = 1;
        while (i < rd.run.length - 1 && rd.run[i] < want) i++;
        const span = rd.run[i] - rd.run[i - 1] || 1;
        const v = (want - rd.run[i - 1]) / span;
        const a = rd.pts[i - 1];
        const b = rd.pts[i];
        const s = proj(lerp(a[0], b[0], v), lerp(a[1], b[1], v), lerp(a[2], b[2], v));
        // It fades in as it leaves a seat and out as it comes to one.
        const fade = clamp(Math.min(u, 1 - u) * 8, 0, 1) * (busy ? 1 : 0.7);
        glow(s[0], s[1], Math.max(8, cam.zoom * (NIGHT ? 4.2 : 3.6)), fade * (NIGHT ? 1 : 0.9));
        ctx.beginPath();
        ctx.arc(s[0], s[1], Math.max(1.2, cam.zoom * 0.42), 0, TAU);
        ctx.fillStyle = `rgba(255,246,214,${fade})`;
        ctx.fill();
      }
    }
  }

  /** One standing thing: its faces far to near, each in the light it stands in. */
  function drawThing(o, ox, oy, zb, t) {
    const foot = proj(ox, oy, zb);
    const f = lampAt(foot[0], foot[1]);
    const far = farOf(ox, oy);
    const vis = [];
    for (const fc of o.faces) {
      const nry = fc.n[0] * sn + fc.n[1] * cs;
      if (nry * cp + fc.n[2] * sp <= 0.001) continue;
      let d = 0;
      let y0 = Infinity;
      let y1 = -Infinity;
      const pts = fc.p.map((p) => {
        const s = proj(ox + p[0] * K, oy + p[1] * K, zb + p[2] * K);
        d += s[2];
        if (s[1] < y0) y0 = s[1];
        if (s[1] > y1) y1 = s[1];
        return s;
      });
      vis.push({ fc, pts, d: d / pts.length + fc.lift * 0.4, y0, y1 });
    }
    vis.sort((a, b) => a.d - b.d);
    for (const v of vis) {
      const fc = v.fc;
      poly(v.pts);
      if (GLASS.has(fc.tone)) {
        const on = fc.tone !== 'door' && o.glow > 0 && fc.roll < o.glow;
        if (!on) {
          fillWith(shade(fc.tone === 'door' ? PAL.door : [58, 66, 84], 0.5 + keyOf(fc.n[0], fc.n[1], fc.n[2]) * 0.7, f, far));
          continue;
        }
        ctx.fillStyle = o.glow > 0.9 ? '#ffd685' : '#e2a552';
        ctx.fill();
        if (o.glow > 0.9 && (!o.seat || fc.roll < 0.4)) {
          let cx = 0;
          let cy = 0;
          for (const p of v.pts) {
            cx += p[0];
            cy += p[1];
          }
          glow(cx / v.pts.length, cy / v.pts.length, clamp((v.y1 - v.y0) * 2.3, 4, 22), NIGHT ? 0.6 : 0.34);
        }
        continue;
      }
      let base = ROOFS.has(fc.tone) ? ROOF[o.district ?? 0] : PAL[fc.tone] ?? PAL.wall;
      if (o.dim && !METALS.has(fc.tone)) base = mix(base, DULL, 0.5);
      const upright = Math.abs(fc.n[2]) < 0.3;
      let key = keyOf(fc.n[0], fc.n[1], fc.n[2]) + (upright ? 0.05 : 0);
      if (METALS.has(fc.tone)) key = key * 1.3 + 0.12;
      const c = shade(base, key, f, far);
      if (upright && v.y1 - v.y0 > 7) {
        // A wall is darker toward its foot, where less of the room reaches it.
        const g = ctx.createLinearGradient(0, v.y0, 0, v.y1);
        g.addColorStop(0, css([c[0] * 1.04, c[1] * 1.04, c[2] * 1.04]));
        g.addColorStop(1, css([c[0] * 0.76, c[1] * 0.78, c[2] * 0.84]));
        ctx.fillStyle = ctx.strokeStyle = g;
        ctx.lineWidth = 0.7;
        ctx.fill();
        ctx.stroke();
      } else fillWith(c);
    }
    const dimLine = NIGHT ? 0.3 : 0.5 + 0.55 * f;
    for (const l of o.lines) {
      const a = proj(ox + l.a[0] * K, oy + l.a[1] * K, zb + l.a[2] * K);
      const b = proj(ox + l.b[0] * K, oy + l.b[1] * K, zb + l.b[2] * K);
      const base = PAL[l.tone] ?? PAL.metal;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineCap = 'round';
      const w = Math.max(0.6, l.w * cam.zoom * K * 0.2);
      ctx.setLineDash(l.tone === 'string' ? [w * 2.2, w * 2.2] : []);
      strokeOf(css([base[0] * dimLine, base[1] * dimLine, base[2] * dimLine]), w);
      ctx.setLineDash([]);
    }
    if (o.crane) {
      // The crane turns, slowly, and carries a lamp: work is going on here.
      const c = o.crane;
      const a = c.phase + (STILL ? 0 : t * 0.00022);
      const at3 = (r, z) => proj(ox + (c.x + Math.cos(a) * r) * K, oy + (c.y + Math.sin(a) * r) * K, zb + z * K);
      const base = at3(0, 0);
      const top = at3(0, c.h);
      const tip = at3(c.arm, c.h);
      const tail = at3(-c.arm * 0.35, c.h);
      const hookTop = at3(c.arm * 0.8, c.h);
      const hook = at3(c.arm * 0.8, c.h - 4 - (STILL ? 0 : Math.sin(t * 0.0005 + c.phase) * 1.4));
      const w = Math.max(0.8, cam.zoom * K * 0.3);
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(top[0], top[1]);
      ctx.moveTo(tail[0], tail[1]);
      ctx.lineTo(tip[0], tip[1]);
      strokeOf(css([PAL.crane[0] * dimLine, PAL.crane[1] * dimLine, PAL.crane[2] * dimLine]), w);
      ctx.beginPath();
      ctx.moveTo(hookTop[0], hookTop[1]);
      ctx.lineTo(hook[0], hook[1]);
      strokeOf(css([PAL.string[0] * dimLine, PAL.string[1] * dimLine, PAL.string[2] * dimLine]), Math.max(0.5, w * 0.4));
      glow(hook[0], hook[1], Math.max(9, cam.zoom * 4.4), NIGHT ? 1 : 0.85);
      ctx.beginPath();
      ctx.arc(hook[0], hook[1], Math.max(1.4, cam.zoom * 0.5), 0, TAU);
      ctx.fillStyle = '#fff2c8';
      ctx.fill();
    }
    if (o.lantern) {
      const s = proj(ox, oy, zb + o.lantern * K);
      const r = Math.max(1.6, cam.zoom * 0.62);
      if (!o.lanternOut) glow(s[0], s[1], Math.max(14, cam.zoom * 7.5), 1);
      ctx.beginPath();
      ctx.arc(s[0], s[1], r, 0, TAU);
      ctx.fillStyle = o.lanternOut ? css(shade(PAL.brass, 0.9, f, far)) : '#fff3cc';
      ctx.fill();
    }
  }
  function drawCloud(it, t) {
    const open = it.thin && lit(it.h);
    const s0 = proj(it.x, it.y, 5);
    const dark = NIGHT ? 0 : clamp((1.12 - lampAt(s0[0], s0[1])) * 1.5, 0, 0.92);
    const a = it.thin ? (open ? 0.12 : 0.62) : 1;
    for (const p of it.cloud) {
      const drift = STILL ? 0 : Math.sin(t * 0.00016 + p.ph) * 1.5;
      const s = proj(it.x + p.dx + drift, it.y + p.dy - drift * 0.5, p.z);
      const R = p.r * cam.zoom;
      ctx.globalAlpha = a;
      ctx.drawImage(NIGHT ? PUFF_NIGHT : PUFF, s[0] - R, s[1] - R * p.sq, 2 * R, 2 * R * p.sq);
      const veil = NIGHT ? 0 : clamp(dark + (1 - p.lit) * 0.28, 0, 0.94);
      if (veil > 0.02) {
        ctx.globalAlpha = a * veil;
        ctx.drawImage(PUFF_FAR, s[0] - R, s[1] - R * p.sq, 2 * R, 2 * R * p.sq);
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawPiece(pc, t) {
    slabSides(pc.x0, pc.y0, 2, 1, () => GROUND[pc.m][0], false);
    for (let i = 0; i < 2; i++) {
      const x = pc.x0 + i * TS;
      const s = proj(x + TS / 2, pc.y0 + TS / 2, 0);
      poly(quad(x, pc.y0, x + TS, pc.y0 + TS));
      ctx.fillStyle = css(shade(mix(GROUND[pc.m][0], [255, 236, 196], hover?.piece === pc ? 0.16 : 0), LAMP[2], lampAt(s[0], s[1]), 0));
      ctx.fill();
      strokeOf('rgba(34,28,26,0.34)', 0.9);
    }
    if (!NIGHT) {
      ctx.save();
      poly(quad(pc.x0, pc.y0, pc.x0 + 2 * TS, pc.y0 + TS));
      ctx.clip();
      ctx.beginPath();
      for (const o of pc.objs) for (const s of o.foot) castInto(s.p.map((p) => [o.ox + p[0] * K, o.oy + p[1] * K]), s.h * K, 0);
      ctx.fillStyle = 'rgba(26,28,66,0.46)';
      ctx.fill('nonzero');
      ctx.restore();
    }
    for (const o of pc.objs.slice().sort((a, b) => a.ox * sn + a.oy * cs - (b.ox * sn + b.oy * cs))) drawThing(o, o.ox, o.oy, 0, t);
  }

  const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  /** A name, set in the picture's own manner: small capitals over a hairline of brass. */
  function nameAt(text, x, y, size, plain) {
    ctx.save();
    ctx.font = `${plain ? 'italic 500' : '600'} ${size}px ${SERIF}`;
    ctx.letterSpacing = plain ? '0.2px' : `${(size * 0.17).toFixed(1)}px`;
    const label = plain ? text : text.toUpperCase();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,9,18,0.82)';
    ctx.lineWidth = 4.5;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = '#f3e6c8';
    ctx.fillText(label, x, y);
    if (!plain) {
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(217,166,64,0.9)';
      ctx.fillRect(x - w / 2, y + 6, w, 1);
    }
    ctx.restore();
  }

  function draw(t) {
    camTrig();
    setLight();
    hits.length = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // The table: dark, with what the lamp spills on it.
    {
      const g = ctx.createRadialGradient(lampX + vw * 0.14, vh * 0.6, 0, lampX + vw * 0.14, vh * 0.6, vw * 0.95);
      if (NIGHT) {
        g.addColorStop(0, '#0c1220');
        g.addColorStop(1, '#05070e');
      } else {
        g.addColorStop(0, '#75594a');
        g.addColorStop(0.22, '#44384a');
        g.addColorStop(0.55, '#1a2032');
        g.addColorStop(1, '#0a0e1a');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }

    const depth = (x, y) => (x - cam.tx) * sn + (y - cam.ty) * cs;
    const board0 = depth(0, 0);
    for (const pc of pieces) if (depth(pc.x0 + TS, pc.y0) < board0) drawPiece(pc, t);

    slabSides(-HALF, -HALF, N, N, (i, j) => tileColour(at(i, j)), true);
    drawTiles();

    // Shadows: long, from the lamp, across the board and stopping at its edge. The terraces
    // throw them, and everything that stands, and the cloud.
    const list = [];
    for (const it of things) {
      const s = proj(it.x, it.y, it.z);
      if (s[0] < -160 || s[0] > vw + 160 || s[1] < -160 || s[1] > vh + 300) continue;
      list.push({ ...it, d: depth(it.x, it.y) + (it.cloud ? 0.5 : 0) });
    }
    list.sort((a, b) => a.d - b.d);
    if (!NIGHT) {
      ctx.save();
      poly(quad(-HALF, -HALF, HALF, HALF));
      ctx.clip();
      onGround(() => {
        for (const it of list) {
          if (!it.cloud || it.thin) continue;
          const r = TS * 0.95;
          ctx.drawImage(SOFT, it.x + CAST[0] * 5 - r, it.y + CAST[1] * 5 - r, 2 * r, 2 * r);
        }
      });
      ctx.beginPath();
      for (const h of hoods) {
        for (let r = 0; r <= h.ring && h.ring > 0; r++) {
          const e = (r + 0.5) * TS;
          castInto(square(h.x - e, h.y - e, h.x + e, h.y + e), STEP, STEP * (h.ring - r));
        }
      }
      for (const it of list) {
        if (!it.o) continue;
        for (const s of it.o.foot) castInto(s.p.map((p) => [it.x + p[0] * K, it.y + p[1] * K]), s.h * K, it.z);
      }
      ctx.fillStyle = 'rgba(26,28,66,0.44)';
      ctx.fill('nonzero');
      ctx.restore();
    }
    drawRoads(false);
    drawLights(t);

    for (const it of list) {
      if (it.cloud) {
        drawCloud(it, t);
        continue;
      }
      drawThing(it.o, it.x, it.y, it.z, t);
      if (it.o.f) {
        const top = Math.min(it.o.top, heightOf(it.o.f) * 1.3) * K;
        const s = proj(it.x, it.y, it.z + top * 0.5);
        hits.push({ o: it.o, h: it.h, x: s[0], y: s[1], top, r: Math.max(9, 6.5 * cam.zoom) });
      }
    }
    drawRoads(true);
    for (const pc of pieces) if (depth(pc.x0 + TS, pc.y0) >= board0) drawPiece(pc, t);

    // The air of the room: light spreading from what is bright, the lamp's own bloom at
    // the left, dark toward the corners, and a fine grain over everything.
    bloom();
    if (!NIGHT) {
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, vw * 0.62);
      g.addColorStop(0, 'rgba(255,176,96,0.5)');
      g.addColorStop(0.45, 'rgba(255,150,80,0.13)');
      g.addColorStop(1, 'rgba(255,150,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    ctx.globalCompositeOperation = 'multiply';
    {
      const g = ctx.createRadialGradient(vw * 0.44, vh * 0.5, vh * 0.3, vw * 0.44, vh * 0.5, vw * 0.82);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.6, NIGHT ? '#b4b8cc' : '#cccddc');
      g.addColorStop(1, NIGHT ? '#454a66' : '#6a6e8c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    ctx.globalCompositeOperation = 'overlay';
    grain ??= ctx.createPattern(NOISE, 'repeat');
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Names. None at rest. A territory is named when you point at it. Inside a project, it
    // is named, and so is every project it is tied to, and its wards; a thing when you point.
    const close = cam.zoom > 4.3;
    const kin = new Set(focus ? [focus, ...ties.get(focus).map((x) => x.other)] : []);
    const taken = [];
    for (const h of hoods.slice().sort((a, b) => Number(lit(b)) - Number(lit(a)) || b.level - a.level)) {
      if (!lit(h) && !(close && kin.has(h))) continue;
      const s = proj(h.x, h.y, at(h.ci, h.cj).z + (h.seat ? h.seat.top * K : 7) + 3);
      const size = h.ring === 0 ? 12 : 12 + h.level * 0.7;
      const box = { x: s[0] - h.p.name.length * size * 0.42 - 8, y: s[1] - size - 6, w: h.p.name.length * size * 0.84 + 16, h: size + 18 };
      if (box.x + box.w < 0 || box.x > vw || box.y + box.h < 0 || box.y > vh) continue;
      if (!lit(h) && taken.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
      taken.push(box);
      nameAt(h.p.name, s[0], s[1] - 6, size);
    }
    if (focus && focus.wards.length > 1 && cam.zoom > 4.3) {
      for (const w of focus.wards) {
        const s = proj(lerp(focus.x, w.x, 1.45), lerp(focus.y, w.y, 1.45), STEP);
        const box = { x: s[0] - w.name.length * 3.4, y: s[1] - 14, w: w.name.length * 6.8, h: 20 };
        if (taken.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) continue;
        nameAt(w.name, s[0], s[1], 12.5, true);
      }
    }
    if (hover?.piece) {
      const s = proj(hover.piece.x0 + TS, hover.piece.y0 + TS / 2, 16);
      nameAt(hover.piece.rg.name, s[0], s[1], 12);
    }
    if (hover?.o) {
      const hit = hits.find((b) => b.o === hover.o);
      if (hit) nameAt(hover.o.f.n, hit.x, hit.y - hit.top * cam.zoom * 0.5 - 14, 13.5, true);
    }
  }

  // ───────────────────────── moving about ─────────────────────────

  let DPR = 1;
  let dirty = true;
  let flight = null;
  const STILL = q.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    vw = cv.clientWidth;
    vh = cv.clientHeight;
    cv.width = Math.round(vw * DPR);
    cv.height = Math.round(vh * DPR);
    grain = null;
    dirty = true;
  }
  // Home: the whole board, one corner toward you and turned a little off square, set to the
  // right of the middle so that the lamp's side of the table is in the picture.
  const HOME = () => {
    const pitch = 0.68;
    const yaw = Math.PI * 0.75 + 0.1;
    const across = 2 * HALF * Math.SQRT2;
    const zoom = Math.min((vw * 0.97) / across, (vh * 0.93) / (across * Math.sin(pitch) + TH + 26));
    const right = (-vw * 0.03) / zoom;
    const down = (vh * 0.012) / zoom / Math.sin(pitch);
    return { yaw, pitch, zoom, tx: right * Math.cos(yaw) + down * Math.sin(yaw), ty: -right * Math.sin(yaw) + down * Math.cos(yaw) };
  };
  // Close to one territory, set a little to the left so that its card does not lie over it.
  const near1 = (h) => {
    const zoom = clamp(Math.min(vw - 380, vh) / ((2 * h.ring + 1) * TS * 1.5), 4.4, 11);
    const aside = (vw > 900 ? 170 : 0) / zoom;
    return { yaw: cam.yaw, pitch: 0.56, zoom, tx: h.x + aside * Math.cos(cam.yaw), ty: h.y - aside * Math.sin(cam.yaw) };
  };
  function fly(to, ms = 1300) {
    flight = { from: { ...cam }, to, t0: performance.now(), ms };
  }
  function enter(h) {
    focus = h;
    fly(near1(h));
    document.body.classList.add('in-city');
    showHood(h);
  }
  function leave() {
    focus = null;
    document.body.classList.remove('in-city');
    fly(HOME());
    showHood(null);
  }
  let last = 0;
  let asleep = false; // set by the page that holds this one, while the other half is showing
  let blind = false; // true while the page has no size to draw into
  function frame(t) {
    // A page opened in a tab that is not showing has no size yet. Wait for one, then start
    // properly, so that it is not left blank when the tab is brought forward.
    if (!cv.clientWidth || !cv.clientHeight) {
      blind = true;
      return void requestAnimationFrame(frame);
    }
    if (asleep) return void requestAnimationFrame(frame);
    if (blind || cv.clientWidth !== vw || cv.clientHeight !== vh) {
      resize();
      if (blind) {
        // It had no size until now, so every view worked out so far was worked out for a
        // window of nothing: drop any move in progress and start from home.
        blind = false;
        flight = null;
        Object.assign(cam, HOME());
      }
    }
    if (flight) {
      const u = clamp((t - flight.t0) / flight.ms, 0, 1);
      const e = 1 - Math.pow(1 - u, 4);
      for (const key of ['yaw', 'pitch', 'tx', 'ty']) cam[key] = lerp(flight.from[key], flight.to[key], e);
      cam.zoom = Math.exp(lerp(Math.log(flight.from.zoom), Math.log(flight.to.zoom), e));
      if (u === 1) flight = null;
      dirty = true;
    }
    if (dirty || (!STILL && t - last > 66)) {
      draw(t);
      last = t;
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  // The board is a thing in your hands: dragging turns and tilts it. Shift-drag slides it.
  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, tx: cam.tx, ty: cam.ty, moved: false, slide: e.shiftKey || e.button === 2 };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      flight = null;
      if (drag.slide) {
        const rx = -dx / cam.zoom;
        const ry = -dy / cam.zoom / sp;
        cam.tx = drag.tx + rx * cs + ry * sn;
        cam.ty = drag.ty - rx * sn + ry * cs;
      } else {
        cam.yaw = drag.yaw - dx * 0.006;
        cam.pitch = clamp(drag.pitch + dy * 0.005, 0.22, 1.45);
      }
      dirty = true;
      return;
    }
    const r = cv.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if ((h?.o ?? null) !== (hover?.o ?? null) || (h?.h ?? null) !== (hover?.h ?? null) || (h?.piece ?? null) !== (hover?.piece ?? null)) {
      hover = h;
      cv.style.cursor = h && !h.piece ? 'pointer' : 'grab';
      dirty = true;
    }
  });
  cv.addEventListener('pointerup', (e) => {
    const was = drag;
    drag = null;
    if (!was || was.moved) return;
    const r = cv.getBoundingClientRect();
    const h = pick(e.clientX - r.left, e.clientY - r.top);
    if (!h || h.piece) return showBuilding(null);
    if (h.h !== focus) enter(h.h);
    if (h.o) showBuilding(h.o, h.h);
    else showBuilding(null);
  });
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const before = unproj(e.clientX - r.left, e.clientY - r.top);
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0016), 1.2, 16);
      camTrig();
      const after = unproj(e.clientX - r.left, e.clientY - r.top);
      cam.tx += before[0] - after[0];
      cam.ty += before[1] - after[1];
      flight = null;
      dirty = true;
    },
    { passive: false },
  );
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === '0') leave();
  });
  addEventListener('resize', resize);

  const inside = (pts, x, y) => {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const v = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (v !== 0) {
        if (sign !== 0 && Math.sign(v) !== sign) return false;
        sign = Math.sign(v);
      }
    }
    return true;
  };
  function pick(x, y) {
    let best = null;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && (!best || d < best.d)) best = { ...h, d };
    }
    if (best) return best;
    // Nothing standing under the pointer: whose tile is it? The nearest one that covers it,
    // since the tiles stand at different heights.
    const e = TS / 2;
    let c = null;
    for (const k of cells) {
      if (!inside(quad(k.x - e, k.y - e, k.x + e, k.y + e, k.z), x, y)) continue;
      if (!c || k.x * sn + k.y * cs > c.x * sn + c.y * cs) c = k;
    }
    if (c?.h) return c.o?.f ? { h: c.h, o: c.o } : { h: c.h };
    for (const pc of pieces) if (inside(quad(pc.x0, pc.y0, pc.x0 + 2 * TS, pc.y0 + TS), x, y)) return { piece: pc };
    return null;
  }

  // ───────────────────────── the few words ─────────────────────────

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const STAGE_WORDS = {
    concept: 'Pegged out. Nothing built yet.',
    planned: 'Planned. The slab is down.',
    designed: 'Designed. The frame is up.',
    building: 'Being built.',
    working: 'Standing and in use.',
    mature: 'Long standing, and returned to.',
  };
  const KIND_WORDS = { frontage: 'What people see and touch', works: 'Where the work is done', reservoir: 'Where data is kept', observatory: 'Where things are judged and learned', utility: 'What the rest runs on' };
  const TIE_WORDS = { road: 'a broad road to', track: 'a fine line to', surveyed: 'a line of studs toward' };
  const TIE_MARK = {
    road: 'width:20px;height:4px;border-radius:2px;background:#d9a640',
    track: 'width:20px;height:1.5px;border-radius:0;background:#d9a640',
    surveyed: 'width:20px;height:3px;border-radius:0;background:radial-gradient(circle,#d9a640 1.4px,transparent 1.6px) 0 0/6.6px 3px',
  };
  const LIVE_WORDS = { building: 'being worked on now', settled: 'settled', quiet: 'quiet', dormant: 'dormant', ruins: 'in ruins' };

  function showHood(h) {
    const el = $('city');
    showBuilding(null);
    if (!h) {
      el.hidden = true;
      $('back').hidden = true;
      return;
    }
    const p = h.p;
    const going = p.f.filter((f) => f.s === 'building').length;
    const meant = p.f.filter((f) => STAGES.indexOf(f.s) < 3).length;
    const standing = p.f.filter((f) => STAGES.indexOf(f.s) >= 4).length;
    const parts = [];
    if (standing) parts.push(`${standing} standing`);
    if (going) parts.push(`${going} going up`);
    if (meant) parts.push(`${meant} planned`);
    const linked = ties
      .get(h)
      .slice()
      .sort((a, b) => GRADE[a.l.g] - GRADE[b.l.g])
      .map((t) => `<li><i style="${TIE_MARK[t.l.g]}"></i>${TIE_WORDS[t.l.g]} ${esc(t.other.p.name)}</li>`)
      .join('');
    el.innerHTML =
      `<h2>${esc(p.name)}</h2><p class="what">${esc(p.note)}</p>` +
      `<p class="tally">${esc(W.regions[h.dom].name)} · ` +
      (h.ring === 0 ? 'an idea: one tile under the cloud, nothing built' : `${plural(h.level, 'ring', 'rings')} on its tower · ${plural(h.ring, 'terrace', 'terraces')} of ground · ${LIVE_WORDS[p.live] ?? p.live}`) +
      `</p>` +
      (parts.length ? `<p class="tally">${parts.join(' · ')}</p>` : '') +
      (h.wards.length > 1 ? `<ul>${h.wards.map((d) => `<li>${esc(d.name)}<b>${d.n}</b></li>`).join('')}</ul>` : '') +
      (linked ? `<ul>${linked}</ul>` : '');
    el.hidden = false;
    $('back').hidden = false;
  }
  function showBuilding(o, h) {
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
      `<h3>${esc(f.n)}</h3><p class="kind">${f.lm ? 'A monument: a release was named for it' : KIND_WORDS[f.k]} · ${esc(f.w ?? h.p.name)}</p>` +
      `<p>${STAGE_WORDS[f.s]}${pct}${again}</p>` +
      `<p class="facts">${plural(f.c, 'commit', 'commits')}${f.last ? ` · last worked on ${esc(f.last)}` : ''}</p>` +
      (f.note ? `<p class="note">${esc(f.note)}</p>` : '');
    el.hidden = false;
  }
  $('back').addEventListener('click', leave);
  $('tally').textContent = '';

  // ───────────────────────── begin ─────────────────────────

  if (STILL) document.body.classList.add('still');
  resize();
  camTrig();
  Object.assign(cam, HOME());
  if (q.has('city')) {
    const h = hoods.find((x) => x.p.name.toLowerCase().startsWith(q.get('city').toLowerCase()));
    if (h) {
      focus = h;
      Object.assign(cam, near1(h));
      document.body.classList.add('in-city');
      showHood(h);
    }
  } else if (!STILL) {
    // One authored moment: the board is set down in front of you, turning as it comes.
    const home = HOME();
    Object.assign(cam, { ...home, yaw: home.yaw - 0.7, pitch: 0.95, zoom: home.zoom * 0.7 });
    fly(home, 2600);
  }

  // ───────────────────────── as half of the joined world ─────────────────────────
  // Opened with ?embed, this board is the overview of a larger whole: from a project's card
  // you can go down to it, and the page holding both asks this one to sleep while the other
  // is showing. Nothing here runs when the board is opened on its own.
  if (q.has('embed')) {
    const say = (m) => parent.postMessage(m, '*');
    const plain = showHood;
    showHood = (h) => {
      plain(h);
      if (!h || h.p.f.length === 0) return; // an idea has nowhere to go down to yet
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'down';
      go.textContent = 'Go down to it';
      go.addEventListener('click', () => say({ pw: 'arrive', name: h.p.name }));
      $('city').appendChild(go);
    };
    addEventListener('message', (e) => {
      const m = e.data;
      if (!m || !m.pw) return;
      if (m.pw === 'sleep') asleep = true;
      if (m.pw === 'wake') {
        asleep = false;
        dirty = true;
      }
      if (m.pw === 'focus') {
        const h = hoods.find((x) => x.p.name === m.name);
        if (h && h !== focus) enter(h);
      }
    });
  }
  requestAnimationFrame(frame);
})();
