
  // ───────────────────────── the bay at the end of the day ─────────────────────────
  // A city built round a bay, seen from a boat low on the water inside it, with the sun
  // going down behind the tallest district. Each project stands on its own quay or islet.
  // The work in a building is its height; a window is lit where there has been work lately.
  // Projects that lean on each other are joined by a bridge strung with lamps, a lighter
  // tie is a low causeway, the loosest is a ferry line. An idea is a pontoon with one lantern.
  //
  // This sketch brings its own eye: the kit's flat projection is not used. Everything here
  // is drawn in perspective from a point just above the water.

  const LOT = 12; // one lot and its share of the lane
  const LANE = 3; // between two wards of one project
  const FL = 3.1; // one floor
  const QZ = 1.6; // a quay stands this far out of the water
  const TALL = 1.2; // everything stands a little taller than it measures
  const NEAR = 6; // nothing nearer the eye than this is drawn
  const BAY = [0, 250]; // every district turns its front to this point
  const MOORING = [0, 353]; // where the viewer's boat lies; the bay is laid out round it
  const RANKS = ['spark', 'site', 'outpost', 'settlement', 'town', 'city', 'major'];
  const STRENGTH = { road: 3, track: 2, surveyed: 1 };
  const WHITE = [255, 255, 255];

  // ───────────────────────── the light ─────────────────────────
  // Three moods, blended by the hour. The sun is always low: by day it is a warm low sun,
  // at dusk it sits on the horizon, at night what is left of it is a stain on the sky.

  const MOODS = {
    day: {
      skyTop: hex('#6a8db3'), skyMid: hex('#b3c5d0'), skyLow: hex('#f0dcc0'), sunGlow: hex('#fff1d6'), sunA: 0.75, sunElev: 0.2,
      amb: [0.6, 0.64, 0.78], sun: [1.02, 0.88, 0.68], haze: hex('#dcd5c8'), fogD: 2100,
      waterNear: hex('#2f4a66'), waterFar: hex('#e3d6c2'), cloud: hex('#f4ece0'),
      lampOn: 0.45, lamps: 0, glow: 0.08, stars: 0, reflA: 0.6, line: hex('#3a3d48'),
    },
    gold: {
      skyTop: hex('#2f4f8c'), skyMid: hex('#c0999f'), skyLow: hex('#ffc07c'), sunGlow: hex('#ffdc9e'), sunA: 1, sunElev: 0.078,
      amb: [0.38, 0.4, 0.6], sun: [1.55, 0.96, 0.5], haze: hex('#f0b384'), fogD: 2300,
      waterNear: hex('#18233c'), waterFar: hex('#f6c493'), cloud: hex('#6f6c8a'),
      lampOn: 0.96, lamps: 0.9, glow: 0.62, stars: 0, reflA: 0.72, line: hex('#2b2b38'),
    },
    night: {
      skyTop: hex('#070d20'), skyMid: hex('#152040'), skyLow: hex('#43405f'), sunGlow: hex('#b06a66'), sunA: 0.55, sunElev: -0.03,
      amb: [0.17, 0.21, 0.36], sun: [0.16, 0.14, 0.2], haze: hex('#2a2f4d'), fogD: 1700,
      waterNear: hex('#04070f'), waterFar: hex('#35354f'), cloud: hex('#1c2340'),
      lampOn: 1, lamps: 1, glow: 1, stars: 1, reflA: 0.8, line: hex('#0d0f1c'),
    },
  };
  const M = (() => {
    const blend = (A, B, u) => Object.fromEntries(Object.keys(A).map((k) => [k, Array.isArray(A[k]) ? mix(A[k], B[k], u) : lerp(A[k], B[k], u)]));
    const h = ((HOUR % 24) + 24) % 24;
    const { day, gold, night } = MOODS;
    if (h < 5.5 || h >= 20.5) return night;
    if (h < 7) return blend(night, gold, (h - 5.5) / 1.5);
    if (h < 9) return blend(gold, day, (h - 7) / 2);
    if (h < 15) return day;
    if (h < 17.5) return blend(day, gold, (h - 15) / 2.5);
    if (h < 18.5) return gold;
    return blend(gold, night, (h - 18.5) / 2);
  })();
  // The sun stands behind the city and a little to the left, low.
  let SUN = (() => {
    const v = [-0.56, -0.8, 0.2];
    const k = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / k);
  })();
  const LAMP = hex('#ffd58c');
  const LAMP2 = hex('#ffb768');

  // Materials: a narrow range of stone, clay and slate. A project takes one of them.
  const MAT = { stone: hex('#d6c9b6'), clay: hex('#b97c63'), slate: hex('#8792a2'), sand: hex('#c8b08e'), umber: hex('#94705f') };
  const MATS = ['stone', 'clay', 'slate', 'sand', 'umber'];
  const ALB = Object.fromEntries(
    Object.entries({
      roof: '#4a5364', trim: '#e7dccb', quay: '#8f867b', quayTop: '#c0b4a2', ward: '#cdc1ae', metal: '#565d68', tank: '#b4b7bb',
      brick: '#a5634e', soot: '#45423f', dome: '#6c9088', gold: '#e6b54c', timber: '#352e2c', slab: '#a39a8d',
      deck: '#6f6a69', pylon: '#84807f', hull: '#3a3e4b', glass: '#5d6c7d',
    }).map(([k, v]) => [k, hex(v)]),
  );
  // One accent to a project, used sparingly: a banner, an awning, a crown.
  const ACCENTS = ['#c8694a', '#3f8f88', '#d2a03a', '#7867ae', '#7c9850', '#be5c7c', '#4a7cae', '#a8744a', '#3f9ab4', '#8f9a3c', '#b0563c', '#5f7a8c', '#9a62b8', '#4f8f6a'].map(hex);
  const ACCENT = new Set(['awning', 'flag', 'accent']);
  const GLASSY = new Set(['window', 'door', 'glass', 'clock', 'slit']);

  // ───────────────────────── the plan of the bay ─────────────────────────

  const hoods = W.places.map((p, n) => ({ p, n, built: p.f.length > 0, work: p.f.reduce((s, f) => s + f.st, 0), wards: [], dim: p.live === 'dormant' || p.live === 'ruins' }));
  const hoodOf = new Map(hoods.map((h) => [h.p.id, h]));
  const ties = new Map(hoods.map((h) => [h, []]));
  for (const l of W.links) {
    const a = hoodOf.get(l.a);
    const b = hoodOf.get(l.b);
    if (!a || !b) continue;
    ties.get(a).push({ other: b, s: STRENGTH[l.g], l });
    ties.get(b).push({ other: a, s: STRENGTH[l.g], l });
  }
  const maxWork = Math.max(1, ...hoods.map((h) => h.work));
  hoods
    .slice()
    .sort((a, b) => b.work - a.work || a.n - b.n)
    .forEach((h, i) => {
      h.col = i % ACCENTS.length;
      h.mat = MATS[i % MATS.length];
      h.crown = ['spire', 'lantern', 'step'][i % 3];
    });
  for (const h of hoods) {
    // Density: the more work in the whole project, the taller everything in it stands.
    h.dens = 0.74 + 0.5 * Math.sqrt(h.work / maxWork);
    h.tied = ties.get(h).length > 0;
  }
  /** How tall a feature stands: the work in it, raised by the density of its project. */
  const rise = (f, h) => (f.st <= 2 ? heightOf(f) : (7 + 2.7 * Math.sqrt(Math.max(f.c, 16))) * h.dens * (f.lm ? 1.08 : 1) * TALL);

  /** Lay out one project's wards side by side, each a block of lots, tallest at the back. */
  function plan(h) {
    const groups = new Map();
    for (const f of h.p.f) {
      const k = f.w ?? 'The quarter';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    const R = clamp(Math.round(Math.sqrt(h.p.f.length)), 1, 5);
    let x = 0;
    for (const [name, fs] of groups) {
      const cols = Math.ceil(fs.length / R);
      const rows = Math.ceil(fs.length / cols);
      fs.sort((a, b) => rise(b, h) - rise(a, h));
      h.wards.push({ name, fs, cols, rows, x0: x, w: cols * LOT });
      x += cols * LOT + LANE;
    }
    h.w = x - LANE;
    h.rows = Math.max(...h.wards.map((w) => w.rows));
    h.d = h.rows * LOT;
  }
  for (const h of hoods) {
    if (h.built) plan(h);
    else {
      h.w = 9;
      h.d = 6;
    }
    // The quay: a little wider than the district, with an apron in front.
    h.qx = h.w / 2 + (h.built ? 4 : 0.5);
    h.qy0 = -h.d / 2 - (h.built ? 4 : 0.5);
    h.qy1 = h.d / 2 + (h.built ? 7 : 0.5);
    h.radius = Math.hypot(h.qx, Math.max(-h.qy0, h.qy1));
  }

  // ───────────────────────── where each project stands ─────────────────────────
  // A rule, not a table. Projects take their places in the order they were founded, and each
  // chooses from the water left free by those before it, so a project added later never
  // moves one that is already there. The bay is measured from the mooring, where the
  // viewer's boat lies: bearing to left and right of straight up the bay, and distance.
  //
  // A project stands beside what it is tied to, the strongest tie pulling hardest, where a
  // bridge to it would neither run through another quay nor cross a bridge already built.
  // With no tie it stands among others of its region, at a distance that suits its size,
  // keeping clear of its neighbours. An idea is pilings: off the quay of what it is tied
  // to, or else out at the mouth of the bay near the mooring. When the near water is taken
  // the bay grows deeper and wider; it does not grow more crowded.

  const TIE_PULL = { road: 1, track: 0.55, surveyed: 0.2 };
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const u = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - ax - dx * u, py - ay - dy * u);
  };
  const crosses = (a, b, c, d) => {
    const side = (p, k, r) => Math.sign((k[0] - p[0]) * (r[1] - p[1]) - (k[1] - p[1]) * (r[0] - p[0]));
    return side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b);
  };
  const bearingOf = (x, y) => Math.atan2(x - MOORING[0], MOORING[1] - y);
  const rangeOf = (x, y) => Math.hypot(x - MOORING[0], y - MOORING[1]);
  const placingBegan = Date.now();
  {
    const stamp = (h) => String(h.p.founded ?? '') + ' ' + h.p.id;
    const order = hoods.slice().sort((a, b) => (stamp(a) < stamp(b) ? -1 : stamp(a) > stamp(b) ? 1 : 0));
    const placed = [];
    const CELL = 150;
    const berths = new Map(); // who stands in each square of water, for looking only nearby
    const roads = []; // bridges and causeways there will be between those already placed
    for (const h of order) {
      const r = rng('berth ' + h.p.id);
      const idea = !h.built;
      const R = h.radius;
      const mine = ties.get(h).filter((t) => t.other.placed);
      const kin = placed.filter((o) => o.built && o.p.region === h.p.region);
      // How far up the bay it would like to stand: the largest in the middle distance, the
      // rest near or far by the luck of their names, so that there is a near shore and a far one.
      const luck = (hash('depth ' + h.p.id) % 1000) / 1000;
      const wish = R >= 60 ? 430 : R >= 34 ? [330, 450, 600][Math.floor(luck * 3)] : [205, 235, 340, 540, 660][Math.floor(luck * 5)];
      let best = null;
      let bestCost = Infinity;
      const first = placed.length === 0;
      // The cheap parts of the price are reckoned first, so that most places are passed over
      // without looking at what stands round them.
      const tryAt = (x, y) => {
        const rho = rangeOf(x, y);
        const beta = bearingOf(x, y);
        if (Math.abs(beta) > 1.9) return;
        // Only small quays come near, a few of them and well apart: the near shore is thin.
        if (rho - R < (idea ? 46 : R < 34 ? 125 : 270)) return;
        if (!idea && rho < 330 && Math.abs(beta) < 0.3) return;
        const near = !idea && rho < 330;
        const wide = Math.max(0, Math.abs(beta) - 0.42);
        let c = 0;
        for (const t of mine) {
          const o = t.other;
          const gap = Math.hypot(x - o.cx, y - o.cy) - R - o.radius;
          c += TIE_PULL[t.l.g] * Math.abs(gap - (idea || !o.built ? 20 : 52));
          if (idea) c += 0.25 * Math.max(0, rho - rangeOf(o.cx, o.cy) + 8);
        }
        if (idea && mine.length === 0) c += Math.abs(rho - 88) * 0.6 + 60 * wide * wide + (Math.abs(beta) < 0.1 ? 40 : 0);
        else if (idea) c += 30 * wide * wide;
        else c += 240 * wide * wide + (mine.length ? 0.06 : 0.24) * Math.abs(rho - wish) + (first ? 12 * Math.abs(beta + 0.24) : 0);
        if (c >= bestCost) return;
        // Is the water free, and how much room is there?
        let room = Infinity;
        const gx = Math.floor(x / CELL);
        const gy = Math.floor(y / CELL);
        for (let i = gx - 2; i <= gx + 2; i++) {
          for (let j = gy - 2; j <= gy + 2; j++) {
            const here = berths.get(i * 65536 + j);
            if (!here) continue;
            for (const o of here) {
              const gap = Math.hypot(x - o.cx, y - o.cy) - R - o.radius;
              if (gap < (idea && !o.built ? 34 : idea || !o.built ? 15 : near && rangeOf(o.cx, o.cy) < 330 ? 120 : 32)) return;
              if (gap < room && o.built !== idea) room = gap;
            }
          }
        }
        if (mine.length === 0) c += (idea ? 1800 : 1400) / (room + (idea ? 12 : 24));
        if (c >= bestCost) return;
        if (!idea && mine.length === 0 && kin.length) {
          let nearest = Infinity;
          for (const o of kin) nearest = Math.min(nearest, Math.hypot(x - o.cx, y - o.cy) - R - o.radius);
          c += 0.12 * nearest;
          if (c >= bestCost) return;
        }
        // A bridge from here must not run through another quay, nor across one already built.
        if (!idea) {
          for (const t of mine) {
            const o = t.other;
            if (!o.built || t.l.g === 'surveyed') continue;
            for (const k of placed) if (k !== o && k.built && segDist(k.cx, k.cy, x, y, o.cx, o.cy) < k.radius + 6) c += 700;
            if (c >= bestCost) return;
            for (const w of roads) if (w.a !== o && w.b !== o && crosses([x, y], [o.cx, o.cy], [w.a.cx, w.a.cy], [w.b.cx, w.b.cy])) c += 260 * TIE_PULL[t.l.g];
          }
        }
        if (c < bestCost) {
          bestCost = c;
          best = [x, y];
        }
      };
      // First, round what it is tied to.
      for (const t of mine) {
        for (const d of idea || !t.other.built ? [16, 24, 36, 56] : [34, 52, 70, 96, 130, 180, 250]) {
          for (let k = 0; k < 28; k++) {
            const a = (k / 28) * TAU + r() * 0.2;
            const dd = R + t.other.radius + d;
            tryAt(t.other.cx + Math.cos(a) * dd, t.other.cy + Math.sin(a) * dd);
          }
        }
      }
      // Failing that, or with no tie, anywhere round the bay; and if the bay is full, beyond it.
      if (!best || mine.length === 0) {
        let from = idea ? 54 : 130;
        let reach = 460 + 70 * Math.sqrt(placed.length);
        for (;;) {
          for (let rho = from; rho < reach; rho += 26) {
            const n = Math.max(8, Math.round((3.8 * rho) / 32));
            for (let k = 0; k <= n; k++) {
              const beta = -1.9 + (3.8 * k) / n + (r() - 0.5) * 0.04;
              const rr = rho + (r() - 0.5) * 16;
              tryAt(MOORING[0] + Math.sin(beta) * rr, MOORING[1] - Math.cos(beta) * rr);
            }
          }
          if (best) break;
          from = reach;
          reach += 400;
          if (reach > 30000) {
            best = [MOORING[0], MOORING[1] - reach];
            break;
          }
        }
      }
      h.cx = best[0];
      h.cy = best[1];
      h.placed = true;
      placed.push(h);
      const sq = Math.floor(h.cx / CELL) * 65536 + Math.floor(h.cy / CELL);
      if (!berths.has(sq)) berths.set(sq, []);
      berths.get(sq).push(h);
      for (const t of mine) if (h.built && t.other.built && t.l.g !== 'surveyed') roads.push({ a: h, b: t.other });
    }
  }
  for (const h of hoods) {
    // Its front looks down the bay to the mooring.
    h.rot = Math.atan2(-(BAY[0] - h.cx), BAY[1] - h.cy);
    h.rc = Math.cos(h.rot);
    h.rs = Math.sin(h.rot);
    h.at = (lx, ly) => [h.cx + lx * h.rc - ly * h.rs, h.cy + lx * h.rs + ly * h.rc];
    h.local = (x, y) => [(x - h.cx) * h.rc + (y - h.cy) * h.rs, -(x - h.cx) * h.rs + (y - h.cy) * h.rc];
  }
  // `?where` prints where everything stands, for checking that nothing has moved.
  if (q.has('where')) console.log('PLACED in ' + (Date.now() - placingBegan) + ' ms');
  if (q.has('where')) console.log('WHERE ' + JSON.stringify(hoods.map((h) => [h.p.id, Math.round(h.cx * 1000) / 1000, Math.round(h.cy * 1000) / 1000])));
  /** How far the bay reaches from the mooring. */
  const EXTENT = Math.max(420, ...hoods.map((h) => rangeOf(h.cx, h.cy) + h.radius));

  // The view from home is chosen after the bay is laid out, and moves nothing. The largest
  // project is the hero: the boat is turned so that it stands a third of the way across the
  // picture, and the sun is set down beside it.
  const HERO = hoods.filter((h) => h.built).sort((a, b) => b.work - a.work || (String(a.p.founded) < String(b.p.founded) ? -1 : 1))[0] ?? hoods[0] ?? null;
  const VIEW = (() => {
    if (!HERO) return { yaw: 0, x: MOORING[0], y: MOORING[1], side: 1 };
    const beta = bearingOf(HERO.cx, HERO.cy);
    // Hero to the left or to the right: whichever shows more of the bay beside it.
    const shows = (yaw) => hoods.reduce((n, h) => n + (Math.abs(bearingOf(h.cx, h.cy) - yaw) < 0.5 ? (h.built ? h.radius : 3) / (1 + rangeOf(h.cx, h.cy) / 700) : 0), 0);
    let yaw = beta + 0.25;
    let most = -1;
    for (const sd of [1, -1]) {
      for (let off = 0.16; off <= 0.3; off += 0.02) {
        const n = shows(beta + off * sd) * (sd === 1 ? 1 : 0.92);
        if (n > most) {
          most = n;
          yaw = beta + off * sd;
        }
      }
    }
    const side = yaw > beta ? 1 : -1;
    // If the hero stands far up the bay, the boat comes up toward it as far as the water is clear.
    let go = clamp(rangeOf(HERO.cx, HERO.cy) - 440, 0, 320);
    const clear = (x, y) => hoods.every((h) => Math.hypot(x - h.cx, y - h.cy) > h.radius + (h.built ? 105 : 24));
    while (go > 0 && !clear(MOORING[0] + Math.sin(yaw) * go, MOORING[1] - Math.cos(yaw) * go)) go -= 20;
    go = Math.max(0, go);
    return { yaw, x: MOORING[0] + Math.sin(yaw) * go, y: MOORING[1] - Math.cos(yaw) * go, side };
  })();
  // The light that models the walls comes from behind the city, on the hero's side.
  {
    const c = Math.cos(VIEW.yaw);
    const k = Math.sin(VIEW.yaw);
    const lx = -0.56 * VIEW.side;
    const v = [lx * c + 0.8 * k, lx * k - 0.8 * c, 0.2];
    const n = Math.hypot(v[0], v[1], v[2]);
    SUN = v.map((q2) => q2 / n);
  }

  // ───────────────────────── what stands on a lot ─────────────────────────

  /** A box whose four walls remember how they are glazed; the windows are drawn on the wall. */
  function tbox(o, x, y, w, d, z0, h, tone, style) {
    const n0 = o.faces.length;
    const z1 = o.box(x, y, w, d, z0, h, tone);
    if (o.faces.length === n0 || !style) return;
    const rows = Math.max(1, Math.round((z1 - z0) / FL));
    const per = style === 'band' ? 3.3 : style === 'loft' ? 2.9 : style === 'tall' ? 2.6 : 2.3;
    for (let i = 0; i < 4; i++) o.faces[n0 + i].win = { style, rows, cols: Math.max(1, Math.round((i < 2 ? w : d) / per)), seed: (o.seed + (n0 + i) * 7919) | 0, tall: z1 - z0 };
  }
  /** A tall wall, broken every few floors by a belt course so that it reads as storeys. */
  function shaft(o, x, y, w, d, z0, h, tone, style) {
    const n = Math.max(1, Math.round(h / (FL * 8)));
    for (let i = 0; i < n; i++) {
      const a = z0 + (h * i) / n;
      tbox(o, x, y, w, d, a + (i ? 0.4 : 0), h / n - (i ? 0.4 : 0), tone, style);
      if (i) o.box(x - 0.18, y - 0.18, w + 0.36, d + 0.36, a, 0.4, 'trim');
    }
  }
  /** A thin course standing a little proud of the wall below it. */
  function cornice(o, w, d, z) {
    o.box(-w / 2 - 0.3, -d / 2 - 0.3, w + 0.6, d + 0.6, z, 0.45, 'trim');
  }
  function mast(o, x, y, z0, z1) {
    if (z0 >= o.maxZ) return;
    const top = Math.min(z1, o.maxZ);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([x + a * 0.8, y + b * 0.8, z0], [x, y, top], 'metal', 1.1);
    for (let k = 1; k <= 3; k++) {
      const z = lerp(z0, top, k / 4);
      const w = 0.8 * (1 - k / 4);
      o.line([x - w, y - w, z], [x + w, y - w, z], 'metal', 0.9);
      o.line([x + w, y - w, z], [x + w, y + w, z], 'metal', 0.9);
      o.line([x + w, y + w, z], [x - w, y + w, z], 'metal', 0.9);
    }
  }
  // The five kinds, grown tall. t is 2 for a mid-rise, 3 for a tower. Each has a base, a
  // shaft with its own rhythm of windows, and at the top the mark of its kind.
  const RISE = {
    // What people see and touch: an arcade, a shaft that steps back, a crown.
    frontage(o, s, H, t, crown) {
      const a = s / 2;
      const p = Math.min(FL * 2.2, H * 0.18);
      tbox(o, -a, -a, s, s, 0, p, 'base', 'arc');
      cornice(o, s, s, p);
      o.box(-a * 0.6, a, s * 0.6, 1.3, p * 0.6, 0.3, 'awning');
      if (t === 2) {
        const b = s * 0.9;
        const top = H * 0.82;
        tbox(o, -b / 2, -b / 2, b, b, p + 0.45, top - p - 0.45, 'wall', 'punch');
        cornice(o, b, b, top);
        o.pyramid(-b / 2, -b / 2, b, b, top + 0.45, H - top - 0.45, 'roof');
        return;
      }
      const b = s * 0.88;
      const c = s * 0.64;
      const e = s * 0.4;
      const z1 = H * 0.58;
      const z2 = H * 0.8;
      const z3 = H * 0.9;
      shaft(o, -b / 2, -b / 2, b, b, p + 0.45, z1 - p - 0.45, 'wall', 'punch');
      cornice(o, b, b, z1);
      shaft(o, -c / 2, -c / 2, c, c, z1 + 0.45, z2 - z1 - 0.45, 'wall', 'punch');
      cornice(o, c, c, z2);
      tbox(o, -e / 2, -e / 2, e, e, z2 + 0.45, z3 - z2 - 0.45, 'wall', 'tall');
      if (crown === 'lantern') o.cyl(0, 0, e * 0.44, z3, (H - z3) * 0.45, 'trim', 'cone', e * 0.44, 8, 'accent');
      else if (crown === 'step') {
        o.box(-e * 0.32, -e * 0.32, e * 0.64, e * 0.64, z3, (H - z3) * 0.6, 'trim');
        if (H < o.maxZ) o.line([0, 0, z3 + (H - z3) * 0.6], [0, 0, H * 1.05], 'metal', 1.1);
      } else {
        o.pyramid(-e / 2 - 0.2, -e / 2 - 0.2, e + 0.4, e + 0.4, z3, H - z3, 'roof');
        if (H < o.maxZ) o.line([0, 0, H], [0, 0, H * 1.05], 'metal', 1.1);
      }
    },
    // Where the work is done: a loft with big windows, a sawtooth roof, a shoulder and a chimney.
    works(o, s, H, t) {
      const a = s / 2;
      const d = s * 0.78;
      const w = s * 0.84;
      if (t === 2) {
        tbox(o, -a, -d / 2, w, d, 0, H * 0.8, 'wall', 'band');
        o.sawtooth(-a, -d / 2, w, d, H * 0.8, H * 0.12, 3, 'roof');
        o.cyl(a - 0.95, 0, 0.8, 0, H * 1.05, 'brick', 'flat', 0.55, 8, 'soot');
        return;
      }
      const m = w * 0.62;
      shaft(o, -a, -d / 2, m, d, 0, H * 0.88, 'wall', 'loft');
      o.box(-a - 0.25, -d / 2 - 0.25, m + 0.5, d + 0.5, H * 0.88, 0.45, 'trim');
      o.sawtooth(-a, -d / 2, m, d, H * 0.88 + 0.45, H * 0.05, 2, 'roof');
      shaft(o, -a + m, -d / 2, w - m, d, 0, H * 0.52, 'wall', 'loft');
      o.sawtooth(-a + m, -d / 2, w - m, d, H * 0.52, H * 0.06, 2, 'roof');
      o.cyl(a - s * 0.1, 0, s * 0.1, 0, H * 0.74, 'brick', 'flat', s * 0.075, 8, 'soot');
    },
    // Where data is kept: silos, and with growth a cluster of them.
    reservoir(o, s, H, t) {
      const r = s * 0.25;
      if (t === 2) {
        o.cyl(-r * 1.05, 0, r, 0, H * 0.94 - r, 'tank', 'cone', r, 10, 'roof');
        o.cyl(r * 1.05, 0, r, 0, H * 0.72 - r, 'tank', 'cone', r, 10, 'roof');
        tbox(o, -s * 0.3, r * 0.9, s * 0.6, s * 0.2, 0, FL, 'base', 'arc');
        return;
      }
      for (const [i, j, k] of [[-1, -1, 1], [1, -1, 0.88], [-1, 1, 0.74], [1, 1, 0.6]]) o.cyl(i * r * 1.02, j * r * 1.02, r, 0, H * k - r, 'tank', 'dome', r, 10, 'roof');
    },
    // Where things are judged and learned: a slender shaft carrying a dome.
    observatory(o, s, H, t) {
      const a = s / 2;
      const slit = (r, z) => {
        if (z < o.maxZ) o.face([[-r * 0.16, r * 0.98, z], [r * 0.16, r * 0.98, z], [r * 0.14, r * 0.42, z + r * 0.9], [-r * 0.14, r * 0.42, z + r * 0.9]], [0, 0.7, 0.7], 'slit', 0, 8);
      };
      if (t === 2) {
        const b = s * 0.8;
        const r = b * 0.42;
        const zs = H - r - 1.2;
        tbox(o, -b / 2, -b / 2, b, b, 0, zs, 'wall', 'tall');
        cornice(o, b, b, zs - 0.45);
        o.cyl(0, 0, r, zs, 1.2, 'trim', 'dome', r, 12, 'dome');
        slit(r, zs + 1.2);
        return;
      }
      const b = s * 0.6;
      const r = b * 0.62;
      const zs = H - r - H * 0.05;
      tbox(o, -a, -a, s, s, 0, H * 0.14, 'base', 'arc');
      cornice(o, s, s, H * 0.14);
      shaft(o, -b / 2, -b / 2, b, b, H * 0.14 + 0.45, zs - H * 0.14 - 0.45, 'wall', 'tall');
      o.cyl(0, 0, r, zs, H * 0.05, 'trim', 'dome', r, 12, 'dome');
      slit(r, zs + H * 0.05);
    },
    // What the rest runs on: a powerhouse with stacks, a mast, and at scale a cooling tower.
    utility(o, s, H, t) {
      const a = s / 2;
      const d = s * 0.62;
      const w = s * 0.68;
      const hb = H * (t === 2 ? 0.44 : 0.5);
      tbox(o, -a, -d / 2, w, d, 0, hb, 'wall', 'band');
      o.box(-a - 0.2, -d / 2 - 0.2, w + 0.4, d + 0.4, hb, 0.5, 'roof');
      const sr = Math.max(0.85, s * 0.09);
      o.cyl(-a + w * 0.28, 0, sr, hb + 0.5, H * 0.96 - hb, 'brick', 'flat', sr * 0.7, 8, 'soot');
      o.cyl(-a + w * 0.72, 0, sr, hb + 0.5, H * 0.8 - hb, 'brick', 'flat', sr * 0.7, 8, 'soot');
      const mx = a - s * 0.15;
      if (t === 2) mast(o, mx, 0, 0, H * 1.02);
      else {
        o.cyl(mx, 0, s * 0.17, 0, H * 0.62, 'tank', 'flat', s * 0.11, 12, 'soot');
        mast(o, -a + w * 0.5, -d / 2 + 0.9, hb + 0.5, H * 1.12);
      }
    },
  };

  /** One feature on its lot, as far along as its stage says. */
  function raise(x, y, f, h) {
    const o = Obj(x, y, h.rot);
    o.kind = 'building';
    o.f = f;
    o.hood = h;
    o.oz = QZ;
    o.seed = hash(f.id);
    o.lamps = [];
    const u = (o.seed % 1000) / 1000;
    o.mat = MAT[h.mat].map((c) => c * (0.9 + 0.17 * u));
    if (h.dim) o.mat = mix(o.mat, [118, 120, 128], 0.45);
    // Light is work: the more lately it has been worked on, the more of its windows are lit.
    o.lit = !h.dim && f.h > 0.02 ? 0.1 + 0.72 * f.h : 0;
    const lamp = (lx, ly, lz, r) => o.lamps.push({ x: x + lx * h.rc - ly * h.rs, y: y + lx * h.rs + ly * h.rc, z: lz + QZ, r });
    const low = f.st <= 2;
    const H = rise(f, h);
    const tier = low ? 1 : H < 34 ? 2 : 3;
    // A tall thing is broad as well: nothing stands as a pole.
    const s = low ? sizeOf(f) : tier === 2 ? 8.6 : clamp(8.8 + H * 0.032, 9.4, 13.2);
    o.s = s;
    o.H = H;
    const stage = STAGES.indexOf(f.s);
    const a = s / 2;
    const cage = (top, tone, step) => {
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([i * a, j * a, 0], [i * a, j * a, top], tone, 0.9);
      const n = clamp(Math.round(top / step), 1, 10);
      for (let k = 1; k <= n; k++) {
        const z = (top * k) / n;
        o.line([-a, -a, z], [a, -a, z], tone, 0.7);
        o.line([a, -a, z], [a, a, z], tone, 0.7);
        o.line([a, a, z], [-a, a, z], tone, 0.7);
        o.line([-a, a, z], [-a, -a, z], tone, 0.7);
      }
    };
    if (stage === 0) {
      // Staked out: four pegs and a string.
      for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) o.line([i * a, j * a, 0], [i * a, j * a, 1.4], 'stake', 1.6);
      o.line([-a, -a, 1.1], [a, -a, 1.1], 'string', 0.7);
      o.line([a, -a, 1.1], [a, a, 1.1], 'string', 0.7);
      o.line([a, a, 1.1], [-a, a, 1.1], 'string', 0.7);
      o.line([-a, a, 1.1], [-a, -a, 1.1], 'string', 0.7);
      o.top = 1.4;
      o.reach = 1.4;
      return o;
    }
    if (stage <= 2) {
      // Planned: a slab with the plan on it. Designed: the frame stands to its full height.
      o.box(-a, -a, s, s, 0, 0.45, 'slab');
      o.line([-a * 0.5, -a, 0.5], [-a * 0.5, a, 0.5], 'string', 0.7);
      o.line([-a, a * 0.2, 0.5], [a, a * 0.2, 0.5], 'string', 0.7);
      o.reach = 0.6;
      if (stage === 2) {
        cage(H * 0.9, 'frame', FL * 2);
        o.reach = H * 0.9;
      }
      return o;
    }
    const make = low ? KIND[f.k] ?? KIND.works : RISE[f.k] ?? RISE.works;
    if (stage === 3) {
      // Being built: it stands as far as the work has got, in a fine scaffold, under a crane
      // with a lamp at the tip of its arm.
      o.maxZ = Math.max(2.2, H * clamp(f.pr, 0.15, 0.92));
      make(o, s, H, tier, h.crown);
      cage(o.maxZ + FL * 0.8, 'scaffold', FL * 2);
      const cxm = a + 1.1;
      const cym = -a - 1.1;
      const ch = o.maxZ + 10;
      const ang = (o.seed % 628) / 100;
      const arm = 8 + s * 0.4;
      o.line([cxm, cym, 0], [cxm, cym, ch + 1.6], 'crane', 1.3);
      o.line([cxm - Math.cos(ang) * arm * 0.35, cym - Math.sin(ang) * arm * 0.35, ch], [cxm + Math.cos(ang) * arm, cym + Math.sin(ang) * arm, ch], 'crane', 1.2);
      o.line([cxm, cym, ch + 1.6], [cxm + Math.cos(ang) * arm * 0.7, cym + Math.sin(ang) * arm * 0.7, ch], 'crane', 0.6);
      o.line([cxm + Math.cos(ang) * arm * 0.8, cym + Math.sin(ang) * arm * 0.8, ch], [cxm + Math.cos(ang) * arm * 0.8, cym + Math.sin(ang) * arm * 0.8, ch - 4.5], 'crane', 0.6);
      o.crane = true;
      if (o.lit > 0) {
        lamp(cxm + Math.cos(ang) * arm, cym + Math.sin(ang) * arm, ch, 1.15);
        lamp(0, a + 0.4, o.maxZ + 1, 0.8);
        o.pulse = o.lamps[0];
      }
      o.built = o.maxZ;
      o.reach = ch + 1.6;
      return o;
    }
    make(o, s, H, tier, h.crown);
    const roof = o.top;
    if (f.lm && !low) {
      // A release was named for it: a gold tip, and a light on it while it is still worked on.
      o.line([0, 0, roof], [0, 0, roof + 2], 'metal', 1.2);
      o.pyramid(-1.4, -1.4, 2.8, 2.8, roof + 2, 3.6, 'gold');
      if (o.lit > 0) lamp(0, 0, roof + 6, 0.9);
    } else if (stage === 5) {
      // Long standing: its banner flies over it, in the project's own colour.
      const ph = low ? 3.2 : 5.5;
      const fw = low ? 1.9 : 3.2;
      o.line([0, 0, roof], [0, 0, roof + ph], 'metal', 1);
      o.face([[0, 0, roof + ph], [fw, 0, roof + ph - fw * 0.24], [0, 0, roof + ph - fw * 0.48]], [0, 1, 0], 'flag', 1, 1);
      o.face([[0, 0, roof + ph - fw * 0.48], [fw, 0, roof + ph - fw * 0.24], [0, 0, roof + ph]], [0, -1, 0], 'flag', 1, 1);
    }
    if (f.h > 0.3) {
      // Finished, and being worked on again: a fine scaffold on its upper floors, and a work lamp.
      const z0 = low ? 0 : roof * 0.62;
      const z1 = low ? roof * 0.75 : roof * 0.94;
      for (let i = 0; i <= 3; i++) o.line([-a + (s * i) / 3, a + 0.7, z0], [-a + (s * i) / 3, a + 0.7, z1], 'scaffold', 0.7);
      const n = clamp(Math.round((z1 - z0) / (FL * 1.4)), 1, 6);
      for (let k = 0; k <= n; k++) o.line([-a, a + 0.7, lerp(z0, z1, k / n)], [a, a + 0.7, lerp(z0, z1, k / n)], 'scaffold', 0.7);
      if (o.lit > 0) lamp(a * 0.4, a + 0.9, z1, 0.75);
      o.repair = true;
    }
    o.built = roof;
    o.reach = o.top;
    return o;
  }

  const things = []; // everything that stands, each drawn whole: { o, x, y, h }
  const quays = []; // the ground each project stands on
  for (const h of hoods) {
    h.top = 0;
    h.peak = null;
    const pad = Obj(h.cx, h.cy, h.rot);
    if (!h.built) {
      // An idea: a pontoon on dark piles at the mouth of the bay, with one small lantern.
      const o = pad;
      o.kind = 'lot';
      o.hood = h;
      o.seed = hash(h.p.id);
      o.lamps = [];
      for (const [a, b, t] of [[-4, -2.4, 3.6], [4, -2.4, 4.4], [4, 2.4, 3.2], [-4, 2.4, 4.8], [0.4, -2.4, 2.8]]) o.box(a - 0.35, b - 0.35, 0.7, 0.7, -1.2, t + 1.2, 'timber');
      o.box(-4.6, -3, 9.2, 6, 0.7, 0.5, 'timber');
      o.line([-4, 2.4, 3.6], [-4, 2.4, 6.2], 'crane', 1);
      o.line([-4, 2.4, 6.2], [-2.9, 2.4, 6.2], 'crane', 0.8);
      const L = h.at(-2.9, 2.4);
      o.lamps.push({ x: L[0], y: L[1], z: 5.7, r: 0.85 });
      o.reach = 6.4;
      o.s = 9;
      things.push({ o, x: h.cx, y: h.cy, h });
      h.top = 6.4;
      h.peak = { x: L[0], y: L[1], z: 6.4 };
      continue;
    }
    pad.kind = 'quay';
    pad.hood = h;
    pad.box(-h.qx, h.qy0, h.qx * 2, h.qy1 - h.qy0, -1, QZ + 1, 'quay');
    pad.faces[pad.faces.length - 1].tone = 'quayTop';
    // Mooring posts along the front.
    for (let x = -h.qx + 2; x <= h.qx - 2; x += 6) pad.line([x, h.qy1 - 0.6, QZ], [x, h.qy1 - 0.6, QZ + 1.1], 'crane', 1.2);
    quays.push(pad);
    for (const w of h.wards) {
      for (let i = 0; i < w.fs.length; i++) {
        const b = Math.floor(i / w.cols); // rows counted from the back
        const lx = -h.w / 2 + w.x0 + ((i % w.cols) + 0.5) * LOT;
        const ly = -h.d / 2 + LOT / 2 + b * LOT + (h.rows - w.rows) * LOT;
        const at = h.at(lx, ly);
        const f = w.fs[i];
        const o = raise(at[0], at[1], f, h);
        o.ward = w.name;
        things.push({ o, x: at[0], y: at[1], h });
        const built = o.built ?? 0;
        if (!h.peak || built > h.peak.z) h.peak = { x: at[0], y: at[1], z: Math.max(built, 2) + QZ };
        h.top = Math.max(h.top, o.reach + QZ);
      }
    }
  }

  // ───────────────────────── bridges, causeways, ferries ─────────────────────────
  // A tie is something built across the water. Leaning hard on each other: a bridge, on
  // arches where the gap is short and hung from pylons where it is long, with a lamp on
  // every bay. Tied: a low causeway on piles with a few lamps. Loosely: a ferry line.

  const bridges = [];
  function edgePoint(h, to) {
    const [lx, ly] = h.local(to[0], to[1]);
    const k = Math.min(lx === 0 ? Infinity : h.qx / Math.abs(lx), ly === 0 ? Infinity : (ly > 0 ? h.qy1 : -h.qy0) / Math.abs(ly));
    return h.at(lx * k * 0.96, ly * k * 0.96);
  }
  function piece(x, y, rot) {
    const o = Obj(x, y, rot);
    o.kind = 'bridge';
    o.lamps = [];
    o.s = 6;
    return o;
  }
  const outOf = (o, lx, ly) => [o.ox + lx * Math.cos(o.rot) - ly * Math.sin(o.rot), o.oy + lx * Math.sin(o.rot) + ly * Math.cos(o.rot)];
  function deck(o, l, w, za, zb, th, under) {
    o.face([[-l, -w, za], [l, -w, zb], [l, w, zb], [-l, w, za]], [0, 0, 1], 'deck');
    if (under) o.face([[-l, -w, za - th], [-l, w, za - th], [l, w, zb - th], [l, -w, zb - th]], [0, 0, -1], 'deck');
    o.face([[-l, w, za - th], [l, w, zb - th], [l, w, zb], [-l, w, za]], [0, 1, 0], 'deck');
    o.face([[l, -w, zb - th], [-l, -w, za - th], [-l, -w, za], [l, -w, zb]], [0, -1, 0], 'deck');
  }
  function span(l, form) {
    const a = hoodOf.get(l.a);
    const b = hoodOf.get(l.b);
    if (!a || !b) return;
    const A = edgePoint(a, [b.cx, b.cy]);
    const B = edgePoint(b, [a.cx, a.cy]);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const ux = (B[0] - A[0]) / L;
    const uy = (B[1] - A[1]) / L;
    const rot = Math.atan2(uy, ux);
    const br = { a, b, l, A, B, L, ux, uy, g: form, segs: [], cars: [], path: null, zd: () => 1, heavy: form === 'ferry' && l.g !== 'surveyed' };
    bridges.push(br);
    const put = (o, reach) => {
      o.reach = reach;
      o.span = br;
      things.push({ o, x: o.ox, y: o.oy, h: null });
    };
    if (form === 'ferry') {
      // A ferry line: a dotted wake that bows a little, and one small boat on it.
      // It bows to whichever side keeps it off the quays between.
      const lie = (u, bw) => [A[0] + ux * L * u - uy * bw * 4 * u * (1 - u), A[1] + uy * L * u + ux * bw * 4 * u * (1 - u)];
      const aground = (bw) => {
        let n = 0;
        for (let k = 1; k < 14; k++) {
          const P = lie(k / 14, bw);
          for (const h of hoods) if (h !== a && h !== b && h.built && Math.hypot(P[0] - h.cx, P[1] - h.cy) < h.radius) n++;
        }
        return n;
      };
      const size = L * (br.heavy ? 0.2 : 0.13) * (hash(l.a + l.b) % 2 ? 1 : -1);
      const bow = [size, -size].map((bw, i) => [aground(bw), i, bw]).sort((p, k) => p[0] - k[0] || p[1] - k[1])[0][2];
      const at = (u) => [A[0] + ux * L * u - uy * bow * 4 * u * (1 - u), A[1] + uy * L * u + ux * bow * 4 * u * (1 - u)];
      br.path = [];
      for (let k = 0; k <= 24; k++) br.path.push(at(k / 24));
      const u = 0.34 + ((hash(l.a) % 30) / 100);
      const P = at(u);
      const Q = at(u + 0.02);
      const o = piece(P[0], P[1], Math.atan2(Q[1] - P[1], Q[0] - P[0]));
      o.kind = 'boat';
      o.box(-2.6, -0.9, 5.2, 1.8, -0.2, 1, 'hull');
      o.box(-1.2, -0.6, 1.8, 1.2, 0.8, 1.1, 'trim');
      o.line([0.9, 0, 0.8], [0.9, 0, 3.4], 'crane', 0.8);
      const Lp = outOf(o, 0.9, 0);
      o.lamps.push({ x: Lp[0], y: Lp[1], z: 3.3, r: 0.6 });
      put(o, 4);
      return;
    }
    if (form === 'track') {
      const n = Math.max(2, Math.round(L / 8));
      const z = 1.1;
      br.zd = () => z;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const o = piece(A[0] + ux * L * u, A[1] + uy * L * u, rot);
        const h = L / n / 2;
        deck(o, h, 1.5, z, z, 0.3, true);
        for (const f of o.faces) f.tone = 'ward';
        for (const sx of [-h * 0.5, h * 0.5]) for (const sy of [-1.2, 1.2]) o.line([sx, sy, z - 0.3], [sx, sy, -1], 'crane', 1);
        o.line([-h, 1.2, z + 0.9], [h, 1.2, z + 0.9], 'rail', 0.6);
        o.line([0, -1.5, z], [0, -1.5, z + 1.8], 'crane', 0.7);
        const P = outOf(o, 0, -1.5);
        o.lamps.push({ x: P[0], y: P[1], z: z + 1.9, r: 0.5 });
        br.segs.push({ o, u });
        put(o, z + 3);
      }
      if (a.p.heat + b.p.heat > 0.5) br.cars.push({ u: (hash(l.a) % 100) / 100, v: 0.012 });
      return;
    }
    const W2 = 2.6;
    const th = 0.9;
    const camber = clamp(L * 0.075, 5, 11);
    const zd = (u) => QZ + camber * 4 * u * (1 - u);
    br.zd = zd;
    const hung = L > 120;
    const n = Math.max(4, Math.round(L / 8));
    const tp = 0.21;
    const zP = zd(tp) + clamp(L * 0.2, 22, 38);
    const zmid = zd(0.5) + 1.8;
    const cable = (u) => (u < tp ? lerp(zd(0) + 0.6, zP, u / tp) : u > 1 - tp ? lerp(zd(1) + 0.6, zP, (1 - u) / tp) : zmid + (zP - zmid) * Math.pow((u - 0.5) / (0.5 - tp), 2));
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const um = (u0 + u1) / 2;
      const o = piece(A[0] + ux * L * um, A[1] + uy * L * um, rot);
      const h = L / n / 2;
      const za = zd(u0);
      const zb = zd(u1);
      deck(o, h, W2, za, zb, th, hung);
      o.line([-h, W2, za + 1], [h, W2, zb + 1], 'rail', 0.6);
      o.line([-h, -W2, za + 1], [h, -W2, zb + 1], 'rail', 0.6);
      const side = i % 2 ? W2 : -W2;
      o.line([0, side, zd(um)], [0, side, zd(um) + 3], 'crane', 0.8);
      const P = outOf(o, 0, side);
      o.lamps.push({ x: P[0], y: P[1], z: zd(um) + 3.2, r: 1 });
      if (hung) {
        for (const sg of [-1, 1]) {
          o.line([-h, sg * W2, cable(u0)], [h, sg * W2, cable(u1)], 'cable', 1.2);
          o.line([-h, sg * W2, za], [-h, sg * W2, cable(u0)], 'cable', 0.4);
        }
      } else {
        // A stone arch under every bay, and a pier where two meet.
        const pw = 0.9;
        const zc = Math.min(za, zb) - th - 0.3;
        for (const sg of [1, -1]) {
          const pts = [[-h, sg * W2, za - th], [h, sg * W2, zb - th], [h, sg * W2, -1], [h - pw, sg * W2, -1]];
          for (let k = 0; k <= 8; k++) {
            const ang = (Math.PI * k) / 8;
            pts.push([(h - pw) * Math.cos(ang), sg * W2, 0.2 + (zc - 0.2) * Math.sin(ang)]);
          }
          pts.push([-h + pw, sg * W2, -1], [-h, sg * W2, -1]);
          o.face(pts, [0, sg, 0], 'pylon');
        }
        o.box(h - pw, -W2, pw * 2, W2 * 2, -1, zb - th + 1, 'pylon', 0, true);
      }
      br.segs.push({ o, u: um });
      put(o, zd(um) + 4);
    }
    if (hung) {
      for (const u of [tp, 1 - tp]) {
        const cx = A[0] + ux * L * u;
        const cy = A[1] + uy * L * u;
        for (const sg of [-1, 1]) {
          const o = piece(cx - uy * sg * (W2 + 0.6), cy + ux * sg * (W2 + 0.6), rot);
          o.box(-0.6, -0.6, 1.2, 1.2, -1, zP + 2, 'pylon');
          put(o, zP + 2);
        }
        const o = piece(cx, cy, rot);
        o.box(-0.45, -W2 - 0.6, 0.9, W2 * 2 + 1.2, zP - 2.6, 1.2, 'pylon');
        o.box(-0.45, -W2 - 0.6, 0.9, W2 * 2 + 1.2, zP - 10, 0.9, 'pylon');
        o.lamps.push({ x: cx, y: cy, z: zP + 1.4, r: 0.8 });
        put(o, zP + 2);
      }
    }
    // Traffic: a few small lights crossing, more where both ends are being worked on.
    const cars = Math.round(L / 60 + (a.p.heat + b.p.heat) * 1.6);
    for (let k = 0; k < cars; k++) br.cars.push({ u: ((hash(l.a + l.b) % 97) / 97 + k / Math.max(1, cars)) % 1, v: 0.02 + 0.012 * ((k * 7) % 3), back: k % 2 === 1 });
  }
  const FORM = new Map(); // what each tie was built as
  {
    const grade = { road: 0, track: 1, surveyed: 2 };
    const laid = [];
    const all = W.links
      .map((l) => ({ l, a: hoodOf.get(l.a), b: hoodOf.get(l.b) }))
      .filter((k) => k.a && k.b && k.a !== k.b)
      .map((k) => ({ ...k, len: Math.hypot(k.a.cx - k.b.cx, k.a.cy - k.b.cy) }))
      .sort((p, k) => grade[p.l.g] - grade[k.l.g] || p.len - k.len || (p.l.a + p.l.b < k.l.a + k.l.b ? -1 : 1));
    for (const { l, a, b } of all) {
      let form = l.g === 'surveyed' || !a.built || !b.built ? 'ferry' : l.g;
      if (form !== 'ferry') {
        const A = edgePoint(a, [b.cx, b.cy]);
        const B = edgePoint(b, [a.cx, a.cy]);
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const through = hoods.some((k) => k !== a && k !== b && k.built && segDist(k.cx, k.cy, A[0], A[1], B[0], B[1]) < k.radius * 0.8);
        const tangled = laid.some((w) => w.a !== a && w.a !== b && w.b !== a && w.b !== b && crosses(A, B, w.A, w.B));
        // Too long, through a quay, or across a stronger bridge: it goes by water instead.
        if (L > 280 || L < 8 || through || tangled) form = 'ferry';
        else laid.push({ a, b, A, B });
      }
      FORM.set(l, form);
      span(l, form);
    }
  }
  // A bridge lamp is lit by the work at its two ends; a bridge between two quiet places is dark.
  for (const br of bridges) br.heat = clamp(0.25 + 0.75 * Math.max(br.a.p.heat, br.b.p.heat), 0, 1) * (br.a.dim && br.b.dim ? 0.35 : 1);

  // ───────────────────────── the lenses ─────────────────────────
  // With no lens the city is lit by its own work. A lens lets everything else sink into the
  // haze and puts one colour on whatever answers its question.

  let lens = null;
  const INK = { plan: hex('#8f9bdc'), build: hex('#f0a448'), stand: hex('#4f9f8e'), idea: hex('#c2c8ea'), now0: hex('#f3c66a'), now1: hex('#e4532a') };
  const AGE = [[0, hex('#f6ca5c')], [0.35, hex('#e07a42')], [0.68, hex('#96527f')], [1, hex('#414e88')]];
  const TODAY = Math.max(...W.places.flatMap((p) => [p.last, ...p.f.map((f) => f.last)]).filter(Boolean).map((d) => Date.parse(d)));
  function ageInk(last) {
    const days = (TODAY - Date.parse(last)) / 864e5;
    const u = clamp(Math.log(1 + days / 20) / Math.log(1 + 1100 / 20), 0, 1);
    for (let i = 1; i < AGE.length; i++) if (u <= AGE[i][0]) return mix(AGE[i - 1][1], AGE[i][1], (u - AGE[i - 1][0]) / (AGE[i][0] - AGE[i - 1][0]));
    return AGE[AGE.length - 1][1];
  }
  const LENSES = {
    now: {
      ink: (o) => (o.f && o.lit > 0 ? mix(INK.now0, INK.now1, o.f.h) : null),
      key() {
        const hot = things.filter((it) => it.o.ink);
        return `<span><i class="ramp" style="background:linear-gradient(90deg,#f3c66a,#e4532a)"></i>a little work lately &rarr; a lot</span><span>${hot.length} buildings in ${new Set(hot.map((it) => it.h)).size} projects</span>`;
      },
    },
    stage: {
      ink: (o) => (o.f ? [INK.plan, INK.plan, INK.plan, INK.build, INK.stand, INK.stand][STAGES.indexOf(o.f.s)] : o.kind === 'lot' ? INK.idea : null),
      key() {
        const n = (c) => things.filter((it) => it.o.ink === c).length;
        return `<span><i style="background:#c2c8ea"></i>idea ${n(INK.idea)}</span><span><i style="background:#8f9bdc"></i>planned ${n(INK.plan)}</span><span><i style="background:#f0a448"></i>being built ${n(INK.build)}</span><span><i style="background:#4f9f8e"></i>standing ${n(INK.stand)}</span>`;
      },
    },
    age: {
      ink: (o) => (o.f && o.f.last ? ageInk(o.f.last) : null),
      key: () => `<span>touched this month</span><span><i class="ramp" style="background:linear-gradient(90deg,#f6ca5c,#e07a42 35%,#96527f 68%,#414e88)"></i>three years ago</span>`,
    },
    ties: {
      ink: (o) => ((o.f || o.kind === 'lot') && o.hood.tied ? ACCENTS[o.hood.col] : null),
      key: () => `<span>a bridge: leans hard</span><span>a causeway: tied</span><span>a ferry: loosely</span><span>${hoods.filter((h) => !h.tied).length} stand alone</span>`,
    },
  };
  function setLens(id) {
    lens = id && LENSES[id] && id !== lens ? id : null;
    for (const it of things) it.o.ink = lens ? LENSES[lens].ink(it.o) : null;
    for (const b of document.querySelectorAll('#lenses button')) b.setAttribute('aria-pressed', String(b.dataset.lens === lens));
    const key = $('key');
    key.hidden = !lens;
    key.innerHTML = lens ? LENSES[lens].key() : '';
    dirty = true;
  }

  // ───────────────────────── the eye ─────────────────────────
  // The camera looks at a point on the water from a little above it. `cam.pitch` is how far
  // above (0.02 is a boat, 1 is a gull), `cam.zoom` how close. The picture's centre is set
  // below the middle of the window when the eye is low, so that there is more sky than water
  // and the towers stand straight.

  const DIST = 440;
  const EYE = 4;
  const V = { ex: 0, ey: 0, ez: 10, rx: 1, ry: 0, fx: 0, fy: -1, sp: 0, cp: 1, foc: 1000, y0: 500, yh: 400 };
  function setCam() {
    const c = Math.cos(cam.yaw);
    const s = Math.sin(cam.yaw);
    V.rx = c;
    V.ry = s;
    V.fx = s;
    V.fy = -c;
    V.sp = Math.sin(cam.pitch);
    V.cp = Math.cos(cam.pitch);
    const dist = DIST / cam.zoom;
    V.ex = cam.tx - V.fx * V.cp * dist;
    V.ey = cam.ty - V.fy * V.cp * dist;
    V.ez = EYE + V.sp * dist;
    V.foc = Math.max(vw, vh * 1.3) * 0.8;
    V.y0 = vh * lerp(0.5, 0.6, clamp(1 - cam.pitch / 0.7, 0, 1));
    V.yh = V.y0 - (V.foc * V.sp) / V.cp;
  }
  /** World point to screen: [x, y, depth]. Anything with depth under NEAR is behind the eye. */
  function pp(x, y, z) {
    const dx = x - V.ex;
    const dy = y - V.ey;
    const dz = z - V.ez;
    const vd = dx * V.fx + dy * V.fy;
    const depth = vd * V.cp - dz * V.sp;
    const k = V.foc / Math.max(depth, 0.01);
    return [vw / 2 + (dx * V.rx + dy * V.ry) * k, V.y0 - (vd * V.sp + dz * V.cp) * k, depth];
  }
  /** Screen point back to the water, or null if it is in the sky. */
  function unpp(sx, sy) {
    const a = (sx - vw / 2) / V.foc;
    const b = (V.y0 - sy) / V.foc;
    const dz = V.cp * b - V.sp;
    if (dz > -1e-3) return null;
    const k = -V.ez / dz;
    if (k > 3000) return null;
    const f = V.sp * b + V.cp;
    return [V.ex + (V.rx * a + V.fx * f) * k, V.ey + (V.ry * a + V.fy * f) * k];
  }
  const far = (x, y) => Math.hypot(x - V.ex, y - V.ey);
  const fogAt = (d) => 1 - Math.exp(-d / M.fogD);

  // Things made once: a soft light, its streak on the water, a sheet of grain.
  function sprite(w, h, paintOn) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paintOn(c.getContext('2d'));
    return c;
  }
  const GLOW = sprite(96, 96, (x) => {
    const gr = x.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(255,226,166,0.95)');
    gr.addColorStop(0.22, 'rgba(255,198,124,0.42)');
    gr.addColorStop(0.6, 'rgba(255,170,96,0.1)');
    gr.addColorStop(1, 'rgba(255,160,90,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 96, 96);
  });
  const STREAK = sprite(32, 128, (x) => {
    let gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,214,150,0.9)');
    gr.addColorStop(0.4, 'rgba(255,190,120,0.4)');
    gr.addColorStop(1, 'rgba(255,170,100,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 32, 128);
    x.globalCompositeOperation = 'destination-in';
    gr = x.createLinearGradient(0, 0, 32, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 32, 128);
  });
  const GRAIN = sprite(180, 180, (x) => {
    const img = x.createImageData(180, 180);
    const r = rng('grain');
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r();
      const c = v < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = Math.abs(v - 0.5) * 2 * 11;
    }
    x.putImageData(img, 0, 0);
  });
  const MIRROR = document.createElement('canvas'); // the city upside down, before the ripple breaks it
  const HELD = document.createElement('canvas'); // the last whole frame, kept while only small lights move

  // ───────────────────────── drawing ─────────────────────────

  let g = ctx; // where we are drawing: the window, or the mirror
  let fast = false; // while the view is moving, leave out what costs most
  let DPR = 1;
  let grainFill = null;
  for (const it of things) if (it.h && it.o.kind === 'building') (it.h.stand ??= []).push(it.o);

  function path(pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  /** A cheap, repeatable coin for one pane of one wall. */
  function coin(seed, r, c) {
    let x = (seed ^ Math.imul(r + 1, 374761393) ^ Math.imul(c + 1, 668265263)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }
  /** What a surface is made of, before any light falls on it. */
  function matter(o, name) {
    switch (name) {
      case 'wall':
        return o.mat ?? MAT.stone;
      case 'base':
        return o.mat ? [o.mat[0] * 0.8, o.mat[1] * 0.8, o.mat[2] * 0.83] : ALB.quay;
      case 'ledge':
      case 'trim':
      case 'stone':
        return o.mat ? mix(o.mat, ALB.trim, 0.55) : ALB.trim;
      case 'roof':
      case 'roof2':
        return ALB.roof;
      case 'awning':
      case 'flag':
      case 'accent':
        return o.hood ? (o.hood.dim ? mix(ACCENTS[o.hood.col], [120, 120, 128], 0.55) : ACCENTS[o.hood.col]) : ALB.trim;
      default:
        return ALB[name] ?? ALB.metal;
    }
  }
  const answers = (o) => o.kind === 'building' || o.kind === 'lot';
  function albedo(o, name) {
    const m = matter(o, name);
    if (!lens || !answers(o)) return m;
    if (!o.ink) return o.kind === 'lot' ? m : mix(m, [132, 134, 146], 0.55);
    if (lens === 'ties') return m;
    if (o.kind === 'lot') return mix(o.ink, m, 0.6);
    if (ACCENT.has(name) || name === 'roof' || name === 'gold' || name === 'soot') return mix(o.ink, [36, 38, 60], 0.38);
    if (name === 'trim' || name === 'ledge') return mix(o.ink, WHITE, 0.22);
    return mix(o.ink, m, 0.26);
  }
  /** A surface in this hour's light, at this distance. */
  function shade(alb, n, o) {
    const lit = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
    const up = (n[2] > 0.5 ? 0.14 : 0) + (lens && lens !== 'ties' && answers(o) && o.ink ? 0.2 : 0);
    const f = o.fog;
    return [
      lerp(Math.min(255, alb[0] * (M.amb[0] + up + M.sun[0] * lit)), M.haze[0], f),
      lerp(Math.min(255, alb[1] * (M.amb[1] + up + M.sun[1] * lit)), M.haze[1], f),
      lerp(Math.min(255, alb[2] * (M.amb[2] + up + M.sun[2] * lit)), M.haze[2], f),
    ];
  }
  const lampOf = (seed, wall, o) => mix(mix(wall, seed & 1 ? LAMP : LAMP2, M.lampOn), M.haze, o.fog * 0.5);
  const litOf = (o) => (!lens ? o.lit : lens === 'now' ? (o.ink ? o.lit : 0) : lens === 'ties' ? (o.ink && o.built > 3 ? 0.42 : 0) : 0) || 0;

  /** The windows of one wall: a rhythm of dark panes, and lit ones where there is work. */
  function glaze(win, p, wall, o, mirror) {
    const wpx = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
    const hpx = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1]);
    if (wpx < 2.2 || hpx < 3) return;
    let { style, rows, cols } = win;
    if (style === 'tall') rows = Math.ceil(rows / 2);
    if (style === 'arc') rows = 1;
    while (rows > 1 && hpx / rows < 2.3) rows = Math.ceil(rows / 2);
    while (cols > 1 && wpx / cols < 2.1) cols = Math.ceil(cols / 2);
    const lit = litOf(o) * (style === 'arc' ? 1.3 : 1);
    const [u0, u1, v0, v1] = style === 'band' ? [0.13, 0.87, 0.28, 0.78] : style === 'loft' ? [0.2, 0.8, 0.22, 0.8] : style === 'tall' ? [0.33, 0.67, 0.14, 0.84] : style === 'arc' ? [0.2, 0.8, 0.06, 0.72] : [0.27, 0.73, 0.3, 0.76];
    const pane = (r, c) => {
      const ua = (c + u0) / cols;
      const ub = (c + u1) / cols;
      const va = (r + v0) / rows;
      const vb = (r + v1) / rows;
      const at = (u, v) => [(p[0][0] * (1 - u) + p[1][0] * u) * (1 - v) + (p[3][0] * (1 - u) + p[2][0] * u) * v, (p[0][1] * (1 - u) + p[1][1] * u) * (1 - v) + (p[3][1] * (1 - u) + p[2][1] * u) * v];
      const a = at(ua, va);
      const b = at(ub, va);
      const c2 = at(ub, vb);
      const d = at(ua, vb);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.lineTo(c2[0], c2[1]);
      g.lineTo(d[0], d[1]);
      g.closePath();
    };
    if (!mirror && !fast) {
      g.beginPath();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!(lit > 0 && coin(win.seed, r, c) < lit)) pane(r, c);
      g.fillStyle = css([wall[0] * 0.64 + M.skyTop[0] * 0.13, wall[1] * 0.64 + M.skyTop[1] * 0.13, wall[2] * 0.66 + M.skyTop[2] * 0.14]);
      g.fill();
    }
    if (lit > 0) {
      g.beginPath();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (coin(win.seed, r, c) < lit) pane(r, c);
      g.fillStyle = css(lampOf(win.seed, wall, o));
      g.fill();
    }
  }
  function paint(o, f, pts, mirror, j) {
    const name = f.tone;
    if (GLASSY.has(name)) {
      // A window of a low building, which is a face of its own.
      const wall = shade(albedo(o, 'wall'), f.n, o);
      const on = name !== 'slit' && coin(o.seed, j, 7) < litOf(o) * 1.4;
      g.fillStyle = css(on ? lampOf(j, wall, o) : [wall[0] * 0.6 + M.skyTop[0] * 0.13, wall[1] * 0.6 + M.skyTop[1] * 0.13, wall[2] * 0.62 + M.skyTop[2] * 0.14]);
      g.fill();
      return;
    }
    const c = shade(albedo(o, name), f.n, o);
    const fill = css(c);
    if (f.win && f.win.tall > 15 && !fast && !mirror) {
      // The foot of a tall wall stands in the haze off the water.
      const gr = g.createLinearGradient((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, (pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2);
      gr.addColorStop(0, css(mix(c, M.haze, 0.34)));
      gr.addColorStop(0.5, fill);
      gr.addColorStop(1, fill);
      g.fillStyle = gr;
    } else g.fillStyle = fill;
    g.fill();
    g.strokeStyle = fill;
    g.lineWidth = 0.55;
    g.lineJoin = 'round';
    g.stroke();
    if (f.win) glaze(f.win, pts, c, o, mirror);
  }
  function lampPower(o) {
    if (o.kind === 'bridge') return o.span.heat * (lens ? (lens === 'ties' ? 1.5 : 0.3) : 1);
    if (o.kind === 'boat') return lens && lens !== 'ties' ? 0.3 : 0.8;
    if (o.kind === 'lot') return lens && !o.ink ? 0.25 : 0.75;
    return litOf(o) > 0 ? 1 : 0;
  }
  function light(s, r, power) {
    if (power <= 0.01) return;
    const R = clamp((r * 3.3 * V.foc) / s[2], 2.6, 48);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, power);
    g.drawImage(GLOW, s[0] - R, s[1] - R, R * 2, R * 2);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#fff6dc';
    g.beginPath();
    g.arc(s[0], s[1], clamp((r * 0.3 * V.foc) / s[2], 0.75, 4), 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  }
  /** One standing thing: its faces from far to near, then its lines and its lights. */
  function drawThing(o, mirror) {
    const zs = mirror ? -1 : 1;
    const oz = o.oz || 0;
    const vis = [];
    let cutOff = false;
    for (let j = 0; j < o.faces.length; j++) {
      const f = o.faces[j];
      if (mirror && f.n[2] > 0.9) continue;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let zmin = Infinity;
      for (const p of f.p) {
        sx += p[0];
        sy += p[1];
        sz += p[2];
        if (p[2] < zmin) zmin = p[2];
      }
      const n = f.p.length;
      const wx = o.ox + sx / n;
      const wy = o.oy + sy / n;
      if (f.n[0] * (V.ex - wx) + f.n[1] * (V.ey - wy) + f.n[2] * zs * (V.ez - (sz / n + oz) * zs) <= 0) continue;
      const pts = [];
      let ok = true;
      for (const p of f.p) {
        const s = pp(o.ox + p[0], o.oy + p[1], (p[2] + oz) * zs);
        if (s[2] < NEAR) {
          cutOff = true;
          ok = false;
          break;
        }
        pts.push(s);
      }
      if (!ok) continue;
      // Seen this low, what is nearer hides what is farther; height only settles what stands on what.
      vis.push({ f, pts, j, k: -Math.hypot(wx - V.ex, wy - V.ey) + zmin * 0.02 + (f.lift || 0) * 0.3 - (f.n[2] > 0.99 ? 0.01 : 0) });
    }
    vis.sort((a, b) => a.k - b.k);
    for (const v of vis) {
      path(v.pts);
      paint(o, v.f, v.pts, mirror, v.j);
    }
    const power = cutOff ? 0 : M.lamps * lampPower(o) * (1 - o.fog * 0.45);
    if (mirror) {
      // A light lies on the water as a long streak under it.
      if (power > 0.02 && o.lamps) {
        g.globalCompositeOperation = 'lighter';
        for (const L of o.lamps) {
          const s = pp(L.x, L.y, -L.z);
          if (s[2] < NEAR) continue;
          const w = clamp((L.r * 1.7 * V.foc) / s[2], 1.6, 18);
          g.globalAlpha = Math.min(1, power * 0.9);
          g.drawImage(STREAK, s[0] - w / 2, s[1] - 2, w, clamp((L.r * 44 * V.foc) / s[2], 14, 260) * Math.min(1, power + 0.2));
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      return;
    }
    const inked = lens && answers(o);
    const ink = inked ? (o.ink ? mix(o.ink, [30, 32, 50], 0.45) : mix(M.line, M.haze, 0.6)) : M.line;
    for (const l of o.lines) {
      const a = pp(o.ox + l.a[0], o.oy + l.a[1], l.a[2] + oz);
      const b = pp(o.ox + l.b[0], o.oy + l.b[1], l.b[2] + oz);
      if (a[2] < NEAR || b[2] < NEAR) continue;
      const w = (l.w * 0.26 * V.foc) / ((a[2] + b[2]) / 2);
      const soft = l.tone === 'rail' || l.tone === 'cable' || l.tone === 'frame' ? 0.3 : 0;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.strokeStyle = css(mix(ink, M.haze, clamp(o.fog + soft, 0, 0.95)), clamp(w / 0.55, 0.3, 1));
      g.lineWidth = clamp(w, 0.5, 3);
      g.lineCap = 'round';
      if (l.tone === 'string') g.setLineDash([2.5, 2.5]);
      g.stroke();
      if (l.tone === 'string') g.setLineDash([]);
    }
    // A building at work is wrapped in its own light.
    if (litOf(o) > 0 && M.glow > 0.05 && o.built > 3) {
      const s = pp(o.ox, o.oy, oz + o.built * 0.5);
      if (s[2] > NEAR) {
        const k = V.foc / s[2];
        const w = Math.max(26, o.s * 4.4 * k);
        const h = Math.max(30, o.built * 1.5 * k);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = clamp(M.glow * litOf(o) * 0.36 * (1 - o.fog * 0.5), 0, 1);
        g.drawImage(GLOW, s[0] - w / 2, s[1] - h / 2, w, h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (power > 0.02 && o.lamps) {
      for (const L of o.lamps) {
        const s = pp(L.x, L.y, L.z);
        if (s[2] > NEAR) light(s, L.r, power);
      }
    }
  }

  // The sky: dusty blue above, warm at the horizon, a glow where the sun is going down.
  const SUN_AZ = Math.atan2(-Math.cos(VIEW.yaw - 0.03 * VIEW.side), Math.sin(VIEW.yaw - 0.03 * VIEW.side));
  const STARS = (() => {
    const r = rng('stars');
    return Array.from({ length: 170 }, () => [r(), Math.pow(r(), 1.5), 0.35 + 0.65 * r(), r() < 0.12 ? 1.3 : 0.8]);
  })();
  const CLOUD = sprite(320, 80, (x) => {
    x.save();
    x.translate(160, 36);
    x.scale(5, 1);
    let gr = x.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, css(M.cloud, 0.62));
    gr.addColorStop(1, css(M.cloud, 0));
    x.fillStyle = gr;
    x.fillRect(-32, -36, 64, 72);
    x.restore();
    x.save();
    x.translate(160, 48);
    x.scale(5, 0.42);
    gr = x.createRadialGradient(0, 0, 0, 0, 0, 30);
    gr.addColorStop(0, css(M.sunGlow, 0.5 * M.sunA));
    gr.addColorStop(1, css(M.sunGlow, 0));
    x.fillStyle = gr;
    x.fillRect(-32, -40, 64, 80);
    x.restore();
  });
  const CLOUDS = [[0.3, 0.3, 0.3], [-0.6, 0.24, 0.26], [0.95, 0.33, 0.24], [-0.42, 0.075, 0.34], [0.2, 0.06, 0.4], [0.62, 0.11, 0.3], [-0.12, 0.15, 0.46], [1.0, 0.085, 0.36], [-0.86, 0.12, 0.34], [0.4, 0.2, 0.3], [-1.3, 0.07, 0.4]];
  let sunAt = null;
  function sky() {
    const yh = V.yh;
    const top = Math.min(0, yh - vh * 0.6);
    const gr = g.createLinearGradient(0, top, 0, Math.max(yh, top + 1));
    gr.addColorStop(0, css(M.skyTop));
    gr.addColorStop(0.6, css(M.skyMid));
    gr.addColorStop(1, css(M.skyLow));
    g.fillStyle = gr;
    g.fillRect(0, 0, vw, vh);
    const band = g.createLinearGradient(0, yh - vh * 0.2, 0, yh);
    band.addColorStop(0, css(M.sunGlow, 0));
    band.addColorStop(1, css(M.sunGlow, 0.3 * M.sunA));
    g.fillStyle = band;
    g.fillRect(0, yh - vh * 0.2, vw, vh * 0.2);
    if (M.stars > 0.02) {
      g.fillStyle = '#e9ecff';
      for (const [u, v, a, r] of STARS) {
        g.globalAlpha = M.stars * a * (0.25 + 0.75 * (1 - v));
        g.fillRect(u * vw, v * yh * 0.93, r, r);
      }
      g.globalAlpha = 1;
    }
    const ce = Math.cos(M.sunElev);
    const s = pp(V.ex + Math.cos(SUN_AZ) * ce * 9000, V.ey + Math.sin(SUN_AZ) * ce * 9000, V.ez + Math.sin(M.sunElev) * 9000);
    sunAt = s[2] > NEAR ? s : null;
    if (sunAt) {
      const R = vw * 0.62;
      const glow = g.createRadialGradient(s[0], s[1], 0, s[0], s[1], R);
      glow.addColorStop(0, css(M.sunGlow, M.sunA));
      glow.addColorStop(0.22, css(M.sunGlow, M.sunA * 0.46));
      glow.addColorStop(1, css(M.sunGlow, 0));
      g.fillStyle = glow;
      g.fillRect(0, 0, vw, vh);
      if (M.sunElev > 0) {
        const disc = g.createRadialGradient(s[0], s[1], 0, s[0], s[1], 13);
        disc.addColorStop(0, '#fffaf0');
        disc.addColorStop(0.8, '#fff0cf');
        disc.addColorStop(1, 'rgba(255,236,196,0)');
        g.fillStyle = disc;
        g.beginPath();
        g.arc(s[0], s[1], 13, 0, TAU);
        g.fill();
      }
    }
    for (const [az, el, size] of CLOUDS) {
      const a = SUN_AZ + az;
      const c = pp(V.ex + Math.cos(a) * Math.cos(el) * 9000, V.ey + Math.sin(a) * Math.cos(el) * 9000, V.ez + Math.sin(el) * 9000);
      if (c[2] < NEAR) continue;
      const w = size * vw;
      g.globalAlpha = el > 0.2 ? 0.55 : 1;
      g.drawImage(CLOUD, c[0] - w / 2, c[1] - w / 8, w, w / 4);
      g.globalAlpha = 1;
    }
  }
  // The far shore: three ridges, each paler than the one in front of it.
  const FAR = Math.max(1, (EXTENT + 300) / 880); // the far shore stands beyond the last quay
  const RIDGES = [
    { r: 2700 * FAR, h: 230 * FAR, fog: 0.9, p: [0.3, 1.7, 4.1] },
    { r: 1500 * FAR, h: 120 * FAR, fog: 0.76, p: [2.1, 0.4, 1.3] },
    { r: 880 * FAR, h: 54 * FAR, fog: 0.58, p: [4.4, 2.9, 0.2] },
  ];
  const RIDGE_ROCK = hex('#55607a');
  function hills(mirror) {
    const af = Math.atan2(V.fy, V.fx);
    const a0 = Math.floor((af - 1.5) / 0.02) * 0.02;
    for (const R of RIDGES) {
      const tops = [];
      const feet = [];
      for (let a = a0; a <= af + 1.5; a += 0.02) {
        const hgt = R.h * (0.3 + 0.7 * Math.abs(Math.sin(a * 2.3 + R.p[0]) * Math.sin(a * 5.1 + R.p[1])) + 0.08 * Math.sin(a * 13 + R.p[2]));
        const x = Math.cos(a) * R.r;
        const y = -100 + Math.sin(a) * R.r;
        const s = pp(x, y, mirror ? -hgt : hgt);
        if (s[2] < NEAR) continue;
        tops.push(s);
        feet.push(pp(x, y, 0));
      }
      if (tops.length < 2) continue;
      path([...tops, ...feet.reverse()]);
      g.fillStyle = css(mix([RIDGE_ROCK[0] * (M.amb[0] + 0.1), RIDGE_ROCK[1] * (M.amb[1] + 0.1), RIDGE_ROCK[2] * (M.amb[2] + 0.1)], M.haze, R.fog));
      g.fill();
    }
  }
  function water() {
    const yh = Math.max(0, V.yh);
    if (yh >= vh) return;
    const gr = g.createLinearGradient(0, yh, 0, vh);
    gr.addColorStop(0, css(M.waterFar));
    gr.addColorStop(0.14, css(mix(M.waterFar, M.waterNear, 0.4)));
    gr.addColorStop(0.5, css(mix(M.waterFar, M.waterNear, 0.82)));
    gr.addColorStop(1, css(M.waterNear));
    g.fillStyle = gr;
    g.fillRect(0, yh, vw, vh - yh);
  }
  /** The city upside down in the water, laid on in strips that the ripple pushes about. */
  function reflect(order, qorder) {
    const yh = Math.max(0, V.yh);
    if (yh >= vh) return;
    const s = fast ? 0.34 : 0.5;
    const w = Math.max(1, Math.round(vw * DPR * s));
    const h = Math.max(1, Math.round(vh * DPR * s));
    if (MIRROR.width !== w || MIRROR.height !== h) {
      MIRROR.width = w;
      MIRROR.height = h;
    }
    const m = MIRROR.getContext('2d');
    m.setTransform(DPR * s, 0, 0, DPR * s, 0, 0);
    m.clearRect(0, 0, vw, vh);
    g = m;
    hills(true);
    for (const o of qorder) drawThing(o, true);
    for (const it of order) drawThing(it.o, true);
    // Water drags a reflection out toward the eye.
    m.setTransform(1, 0, 0, 1, 0, 0);
    if (!fast) {
      for (const off of [2, 4, 7]) {
        m.globalAlpha = 0.42;
        m.drawImage(MIRROR, 0, off);
      }
      m.globalAlpha = 1;
    }
    g = ctx;
    const step = fast ? 4 : 2;
    for (let y = yh; y < vh; y += step) {
      const v = (y - yh) / Math.max(1, vh - yh);
      const amp = 0.25 + 1.5 * v;
      const dx = Math.sin(y * 0.21 + v * 9) * amp + Math.sin(y * 0.057 + 1.3) * amp;
      // Each ripple lets more or less of the reflection through.
      const wave = 0.5 + 0.5 * Math.sin(y * (1.9 - 1.2 * v) + Math.sin(y * 0.31) * 2.4);
      g.globalAlpha = M.reflA * (0.96 - 0.5 * v) * (1 - (0.25 + 0.6 * v) * wave);
      const from = yh + (y - yh) / 1.18;
      g.drawImage(MIRROR, 0, from * DPR * s, w, step * DPR * s, dx, y, vw, step);
    }
    g.globalAlpha = 1;
  }
  const RIPPLES = (() => {
    const r = rng('ripples');
    return Array.from({ length: 260 }, () => [r(), Math.pow(r(), 1.7), r(), r() < 0.5]);
  })();
  function surface() {
    const yh = Math.max(0, V.yh);
    if (yh >= vh) return;
    // The path of the sun on the water.
    if (sunAt && M.sunA > 0.3) {
      const r = rng('glitter');
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 190; i++) {
        const v = Math.pow(r(), 1.5);
        const y = yh + 1 + v * (vh - yh);
        const x = sunAt[0] + (r() + r() - 1) * (10 + v * 170);
        const len = 3 + v * 40 * r();
        g.fillStyle = css(M.sunGlow, (0.42 * (1 - v) + 0.06) * M.sunA * (M.sunElev > 0 ? 1 : 0.35));
        g.fillRect(x - len / 2, y, len, 1 + v * 1.5);
      }
      g.globalCompositeOperation = 'source-over';
    }
    for (const [u, v, k, pale] of RIPPLES) {
      const y = yh + 2 + v * (vh - yh);
      const len = (8 + 90 * v) * (0.3 + k);
      g.fillStyle = pale ? css(M.skyLow, 0.05 + 0.07 * (1 - v)) : css([4, 8, 20], 0.05 + 0.1 * v);
      g.fillRect(u * (vw + len) - len, y, len, 1 + v * 1.4);
    }
    // Ferry lines: a dotted wake.
    for (const br of bridges) {
      if (!br.path) continue;
      g.beginPath();
      let pen = false;
      for (const P of br.path) {
        const s = pp(P[0], P[1], 0);
        if (s[2] < NEAR) {
          pen = false;
          continue;
        }
        if (pen) g.lineTo(s[0], s[1]);
        else g.moveTo(s[0], s[1]);
        pen = true;
      }
      const d = far((br.A[0] + br.B[0]) / 2, (br.A[1] + br.B[1]) / 2);
      g.strokeStyle = css(mix(M.skyLow, WHITE, 0.6), (lens === 'ties' ? 1 : 0.62 * clamp(170 / br.L, 0.3, 1)) * (1 - fogAt(d) * 0.5));
      g.lineWidth = clamp((0.6 * V.foc) / d, 1.2, 2.6) * (br.heavy ? 1.3 : 1);
      g.setLineDash([g.lineWidth * 0.2, g.lineWidth * 3.2]);
      g.lineCap = 'round';
      g.stroke();
      g.setLineDash([]);
    }
  }
  /** A quay, and on its top the paving of the wards and the long shadows of what stands there. */
  function drawQuay(o) {
    drawThing(o, false);
    const h = o.hood;
    if (V.ez <= QZ + 0.5) return;
    const corner = (lx, ly) => {
      const P = h.at(lx, ly);
      return pp(P[0], P[1], QZ);
    };
    const top = [corner(-h.qx, h.qy0), corner(h.qx, h.qy0), corner(h.qx, h.qy1), corner(-h.qx, h.qy1)];
    if (top.some((s) => s[2] < NEAR)) return;
    g.save();
    path(top);
    g.clip();
    const lit = shade(albedo(o, 'ward'), [0, 0, 1], o);
    for (const w of h.wards) {
      const x0 = -h.w / 2 + w.x0;
      const y0 = -h.d / 2 + (h.rows - w.rows) * LOT;
      path([corner(x0, y0), corner(x0 + w.w, y0), corner(x0 + w.w, h.d / 2), corner(x0, h.d / 2)]);
      g.fillStyle = css(lit);
      g.fill();
    }
    const sunny = clamp(M.sun[0], 0, 1);
    if (sunny > 0.2 && h.stand) {
      const cx = -SUN[0] / SUN[2];
      const cy = -SUN[1] / SUN[2];
      g.beginPath();
      for (const b of h.stand) {
        for (const s of b.foot) {
          const k = Math.min(s.h, 8);
          const base = s.p.map((p) => [b.ox + p[0], b.oy + p[1]]);
          const cast = base.map((p) => [p[0] + cx * k, p[1] + cy * k]);
          const hull = [...base.map((p) => pp(p[0], p[1], QZ)), ...cast.map((p) => pp(p[0], p[1], QZ))];
          if (hull.some((q2) => q2[2] < NEAR)) continue;
          for (let i = 0; i < base.length; i++) {
            const j = (i + 1) % base.length;
            const quad = [hull[i], hull[j], hull[base.length + j], hull[base.length + i]];
            let area = 0;
            for (let m = 0; m < 4; m++) area += quad[m][0] * quad[(m + 1) % 4][1] - quad[(m + 1) % 4][0] * quad[m][1];
            if (area < 0) quad.reverse();
            g.moveTo(quad[0][0], quad[0][1]);
            for (let m = 1; m < 4; m++) g.lineTo(quad[m][0], quad[m][1]);
            g.closePath();
          }
        }
      }
      g.fillStyle = css([18, 20, 48], 0.36 * sunny * (1 - o.fog));
      g.fill('nonzero');
    }
    if (hover?.h === h || focus === h) {
      path(top);
      g.strokeStyle = css(LAMP, 0.8);
      g.lineWidth = 2.5;
      g.stroke();
    }
    g.restore();
  }
  function tag(text, x, y, size, alpha = 1) {
    g.font = `600 ${size}px "Avenir Next","Helvetica Neue",sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = '0.16em';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(6,8,22,0.9)';
    g.shadowBlur = 9;
    g.fillStyle = css([250, 240, 222], alpha);
    g.fillText(text.toUpperCase(), x, y);
    g.fillText(text.toUpperCase(), x, y);
    g.shadowBlur = 0;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.textAlign = 'start';
  }
  /** Names are not worn at rest. One appears over what you point at, and over what you come close to. */
  function names() {
    const close = cam.zoom > 1.7;
    for (const h of hoods) {
      const pointed = hover?.h === h;
      if (!pointed && !(close && h !== focus && far(h.cx, h.cy) < 300)) continue;
      const foot = pp(h.peak.x, h.peak.y, h.peak.z);
      const s = pp(h.peak.x, h.peak.y, h.top + 5);
      if (s[2] < NEAR) continue;
      const y = Math.max(34, s[1] - 14);
      g.beginPath();
      g.moveTo(foot[0], foot[1] - 3);
      g.lineTo(s[0], y + 6);
      g.strokeStyle = css([250, 240, 222], 0.55);
      g.lineWidth = 1;
      g.stroke();
      tag(h.p.name, s[0], y, pointed ? 13 : 11.5, pointed ? 1 : 0.85);
    }
    if (focus && focus.wards.length > 1) {
      focus.wards.forEach((w, i) => {
        const P = focus.at(-focus.w / 2 + w.x0 + w.w / 2, focus.qy1);
        const s = pp(P[0], P[1], 0);
        if (s[2] > NEAR) tag(w.name, s[0], s[1] + 20 + (i % 2) * 17, 10, 0.8);
      });
    }
    if (hover?.o) {
      const hit = hits.find((b) => b.o === hover.o);
      if (hit) {
        g.font = 'italic 500 15px "Iowan Old Style","Palatino","Georgia",serif';
        g.textAlign = 'center';
        g.shadowColor = 'rgba(6,8,22,0.95)';
        g.shadowBlur = 8;
        g.fillStyle = '#fff3d6';
        g.fillText(hover.o.f.n, hit.tx, hit.ty - 10);
        g.fillText(hover.o.f.n, hit.tx, hit.ty - 10);
        g.shadowBlur = 0;
        g.textAlign = 'start';
      }
    }
  }
  /** The frame: darker at its edges, and a fine grain over everything. */
  function finish() {
    const gr = g.createRadialGradient(vw * 0.5, vh * 0.5, vh * 0.34, vw * 0.5, vh * 0.5, Math.hypot(vw, vh) * 0.6);
    gr.addColorStop(0, 'rgba(6,8,24,0)');
    gr.addColorStop(1, 'rgba(6,8,24,0.52)');
    g.fillStyle = gr;
    g.fillRect(0, 0, vw, vh);
    if (!fast) {
      grainFill ??= g.createPattern(GRAIN, 'repeat');
      g.globalCompositeOperation = 'overlay';
      g.fillStyle = grainFill;
      g.fillRect(0, 0, vw, vh);
      g.globalCompositeOperation = 'source-over';
    }
  }

  function render() {
    setCam();
    g = ctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    hits.length = 0;
    const seen = (o, x, y) => {
      const d = far(x, y);
      o.d = d;
      o.fog = clamp(fogAt(d) + (lens && o.kind === 'building' && !o.ink ? 0.3 : 0) + (lens && lens !== 'ties' && (o.kind === 'bridge' || o.kind === 'boat') ? 0.25 : 0), 0, 0.96);
      const s = pp(x, y, 0);
      if (s[2] < NEAR) return false;
      const m = ((o.reach ?? 20) + 40) * (V.foc / s[2]) + 60;
      return s[0] > -m && s[0] < vw + m;
    };
    const order = things.filter((it) => seen(it.o, it.x, it.y)).sort((a, b) => b.o.d - a.o.d);
    const qorder = quays.filter((o) => {
      o.reach = o.hood.radius;
      return seen(o, o.ox, o.oy);
    }).sort((a, b) => b.d - a.d);
    sky();
    hills(false);
    water();
    reflect(order, qorder);
    surface();
    for (const o of qorder) drawQuay(o);
    for (const { o, x, y, h } of order) {
      drawThing(o, false);
      if (!answers(o)) continue;
      const oz = o.oz || 0;
      const b = pp(x, y, oz);
      const tp = pp(x, y, oz + Math.max(o.reach, 2.5));
      const hw = Math.max(6, (o.s / 2) * (V.foc / b[2]) * 1.05);
      hits.push({ o: o.kind === 'building' ? o : null, h, d: o.d, x0: b[0] - hw, x1: b[0] + hw, y0: tp[1] - 3, y1: b[1] + 5, tx: b[0], ty: tp[1] });
    }
    names();
    finish();
  }
  /** What moves: small lights crossing the bridges, and the lamp on each crane breathing. Slow. */
  function moving(t) {
    g = ctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const hidden = (s, d) => hits.some((b) => b.o && b.d < d - 8 && s[0] > b.x0 && s[0] < b.x1 && s[1] > b.y0 && s[1] < b.y1);
    for (const br of bridges) {
      for (const c of br.cars) {
        let u = (c.u + (t / 1000) * c.v * (60 / br.L)) % 1;
        if (c.back) u = 1 - u;
        const x = br.A[0] + br.ux * br.L * u;
        const y = br.A[1] + br.uy * br.L * u;
        const s = pp(x, y, br.zd(u) + 0.9);
        const d = far(x, y);
        if (s[2] < NEAR || hidden(s, d)) continue;
        if (M.lamps > 0.3) light(s, 0.5, (lens && lens !== 'ties' ? 0.35 : 0.95) * (1 - fogAt(d) * 0.4));
        else {
          g.fillStyle = css(M.line, 0.8);
          g.fillRect(s[0] - 1, s[1] - 1, 2.2, 1.6);
        }
      }
    }
    if (M.lamps > 0.3 && !STILL) {
      for (const it of things) {
        const L = it.o.pulse;
        if (!L || litOf(it.o) <= 0) continue;
        const s = pp(L.x, L.y, L.z);
        if (s[2] < NEAR || hidden(s, it.o.d)) continue;
        light(s, L.r, 0.5 * (0.5 + 0.5 * Math.sin(t * 0.0016 + it.o.seed)));
      }
    }
  }

  // ───────────────────────── moving about ─────────────────────────

  let dirty = true;
  let flight = null;
  let rough = false; // the last frame drawn was a quick one
  let lastInput = -1e9;
  let lastTick = 0;
  const STILL = q.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    vw = cv.clientWidth;
    vh = cv.clientHeight;
    cv.width = Math.round(vw * DPR);
    cv.height = Math.round(vh * DPR);
    HELD.width = cv.width;
    HELD.height = cv.height;
    dirty = true;
  }
  // Home: on the water inside the bay, looking up it into the light.
  const HOME = () => {
    const d = (DIST / 1.12) * Math.cos(0.016);
    return { yaw: VIEW.yaw, pitch: 0.016, zoom: 1.12, tx: VIEW.x + Math.sin(VIEW.yaw) * d, ty: VIEW.y - Math.cos(VIEW.yaw) * d };
  };
  const hold = (x, y) => [clamp(x, MOORING[0] - EXTENT - 120, MOORING[0] + EXTENT + 120), clamp(y, MOORING[1] - EXTENT - 120, MOORING[1] + 260)];
  /** Close in on one project, from the water in front of it and a little to one side. */
  const INSIDE = (h) => {
    const yaw = h.rot + 0.28;
    const dist = h.built ? clamp(Math.max(h.radius * 2.3, h.top * 2.5), 110, 430) : 110;
    const shift = Math.min(0.14, (vw * 0.12) / V.foc) * dist;
    return { yaw, pitch: h.built ? 0.13 : 0.1, zoom: DIST / dist, tx: h.cx + Math.cos(yaw) * shift, ty: h.cy + Math.sin(yaw) * shift };
  };
  function fly(to, ms = 1500) {
    const from = { ...cam };
    // Turn the short way round.
    to.yaw = from.yaw + Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
    flight = { from, to, t0: performance.now(), ms };
  }
  function enter(h) {
    focus = h;
    fly(INSIDE(h));
    document.body.classList.add('in-city');
    showHood(h);
  }
  function leave() {
    focus = null;
    document.body.classList.remove('in-city');
    fly(HOME());
    showHood(null);
  }
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
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      for (const key of ['yaw', 'pitch', 'tx', 'ty']) cam[key] = lerp(flight.from[key], flight.to[key], e);
      cam.zoom = Math.exp(lerp(Math.log(flight.from.zoom), Math.log(flight.to.zoom), e));
      if (u === 1) flight = null;
      dirty = true;
    }
    const busy = !STILL && (!!flight || (drag && drag.moved) || t - lastInput < 200);
    if (dirty || (rough && !busy)) {
      fast = busy;
      render();
      rough = fast;
      dirty = false;
      if (!fast) HELD.getContext('2d').drawImage(cv, 0, 0);
      moving(STILL ? 4000 : t);
      lastTick = t;
    } else if (!STILL && !rough && t - lastTick > 45) {
      // Nothing has changed but the small lights: lay down the frame we kept and move them.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(HELD, 0, 0);
      moving(t);
      lastTick = t;
    }
    requestAnimationFrame(frame);
  }

  function pick(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const b = hits[i];
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b;
    }
    const at = unpp(x, y);
    if (!at) return null;
    for (const h of hoods) {
      const [lx, ly] = h.local(at[0], at[1]);
      if (Math.abs(lx) <= h.qx + 1 && ly >= h.qy0 - 1 && ly <= h.qy1 + 1) return { h };
    }
    return null;
  }
  let drag = null;
  const spot = (e) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  cv.addEventListener('pointerdown', (e) => {
    setCam();
    const [x, y] = spot(e);
    drag = { x: e.clientX, y: e.clientY, cam: { ...cam }, at: unpp(x, Math.max(y, V.yh + 30)), moved: false, turn: e.shiftKey || e.button === 2 };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    const [x, y] = spot(e);
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      flight = null;
      if (drag.turn) {
        cam.yaw = drag.cam.yaw - dx * 0.004;
        cam.pitch = clamp(drag.cam.pitch + dy * 0.004, 0.012, 1.25);
      } else {
        // The water you took hold of stays under the pointer.
        Object.assign(cam, drag.cam);
        setCam();
        const now2 = unpp(x, Math.max(y, V.yh + 30));
        if (drag.at && now2) {
          [cam.tx, cam.ty] = hold(drag.cam.tx + drag.at[0] - now2[0], drag.cam.ty + drag.at[1] - now2[1]);
        }
      }
      lastInput = performance.now();
      dirty = true;
      return;
    }
    const h = pick(x, y);
    if ((h?.o ?? null) !== (hover?.o ?? null) || (h?.h ?? null) !== (hover?.h ?? null)) {
      hover = h;
      cv.style.cursor = h ? 'pointer' : 'grab';
      dirty = true;
    }
  });
  cv.addEventListener('pointerup', (e) => {
    const was = drag;
    drag = null;
    if (!was || was.moved) return;
    const [x, y] = spot(e);
    const h = pick(x, y);
    if (!h || !h.h) return showBuilding(null);
    if (h.h !== focus) enter(h.h);
    if (h.o) showBuilding(h.o, h.h);
    else showBuilding(null);
  });
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const [x, y] = spot(e);
      setCam();
      const before = unpp(x, Math.max(y, V.yh + 30));
      cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0014), Math.min(0.5, 200 / EXTENT), 6);
      setCam();
      const after = unpp(x, Math.max(y, V.yh + 30));
      if (before && after) {
        [cam.tx, cam.ty] = hold(cam.tx + before[0] - after[0], cam.ty + before[1] - after[1]);
      }
      flight = null;
      lastInput = performance.now();
      dirty = true;
    },
    { passive: false },
  );
  const LENS_KEYS = ['now', 'stage', 'age', 'ties'];
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === '0') leave();
    else if (e.key >= '1' && e.key <= '4') setLens(LENS_KEYS[Number(e.key) - 1]);
  });
  addEventListener('resize', resize);
  for (const b of document.querySelectorAll('#lenses button')) b.addEventListener('click', () => setLens(b.dataset.lens));

  // ───────────────────────── the few words ─────────────────────────

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const STAGE_WORDS = {
    concept: 'Staked out. Nothing built yet.',
    planned: 'Planned. The ground is laid.',
    designed: 'Designed. The frame is up.',
    building: 'Being built.',
    working: 'Standing and in use.',
    mature: 'Long standing, and returned to.',
  };
  const KIND_WORDS = { frontage: 'What people see and touch', works: 'Where the work is done', reservoir: 'Where data is kept', observatory: 'Where things are judged and learned', utility: 'What the rest runs on' };
  const TIE_WORDS = { road: 'a bridge to', track: 'a causeway to', ferry: 'a ferry to' };
  const LIVE_WORDS = { building: 'Lit: being worked on now', settled: 'Settled', quiet: 'Quiet lately', dormant: 'Dark: dormant', ruins: 'Dark: left standing' };

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
    const tallest = p.f.filter((f) => STAGES.indexOf(f.s) >= 3).sort((a, b) => rise(b, h) - rise(a, h))[0];
    const region = W.regions.find((r) => r.id === p.region)?.name;
    const linked = ties
      .get(h)
      .slice()
      .sort((a, b) => b.s - a.s)
      .map((t) => `<li><i style="background:${css(ACCENTS[t.other.col])}"></i>${TIE_WORDS[FORM.get(t.l) ?? 'ferry']} ${esc(t.other.p.name)}${t.l.carries ? `<b>${esc(t.l.carries)}</b>` : ''}</li>`)
      .join('');
    el.innerHTML =
      `<h2>${esc(p.name)}</h2><p class="what">${esc(p.note)}</p>` +
      `<p class="tally">${parts.length ? parts.join(' · ') : 'An idea. A pontoon and a lantern, waiting.'}</p>` +
      `<p class="facts">${LIVE_WORDS[p.live] ?? ''}${region ? ` · ${esc(region)}` : ''}${tallest ? ` · tallest: ${esc(tallest.n)}` : ''}</p>` +
      (h.wards.length > 1 ? `<ul>${h.wards.map((w) => `<li>${esc(w.name)}<b>${w.fs.length}</b></li>`).join('')}</ul>` : '') +
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
      `<h3>${esc(f.n)}</h3><p class="kind">${KIND_WORDS[f.k]}${f.lm ? ' · a release was named for it' : ''} · ${esc(o.ward ?? h.p.name)}</p>` +
      `<p>${STAGE_WORDS[f.s]}${pct}${again}</p>` +
      `<p class="facts">${plural(f.c, 'commit', 'commits')}${f.last ? ` · last worked on ${esc(f.last)}` : ''}</p>` +
      (f.note ? `<p class="note">${esc(f.note)}</p>` : '');
    el.hidden = false;
  }
  $('back').addEventListener('click', leave);

  // ───────────────────────── begin ─────────────────────────

  resize();
  Object.assign(cam, HOME());
  setCam();
  if (q.has('lens')) setLens(q.get('lens'));
  if (q.has('city')) {
    const h = hoods.find((x) => x.p.name.toLowerCase().startsWith(q.get('city').toLowerCase()));
    if (h) {
      focus = h;
      Object.assign(cam, INSIDE(h));
      document.body.classList.add('in-city');
      showHood(h);
    }
  } else if (q.has('gull')) {
    // From high up: the plan of the whole bay.
    const mid = [hoods.reduce((n, h) => n + h.cx, 0) / Math.max(1, hoods.length), hoods.reduce((n, h) => n + h.cy, 0) / Math.max(1, hoods.length)];
    Object.assign(cam, { yaw: VIEW.yaw, pitch: 1.2, zoom: clamp(260 / EXTENT, 0.12, 0.6), tx: mid[0], ty: mid[1] });
  } else if (!STILL) {
    // One authored moment: you come down out of the air onto the water as the lamps come on.
    Object.assign(cam, { ...HOME(), pitch: 0.2, zoom: 0.72 });
    fly(HOME(), 3200);
    document.body.classList.add('hinting');
  }

  // ───────────────────────── as half of the joined world ─────────────────────────
  // Opened with ?embed, this bay is where you arrive from the board. Its way back leads to
  // the board, not to the whole bay, and the page holding both asks this one to sleep while
  // the board is showing. Nothing here runs when the bay is opened on its own.
  if (q.has('embed')) {
    const say = (m) => parent.postMessage(m, '*');
    const back = $('back');
    back.textContent = 'Back to the board';
    back.hidden = false;
    back.addEventListener(
      'click',
      (e) => {
        e.stopImmediatePropagation();
        say({ pw: 'back', name: focus ? focus.p.name : null });
      },
      true,
    );
    const plain = showHood;
    showHood = (h) => {
      plain(h);
      back.hidden = false;
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
        if (h) enter(h);
      }
    });
    say({ pw: 'ready' });
  }
  requestAnimationFrame(frame);
})();
