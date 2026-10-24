// Sand: a top-down zen sand garden (karesansui). Drag to rake, tap to set a stone, tap a stone to nudge it.
// Shares game.js's audio engine and sound/music settings through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("sand");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, S = 1; // S scales sizes to the screen (1 on an 800px screen)

  const KEY = "drift-sand-v1";
  const opts = { tines: 5, stones: null };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.tines = clamp(Math.round(+opts.tines) || 5, 2, 8);
  if (!Array.isArray(opts.stones)) opts.stones = null;
  const here = () => document.body.dataset.place === "sand";

  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  // small seeded random, so a stone keeps its shape across reloads
  const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const SAND = [216, 205, 184];

  // shared value noise for the sand's texture
  const hash2 = (x, y, salt = 0) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, salt = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash2(ix, iy, salt), hash2(ix + 1, iy, salt), u), lerp(hash2(ix, iy + 1, salt), hash2(ix + 1, iy + 1, salt), u), v);
  };

  // ---------- Sand: a height field, lit from the top left ----------
  // Grooves dip to -AMP, the ridges between them rise to +AMP, smooth sand sits at 0.
  const AMP = 1;
  let C = 2, gw = 0, gh = 0, SP = 16, G = 0.5; // cell size (px), grid size, groove spacing (px), height-to-slope factor
  let hf = null, micro = null, albedo = null, img = null, dirty = null;
  const field = document.createElement("canvas");
  const fctx = field.getContext("2d");
  let grainLayer = null; // full-resolution sand grain
  // a low afternoon sun: long soft relief in the grooves
  const SUN = (() => { const l = [-0.52, -0.62, 0.58], n = Math.hypot(...l); return l.map((c) => c / n); })();

  const prof = (d) => -Math.cos((d / SP) * TAU) * AMP; // the cross-section of raked sand, d px from a groove

  function markDirty(x0, y0, x1, y1) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(gw - 1, Math.ceil(x1)); y1 = Math.min(gh - 1, Math.ceil(y1));
    if (x1 < x0 || y1 < y0) return;
    if (!dirty) dirty = [x0, y0, x1, y1];
    else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], y0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], y1); }
  }

  function relight() {
    if (!dirty) return;
    const [x0, y0, x1, y1] = dirty;
    dirty = null;
    const d = img.data, Lx = SUN[0], Ly = SUN[1], Lz = SUN[2], flat = 1 / Lz;
    const hAt = (i) => hf[i] + micro[i];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * gw + x;
        const c = hAt(i), l = hAt(x > 0 ? i - 1 : i), r = hAt(x < gw - 1 ? i + 1 : i), u = hAt(y > 0 ? i - gw : i), b = hAt(y < gh - 1 ? i + gw : i);
        // surface normal from the slope, lambert light relative to flat sand
        const nx = (l - r) * G, ny = (u - b) * G, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const diff = Math.max(0, (nx * Lx + ny * Ly + Lz) * inv) * flat;
        // groove bottoms catch less sky; the crumbly crests a touch more
        const cavity = (l + r + u + b - 4 * c) * 0.06;
        const lum = (0.5 + 0.5 * diff) * (1 + hf[i] * 0.03 - cavity) * albedo[i];
        // warm where the sun hits, cool grey-blue in the shade
        const p = i * 4;
        d[p] = SAND[0] * (lum * 1.05 - 0.05);
        d[p + 1] = SAND[1] * lum;
        d[p + 2] = SAND[2] * (lum * 0.92 + 0.08);
      }
    }
    fctx.putImageData(img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  function buildField() {
    const old = hf, ogw = gw, ogh = gh;
    C = clamp(Math.min(W, H) / 520, 1, 2);
    SP = Math.max(11, 16 * S);
    G = (SP * 0.09) / (2 * C); // grooves about a tenth of their spacing deep
    gw = Math.ceil(W / C);
    gh = Math.ceil(H / C);
    hf = new Float32Array(gw * gh);
    micro = new Float32Array(gw * gh);
    albedo = new Float32Array(gw * gh);
    const salt = (Math.random() * 1e9) | 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const px = x * C, py = y * C, i = y * gw + x;
        // grain you can see in relief, at a couple of scales
        micro[i] = (hash2(x, y, salt) - 0.5) * 0.22 + (vnoise(px / 2.6, py / 2.6, salt + 1) - 0.5) * 0.3;
        // faint tonal drifts across the garden, and single darker or paler grains
        const g = hash2(x, y, salt + 2);
        albedo[i] = 1 + (vnoise(px / 140, py / 140, salt + 3) - 0.5) * 0.07 + (vnoise(px / 22, py / 22, salt + 4) - 0.5) * 0.04 + (g > 0.985 ? 0.12 : g < 0.02 ? -0.14 : (g - 0.5) * 0.05);
      }
    }
    if (old) {
      // keep the raking, stretched to the new size
      for (let y = 0; y < gh; y++) {
        const fy = clamp(((y + 0.5) / gh) * ogh - 0.5, 0, ogh - 1), y0 = fy | 0, y1 = Math.min(ogh - 1, y0 + 1), v = fy - y0;
        for (let x = 0; x < gw; x++) {
          const fx = clamp(((x + 0.5) / gw) * ogw - 0.5, 0, ogw - 1), x0 = fx | 0, x1 = Math.min(ogw - 1, x0 + 1), u = fx - x0;
          hf[y * gw + x] = lerp(lerp(old[y0 * ogw + x0], old[y0 * ogw + x1], u), lerp(old[y1 * ogw + x0], old[y1 * ogw + x1], u), v);
        }
      }
    }
    field.width = gw;
    field.height = gh;
    img = fctx.createImageData(gw, gh);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    markDirty(0, 0, gw, gh);
    relight();
    makeGlints();
  }

  function makeGrain() {
    grainLayer = document.createElement("canvas");
    grainLayer.width = Math.ceil(W * DPR);
    grainLayer.height = Math.ceil(H * DPR);
    const g = grainLayer.getContext("2d");
    g.scale(DPR, DPR);
    // fine grains at screen resolution, sharper than the height field
    for (let i = 0; i < (W * H) / 260; i++) {
      g.fillStyle = Math.random() < 0.5 ? `rgba(255,250,236,${rand(0.06, 0.16)})` : `rgba(78,62,40,${rand(0.05, 0.12)})`;
      const s = rand(0.5, 1.1);
      g.fillRect(rand(0, W), rand(0, H), s, s);
    }
    // a few tiny pebbles, each with a lit side and a shadow
    for (let i = 0; i < (W * H) / 16000; i++) {
      const x = rand(0, W), y = rand(0, H), r = rand(0.7, 1.7), a = rand(0, TAU), tone = rand(0.35, 0.85);
      g.fillStyle = "rgba(60,46,30,0.28)";
      g.beginPath();
      g.ellipse(x + r * 0.5, y + r * 0.6, r, r * 0.75, a, 0, TAU);
      g.fill();
      g.fillStyle = `rgb(${200 * tone + 30},${190 * tone + 30},${175 * tone + 30})`;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.75, a, 0, TAU);
      g.fill();
      g.fillStyle = "rgba(255,252,240,0.45)";
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU);
      g.fill();
    }
  }

  // mica in the sand: tiny glints that wink as the light shifts
  let glints = [];
  function makeGlints() {
    glints = Array.from({ length: Math.round((W * H) / 5000) }, () => ({ x: rand(0, W), y: rand(0, H), p: rand(0, TAU), s: rand(0.25, 0.9), r: rand(0.5, 1.1) }));
  }

  // press one tine's groove along a short segment; sc < 1 narrows it where tines crowd together
  function stampSeg(ax, ay, bx, by, wgt, px, py, edge, sc = 1, amp = 1) {
    const half = (SP / 2) * sc;
    const x0 = Math.floor((Math.min(ax, bx) - half) / C), x1 = Math.ceil((Math.max(ax, bx) + half) / C);
    const y0 = Math.floor((Math.min(ay, by) - half) / C), y1 = Math.ceil((Math.max(ay, by) + half) / C);
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len, pad = C * 0.75;
    for (let cy = Math.max(0, y0); cy <= Math.min(gh - 1, y1); cy++) {
      const y = (cy + 0.5) * C;
      for (let cx = Math.max(0, x0); cx <= Math.min(gw - 1, x1); cx++) {
        const x = (cx + 0.5) * C;
        // only alongside the segment: round end caps would re-press finished sand behind the tine
        const along = (x - ax) * ux + (y - ay) * uy;
        if (along < -pad || along > len + pad) continue;
        const d = Math.abs((x - ax) * uy - (y - ay) * ux);
        if (d >= half) continue;
        let w = wgt;
        // the outside of the end tines blends into whatever was there
        if (edge && ((x - bx) * px + (y - by) * py) * edge > 0) w *= 1 - d / half;
        const i = cy * gw + cx;
        // the crests crumble a little where the tines push sand aside
        const crest = (d / half) ** 4;
        hf[i] += (prof(d / sc) * amp + (Math.random() - 0.5) * 0.4 * crest - hf[i]) * w;
      }
    }
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  // concentric rings around a stone, like a ripple frozen in the sand
  function stampRings(s) {
    const R = ringR(s), outer = R + SP * 2.6, inner = s.r * 0.85;
    const x0 = Math.floor((s.x - outer) / C), x1 = Math.ceil((s.x + outer) / C);
    const y0 = Math.floor((s.y - outer) / C), y1 = Math.ceil((s.y + outer) / C);
    for (let cy = Math.max(0, y0); cy <= Math.min(gh - 1, y1); cy++) {
      const y = (cy + 0.5) * C;
      for (let cx = Math.max(0, x0); cx <= Math.min(gw - 1, x1); cx++) {
        const x = (cx + 0.5) * C, d = Math.hypot(x - s.x, y - s.y);
        if (d < inner || d > outer) continue;
        const w = d < outer - SP ? 1 : (outer - d) / SP;
        const i = cy * gw + cx;
        hf[i] += (prof(d - R) - hf[i]) * w;
      }
    }
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  // the classic start: straight lines that bend around the stones, rings hugging each stone
  function rakeStraight() {
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        let x = (cx + 0.5) * C, y = (cy + 0.5) * C;
        for (const s of stones) {
          const R = ringR(s), dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
          if (d < 2 * R) {
            // undo the rake's bend (see deflect) to find which straight line this cell belongs to
            const k = d > R ? (2 * (d - R)) / d : 0;
            x = s.x + dx * k;
            y = s.y + dy * k;
          }
        }
        // raked by hand: the lines drift a little from true
        hf[cy * gw + cx] = prof(y + Math.sin(x / (SP * 13) + y / (SP * 40)) * SP * 0.05);
      }
    }
    for (const s of stones) stampRings(s);
    markDirty(0, 0, gw, gh);
  }

  // ---------- Stones ----------
  const stones = [];
  const MAX_STONES = 9;
  const ringR = (s) => s.r * 1.12 + SP * 0.55;
  const STONE_COLS = [[118, 116, 110], [102, 100, 98], [128, 120, 108], [92, 94, 98], [136, 130, 122]];

  function makeStone(x, y, size, seed, rot, moss) {
    const s = { x, y, size, seed, rot, moss, r: size * S, vx: 0, vy: 0, spin: 0, drop: 0, lift: 0, lifted: false, gone: 0, settle: false, sprite: null };
    buildStone(s);
    stones.push(s);
    return s;
  }

  // Each stone is a little height map in its own frame (dome, facets, mottling, veins, a moss cushion),
  // shaded per pixel with the light fixed at the top left, so it stays lit right as it turns.
  function buildStone(s) {
    const R = prng(s.seed);
    const r = s.r, half = r * 1.42, N = Math.ceil(half * 2 * DPR), px = 1 / DPR;
    const stretch = 1 + R() * 0.35, sx = Math.sqrt(stretch), sy = 1 / sx;
    const ph = [R() * TAU, R() * TAU, R() * TAU], am = [0.05 + R() * 0.05, 0.05 + R() * 0.07, 0.02 + R() * 0.03];
    const tall = 0.42 + R() * 0.32, tiltX = (R() - 0.5) * 0.3, tiltY = (R() - 0.5) * 0.3;
    const facets = Array.from({ length: 4 }, () => ({ a: R() * TAU, f: 2 + R() * 4, p: R() * TAU, h: 0.012 + R() * 0.03 }));
    const base = STONE_COLS[(R() * STONE_COLS.length) | 0];
    const gloss = R() < 0.35 ? [0.32, 34] : [0.13, 14]; // a few smooth river stones, the rest matte granite
    const vein = R() < 0.45 ? { a: R() * TAU, p: R() * TAU, w: r * 0.03 + 0.7 } : null;
    const salt = (R() * 1e9) | 0;
    const hash = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), u), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
    };
    const Hm = new Float32Array(N * N), Cm = new Float32Array(N * N), Am = new Float32Array(N * N), Mm = new Float32Array(N * N), Tm = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const v = (j + 0.5) * px - half;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) * px - half, k = j * N + i;
        const uu = u / sx, vv = v / sy, th = Math.atan2(vv, uu);
        const Rt = r * (1 + am[0] * Math.sin(th + ph[0]) + am[1] * Math.sin(2 * th + ph[1]) + am[2] * Math.sin(3 * th + ph[2]));
        const rho = Math.hypot(uu, vv) / Rt;
        let h = 0;
        if (rho < 1) {
          const q = 1 - rho * rho;
          let z = Math.pow(q, 0.55) * (1 + (uu * tiltX + vv * tiltY) / r);
          for (const f of facets) z += Math.sin(((Math.cos(f.a) * u + Math.sin(f.a) * v) / r) * f.f + f.p) * f.h * q;
          h = z * r * tall;
          Cm[k] = clamp((1 - rho) * Rt * DPR + 0.5, 0, 1);
          let alb = 1 + (noise(u / (r * 0.3), v / (r * 0.3)) - 0.5) * 0.3 + (noise(u / (r * 0.08), v / (r * 0.08)) - 0.5) * 0.12;
          const sp = hash(Math.floor(u * 0.8), Math.floor(v * 0.8));
          if (sp > 0.95) alb += 0.22; else if (sp < 0.04) alb -= 0.2;
          if (vein) {
            const along = Math.cos(vein.a) * u + Math.sin(vein.a) * v, across = -Math.sin(vein.a) * u + Math.cos(vein.a) * v;
            const d = Math.abs(across - r * 0.18 * Math.sin((along / r) * 2.2 + vein.p));
            alb += 0.38 * Math.max(0, 1 - d / vein.w);
          }
          Am[k] = alb;
        }
        if (s.moss && rho > 0.88) {
          // a tufted cushion of moss hugging the stone
          const edge = 1.24 + (noise(u / (r * 0.16), v / (r * 0.16)) - 0.5) * 0.2;
          const m = clamp((edge - rho) / 0.05, 0, 1);
          if (m > 0) {
            const tuft = noise(u / 2.1, v / 2.1);
            Mm[k] = m;
            Tm[k] = tuft;
            h = Math.max(h, r * 0.07 * m * (0.55 + 0.45 * tuft) * Math.min(1, (edge - rho) / 0.12));
          }
        }
        Hm[k] = h;
      }
    }
    s.map = { N, Hm, Cm, Am, Mm, Tm, base, gloss };
    s.half = half;
    s.tall = tall;
    s.sprite = document.createElement("canvas");
    s.sprite.width = s.sprite.height = N;
    shadeStone(s);
  }

  const LIGHT = (() => { const l = [-0.45, -0.55, 0.7], n = Math.hypot(...l); return l.map((c) => c / n); })();
  const HALFV = (() => { const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], n = Math.hypot(...h); return h.map((c) => c / n); })();
  const MOSS = [80, 100, 52];

  // light the stone at its current turn
  function shadeStone(s) {
    const { N, Hm, Cm, Am, Mm, Tm, base, gloss } = s.map;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot), mid = N / 2;
    const Hw = new Float32Array(N * N), Cw = new Float32Array(N * N), Aw = new Float32Array(N * N), Mw = new Float32Array(N * N), Tw = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const y = j + 0.5 - mid;
      for (let i = 0; i < N; i++) {
        const x = i + 0.5 - mid;
        // into the stone's own frame
        const fx = c * x + sn * y + mid - 0.5, fy = -sn * x + c * y + mid - 0.5;
        if (fx < 0 || fy < 0 || fx >= N - 1 || fy >= N - 1) continue;
        const ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, k = iy * N + ix, o = j * N + i;
        const bl = (A) => lerp(lerp(A[k], A[k + 1], u), lerp(A[k + N], A[k + N + 1], u), v);
        Hw[o] = bl(Hm);
        Cw[o] = bl(Cm);
        Aw[o] = bl(Am);
        Mw[o] = bl(Mm);
        Tw[o] = bl(Tm);
      }
    }
    const g = s.sprite.getContext("2d"), img = g.createImageData(N, N), d = img.data, k2 = DPR / 2;
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const o = j * N + i, cv = Cw[o], mv = Mw[o];
        const a = cv + mv * (1 - cv);
        if (a < 0.004) continue;
        let nx = -(Hw[o + 1] - Hw[o - 1]) * k2, ny = -(Hw[o + N] - Hw[o - N]) * k2;
        const nl = Math.hypot(nx, ny, 1);
        nx /= nl; ny /= nl;
        const nz = 1 / nl;
        const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        const spec = Math.pow(Math.max(0, nx * HALFV[0] + ny * HALFV[1] + nz * HALFV[2]), gloss[1]) * gloss[0] * 255;
        // the stone darkens where it meets the sand
        const ao = 0.6 + 0.4 * Math.min(1, Hw[o] / (s.r * 0.12));
        const sl = (0.3 + 0.85 * diff) * Aw[o] * ao;
        const ml = (0.3 + 0.7 * diff) * (0.7 + 0.5 * Tw[o]);
        const p = o * 4, ws = cv / a, wm = 1 - ws;
        d[p] = (base[0] * sl + spec) * ws + MOSS[0] * ml * wm;
        d[p + 1] = (base[1] * sl + spec) * ws + (MOSS[1] + Tw[o] * 26) * ml * wm;
        d[p + 2] = (base[2] * sl + spec) * ws + MOSS[2] * ml * wm;
        d[p + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    s.shadedRot = s.rot;
  }

  const stoneAt = (x, y) => {
    for (let i = stones.length - 1; i >= 0; i--) {
      const s = stones[i];
      if (!s.gone && Math.hypot(x - s.x, y - s.y) < s.r * 1.12) return s;
    }
    return null;
  };

  function saveOpts() {
    opts.stones = stones.filter((s) => !s.gone).map((s) => ({ x: +(s.x / W).toFixed(4), y: +(s.y / H).toFixed(4), size: +s.size.toFixed(1), seed: s.seed, rot: +s.rot.toFixed(2), moss: s.moss }));
    try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ }
  }

  function placeStone(x, y) {
    if (stones.filter((s) => !s.gone).length >= MAX_STONES) { scuff(x, 0.6); return; }
    const s = makeStone(x, y, rand(18, 44), (Math.random() * 1e9) | 0, rand(0, TAU), Math.random() < 0.35);
    s.drop = 1;
  }

  function nudge(s, tx, ty) {
    let dx = s.x - tx, dy = s.y - ty;
    const d = Math.hypot(dx, dy);
    if (d < s.r * 0.15) { const a = rand(0, TAU); dx = Math.cos(a); dy = Math.sin(a); } else { dx /= d; dy /= d; }
    const k = 110 * S * clamp(30 / s.size, 0.6, 1.5);
    s.vx += dx * k;
    s.vy += dy * k;
    s.spin += rand(-0.7, 0.7);
    s.settle = true;
    tok(s.x, s.size);
    scuff(s.x, 0.5);
  }

  // ---------- Rake ----------
  const rake = { on: false, x: 0, y: 0, dx: 1, dy: 0, prev: [], dist: 0, speed: 0, travel: 0, jit: [] };

  // tines bend smoothly around stones: anything within 2R is squeezed into the band from R to 2R
  function deflect(x, y) {
    for (const s of stones) {
      if (s.gone || s.drop > 0) continue;
      const R = ringR(s), dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
      if (d < 2 * R) {
        if (d < 1e-3) { x = s.x + R; continue; }
        const k = (R + d / 2) / d;
        x = s.x + dx * k;
        y = s.y + dy * k;
      }
    }
    return [x, y];
  }

  function tines() {
    const n = opts.tines, px = -rake.dy, py = rake.dx, out = [];
    for (let i = 0; i < n; i++) {
      // a hand-held rake: each tine wanders a hair from true
      const j = rake.jit[i] || { ph: 0, f: 1 };
      const o = (i - (n - 1) / 2) * SP + Math.sin(rake.travel / (SP * 6 * j.f) + j.ph) * SP * 0.035;
      out.push(deflect(rake.x + px * o, rake.y + py * o));
    }
    return out;
  }

  function rakeStart(x, y, dx, dy) {
    const d = Math.hypot(dx, dy) || 1;
    Object.assign(rake, { on: true, x, y, dx: dx / d, dy: dy / d });
    rake.travel = 0;
    rake.jit = Array.from({ length: 8 }, () => ({ ph: rand(0, TAU), f: rand(0.7, 1.4), amp: rand(0.86, 1.08) }));
    rake.prev = tines();
  }

  function rakeTo(x, y) {
    const mx = x - rake.x, my = y - rake.y, dist = Math.hypot(mx, my);
    if (dist < 0.5) return;
    const steps = Math.ceil(dist / (C * 1.5)), sx = mx / steps, sy = my / steps, sl = dist / steps;
    for (let k = 0; k < steps; k++) {
      // the head turns to face where it's going, by distance travelled so curves stay smooth
      const turn = Math.min(1, sl / (SP * 1.4));
      let ndx = lerp(rake.dx, sx / sl, turn), ndy = lerp(rake.dy, sy / sl, turn);
      const nl = Math.hypot(ndx, ndy);
      if (nl < 1e-3) { ndx = sx / sl; ndy = sy / sl; } else { ndx /= nl; ndy /= nl; }
      // turned right round: keep each tine paired with its own groove
      if (ndx * rake.dx + ndy * rake.dy < 0) rake.prev.reverse();
      rake.dx = ndx;
      rake.dy = ndy;
      rake.x += sx;
      rake.travel += sl;
      rake.y += sy;
      const cur = tines(), n = cur.length;
      for (let i = 0; i < n; i++) {
        // beside a stone the tines squeeze together: shrink each groove to the room it has
        let gap = SP;
        if (i > 0) gap = Math.min(gap, Math.hypot(cur[i][0] - cur[i - 1][0], cur[i][1] - cur[i - 1][1]));
        if (i < n - 1) gap = Math.min(gap, Math.hypot(cur[i][0] - cur[i + 1][0], cur[i][1] - cur[i + 1][1]));
        stampSeg(rake.prev[i][0], rake.prev[i][1], cur[i][0], cur[i][1], 0.6, -rake.dy, rake.dx, i === 0 ? -1 : i === n - 1 ? 1 : 0, clamp(gap / SP, 0.35, 1), rake.jit[i].amp);
      }
      rake.prev = cur;
    }
    rake.dist += dist;
    // fallen leaves get pushed along by the rake
    const reach = (opts.tines * SP) / 2 + 6 * S;
    for (const l of leaves) {
      if (l.h > 0) continue;
      if (Math.hypot(l.x - x, l.y - y) < reach) { l.x += mx; l.y += my; l.rot += rand(-0.15, 0.15); }
    }
  }

  // ---------- Smoothing ----------
  let smoothing = null; // a soft band sweeping down the garden, leaving flat sand behind
  function smooth() {
    smoothing = { row: 0, band: Math.max(8, gh * 0.14), done: 0 };
    sweep();
    setTimeout(() => Z.bell(Z.noteFreq(5), 0.028, W / 2, 3), 1300);
    setTimeout(() => Z.bell(Z.noteFreq(9), 0.022, W / 2, 3.2), 1500);
  }

  function updateSmoothing(dt) {
    const s = smoothing;
    s.row += (gh + s.band) * dt / 1.6;
    const front = Math.min(gh - 1, Math.floor(s.row)), back = Math.max(0, Math.floor(s.row - s.band));
    for (let y = back; y <= front; y++) {
      const t = clamp((s.row - y) / s.band, 0, 1), k = Math.min(1, dt * 14 * t);
      for (let i = y * gw, e = i + gw; i < e; i++) hf[i] *= 1 - k;
    }
    for (; s.done < back; s.done++) for (let i = s.done * gw, e = i + gw; i < e; i++) hf[i] = 0;
    markDirty(0, s.done - 1, gw, front + 1);
    for (const l of leaves) if (l.h <= 0 && l.y < s.row * C) l.fade = Math.max(l.fade, 0.01);
    if (s.row - s.band > gh) {
      for (; s.done < gh; s.done++) for (let i = s.done * gw, e = i + gw; i < e; i++) hf[i] = 0;
      markDirty(0, 0, gw, gh);
      smoothing = null;
      for (const st of stones) if (!st.gone) stampRings(st);
    }
  }

  // grooves soften very slowly, a few rows at a time (half-life of about ten minutes)
  let relaxRow = 0;
  function relax(dt) {
    const rows = (gh * dt) / 10, f = Math.pow(0.5, 10 / 600);
    relaxRow += rows;
    while (relaxRow >= 1) {
      relaxRow -= 1;
      relax.y = ((relax.y || 0) + 1) % gh;
      for (let i = relax.y * gw, e = i + gw; i < e; i++) hf[i] *= f;
      markDirty(0, relax.y - 1, gw, relax.y + 1);
    }
  }

  // ---------- Leaves and light ----------
  const leaves = [];
  const LEAF_COLS = [[196, 74, 40], [214, 120, 44], [222, 168, 60], [176, 52, 46], [128, 140, 64]];
  const clouds = Array.from({ length: 3 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.35, 0.6), s: rand(0.006, 0.012) }));

  // ---------- Audio ----------
  const panOf = (x) => (x / W) * 2 - 1;
  const audio = () => (Z.audioOk() ? Z.ac : null);

  // a stone settling into the sand: a low thud and a little hiss of grains
  function thud(x, size) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x)), f = clamp(150 - size * 1.8, 60, 120);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.16);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.32);
    scuff(x, 0.9);
    Z.bell(Z.noteFreq(clamp(Math.round(14 - size / 4), 2, 12)), 0.022, x, 2.6);
  }

  // a stone knocked: a dry, woody tok
  function tok(x, size) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x)), f = clamp(900 - size * 9, 420, 760);
    for (const [m, v] of [[1, 0.05], [1.52, 0.022]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(f * m, t);
      o.frequency.exponentialRampToValueAtTime(f * m * 0.92, t + 0.08);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.13);
    }
  }

  // a short brush of sand
  function scuff(x, vol = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const n = Z.noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(1100, t + 0.22);
    bp.Q.value = 0.9;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.3);
  }

  // single grains ticking against the tines
  function grit(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const n = Z.noise(), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = "highpass";
    hp.frequency.value = rand(3000, 6000);
    g.gain.setValueAtTime(rand(0.006, 0.016), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rand(0.01, 0.025));
    n.connect(hp).connect(g).connect(out);
    n.start(t, rand(0, 1.5));
    n.stop(t + 0.03);
  }

  // the long soft sweep of smoothing the whole garden
  function sweep() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(0);
    const n = Z.noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.8);
    bp.frequency.exponentialRampToValueAtTime(700, t + 1.7);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.5);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 2);
  }

  // far off: a wind chime, or a bamboo water spout tipping over
  function ambience() {
    if (Math.random() < 0.7) {
      const base = 9 + ((Math.random() * 4) | 0), x = rand(W * 0.15, W * 0.85);
      for (let k = 0; k < 3; k++) setTimeout(() => here() && Z.bell(Z.noteFreq(base + [0, 2, 4, 3][(Math.random() * 4) | 0]), 0.011, x, 3.2), k * rand(160, 420));
      return;
    }
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + 0.01, out = Z.output(rand(-0.7, 0.7));
    for (const [f, v, dk] of [[310, 0.035, 0.22], [180, 0.03, 0.3]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.85, t + dk);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dk + 0.02);
    }
  }

  // continuous layers: a faint breeze, and the hush of the rake through sand
  let loops = null;
  function startLoops() {
    const ac = audio();
    if (loops || !ac) return;
    const layer = (type, freq, q) => {
      const n = Z.noise(), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = 0;
      n.connect(f).connect(g).connect(Z.output(0));
      n.start();
      return { f, g };
    };
    loops = { wind: layer("lowpass", 260, 0.4), hush: layer("bandpass", 1400, 0.7), body: layer("lowpass", 520, 0.6) };
  }
  function updateLoops(speed) {
    if (!loops) return;
    const t = Z.ac.currentTime, on = here(), k = clamp(speed / 1100, 0, 1);
    loops.wind.g.gain.setTargetAtTime(on ? 0.018 + 0.008 * Math.sin(time * 0.15) : 0, t, 0.8);
    loops.hush.g.gain.setTargetAtTime(on ? k * 0.1 : 0, t, 0.06);
    loops.hush.f.frequency.setTargetAtTime(1100 + clamp(speed, 0, 2000) * 0.7, t, 0.1);
    loops.body.g.gain.setTargetAtTime(on ? k * 0.07 : 0, t, 0.08);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, st: 0, moved: false, stone: null, ox: 0, oy: 0 };
  let interactions = 0, time = 0;

  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("sand-title").classList.add("fade");
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* pointer already gone */ }
    const s = stoneAt(e.clientX, e.clientY);
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, st: time, moved: false, stone: s, ox: s ? s.x - e.clientX : 0, oy: s ? s.y - e.clientY : 0 });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down) { canvas.classList.toggle("grab", !!stoneAt(e.clientX, e.clientY)); return; }
    if (e.pointerId !== ptr.id) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    const s = ptr.stone;
    if (!ptr.moved && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) {
      ptr.moved = true;
      if (s) { s.lifted = true; s.vx = s.vy = 0; canvas.classList.add("grabbing"); tok(s.x, s.size * 1.4); }
      else rakeStart(ptr.sx, ptr.sy, ptr.x - ptr.sx, ptr.y - ptr.sy);
    }
    if (!ptr.moved) return;
    if (s) { s.x = ptr.x + ptr.ox; s.y = ptr.y + ptr.oy; }
    else rakeTo(ptr.x, ptr.y);
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    const s = ptr.stone;
    if (!ptr.moved && time - ptr.st < 0.4) {
      if (s) nudge(s, ptr.sx, ptr.sy);
      else placeStone(ptr.x, ptr.y);
    } else if (s && ptr.moved) {
      s.lifted = false;
      // set down near an edge: the stone is taken away
      if (Math.min(s.x, s.y, W - s.x, H - s.y) < Math.max(s.r * 0.5, 24)) { s.gone = 0.001; scuff(s.x, 0.7); }
      else { s.drop = 0.35; }
    }
    canvas.classList.remove("grabbing");
    rake.on = false;
    ptr.down = false;
    ptr.stone = null;
    noteInteraction();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());

  // ---------- Simulation ----------
  let ambient = 12, leafTimer = 6, lastGrit = 0;
  function update(dt) {
    time += dt;

    // how fast the rake is moving, for its sound
    rake.speed = lerp(rake.speed, rake.on ? rake.dist / dt : 0, Math.min(1, dt * 10));
    if (rake.on && rake.dist > 0) {
      let n = Math.min(rake.dist / (14 * S), 3);
      while (n > 0) { if (Math.random() < n && time - lastGrit > 0.03) { lastGrit = time; grit(rake.x + rand(-1, 1) * opts.tines * SP * 0.5); } n -= 1; }
    }
    rake.dist = 0;
    if (Z.ac) { startLoops(); updateLoops(rake.speed); }

    for (let i = stones.length - 1; i >= 0; i--) {
      const s = stones[i];
      s.lift = lerp(s.lift, s.lifted ? 1 : 0, Math.min(1, dt * 12));
      if (s.gone) {
        s.gone += dt / 0.45;
        if (s.gone >= 1) { stones.splice(i, 1); saveOpts(); }
        continue;
      }
      if (s.drop > 0) {
        s.drop -= dt / 0.3;
        if (s.drop <= 0) { s.drop = 0; thud(s.x, s.size); stampRings(s); saveOpts(); }
        continue;
      }
      if (s.lifted) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      if (Math.abs(s.rot - s.shadedRot) > 0.03) shadeStone(s);
      const damp = Math.exp(-4.5 * dt);
      s.vx *= damp;
      s.vy *= damp;
      s.spin *= damp;
      // stay in the garden
      const m = s.r * 0.7;
      if (s.x < m) s.vx += (m - s.x) * 8 * dt; if (s.x > W - m) s.vx -= (s.x - W + m) * 8 * dt;
      if (s.y < m) s.vy += (m - s.y) * 8 * dt; if (s.y > H - m) s.vy -= (s.y - H + m) * 8 * dt;
      if (s.settle && Math.hypot(s.vx, s.vy) < 4 * S) { s.settle = false; s.vx = s.vy = 0; stampRings(s); saveOpts(); }
    }
    // stones nudge each other apart
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        const a = stones[i], b = stones[j];
        if (a.gone || b.gone || a.drop > 0 || b.drop > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 1.05;
        if (d >= min) continue;
        const push = (min - d) * 6, nx = dx / d, ny = dy / d;
        if (!a.lifted) { a.vx -= nx * push * dt * 10; a.vy -= ny * push * dt * 10; a.settle = true; }
        if (!b.lifted) { b.vx += nx * push * dt * 10; b.vy += ny * push * dt * 10; b.settle = true; }
        if ((a.lifted || b.lifted) && time - (a.knock || 0) > 0.4) { a.knock = time; tok((a.x + b.x) / 2, Math.min(a.size, b.size)); }
      }
    }

    if (smoothing) updateSmoothing(dt);
    else relax(dt);

    // a leaf drifts down now and then
    if ((leafTimer -= dt) <= 0) {
      leafTimer = rand(9, 20);
      if (leaves.filter((l) => !l.fade).length < 8) leaves.push({ x: rand(W * 0.05, W * 0.95), y: rand(H * 0.05, H * 0.95), h: 1, rot: rand(0, TAU), spin: rand(-1.4, 1.4), age: 0, size: rand(0.8, 1.25), col: LEAF_COLS[(Math.random() * LEAF_COLS.length) | 0], fade: 0 });
    }
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.age += dt;
      if (l.h > 0) {
        l.h -= dt / 3.6;
        l.x += Math.sin(l.age * 1.8) * 16 * S * dt;
        l.rot += l.spin * dt;
        if (l.h <= 0) { l.h = 0; scuff(l.x, 0.12); }
      }
      if (l.age > 70 && !l.fade) l.fade = 0.01;
      if (l.fade) { l.fade += dt / 3; if (l.fade >= 1) leaves.splice(i, 1); }
    }

    if ((ambient -= dt) <= 0) { ambient = rand(16, 34); ambience(); }
  }

  // ---------- Render ----------
  function drawLeaf(l) {
    const s = 9 * S * l.size * (1 + l.h * 0.7), a = 1 - l.fade, off = (2 + l.h * 40) * S;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(l.x + off * 0.5, l.y + off * 0.75);
    ctx.rotate(l.rot);
    ctx.fillStyle = `rgba(70,50,25,${0.22 * (1 - l.h * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.fillStyle = css(l.col);
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.75, s, 0);
    ctx.quadraticCurveTo(0, s * 0.75, -s, 0);
    ctx.fill();
    ctx.strokeStyle = css(mix(l.col, [0, 0, 0], 0.3), 0.5);
    ctx.lineWidth = 0.8 * S;
    ctx.beginPath();
    ctx.moveTo(-s * 1.25, 0);
    ctx.lineTo(s * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawStone(s, shadow) {
    const lift = s.lift + s.drop * 1.6, sc = (1 + lift * 0.07) * (1 - s.gone * 0.15), a = 1 - s.gone;
    if (shadow) {
      // cast shadow, longer for taller stones and lifted ones
      const off = (0.12 + s.tall * 0.45 + lift * 0.5) * s.r, rr = s.r * (1.15 + s.tall * 0.2 + lift * 0.25);
      const g = ctx.createRadialGradient(s.x + off * 0.75, s.y + off, s.r * 0.35, s.x + off * 0.75, s.y + off, rr);
      g.addColorStop(0, `rgba(60,44,24,${0.45 * a * (1 - lift * 0.3)})`);
      g.addColorStop(1, "rgba(60,44,24,0)");
      ctx.fillStyle = g;
      ctx.fillRect(s.x + off * 0.75 - rr, s.y + off - rr, rr * 2, rr * 2);
      // and a tight contact shadow where it sits in the sand
      const ck = 1 - Math.min(1, lift * 1.5);
      if (ck > 0.02) {
        const cg = ctx.createRadialGradient(s.x + s.r * 0.06, s.y + s.r * 0.08, s.r * 0.8, s.x + s.r * 0.06, s.y + s.r * 0.08, s.r * 1.16);
        cg.addColorStop(0, `rgba(50,36,20,${0.38 * a * ck})`);
        cg.addColorStop(1, "rgba(50,36,20,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(s.x - s.r * 1.3, s.y - s.r * 1.3, s.r * 2.6, s.r * 2.6);
      }
      return;
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(s.x, s.y);
    ctx.scale(sc, sc);
    ctx.drawImage(s.sprite, -s.half, -s.half, s.half * 2, s.half * 2);
    ctx.restore();
  }

  function render() {
    relight();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(field, 0, 0, gw * C, gh * C);
    if (grainLayer) ctx.drawImage(grainLayer, 0, 0, W, H);
    // glints only show on slopes facing the sun
    const d = img.data;
    ctx.fillStyle = "#fffaf0";
    for (const g of glints) {
      const tw = Math.pow(Math.max(0, Math.sin(time * g.s + g.p)), 24);
      if (tw < 0.03) continue;
      const cx = Math.min(gw - 1, (g.x / C) | 0), cy = Math.min(gh - 1, (g.y / C) | 0), lit = d[(cy * gw + cx) * 4 + 1] / SAND[1] - 0.95;
      if (lit <= 0) continue;
      ctx.globalAlpha = Math.min(1, tw * lit * 6);
      ctx.fillRect(g.x - g.r * 1.6, g.y - 0.3, g.r * 3.2, 0.6);
      ctx.fillRect(g.x - 0.3, g.y - g.r * 1.6, 0.6, g.r * 3.2);
    }
    ctx.globalAlpha = 1;

    for (const l of leaves) if (l.h <= 0) drawLeaf(l);
    const order = stones.slice().sort((a, b) => a.lift + a.drop - (b.lift + b.drop));
    for (const s of order) drawStone(s, true);
    for (const s of order) drawStone(s, false);

    // slow cloud shadows passing over
    for (const c of clouds) {
      const x = (((c.x + time * c.s) % 1.6) - 0.3) * W, y = (((c.y + time * c.s * 0.6) % 1.6) - 0.3) * H, r = c.r * Math.max(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(70,62,50,0.09)");
      g.addColorStop(1, "rgba(70,62,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (const l of leaves) if (l.h > 0) drawLeaf(l);

    // warm light from the top left, the garden's edges in soft shade
    const sun = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, Math.hypot(W, H) * 0.7);
    sun.addColorStop(0, "rgba(255,244,220,0.12)");
    sun.addColorStop(1, "rgba(255,244,220,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(80,62,40,0)");
    v.addColorStop(1, "rgba(80,62,40,0.32)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- UI ----------
  function syncUi() {
    $("sand-tines").value = opts.tines;
    $("sand-tines-lbl").textContent = `${opts.tines} tines`;
    $("sand-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("sand-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("sand-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("sand-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("sand-smooth").addEventListener("click", () => { Z.ensureAudio(); startLoops(); smooth(); });
  $("sand-tines").addEventListener("input", (e) => {
    const n = clamp(Math.round(+e.target.value), 2, 8);
    if (n === opts.tines) return;
    opts.tines = n;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    Z.bell(Z.noteFreq(4 + n), 0.02, W / 2, 1.8);
  });
  $("sand-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("sand-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    const oldW = W || window.innerWidth, oldH = H || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    S = clamp(Math.min(W, H) / 800, 0.55, 1.25);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildField();
    makeGrain();
    // keep everything where it was, proportionally
    const kx = W / oldW, ky = H / oldH;
    for (const s of stones) { s.x *= kx; s.y *= ky; s.r = s.size * S; buildStone(s); }
    for (const l of leaves) { l.x *= kx; l.y *= ky; }
  }
  // a frame hidden at load can report a 0 size: wait for a real one before laying things out
  let seeded = false;
  const seedOnce = () => { if (!seeded && window.innerWidth > 0 && window.innerHeight > 0) { seeded = true; seed(); } };
  window.addEventListener("resize", () => { resize(); seedOnce(); });

  function seed() {
    const saved = opts.stones || [
      // an asymmetric grouping: a pair and a loner
      { x: 0.3, y: 0.42, size: 44, seed: 11, rot: 0.4, moss: true },
      { x: 0.3 + 70 / Math.max(W, 1), y: 0.42 + 46 / Math.max(H, 1), size: 24, seed: 29, rot: 2.1, moss: false },
      { x: 0.72, y: 0.64, size: 34, seed: 47, rot: 1.2, moss: true },
    ];
    for (const s of saved) makeStone(clamp(+s.x, 0, 1) * W, clamp(+s.y, 0, 1) * H, clamp(+s.size || 30, 12, 50), s.seed | 0, +s.rot || 0, !!s.moss);
    rakeStraight();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else if (loops) updateLoops(0);
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has("debug")) {
    window.__sand = { stones, leaves, opts, rake, ptr, update, render, rakeStart, rakeTo, placeStone, nudge, smooth, get hf() { return hf; }, get grid() { return { C, gw, gh, SP }; }, get smoothing() { return smoothing; } };
  }

  resize();
  seedOnce();
  syncUi();
  requestAnimationFrame(frame);
})();
