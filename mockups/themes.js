// The looks. Each is the same world drawn in a different material.
//
// A theme answers: what colour is this tone in this light, how are edges drawn, what does
// the ground look like, and how is a name lettered. Working material, not the app's palette.

const THEMES = (() => {
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /** A sheet of fine noise, for the tooth of paper or the grain of a print. */
  function grain(size, strength, tint) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    let s = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = (s >>> 24) / 255;
      img.data[i] = tint[0];
      img.data[i + 1] = tint[1];
      img.data[i + 2] = tint[2];
      img.data[i + 3] = v * v * 255 * strength;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  /** A field of dots: the shadow of a screenprint. */
  function halftone(step, r, color) {
    const c = document.createElement('canvas');
    c.width = c.height = step * 2;
    const g = c.getContext('2d');
    g.fillStyle = color;
    for (const [x, y] of [[0, 0], [step, step], [step * 2, 0], [0, step * 2], [step * 2, step * 2]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  const DISTRICT_TONES = new Set(['roof', 'awning', 'flag', 'dome']);

  function make(spec) {
    const tone = Object.fromEntries(Object.entries(spec.tones).map(([k, v]) => [k, hex(v)]));
    const districts = spec.districts.map(hex);
    const warm = hex(spec.light.warm);
    const cool = hex(spec.light.cool);
    const nightTint = hex(spec.nightTint ?? '#0c1430');
    let night = false;
    let grainPattern = null;
    let dots = null;
    const N = (c) => (night ? mix(c, nightTint, spec.nightDepth ?? 0.66) : c);

    /** A base colour seen in a given light. */
    function shade(base, lit, face) {
      let i = spec.light.amb + spec.light.dif * lit;
      if (spec.light.steps) i = Math.round(i * spec.light.steps) / spec.light.steps;
      let c = i < 0.62 ? mix(base, cool, clamp((0.62 - i) * spec.light.shadow, 0, 0.85)) : mix(base, warm, clamp((i - 0.62) * spec.light.glow, 0, 0.7));
      if (spec.jitter && face) {
        // A painter never mixes the same colour twice.
        if (face.j === undefined) face.j = Math.random() - 0.5;
        c = [c[0] + face.j * spec.jitter, c[1] + face.j * spec.jitter * 0.8, c[2] + face.j * spec.jitter * 0.5];
      }
      return N(c);
    }

    const T = {
      /** Pixels to a world unit as drawn now; the engine keeps it current. */
      zoom: 2,
      id: spec.id,
      title: spec.title,
      tree: spec.tree,
      landThickness: spec.landThickness,
      districtColor: (i) => css(districts[i % districts.length]),

      sky(ctx, w, h, o) {
        night = o.night;
        spec.sky(ctx, w, h, { ...o, tone, css, mix, N });
      },
      fill(ctx, name, c, i, opts) {
        let col = tone[name] ?? tone.land;
        if (name === 'plot') col = mix(tone.cityGround, districts[i % districts.length], spec.plotTint ?? 0.4);
        if (name === 'hood') {
          // A neighbourhood's own ground: its colour, quieter where the project has gone quiet,
          // barely there where it is only an idea, a little stronger under the pointer.
          const tint = (spec.plotTint ?? 0.4) * (opts.idea ? 0.3 : opts.dim ? 0.38 : 1) + (opts.hot ? 0.12 : 0);
          col = mix(tone.block ?? tone.cityGround, districts[i % districts.length], tint);
        }
        ctx.fillStyle = css(N(col));
        ctx.fill();
        const edge = spec.groundEdge?.[name];
        if (edge) {
          ctx.strokeStyle = night ? css(N(hex(edge[0])), edge[2] ?? 1) : edge[0];
          ctx.lineWidth = edge[1];
          ctx.stroke();
        }
      },
      paint(ctx, name, lit, o, face) {
        let base;
        if (name === 'window' || name === 'door' || name === 'glass' || name === 'clock' || name === 'slit') {
          // Glass is dark by day and lit from inside at night.
          if (night && name !== 'slit') {
            ctx.fillStyle = spec.lamp ?? '#ffd27a';
            ctx.fill();
            return;
          }
          base = tone[name] ?? tone.window;
          ctx.fillStyle = css(N(name === 'clock' ? tone.clock ?? tone.ledge : base));
          ctx.fill();
          if (spec.outline && spec.outline.windows) {
            ctx.strokeStyle = spec.outline.color;
            ctx.lineWidth = spec.outline.width * 0.6;
            ctx.stroke();
          }
          return;
        }
        if (DISTRICT_TONES.has(name) && o.kind === 'building') base = districts[o.district % districts.length];
        else if (name === 'hill') base = mix(tone.hill, tone.hillTop ?? tone.hill, clamp(face.tint / 3, 0, 1));
        else base = tone[name] ?? tone.wall;
        // A project gone quiet loses its colour.
        if (o.dim) base = mix(base, tone.block ?? tone.land, 0.55);
        if (o.outskirts && name === 'wall') base = mix(base, tone.block ?? tone.land, 0.35);
        if (o.kind === 'house' && name === 'wall' && spec.houseWalls) {
          if (o.hw === undefined) o.hw = Math.floor(Math.random() * spec.houseWalls.length);
          base = hex(spec.houseWalls[o.hw]);
        }
        ctx.fillStyle = css(shade(base, lit, face));
        ctx.fill();
        if (spec.outline) {
          ctx.strokeStyle = night && spec.outline.night ? spec.outline.night : spec.outline.color;
          ctx.lineWidth = spec.outline.width * clamp((T.zoom ?? 2) / 2.4, 0.28, 1);
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      },
      stroke(ctx, name, w) {
        const c = tone[name] ?? tone.metal;
        ctx.strokeStyle = css(N(c));
        ctx.lineWidth = w * (spec.lineWeight ?? 1);
        ctx.lineCap = 'round';
        ctx.setLineDash(name === 'string' ? [w * 2.2, w * 2.2] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      },
      road(ctx, grade, z) {
        spec.road(ctx, grade, z, { tone, css, N });
      },
      shadowStyle(ctx, isNight) {
        if (spec.shadowDots) {
          dots ??= ctx.createPattern(halftone(3, 1.05, spec.shadowDots), 'repeat');
          ctx.fillStyle = dots;
        } else ctx.fillStyle = isNight ? 'rgba(4,8,24,0.34)' : spec.shadow;
        if (spec.shadowBlend) ctx.globalCompositeOperation = spec.shadowBlend;
      },
      vehicle(ctx, x, y, s) {
        ctx.fillStyle = night ? '#ffd27a' : spec.vehicle;
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        if (spec.outline) {
          ctx.strokeStyle = spec.outline.color;
          ctx.lineWidth = spec.outline.width;
          ctx.stroke();
        }
      },
      label(ctx, name, x, y, rank, hot, swatch) {
        spec.label(ctx, name, x, y, rank, hot, { night, swatch });
      },
      tip(ctx, name, x, y) {
        spec.label(ctx, name, x, y, 2, true, { night, tip: true });
      },
      regionName(ctx, rg, cam) {
        spec.regionName?.(ctx, rg, cam, { night, tone, css, N });
      },
      landDetail(ctx, env) {
        spec.landDetail?.(ctx, env, { tone, css, mix, N, night, hex });
      },
      haze(ctx, w, h, isNight) {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        const c = isNight ? [14, 20, 44] : hex(spec.hazeColor ?? '#ffffff');
        g.addColorStop(0, css(c, 0.82));
        g.addColorStop(0.55, css(c, 0.28));
        g.addColorStop(1, css(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h * 0.5);
      },
      tie(ctx, grade, hot, zoom, faded) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const w = Math.max(1.4, (grade === 'road' ? 2.3 : grade === 'track' ? 1.3 : 0.8) * zoom);
        ctx.setLineDash(grade === 'surveyed' ? [w * 0.6, w * 2.4] : []);
        ctx.globalAlpha = faded ? 0.25 : 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = w + Math.max(1.5, zoom * 0.5);
        ctx.stroke();
        ctx.strokeStyle = hot ? (spec.tieHot ?? '#262c3a') : (spec.tieColor ?? '#d8553a');
        ctx.lineWidth = w;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      },
      stop(ctx, x, y, r, hot) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = hot ? (spec.tieHot ?? '#262c3a') : (spec.tieColor ?? '#d8553a');
        ctx.lineWidth = Math.max(1.2, r * 0.45);
        ctx.stroke();
      },
      finish(ctx, w, h) {
        if (spec.grain) {
          grainPattern ??= ctx.createPattern(grain(160, spec.grain[0], hex(spec.grain[1])), 'repeat');
          ctx.save();
          ctx.globalCompositeOperation = spec.grain[2] ?? 'multiply';
          ctx.fillStyle = grainPattern;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
        spec.finish?.(ctx, w, h, { night });
      },
    };
    return T;
  }

  /** Letter a word along the ground, spaced out, the way a map letters a country. */
  function groundWord(ctx, text, x, y, size, font, fill, spacing = 0.5) {
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = fill;
    ctx.textBaseline = 'middle';
    const chars = [...text.toUpperCase()];
    const widths = chars.map((c) => ctx.measureText(c).width + size * spacing);
    let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, y);
      cx += widths[i];
    }
  }
  const sizeFor = (rank) => [9, 9, 10, 10, 11, 12.5, 14][rank] ?? 11;

  // ───────────────────────── 1. The pop-up atlas ─────────────────────────
  // A paper model on a desk by a window. White card architecture, roofs and plots in
  // coloured stock, hills as stacked sheets, the whole thing standing up out of one page.

  const popup = make({
    id: 'popup',
    title: 'The Pop-up Atlas',
    tree: 'card',
    landThickness: 5,
    tones: {
      land: '#f7f4ec', cliff: '#d9d3c4', cityGround: '#ead9b4', wall: '#fdfcf9', ledge: '#ffffff', roof2: '#c9b98f',
      window: '#6f8794', door: '#56707d', glass: '#9fb6c0', clock: '#ffffff', slit: '#4a6270',
      brick: '#f3efe6', soot: '#a9a394', tank: '#f7f5ef', metal: '#7d878c', stone: '#f4f1e9', gold: '#e8b93c',
      slab: '#dccaa2', stake: '#e4572e', string: '#e4572e', frame: '#9aa6ab', scaffold: '#e4572e', crane: '#e4572e',
      trunk: '#8c8676', tree: '#2f9a72', hill: '#f1eee6', hillTop: '#ffffff', hillside: '#d8d2c3', pole: '#ffffff',
    },
    districts: ['#ef6a4c', '#2f9c95', '#f2b632', '#6d5fc7', '#7fae45', '#2d7dd2', '#d9508a'],
    plotTint: 0.5,
    light: { amb: 0.46, dif: 0.6, warm: '#ffffff', cool: '#6f7c98', shadow: 1.7, glow: 0.3 },
    outline: { color: 'rgba(46,54,72,0.22)', width: 0.6, night: 'rgba(0,0,0,0.3)' },
    shadow: 'rgba(40,52,84,0.3)',
    shadowBlend: 'multiply',
    vehicle: '#e4572e',
    lamp: '#ffd98a',
    nightTint: '#141b3a',
    nightDepth: 0.58,
    grain: [0.05, '#40382c'],
    groundEdge: { land: ['rgba(60,66,80,0.22)', 0.8], cityGround: ['rgba(60,66,80,0.10)', 0.6], plot: ['rgba(60,66,80,0.14)', 0.6] },
    sky(ctx, w, h, o) {
      // The page the land is cut from: pale blue stock, with the book's gutter down the middle.
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, o.night ? '#16223f' : '#2f7391');
      g.addColorStop(1, o.night ? '#0f1830' : '#255f7c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const gut = ctx.createLinearGradient(w / 2 - 70, 0, w / 2 + 70, 0);
      gut.addColorStop(0, 'rgba(40,60,80,0)');
      gut.addColorStop(0.5, o.night ? 'rgba(0,0,0,0.3)' : 'rgba(8,30,48,0.26)');
      gut.addColorStop(1, 'rgba(40,60,80,0)');
      ctx.fillStyle = gut;
      ctx.fillRect(w / 2 - 70, 0, 140, h);
    },
    road(ctx, grade, z, { css, N }) {
      // Paper ribbons: a pricked line for a loose tie, a wide strip for a strong one.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (grade === 'surveyed') {
        ctx.setLineDash([1.5, 5]);
        ctx.strokeStyle = css(N([92, 104, 122]));
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const w = grade === 'road' ? Math.min(11, Math.max(4, 5.2 * z)) : Math.min(5, Math.max(1.8, 2.2 * z));
      ctx.strokeStyle = css(N([40, 52, 84]), 0.22);
      ctx.lineWidth = w + 2.2;
      ctx.stroke();
      ctx.strokeStyle = css(N(grade === 'road' ? [228, 87, 46] : [201, 185, 143]));
      ctx.lineWidth = w;
      ctx.stroke();
    },
    regionName(ctx, rg, cam, { night }) {
      groundWord(ctx, rg.name, rg.x, rg.y + rg.r * 0.5, 62, '"Futura", "Avenir Next", sans-serif', night ? 'rgba(255,255,255,0.07)' : 'rgba(70,80,100,0.16)', 0.55);
    },
    label(ctx, name, x, y, rank, hot, o) {
      // A paper tab, standing behind the city it names.
      const size = o.tip ? 12 : sizeFor(rank);
      ctx.font = `${rank >= 5 ? 600 : 500} ${size}px "Futura", "Avenir Next", sans-serif`;
      const text = name.toUpperCase();
      const tw = ctx.measureText(text).width + size * 0.12 * text.length;
      const pw = tw + size * 1.3;
      const ph = size * 1.9;
      ctx.fillStyle = 'rgba(40,50,70,0.2)';
      ctx.fillRect(x - pw / 2 + 2, y - ph + 3, pw, ph);
      ctx.fillStyle = hot ? '#e4572e' : '#ffffff';
      ctx.fillRect(x - pw / 2, y - ph, pw, ph);
      ctx.fillStyle = hot ? '#ffffff' : '#2b3345';
      ctx.textBaseline = 'middle';
      let cx = x - tw / 2;
      for (const ch of text) {
        ctx.fillText(ch, cx, y - ph / 2 + 0.5);
        cx += ctx.measureText(ch).width + size * 0.12;
      }
    },
  });

  // ───────────────────────── 2. The painted panorama ─────────────────────────
  // A hand-painted bird's-eye view: gouache on rough paper, warm sun and violet shade,
  // terracotta and slate roofs, fields between the towns.

  const panorama = make({
    id: 'panorama',
    title: 'The Painted Panorama',
    tree: 'blob',
    landThickness: 9,
    tones: {
      land: '#a9b36a', cliff: '#7d6a4a', cityGround: '#d9c59a', wall: '#f0deb8', ledge: '#f7ebd0', roof2: '#b9603f',
      window: '#4b4a5e', door: '#5c4336', glass: '#7f8fa3', clock: '#f7ebd0', slit: '#33354a',
      brick: '#b56a4a', soot: '#5a4a44', tank: '#c9c3ae', metal: '#4f4a47', stone: '#d8cdb4', gold: '#e2a93b',
      slab: '#c8b68e', stake: '#7a4a2a', string: '#7a4a2a', frame: '#8a6a45', scaffold: '#8a5a32', crane: '#9a3b2a',
      trunk: '#5e4630', tree: '#4f7a3c', hill: '#8ea457', hillTop: '#b7c279', hillside: '#6f8546', pole: '#3a261e',
    },
    houseWalls: ['#f0deb8', '#ecd0a8', '#e9c6b0', '#f4e8cf', '#dcc7a0'],
    districts: ['#b9502f', '#4d6d86', '#c9912f', '#7f8f5a', '#93425a', '#6d5a48', '#2f7a78'],
    plotTint: 0.22,
    light: { amb: 0.42, dif: 0.66, warm: '#ffe6ad', cool: '#4b3f78', shadow: 1.25, glow: 0.75 },
    jitter: 16,
    outline: { color: 'rgba(58,38,30,0.34)', width: 0.7, night: 'rgba(0,0,0,0.4)' },
    shadow: 'rgba(52,38,96,0.3)',
    shadowBlend: 'multiply',
    vehicle: '#f7ebd0',
    nightTint: '#0c1c52',
    nightDepth: 0.58,
    grain: [0.09, '#3a2a18'],
    groundEdge: { land: ['rgba(255,244,210,0.55)', 2.2], cityGround: ['rgba(90,62,36,0.25)', 0.8], plot: ['rgba(90,62,36,0.2)', 0.6] },
    sky(ctx, w, h, o) {
      // The sea, laid on in washes: deeper at the edges of the sheet.
      const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.2, w / 2, h * 0.52, Math.max(w, h) * 0.75);
      if (o.night) {
        g.addColorStop(0, '#1c3252');
        g.addColorStop(1, '#0b1630');
      } else {
        g.addColorStop(0, '#8fc0c4');
        g.addColorStop(0.6, '#5f9db0');
        g.addColorStop(1, '#3f7896');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    landDetail(ctx, env, { css, N, hex }) {
      // Fields: patches of ochre and green, laid between the towns like a quilt.
      const cols = ['#c2b25c', '#8fa04f', '#d1bb72', '#7f9647', '#b9a650', '#9aae62'].map(hex);
      let s = 99;
      const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
      for (let i = 0; i < 260; i++) {
        const x = 300 + r() * 4200;
        const y = 200 + r() * 2800;
        const w = 70 + r() * 150;
        const d = 50 + r() * 110;
        const a = r() * 0.5 - 0.25;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map((p) => env.proj(x + p[0] * ca - p[1] * sa, y + p[0] * sa + p[1] * ca, 0));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < 4; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.closePath();
        ctx.fillStyle = css(N(cols[i % cols.length]), 0.55);
        ctx.fill();
      }
    },
    road(ctx, grade, z, { css, N }) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (grade === 'surveyed') {
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = css(N([122, 88, 52]), 0.7);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const w = grade === 'road' ? Math.min(10, Math.max(3.4, 4.4 * z)) : Math.min(4.5, Math.max(1.6, 1.8 * z));
      ctx.strokeStyle = css(N([120, 92, 58]), 0.5);
      ctx.lineWidth = w + 1.5;
      ctx.stroke();
      ctx.strokeStyle = css(N([236, 218, 176]));
      ctx.lineWidth = w;
      ctx.stroke();
    },
    regionName(ctx, rg, cam, { night }) {
      groundWord(ctx, rg.name, rg.x, rg.y + rg.r * 0.5, 56, '"Baskerville", "Hoefler Text", Georgia, serif', night ? 'rgba(255,240,200,0.08)' : 'rgba(52,62,24,0.2)', 0.6);
    },
    label(ctx, name, x, y, rank, hot, o) {
      // A ribbon, lettered by hand.
      const size = (o.tip ? 13 : sizeFor(rank)) + 2;
      ctx.font = `italic ${rank >= 5 ? 700 : 500} ${size}px "Baskerville", "Hoefler Text", Georgia, serif`;
      const tw = ctx.measureText(name).width;
      const pw = tw + size * 1.4;
      const ph = size * 1.55;
      ctx.beginPath();
      ctx.moveTo(x - pw / 2 - 6, y - ph);
      ctx.lineTo(x + pw / 2 + 6, y - ph);
      ctx.lineTo(x + pw / 2, y - ph / 2);
      ctx.lineTo(x + pw / 2 + 6, y);
      ctx.lineTo(x - pw / 2 - 6, y);
      ctx.lineTo(x - pw / 2, y - ph / 2);
      ctx.closePath();
      ctx.fillStyle = hot ? '#9a3b2a' : '#f6ead0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,38,30,0.55)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.fillStyle = hot ? '#fbf3df' : '#3a261e';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y - ph / 2 + 0.5);
      ctx.textAlign = 'start';
    },
    finish(ctx, w, h, o) {
      // The sheet darkens a little toward its edges, as a painting does under glass.
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(40,24,10,0)');
      g.addColorStop(1, o.night ? 'rgba(0,0,0,0.35)' : 'rgba(40,24,10,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  });

  // ───────────────────────── 3. The street-fair print ─────────────────────────
  // A screenprinted cut-paper city: flat inks, black keyline, halftone shade, the grain of
  // the print. Colour is spent per district.

  const print = make({
    id: 'print',
    title: 'The Street-fair Print',
    tree: 'blob',
    landThickness: 8,
    tones: {
      land: '#f3ede0', cliff: '#111111', cityGround: '#fffaf0', wall: '#fffaf0', ledge: '#fffaf0', roof2: '#111111',
      window: '#111111', door: '#111111', glass: '#1c7fe2', clock: '#fffaf0', slit: '#111111',
      brick: '#ff6a00', soot: '#111111', tank: '#c9e250', metal: '#111111', stone: '#fffaf0', gold: '#ffc400',
      slab: '#e9e0cc', stake: '#ee1f8a', string: '#111111', frame: '#111111', scaffold: '#ee1f8a', crane: '#ee1f8a',
      trunk: '#111111', tree: '#3ea83e', hill: '#c9e250', hillTop: '#c9e250', hillside: '#3ea83e', pole: '#111111',
    },
    houseWalls: ['#fffaf0', '#ff6a00', '#ee1f8a', '#7b57f0', '#1c7fe2', '#fffaf0'],
    districts: ['#ff6a00', '#ee1f8a', '#7b57f0', '#1c7fe2', '#3ea83e', '#ffc400'],
    plotTint: 0.9,
    light: { amb: 0.5, dif: 0.6, warm: '#ffffff', cool: '#111111', shadow: 0.9, glow: 0, steps: 2 },
    outline: { color: '#111111', width: 1.15, windows: false },
    lineWeight: 1.5,
    shadow: 'rgba(123,87,240,0.5)',
    shadowBlend: 'multiply',
    vehicle: '#ffc400',
    lamp: '#ffc400',
    nightTint: '#1b1040',
    nightDepth: 0.62,
    grain: [0.07, '#111111'],
    groundEdge: { land: ['#111111', 2.2], cityGround: ['#111111', 1.4], plot: ['#111111', 1.2] },
    sky(ctx, w, h, o) {
      ctx.fillStyle = o.night ? '#1b1040' : '#7b57f0';
      ctx.fillRect(0, 0, w, h);
    },
    road(ctx, grade, z) {
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      if (grade === 'surveyed') {
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const w = grade === 'road' ? Math.min(12, Math.max(4.5, 6 * z)) : Math.min(5, Math.max(2, 2.4 * z));
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = w + 2.4;
      ctx.stroke();
      ctx.strokeStyle = grade === 'road' ? '#ffc400' : '#fffaf0';
      ctx.lineWidth = w;
      ctx.stroke();
    },
    regionName(ctx, rg, cam, { night }) {
      groundWord(ctx, rg.name, rg.x, rg.y + rg.r * 0.5, 84, '"Futura-CondensedExtraBold", "Futura", "Arial Narrow", sans-serif', night ? 'rgba(255,255,255,0.08)' : 'rgba(123,87,240,0.3)', 0.1);
    },
    label(ctx, name, x, y, rank, hot, o) {
      // A reversed bar, as on a bill.
      const size = (o.tip ? 12 : sizeFor(rank)) + 1;
      ctx.font = `${size}px "Futura-CondensedExtraBold", "Futura", "Arial Narrow", sans-serif`;
      const text = name.toUpperCase();
      const tw = ctx.measureText(text).width + text.length * size * 0.06;
      const pw = tw + size * 1.1;
      const ph = size * 1.7;
      ctx.save();
      ctx.translate(x, y - ph / 2);
      ctx.rotate(-0.035);
      ctx.fillStyle = hot ? '#ee1f8a' : '#111111';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = hot ? '#111111' : rank >= 5 ? '#ffc400' : '#fffaf0';
      ctx.textBaseline = 'middle';
      let cx = -tw / 2;
      for (const ch of text) {
        ctx.fillText(ch, cx, 1);
        cx += ctx.measureText(ch).width + size * 0.06;
      }
      ctx.restore();
    },
  });

  // ───────────────────────── 4. The category standard ─────────────────────────
  // What a city-building strategy game looks like, played straight: green land, blue sea,
  // bright roofs, soft light, banners over the cities.

  const standard = make({
    id: 'standard',
    title: 'The Strategy Board',
    tree: 'cone',
    landThickness: 16,
    tones: {
      land: '#7fb857', cliff: '#8a6b48', cityGround: '#d7c7a2', wall: '#f3ead8', ledge: '#fbf5e8', roof2: '#b5563d',
      window: '#3b5a78', door: '#5a3e2e', glass: '#7fb2d9', clock: '#fbf5e8', slit: '#2b3c52',
      brick: '#a65a44', soot: '#4a4440', tank: '#b9c4cc', metal: '#55606a', stone: '#d9d2c2', gold: '#f2c13c',
      slab: '#c2b594', stake: '#c8402f', string: '#f2e9d0', frame: '#b38a52', scaffold: '#c99a4e', crane: '#f0b323',
      trunk: '#6b4a2f', tree: '#3d8a4a', hill: '#6fae4d', hillTop: '#9ccd70', hillside: '#8b7a5a', pole: '#ffffff',
    },
    houseWalls: ['#f3ead8', '#ead9bb', '#f6efe2'],
    districts: ['#d8463a', '#3777c8', '#f0b323', '#8a4fc0', '#2fa58f', '#e67f2c', '#c94a8a'],
    plotTint: 0.2,
    light: { amb: 0.5, dif: 0.6, warm: '#fff3cf', cool: '#2c3a66', shadow: 1.1, glow: 0.5 },
    outline: { color: 'rgba(30,34,48,0.22)', width: 0.5, night: 'rgba(0,0,0,0.35)' },
    shadow: 'rgba(22,34,60,0.3)',
    shadowBlend: 'multiply',
    vehicle: '#ffffff',
    nightTint: '#0b1638',
    nightDepth: 0.68,
    groundEdge: { land: ['rgba(232,244,200,0.6)', 1.6], cityGround: ['rgba(90,70,40,0.3)', 0.8], plot: ['rgba(90,70,40,0.25)', 0.6] },
    sky(ctx, w, h, o) {
      const g = ctx.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.25, w / 2, h * 0.52, Math.max(w, h) * 0.8);
      if (o.night) {
        g.addColorStop(0, '#16335e');
        g.addColorStop(1, '#081429');
      } else {
        g.addColorStop(0, '#6fc3e6');
        g.addColorStop(0.55, '#3f9bd2');
        g.addColorStop(1, '#2a6fae');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    landDetail(ctx, env, { css, N, hex }) {
      // Darker and lighter grass, in broad soft patches.
      const cols = ['#6ea84b', '#8cc465', '#74b052'].map(hex);
      let s = 7;
      const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
      for (let i = 0; i < 70; i++) {
        const x = 200 + r() * 4400;
        const y = 100 + r() * 3000;
        const rad = 120 + r() * 240;
        ctx.beginPath();
        for (let j = 0; j < 12; j++) {
          const a = (j / 12) * Math.PI * 2;
          const p = env.proj(x + Math.cos(a) * rad * (0.8 + r() * 0.4), y + Math.sin(a) * rad * (0.8 + r() * 0.4), 0);
          if (j === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
        ctx.fillStyle = css(N(cols[i % cols.length]), 0.5);
        ctx.fill();
      }
    },
    road(ctx, grade, z, { css, N }) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (grade === 'surveyed') {
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = css(N([240, 232, 200]), 0.8);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const w = grade === 'road' ? Math.min(10, Math.max(3.6, 5 * z)) : Math.min(4.5, Math.max(1.8, 2 * z));
      ctx.strokeStyle = css(N([104, 84, 56]), 0.6);
      ctx.lineWidth = w + 1.8;
      ctx.stroke();
      ctx.strokeStyle = css(N(grade === 'road' ? [226, 208, 164] : [198, 178, 132]));
      ctx.lineWidth = w;
      ctx.stroke();
    },
    regionName(ctx, rg, cam, { night }) {
      groundWord(ctx, rg.name, rg.x, rg.y + rg.r * 0.5, 58, '"Avenir Next", "Trebuchet MS", sans-serif', night ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)', 0.5);
    },
    label(ctx, name, x, y, rank, hot, o) {
      // A banner over the city, as a game hangs one.
      const size = (o.tip ? 12 : sizeFor(rank)) + 1;
      ctx.font = `600 ${size}px "Avenir Next", "Trebuchet MS", sans-serif`;
      const tw = ctx.measureText(name).width;
      const pw = tw + size * 1.6;
      const ph = size * 1.8;
      const r = ph / 2;
      ctx.beginPath();
      ctx.moveTo(x - pw / 2 + r, y - ph);
      ctx.arcTo(x + pw / 2, y - ph, x + pw / 2, y, r);
      ctx.arcTo(x + pw / 2, y, x - pw / 2, y, r);
      ctx.arcTo(x - pw / 2, y, x - pw / 2, y - ph, r);
      ctx.arcTo(x - pw / 2, y - ph, x + pw / 2, y - ph, r);
      ctx.closePath();
      ctx.fillStyle = hot ? '#f0b323' : 'rgba(20,30,52,0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hot ? '#1a2238' : '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y - ph / 2 + 0.5);
      ctx.textAlign = 'start';
    },
  });

  // ───────────────────────── A sketch look ─────────────────────────
  // A plain massing model, for judging a structure and not a finish: pale ground, white
  // walls, one colour to a project.

  const sketch = make({
    id: 'sketch',
    title: 'One Great City (sketch)',
    tree: 'blob',
    tones: {
      land: '#c9c5bb', cliff: '#c9c5bb', cityGround: '#e4e0d6', block: '#dedad0', wall: '#fbfaf7', ledge: '#ffffff', roof2: '#cfcabd', roof3: '#c4bfb2',
      window: '#6f8794', door: '#56707d', glass: '#9fb6c0', clock: '#ffffff', slit: '#4a6270',
      brick: '#efebe2', soot: '#a39d8e', tank: '#f4f2ec', metal: '#7d868a', stone: '#f1eee6', gold: '#e2b03a',
      slab: '#d2cdbf', stake: '#d8553a', string: '#d8553a', frame: '#98a3a8', scaffold: '#d8553a', crane: '#d8553a',
      trunk: '#8a8474', tree: '#7fa588', hill: '#dedad0', hillTop: '#eeeae0', hillside: '#c9c5bb', pole: '#ffffff',
    },
    districts: ['#d8553a', '#2f8f8a', '#e0a52e', '#6a5cc0', '#6f9e3d', '#2f78c8', '#c84c84', '#8a6a3c', '#3aa0c0', '#a8452c', '#4f7f5c', '#b08a1e'],
    plotTint: 0.34,
    light: { amb: 0.5, dif: 0.56, warm: '#ffffff', cool: '#6c7892', shadow: 1.5, glow: 0.3 },
    shadow: 'rgba(40,48,72,0.26)',
    shadowBlend: 'multiply',
    vehicle: '#d8553a',
    hazeColor: '#eef1f2',
    nightTint: '#131a38',
    nightDepth: 0.6,
    sky(ctx, w, h, o) {
      // No sea and no edge: the streets are the ground everywhere.
      ctx.fillStyle = o.night ? '#1a2038' : '#c9c5bb';
      ctx.fillRect(0, 0, w, h);
    },
    road() {},
    label(ctx, name, x, y, rank, hot, o) {
      const size = o.tip ? 12 : [11, 11, 11.5, 12, 13, 15, 17][rank] ?? 12;
      ctx.font = `600 ${size}px "Avenir Next", "Helvetica Neue", sans-serif`;
      const tw = ctx.measureText(name).width;
      const sw = o.swatch ? size * 1.1 : 0;
      const pw = tw + size * 1.5 + sw;
      const ph = size * 1.9;
      ctx.fillStyle = 'rgba(30,36,52,0.22)';
      ctx.fillRect(x - pw / 2 + 1.5, y - ph + 3, pw, ph);
      ctx.fillStyle = hot ? '#262c3a' : '#ffffff';
      ctx.fillRect(x - pw / 2, y - ph, pw, ph);
      if (o.swatch) {
        // The neighbourhood's own colour, so that a name and its ground are told together.
        ctx.fillStyle = o.swatch;
        ctx.fillRect(x - pw / 2, y - ph, sw * 0.55, ph);
      }
      ctx.fillStyle = hot ? '#ffffff' : '#262c3a';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + sw * 0.28, y - ph / 2 + 0.5);
      ctx.textAlign = 'start';
    },
  });

  // `make` and its helpers are handed out too, so that a sketch can bring a look of its own:
  //   THEMES.mine = THEMES.make({ ...spec })
  return { popup, panorama, print, standard, sketch, make, groundWord, hex, mix, css, clamp };
})();
