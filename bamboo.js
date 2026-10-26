// Bamboo: a misty grove with a shishi-odoshi. Water trickles from a bamboo spout into a pivoting
// tube; when it's full it tips, pours into a stone basin, swings back and knocks on a rock.
// Drag to send a gust through the grove, tap a stalk to knock it, tap the tube to tip it early,
// tap the basin to ripple the water. Shares game.js's audio engine through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("bamboo");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, U = 1, cx = 0, groundY = 0;

  const KEY = "drift-bamboo-v1";
  const FLOWS = [{ name: "Slow", fill: 7.5, drops: 22 }, { name: "Steady", fill: 4.8, drops: 34 }, { name: "Fast", fill: 2.8, drops: 52 }];
  const BREEZES = [{ name: "Still", k: 0.05 }, { name: "Breeze", k: 0.45 }, { name: "Windy", k: 1 }];
  const opts = { flow: 1, breeze: 1 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.flow = clamp(opts.flow | 0, 0, FLOWS.length - 1);
  opts.breeze = clamp(opts.breeze | 0, 0, BREEZES.length - 1);
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "bamboo";

  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const MIST = [196, 210, 176], STALK = [86, 116, 48], LEAF = [72, 108, 40];

  // ---------- The water feature ----------
  // all positions hang off the centre line cx and the ground line groundY, scaled by U
  function geom() {
    return {
      px: cx - 40 * U, py: groundY - 150 * U, // tube pivot
      L: 230 * U, front: 0.62, tr: 11 * U, aRest: -0.32, aDown: 0.42,
      sx: cx + 100 * U, sy: groundY - 282 * U, // spout mouth
      bx: cx + 150 * U, rimY: groundY - 58 * U, brx: 95 * U, bry: 22 * U, // basin
      kx: cx - 124 * U, // the striking stone under the tube's back end
    };
  }
  const tube = { a: -0.32, av: 0, w: 0, state: "fill" };
  const tubeEnds = (g) => ({
    mx: g.px + Math.cos(tube.a) * g.L * g.front, my: g.py + Math.sin(tube.a) * g.L * g.front,
    bx: g.px - Math.cos(tube.a) * g.L * (1 - g.front), by: g.py - Math.sin(tube.a) * g.L * (1 - g.front),
  });

  // ---------- Scene ----------
  let stalks = [], framers = [], moss = [], pebbles = [], canopy = [], ghosts = [], flecks = [], tufts = [], steps = [], speckle = [];
  const drops = [], pours = [], ripples = [], leaves = [], flashes = [], splashes = [];
  const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), p: rand(0, TAU), s: rand(0.01, 0.03), r: rand(0.6, 1.5) }));
  let time = 0, wind = 0, gust = 0;

  function makeScene() {
    stalks = [];
    const layers = [
      { per: 52, wmin: 5, wmax: 9, mist: 0.72, base: groundY - 46 * U, sway: 1.25 },
      { per: 86, wmin: 9, wmax: 15, mist: 0.45, base: groundY - 18 * U, sway: 1 },
      { per: 150, wmin: 15, wmax: 23, mist: 0.18, base: groundY + 6 * U, sway: 0.8 },
    ];
    layers.forEach((L, li) => {
      const n = Math.ceil(W / (L.per * U)) + 2;
      for (let i = 0; i < n; i++) {
        const x = (i + rand(-0.4, 0.4)) * L.per * U;
        // keep the nearest stalks out of the way of the water feature
        if (li === 2 && x > cx - 190 * U && x < cx + 270 * U) continue;
        stalks.push(makeStalk(x, rand(L.wmin, L.wmax) * U, li, L));
      }
    });
    // two big stalks right at the front frame the scene
    framers = [makeStalk(rand(0.02, 0.07) * W, 34 * U, 3, { mist: 0, base: H + 20, sway: 0.6 }), makeStalk(W - rand(0.02, 0.07) * W, 30 * U, 3, { mist: 0, base: H + 20, sway: 0.6 })];
    moss = Array.from({ length: Math.ceil(W / (60 * U)) }, () => ({ x: rand(0, W), y: groundY + rand(-6, 30) * U, rx: rand(30, 80) * U, ry: rand(8, 18) * U, c: rand(-0.1, 0.12) }));
    pebbles = Array.from({ length: Math.ceil(W / (14 * U)) }, () => ({ x: rand(0, W), y: groundY + rand(8, 0.24 * H / U) * U, r: rand(2, 6) * U, l: rand(0.3, 0.9) }));
    canopy = Array.from({ length: Math.ceil(W / (9 * U)) }, () => ({ x: rand(-20, W + 20), y: rand(-10, H * 0.2), len: rand(26, 48) * U, a: rand(0.9, 2.3), p: rand(0, TAU), shade: rand(0, 0.5) }));
    // the far grove, only just showing through the mist
    ghosts = Array.from({ length: Math.ceil(W / (30 * U)) }, () => ({ x: rand(-10, W + 10), w: rand(2, 5) * U, top: rand(-20, H * 0.15), lean: rand(-0.02, 0.02), p: rand(0, TAU) }));
    // sun flecks on the ground through the leaves
    flecks = Array.from({ length: Math.ceil(W / (40 * U)) }, () => ({ x: rand(0, W), y: groundY + rand(6, H - groundY - 10), r: rand(6, 18) * U, p: rand(0, TAU), s: rand(0.4, 1.1) }));
    // tufts of grass at the stalks' feet and around the stones
    const g = geom();
    tufts = [];
    for (const st of stalks) if (st.layer === 2) tufts.push({ x: st.x + rand(-8, 8) * U, y: st.base + rand(-2, 4) * U, n: 5 + ((Math.random() * 4) | 0), h: rand(10, 20) * U, p: rand(0, TAU) });
    for (const x of [g.kx - 50 * U, g.kx + 40 * U, g.bx - g.brx * 0.9, g.bx + g.brx * 0.95, g.px - 18 * U]) tufts.push({ x: x + rand(-6, 6) * U, y: groundY + rand(2, 8) * U, n: 6 + ((Math.random() * 4) | 0), h: rand(12, 24) * U, p: rand(0, TAU) });
    for (let i = 0; i < W / (90 * U); i++) tufts.push({ x: rand(0, W), y: groundY + rand(14, H - groundY - 20), n: 4 + ((Math.random() * 3) | 0), h: rand(8, 16) * U, p: rand(0, TAU) });
    // three stepping stones leading in from the front
    steps = [0, 1, 2].map((k) => ({ x: cx - 70 * U + k * 40 * U + rand(-10, 10) * U, y: H - (H - groundY) * (0.18 + k * 0.24), rx: (46 - k * 8) * U, ry: (13 - k * 2.2) * U, a: rand(-0.12, 0.12) }));
    speckle = Array.from({ length: 60 }, () => ({ u: Math.random(), v: Math.random(), r: rand(0.6, 1.8), l: Math.random() < 0.5 }));
  }

  function makeStalk(x, w, layer, L) {
    // most culms are green, a few have aged to yellow-green or grown a deeper blue-green
    const hue = Math.random(), tint = hue < 0.15 ? [150, 150, 70] : hue > 0.85 ? [60, 104, 64] : mix(STALK, [110, 140, 60], Math.random() * 0.5);
    const s = { x, w, layer, mist: L.mist, base: L.base, sway: L.sway * rand(0.85, 1.15), seg: rand(55, 85) * U * (1 + layer * 0.25), phase: rand(0, TAU), b: 0, bv: 0, k: rand(11, 17), lean: rand(-0.025, 0.025), sprigs: [], tint };
    for (let y = s.base - s.seg; y > -40; y -= s.seg) {
      if (y < H * 0.5 && Math.random() < 0.55) s.sprigs.push({ y, side: Math.random() < 0.5 ? -1 : 1, n: 3 + ((Math.random() * 3) | 0), len: rand(20, 34) * U * (0.6 + layer * 0.3) });
    }
    return s;
  }

  // the stalk's centre line: it bends more toward the top
  const stalkX = (s, y) => {
    const h = s.base + 60, k = clamp((s.base - y) / h, 0, 1.2);
    return s.x + (s.lean + s.b) * k * k * h;
  };

  // ---------- Audio ----------
  const audio = () => (Z.audioOk() ? Z.ac : null);
  const panOf = (x) => clamp((x / W) * 2 - 1, -0.9, 0.9);

  // the shishi-odoshi's knock: hollow bamboo on stone
  function klok(vol) {
    const ac = audio();
    if (!ac) return;
    const g = geom(), t = ac.currentTime, out = Z.output(panOf(g.kx));
    for (const [f, v, decay] of [[640, 1, 0.13], [1390, 0.42, 0.05], [318, 0.6, 0.1], [2210, 0.12, 0.025]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.setValueAtTime(f * 1.04, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.015);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.15 * v * vol, t + 0.0015);
      og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
    const n = Z.noise(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    ng.gain.setValueAtTime(0.12 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    n.connect(bp).connect(ng).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 0.04);
  }

  // knocking a living stalk: higher and shorter for thinner ones
  function tok(s) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(s.x)), f = clamp(1300 - (s.w / U) * 26, 560, 1200);
    for (const [mult, v, decay] of [[1, 1, 0.12], [2.62, 0.3, 0.045], [0.5, 0.4, 0.08]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.07 * v, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
  }

  // the tube emptying into the basin
  function gush() {
    const ac = audio();
    if (!ac) return;
    const g = geom(), t = ac.currentTime, out = Z.output(panOf(g.bx));
    const n = Z.noise(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.09, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    n.connect(bp).connect(ng).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 0.75);
  }

  // an uguisu, the Japanese bush warbler: a long held whistle, then "ho-ke-kyo"
  function warbler() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(rand(-0.8, 0.8)), vol = rand(0.012, 0.02);
    const note = (t0, f0, f1, dur, v) => {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(v, t0 + 0.04);
      og.gain.setValueAtTime(v, t0 + dur * 0.8);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(og).connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    };
    note(t, 1350, 1500, 1.1, vol);
    note(t + 1.3, 2500, 2200, 0.12, vol);
    note(t + 1.45, 2100, 1900, 0.14, vol);
    note(t + 1.62, 2300, 3000, 0.3, vol * 1.1);
  }

  // continuous layers: the trickle (it rises in pitch as the tube fills) and the rustle of leaves
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
    loops = { trickle: layer("bandpass", 600, 3), splash: layer("bandpass", 2400, 0.8), rustle: layer("bandpass", 4200, 0.6) };
  }
  function updateLoops() {
    if (!loops) return;
    const t = Z.ac.currentTime, on = here(), flow = (opts.flow + 1) / 3;
    const filling = tube.state === "fill";
    loops.trickle.g.gain.setTargetAtTime(on && filling ? 0.05 * (0.6 + flow * 0.4) : 0, t, 0.15);
    loops.trickle.f.frequency.setTargetAtTime(420 + tube.w * 1400, t, 0.1); // a filling tube sings higher
    loops.splash.g.gain.setTargetAtTime(on ? (filling ? 0.012 : 0.03) * (0.6 + flow * 0.4) : 0, t, 0.2);
    loops.rustle.g.gain.setTargetAtTime(on ? clamp(Math.abs(wind) * 0.5 + Math.abs(gust) * 0.4, 0, 1) * 0.07 : 0, t, 0.25);
    loops.rustle.f.frequency.setTargetAtTime(3200 + clamp(Math.abs(gust), 0, 1.5) * 1800, t, 0.3);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, st: 0, moved: false };
  let interactions = 0;
  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("bamboo-title").classList.add("fade");
  }

  function nearTube(x, y) {
    const g = geom(), e = tubeEnds(g);
    const dx = e.mx - e.bx, dy = e.my - e.by, len2 = dx * dx + dy * dy;
    const t = clamp(((x - e.bx) * dx + (y - e.by) * dy) / len2, 0, 1);
    return Math.hypot(x - (e.bx + dx * t), y - (e.by + dy * t)) < g.tr * 2.6;
  }
  const inBasin = (x, y) => { const g = geom(); return ((x - g.bx) / g.brx) ** 2 + ((y - g.rimY) / (g.bry * 2.4)) ** 2 < 1; };
  function stalkAt(x, y) {
    for (const s of [...framers, ...stalks.filter((q) => q.layer >= 1).reverse()]) {
      if (y > s.base) continue;
      if (Math.abs(x - stalkX(s, y)) < s.w / 2 + 6 * U) return s;
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    canvas.setPointerCapture?.(e.pointerId);
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 10) ptr.moved = true;
    if (ptr.moved) gust = clamp(gust + (dx / W) * 2.4, -2, 2); // sweeping sends a gust the same way
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    if (!ptr.moved && time - ptr.st < 0.4) tap(ptr.x, ptr.y);
    noteInteraction();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "BUTTON" || !here() || e.repeat) return;
    e.preventDefault();
    Z.ensureAudio();
    startLoops();
    tipNow();
  });

  function tap(x, y) {
    if (nearTube(x, y)) { tipNow(); return; }
    if (inBasin(x, y)) { const g = geom(); ripples.push({ x, y: clamp(y, g.rimY - g.bry * 0.5, g.rimY + g.bry * 0.6), age: 0, amp: 1 }); Z.plip(x); return; }
    const s = stalkAt(x, y);
    if (s) {
      s.bv += (x < stalkX(s, y) ? 1 : -1) * rand(0.25, 0.4) / (1 + s.layer * 0.3);
      tok(s);
      for (let i = 0; i < 3; i++) dropLeaf(stalkX(s, H * 0.15) + rand(-40, 40) * U, rand(-20, H * 0.2));
      return;
    }
    // empty air: a few leaves let go above you
    for (let i = 0; i < 3; i++) dropLeaf(x + rand(-50, 50) * U, rand(-30, H * 0.15));
    gust = clamp(gust + rand(-0.25, 0.25), -2, 2);
  }

  function tipNow() {
    if (tube.state === "fill" && tube.w > 0.2) tube.w = 1;
  }

  function dropLeaf(x, y) {
    if (leaves.length > 50) leaves.shift();
    leaves.push({ x, y, rot: rand(0, TAU), spin: rand(-2.5, 2.5), age: 0, land: groundY + rand(4, H - groundY - 30), landed: false, size: rand(0.7, 1.2), ph: rand(0, TAU), c: Math.random() < 0.35 ? [196, 178, 92] : [120, 150, 60] });
  }

  // ---------- Simulation ----------
  let birdTimer = rand(12, 30), dropTimer = 0, rippleTimer = 0;
  function update(dt) {
    time += dt;
    const g = geom(), e = tubeEnds(g), flow = FLOWS[opts.flow];

    // the shishi-odoshi
    switch (tube.state) {
      case "fill":
        tube.w = Math.min(1, tube.w + dt / flow.fill);
        tube.a = lerp(tube.a, g.aRest + tube.w * tube.w * 0.1, Math.min(1, dt * 6)); // it dips a little as it fills
        if (tube.w >= 1) { tube.state = "tip"; tube.av = 0.4; }
        break;
      case "tip":
        tube.av += 9 * dt;
        tube.a += tube.av * dt;
        if (tube.a >= g.aDown) { tube.a = g.aDown; tube.av = 0; tube.state = "pour"; gush(); }
        break;
      case "pour":
        tube.w -= dt * 2.4;
        for (let i = 0; i < 3; i++) pours.push({ x: e.mx, y: e.my, vx: Math.cos(tube.a) * rand(90, 150) * U, vy: Math.sin(tube.a) * rand(60, 120) * U, age: 0 });
        if (tube.w <= 0.02) { tube.w = 0; tube.state = "return"; tube.av = 0; }
        break;
      case "return":
      case "bounce":
        tube.av -= 11 * dt;
        tube.a += tube.av * dt;
        if (tube.a <= g.aRest) {
          const v = Math.abs(tube.av);
          tube.a = g.aRest;
          klok(tube.state === "bounce" ? 0.22 : clamp(v / 4, 0.45, 1));
          flashes.push({ x: e.bx, y: e.by + g.tr, age: 0 });
          if (tube.state === "return" && v > 1.2) { tube.av = v * 0.22; tube.state = "bounce"; }
          else { tube.av = 0; tube.state = "fill"; }
        }
        break;
    }

    // the stream from the spout: into the tube while it's waiting, into the basin when it's away
    dropTimer -= dt;
    while (dropTimer <= 0) {
      dropTimer += 1 / flow.drops;
      drops.push({ x: g.sx + rand(-1.2, 1.2) * U, y: g.sy + 4 * U, vx: rand(-4, 4) * U, vy: rand(20, 40) * U });
    }
    const grav = 1300 * U;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vy += grav * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const intoTube = tube.state === "fill" && d.y >= e.my - g.tr && Math.abs(d.x - e.mx) < g.tr * 2.4;
      if (intoTube) { drops.splice(i, 1); continue; }
      if (d.y >= g.rimY) {
        drops.splice(i, 1);
        if (Math.random() < 0.5) splashes.push({ x: d.x, y: g.rimY, vx: rand(-30, 30) * U, vy: rand(-90, -40) * U, age: 0 });
        if ((rippleTimer -= 1) <= 0) { rippleTimer = 4; ripples.push({ x: d.x, y: g.rimY + rand(-2, 2) * U, age: 0, amp: 0.45 }); }
      }
    }
    for (let i = pours.length - 1; i >= 0; i--) {
      const d = pours[i];
      d.vy += grav * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.age += dt;
      if (d.y >= g.rimY + rand(-3, 3) * U) {
        pours.splice(i, 1);
        if (Math.random() < 0.3) splashes.push({ x: clamp(d.x, g.bx - g.brx * 0.8, g.bx + g.brx * 0.8), y: g.rimY, vx: rand(-60, 60) * U, vy: rand(-160, -60) * U, age: 0 });
        if (Math.random() < 0.15) ripples.push({ x: clamp(d.x, g.bx - g.brx * 0.7, g.bx + g.brx * 0.7), y: g.rimY + rand(-4, 4) * U, age: 0, amp: 0.9 });
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const p = splashes[i];
      p.age += dt;
      p.vy += grav * 0.8 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > g.rimY + 2 * U && p.vy > 0) splashes.splice(i, 1);
    }
    if (splashes.length > 80) splashes.splice(0, splashes.length - 80);
    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 1.8) ripples.shift();
    if (ripples.length > 40) ripples.splice(0, ripples.length - 40);
    for (const f of flashes) f.age += dt;
    while (flashes.length && flashes[0].age > 0.4) flashes.shift();

    // wind: a wandering breeze, plus gusts you send by sweeping
    const B = BREEZES[opts.breeze].k;
    wind = B * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.23) * Math.sin(time * 0.61 + 1)));
    gust *= 1 - 1.1 * dt;
    const pvx = (ptr.x - ptr.lx) / Math.max(dt, 1e-3);
    for (const s of [...stalks, ...framers]) {
      const target = (wind + gust) * 0.055 * s.sway + Math.sin(time * 0.9 + s.phase) * 0.004 * (0.3 + B);
      s.bv += ((target - s.b) * s.k - s.bv * 2.2) * dt;
      if (ptr.down && ptr.moved && Math.abs(stalkX(s, ptr.y) - ptr.x) < 70 * U && ptr.y < s.base) s.bv += clamp(pvx, -3000, 3000) * 0.00004 / (1 + s.layer * 0.4);
      s.b += s.bv * dt;
    }
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;

    // leaves let go in the wind
    if (Math.random() < (Math.abs(gust) * 5 + B * 0.35 + 0.08) * dt) dropLeaf(rand(-40, W + 40), rand(-30, H * 0.12));
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.age += dt;
      if (!l.landed) {
        l.x += ((wind + gust) * 70 * U + Math.sin(l.age * 2.6 + l.ph) * 26 * U) * dt;
        l.y += (32 + Math.sin(l.age * 1.9 + l.ph) * 12) * U * dt;
        l.rot += l.spin * dt;
        if (l.y >= l.land) { l.landed = true; l.age = 0; }
      } else if (l.age > 9) leaves.splice(i, 1);
    }

    if ((birdTimer -= dt) <= 0) { birdTimer = rand(28, 60); warbler(); }
    if (Z.ac) { startLoops(); updateLoops(); }
  }

  // ---------- Render ----------
  function drawStalk(s, front = false) {
    const col = mix(s.tint || STALK, MIST, s.mist), dark = mix(col, [20, 30, 12], 0.4), light = mix(col, [236, 244, 200], 0.32);
    const top = -40;
    const width = (y) => s.w * (1 - 0.14 * clamp((s.base - y) / H, 0, 1)); // a little slimmer toward the top
    if (s.layer === 0) {
      // far culms: a simple stroke is all the mist leaves
      const steps = 8, h = s.base - top;
      ctx.lineCap = "butt";
      ctx.strokeStyle = css(col);
      ctx.lineWidth = s.w;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) { const y = s.base - (h * i) / steps; i ? ctx.lineTo(stalkX(s, y), y) : ctx.moveTo(stalkX(s, y), y); }
      ctx.stroke();
      ctx.strokeStyle = css(light, 0.35);
      ctx.lineWidth = s.w * 0.25;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) { const y = s.base - (h * i) / steps; i ? ctx.lineTo(stalkX(s, y) - s.w * 0.22, y) : ctx.moveTo(stalkX(s, y) - s.w * 0.22, y); }
      ctx.stroke();
    } else {
      // each internode is a rounded tube: shaded across its width, lit from the left
      for (let y0 = s.base; y0 > top; y0 -= s.seg) {
        const y1 = Math.max(top, y0 - s.seg), ym = (y0 + y1) / 2;
        const x0 = stalkX(s, y0), xm = stalkX(s, ym), x1 = stalkX(s, y1), w0 = width(y0) / 2, w1 = width(y1) / 2, wm = (w0 + w1) / 2;
        const g = ctx.createLinearGradient(xm - wm, 0, xm + wm, 0);
        g.addColorStop(0, css(dark));
        g.addColorStop(0.18, css(mix(col, light, 0.55)));
        g.addColorStop(0.32, css(light));
        g.addColorStop(0.62, css(col));
        g.addColorStop(1, css(mix(dark, [10, 16, 6], 0.3)));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0 - w0, y0);
        ctx.quadraticCurveTo(xm - wm * 1.02, ym, x1 - w1, y1);
        ctx.lineTo(x1 + w1, y1);
        ctx.quadraticCurveTo(xm + wm * 1.02, ym, x0 + w0, y0);
        ctx.closePath();
        ctx.fill();
        // the powdery white bloom just below each node
        if (y1 > top) {
          const bg = ctx.createLinearGradient(0, y1, 0, y1 + s.w * 0.9);
          bg.addColorStop(0, `rgba(232,240,222,${front ? 0.32 : 0.24})`);
          bg.addColorStop(1, "rgba(232,240,222,0)");
          ctx.fillStyle = bg;
          ctx.fillRect(x1 - w1, y1, w1 * 2, s.w * 0.9);
        }
      }
      // nodes: a raised ring with a dark seam and a lit ridge
      for (let y = s.base - s.seg; y > top; y -= s.seg) {
        const x = stalkX(s, y), w = width(y) / 2;
        ctx.fillStyle = css(mix(col, dark, 0.3));
        ctx.beginPath(); ctx.ellipse(x, y, w * 1.1, Math.max(1.2, s.w * 0.1), 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = css(dark, 0.95);
        ctx.lineWidth = Math.max(1, s.w * 0.07);
        ctx.beginPath(); ctx.moveTo(x - w * 1.08, y + s.w * 0.04); ctx.lineTo(x + w * 1.08, y + s.w * 0.04); ctx.stroke();
        ctx.strokeStyle = css(light, 0.75);
        ctx.lineWidth = Math.max(0.6, s.w * 0.05);
        ctx.beginPath(); ctx.moveTo(x - w * 0.95, y - s.w * 0.06); ctx.lineTo(x + w * 0.2, y - s.w * 0.06); ctx.stroke();
      }
    }
    // sprigs of leaves from the upper nodes, swaying with the stalk
    const lc = mix(LEAF, MIST, s.mist * 0.9), lcLit = mix(lc, [190, 214, 120], 0.35 * (1 - s.mist)), lcDark = mix(lc, [20, 34, 12], 0.25);
    for (const sp of s.sprigs) {
      const x = stalkX(s, sp.y), sway = s.b * 4 + Math.sin(time * 1.4 + s.phase + sp.y * 0.01) * 0.06;
      const tx = x + sp.side * (s.w * 0.4 + sp.len * 0.35), ty = sp.y + sp.len * 0.08;
      if (s.layer >= 1) {
        // the little twig the leaves hang from
        ctx.strokeStyle = css(mix(col, dark, 0.4), 0.9);
        ctx.lineWidth = Math.max(0.6, s.w * 0.06);
        ctx.beginPath(); ctx.moveTo(x + sp.side * s.w * 0.4, sp.y); ctx.quadraticCurveTo(x + sp.side * sp.len * 0.25, sp.y - sp.len * 0.05, tx, ty); ctx.stroke();
      }
      for (let k = 0; k < sp.n; k++) {
        const a = Math.PI / 2 - sp.side * (0.5 + k * 0.28) + sway, len = sp.len * (1 - k * 0.08);
        const lx = s.layer >= 1 ? lerp(x + sp.side * s.w * 0.4, tx, k / sp.n) : x + sp.side * s.w * 0.4, ly = s.layer >= 1 ? lerp(sp.y, ty, k / sp.n) : sp.y;
        ctx.fillStyle = css(k % 2 ? lcDark : lcLit, front ? 0.96 : 0.9);
        leafShape(lx, ly, a, len, len * 0.15);
        if (s.layer >= 2 || front) {
          // the midrib
          ctx.strokeStyle = css(mix(lcLit, [230, 240, 190], 0.3), 0.35);
          ctx.lineWidth = Math.max(0.5, len * 0.025);
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.cos(a) * len * 0.9, ly + Math.sin(a) * len * 0.9); ctx.stroke();
        }
      }
    }
  }

  function leafShape(x, y, a, len, wid) {
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + ux * len * 0.45 + nx * wid, y + uy * len * 0.45 + ny * wid, x + ux * len, y + uy * len);
    ctx.quadraticCurveTo(x + ux * len * 0.45 - nx * wid, y + uy * len * 0.45 - ny * wid, x, y);
    ctx.fill();
  }

  function drawBamboo(seg0, seg1, r, base, col) {
    // a straight length of cut bamboo from seg0 to seg1 with radius r
    const [x0, y0] = seg0, [x1, y1] = seg1, a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
    const g = ctx.createLinearGradient(x0 + nx * r, y0 + ny * r, x0 - nx * r, y0 - ny * r);
    g.addColorStop(0, css(mix(col, [20, 30, 10], 0.4)));
    g.addColorStop(0.65, css(mix(col, [240, 240, 190], 0.3)));
    g.addColorStop(1, css(mix(col, [20, 30, 10], 0.2)));
    ctx.strokeStyle = g;
    ctx.lineWidth = r * 2;
    ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    return { a, nx, ny };
  }

  function render() {
    const g = geom(), e = tubeEnds(g);

    // light through the grove: dark canopy above, a bright misty glow behind, mossy ground below
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, "#16200f");
    sky.addColorStop(0.3, "#3b5233");
    sky.addColorStop(0.62, "#a9bd94");
    sky.addColorStop(1, "#7e9768");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY + 2);
    const glow = ctx.createRadialGradient(W * 0.38, groundY * 0.62, 0, W * 0.38, groundY * 0.62, Math.max(W, H) * 0.55);
    glow.addColorStop(0, "rgba(246,240,200,0.45)");
    glow.addColorStop(1, "rgba(246,240,200,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, groundY);

    // the far grove, ghostly in the mist
    ctx.lineCap = "butt";
    for (const gh of ghosts) {
      ctx.strokeStyle = css(mix(STALK, MIST, 0.86), 0.7);
      ctx.lineWidth = gh.w;
      const lean = gh.lean + (wind + gust) * 0.01 + Math.sin(time * 0.6 + gh.p) * 0.002;
      ctx.beginPath(); ctx.moveTo(gh.x, groundY - 60 * U); ctx.lineTo(gh.x + lean * H, gh.top); ctx.stroke();
    }
    mistBand(groundY - 200 * U, groundY - 40 * U, 0.35);
    for (const s of stalks) if (s.layer === 0) drawStalk(s);
    mistBand(groundY - 120 * U, groundY, 0.55);
    for (const s of stalks) if (s.layer === 1) drawStalk(s);
    mistBand(groundY - 70 * U, groundY + 10 * U, 0.35);

    // sun shafts
    ctx.globalCompositeOperation = "screen";
    for (let k = 0; k < 3; k++) {
      const x0 = W * (0.12 + k * 0.2) + Math.sin(time * 0.05 + k) * 30 * U, a = 0.05 + 0.03 * Math.sin(time * 0.3 + k * 2);
      const sg = ctx.createLinearGradient(x0, 0, x0 + H * 0.45, groundY);
      sg.addColorStop(0, `rgba(255,248,215,${a})`);
      sg.addColorStop(1, "rgba(255,248,215,0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0 + 60 * U, 0); ctx.lineTo(x0 + H * 0.45 + 150 * U, groundY); ctx.lineTo(x0 + H * 0.45, groundY);
      ctx.closePath();
      ctx.fill();
    }
    // pollen and motes drifting through the light
    for (const m of motes) {
      const x = ((m.x + time * m.s * 0.3 + (wind + gust) * 0.002 * time + Math.sin(time * 0.5 + m.p) * 0.01) % 1 + 1) % 1 * W;
      const y = ((m.y + Math.sin(time * m.s * 3 + m.p) * 0.02) % 1) * groundY;
      ctx.fillStyle = `rgba(255,250,220,${0.35 + 0.3 * Math.sin(time * 1.7 + m.p)})`;
      ctx.beginPath(); ctx.arc(x, y, m.r * U, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // ground
    const gr = ctx.createLinearGradient(0, groundY - 10 * U, 0, H);
    gr.addColorStop(0, "#5f7a45");
    gr.addColorStop(0.25, "#3c5129");
    gr.addColorStop(1, "#18220f");
    ctx.fillStyle = gr;
    ctx.fillRect(0, groundY - 2 * U, W, H - groundY + 2 * U);
    for (const m of moss) {
      ctx.fillStyle = css(mix([86, 118, 52], [30, 44, 20], 0.4 + m.c), 0.7);
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css(mix([140, 170, 80], [60, 80, 36], 0.4 + m.c), 0.35); // its sunlit crown
      ctx.beginPath(); ctx.ellipse(m.x - m.rx * 0.15, m.y - m.ry * 0.3, m.rx * 0.6, m.ry * 0.45, 0, 0, TAU); ctx.fill();
    }
    for (const p of pebbles) {
      ctx.fillStyle = "rgba(10,16,6,0.35)";
      ctx.beginPath(); ctx.ellipse(p.x + p.r * 0.3, p.y + p.r * 0.35, p.r, p.r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = css(mix([150, 150, 135], [40, 44, 36], 1 - p.l), 0.85);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.65, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(240,240,220,${0.3 * p.l})`;
      ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.25, p.r * 0.35, p.r * 0.2, 0, 0, TAU); ctx.fill();
    }
    for (const st of steps) drawStep(st);
    // sunlight dappling the ground, shifting as the canopy moves
    ctx.globalCompositeOperation = "screen";
    for (const f of flecks) {
      const a = 0.08 + 0.07 * Math.sin(time * f.s + f.p + (wind + gust) * 3);
      if (a <= 0.01) continue;
      const x = f.x + Math.sin(time * 0.7 + f.p) * (4 + Math.abs(wind + gust) * 10) * U;
      ctx.save();
      ctx.translate(x, f.y);
      ctx.scale(1, 0.4);
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, f.r);
      fg.addColorStop(0, `rgba(255,246,200,${a})`);
      fg.addColorStop(1, "rgba(255,246,200,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(-f.r, -f.r, f.r * 2, f.r * 2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";

    for (const s of stalks) if (s.layer === 2) drawStalk(s);
    drawTufts();

    drawSpout(g);
    drawStone(g);
    drawPosts(g);
    drawBasin(g);
    drawTube(g, e);
    drawWater(g);
    ctx.fillStyle = "rgba(225,242,250,0.75)";
    for (const p of splashes) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.3 * U, 0, TAU); ctx.fill(); }
    for (const f of flashes) {
      const k = f.age / 0.4;
      ctx.strokeStyle = `rgba(255,255,240,${0.5 * (1 - k)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(f.x, f.y, (6 + k * 26) * U, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    drawLeaves();
    for (const s of framers) drawStalk(s, true);

    // the canopy closes in overhead
    const cg = ctx.createLinearGradient(0, 0, 0, H * 0.34);
    cg.addColorStop(0, "rgba(12,20,8,0.9)");
    cg.addColorStop(1, "rgba(12,20,8,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H * 0.34);
    for (const c of canopy) {
      ctx.fillStyle = css(mix([30, 48, 20], [70, 96, 44], c.shade), 0.85);
      leafShape(c.x, c.y, c.a + (wind + gust) * 0.12 + Math.sin(time * 1.2 + c.p) * 0.05, c.len, c.len * 0.17);
    }

    const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(5,10,3,0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStep(st) {
    ctx.fillStyle = "rgba(10,16,6,0.4)";
    ctx.beginPath(); ctx.ellipse(st.x + st.rx * 0.08, st.y + st.ry * 0.5, st.rx * 1.04, st.ry * 1.1, st.a, 0, TAU); ctx.fill();
    ctx.fillStyle = "#545a4c";
    ctx.beginPath(); ctx.ellipse(st.x, st.y + st.ry * 0.25, st.rx, st.ry, st.a, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(st.x - st.rx * 0.35, st.y - st.ry * 0.4, 0, st.x, st.y, st.rx);
    g.addColorStop(0, "#a9ab9c");
    g.addColorStop(1, "#6a6e60");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(st.x, st.y, st.rx, st.ry, st.a, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(96,128,56,0.45)"; // moss in the hollows of its edge
    ctx.beginPath(); ctx.ellipse(st.x + st.rx * 0.6, st.y + st.ry * 0.35, st.rx * 0.3, st.ry * 0.3, st.a, 0, TAU); ctx.fill();
  }

  function drawTufts() {
    ctx.lineCap = "round";
    for (const t of tufts) {
      for (let k = 0; k < t.n; k++) {
        const spread = (k / (t.n - 1) - 0.5) * 1.4, sway = (wind + gust) * 0.25 + Math.sin(time * 1.3 + t.p + k) * 0.06;
        const a = -Math.PI / 2 + spread * 0.7 + sway, len = t.h * (1 - Math.abs(spread) * 0.35);
        ctx.strokeStyle = k % 2 ? "rgba(70,100,36,0.95)" : "rgba(118,150,62,0.9)";
        ctx.lineWidth = Math.max(0.8, 1.6 * U);
        ctx.beginPath();
        ctx.moveTo(t.x + spread * 3 * U, t.y);
        ctx.quadraticCurveTo(t.x + spread * 5 * U + Math.cos(a) * len * 0.5, t.y + Math.sin(a) * len * 0.6, t.x + spread * 4 * U + Math.cos(a) * len, t.y + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }

  function mistBand(y0, y1, a) {
    const m = ctx.createLinearGradient(0, y0, 0, y1);
    m.addColorStop(0, css(MIST, 0));
    m.addColorStop(0.7, css(MIST, a));
    m.addColorStop(1, css(MIST, a * 0.6));
    ctx.fillStyle = m;
    ctx.fillRect(0, y0, W, y1 - y0);
  }

  function drawSpout(g) {
    // a long bamboo pipe from off to the right, propped on a crossed stand
    const r = 7 * U, standX = Math.min(W - 30 * U, g.sx + 150 * U);
    for (const side of [-1, 1]) drawBamboo([standX + side * 22 * U, groundY + 4 * U], [standX - side * 10 * U, g.sy - 18 * U], 4 * U, 0, [120, 104, 64]);
    ctx.strokeStyle = "#3b2a18";
    ctx.lineWidth = 2 * U;
    ctx.beginPath(); ctx.moveTo(standX - 12 * U, g.sy - 6 * U); ctx.lineTo(standX + 12 * U, g.sy + 2 * U); ctx.stroke(); // the binding
    drawBamboo([W + 30 * U, g.sy - 10 * U], [g.sx, g.sy], r, 0, [128, 146, 70]);
    for (let x = g.sx + 70 * U; x < W + 30 * U; x += 90 * U) {
      const y = g.sy - ((x - g.sx) / (W + 30 * U - g.sx)) * 10 * U;
      ctx.strokeStyle = "rgba(40,50,20,0.7)";
      ctx.lineWidth = 2 * U;
      ctx.beginPath(); ctx.moveTo(x, y - r * 1.05); ctx.lineTo(x, y + r * 1.05); ctx.stroke();
    }
    ctx.fillStyle = "#2a3214";
    ctx.beginPath(); ctx.ellipse(g.sx, g.sy, r * 0.45, r, 0, 0, TAU); ctx.fill(); // the open end
  }

  function drawStone(g) {
    // the upright striking stone under the tube's back end
    const restBack = { y: g.py - Math.sin(g.aRest) * g.L * (1 - g.front) };
    const top = restBack.y + g.tr, w = 42 * U;
    const sg = ctx.createLinearGradient(g.kx - w, 0, g.kx + w, 0);
    sg.addColorStop(0, "#5b5e55");
    sg.addColorStop(0.4, "#8d8f84");
    sg.addColorStop(1, "#3a3c35");
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(g.kx + 10 * U, groundY + 4 * U, w * 1.3, 9 * U, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(g.kx - w, groundY + 4 * U);
    ctx.bezierCurveTo(g.kx - w * 1.05, top + 30 * U, g.kx - w * 0.5, top, g.kx + w * 0.1, top);
    ctx.bezierCurveTo(g.kx + w * 0.7, top + 4 * U, g.kx + w * 1.05, top + 40 * U, g.kx + w * 0.95, groundY + 4 * U);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (const sp of speckle) {
      ctx.fillStyle = sp.l ? "rgba(220,222,210,0.25)" : "rgba(20,22,18,0.3)";
      ctx.beginPath(); ctx.arc(g.kx - w + sp.u * w * 2, top + sp.v * (groundY - top), sp.r * U, 0, TAU); ctx.fill();
    }
    // dark and glossy where the tube keeps landing
    const wet = ctx.createRadialGradient(g.kx, top + 4 * U, 0, g.kx, top + 4 * U, w * 0.6);
    wet.addColorStop(0, "rgba(20,26,22,0.45)");
    wet.addColorStop(1, "rgba(20,26,22,0)");
    ctx.fillStyle = wet;
    ctx.fillRect(g.kx - w, top - 4 * U, w * 2, w);
    ctx.fillStyle = "rgba(230,240,240,0.35)";
    ctx.beginPath(); ctx.ellipse(g.kx - w * 0.15, top + 5 * U, w * 0.18, 2 * U, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(90,120,50,0.55)"; // moss on its shoulder
    ctx.beginPath(); ctx.ellipse(g.kx - w * 0.45, top + 18 * U, w * 0.35, 6 * U, -0.5, 0, TAU); ctx.fill();
  }

  function drawPosts(g) {
    // a forked pair of posts holding the pivot pin
    for (const off of [-1, 1]) drawBamboo([g.px + off * 7 * U, groundY + 4 * U], [g.px + off * 7 * U, g.py - 10 * U], 5 * U, 0, [110, 98, 60]);
    // a few turns of rope lashing the posts together below the pin
    ctx.strokeStyle = "#4a3620";
    ctx.lineWidth = 1.6 * U;
    for (let k = 0; k < 3; k++) { const y = g.py + (14 + k * 4) * U; ctx.beginPath(); ctx.moveTo(g.px - 13 * U, y); ctx.lineTo(g.px + 13 * U, y + 2 * U); ctx.stroke(); }
    ctx.strokeStyle = "rgba(220,190,140,0.3)";
    ctx.lineWidth = 0.8 * U;
    for (let k = 0; k < 3; k++) { const y = g.py + (13.4 + k * 4) * U; ctx.beginPath(); ctx.moveTo(g.px - 12 * U, y); ctx.lineTo(g.px + 12 * U, y + 2 * U); ctx.stroke(); }
  }

  function drawTube(g, e) {
    const col = [150, 170, 74];
    const { nx, ny, a } = drawBamboo([e.bx, e.by], [e.mx, e.my], g.tr, 0, col);
    // nodes and the pivot pin
    for (const t of [0.12, 0.55]) {
      const x = lerp(e.bx, e.mx, t), y = lerp(e.by, e.my, t);
      ctx.strokeStyle = "rgba(50,62,22,0.8)";
      ctx.lineWidth = 2.4 * U;
      ctx.beginPath(); ctx.moveTo(x + nx * g.tr * 1.05, y + ny * g.tr * 1.05); ctx.lineTo(x - nx * g.tr * 1.05, y - ny * g.tr * 1.05); ctx.stroke();
    }
    ctx.fillStyle = "#3b2a18";
    ctx.beginPath(); ctx.arc(g.px, g.py, 3.2 * U, 0, TAU); ctx.fill();
    // the closed back end and the slanted open mouth
    ctx.fillStyle = css(mix(col, [40, 50, 20], 0.3));
    ctx.beginPath(); ctx.ellipse(e.bx, e.by, g.tr * 0.35, g.tr, a, 0, TAU); ctx.fill();
    ctx.fillStyle = css(mix(col, [250, 245, 210], 0.45)); // the pale cut wall of the bamboo
    ctx.beginPath(); ctx.ellipse(e.mx, e.my, g.tr * 1.02, g.tr * 0.64, a - 0.9, 0, TAU); ctx.fill();
    ctx.fillStyle = "#26300f";
    ctx.beginPath(); ctx.ellipse(e.mx, e.my, g.tr * 0.86, g.tr * 0.5, a - 0.9, 0, TAU); ctx.fill();
    // a long highlight down the tube
    ctx.strokeStyle = "rgba(240,250,210,0.35)";
    ctx.lineWidth = 1.6 * U;
    ctx.beginPath(); ctx.moveTo(e.bx - nx * g.tr * 0.55, e.by - ny * g.tr * 0.55); ctx.lineTo(e.mx - nx * g.tr * 0.55, e.my - ny * g.tr * 0.55); ctx.stroke();
    if (tube.w > 0.55 && tube.state === "fill") { // water brimming in the mouth
      ctx.fillStyle = `rgba(200,230,240,${(tube.w - 0.55) * 1.4})`;
      ctx.beginPath(); ctx.ellipse(e.mx, e.my, g.tr * 0.65, g.tr * 0.35, a - 0.9, 0, TAU); ctx.fill();
    }
  }

  function drawBasin(g) {
    const { bx, rimY, brx, bry } = g;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(bx + 12 * U, groundY + 6 * U, brx * 1.1, 12 * U, 0, 0, TAU); ctx.fill();
    const sg = ctx.createLinearGradient(bx - brx, 0, bx + brx, 0);
    sg.addColorStop(0, "#4c4f47");
    sg.addColorStop(0.35, "#8a8c80");
    sg.addColorStop(1, "#33352f");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(bx - brx, rimY);
    ctx.bezierCurveTo(bx - brx, rimY + 40 * U, bx - brx * 0.75, groundY + 6 * U, bx - brx * 0.55, groundY + 6 * U);
    ctx.lineTo(bx + brx * 0.55, groundY + 6 * U);
    ctx.bezierCurveTo(bx + brx * 0.75, groundY + 6 * U, bx + brx, rimY + 40 * U, bx + brx, rimY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(96,128,56,0.5)"; // moss creeping up the side
    ctx.beginPath(); ctx.ellipse(bx - brx * 0.6, rimY + 34 * U, brx * 0.3, 8 * U, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#a3a596";
    ctx.beginPath(); ctx.ellipse(bx, rimY, brx, bry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(255,255,240,0.25)"; // the lit far edge of the rim
    ctx.beginPath(); ctx.ellipse(bx, rimY - bry * 0.08, brx * 0.98, bry * 0.9, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.ellipse(bx, rimY, brx * 0.86, bry * 0.74, 0, Math.PI * 1.95, Math.PI * 1.05, true); ctx.fill();
    ctx.fillStyle = "#4a4e44"; // the inner wall in shadow
    ctx.beginPath(); ctx.ellipse(bx, rimY + 1 * U, brx * 0.86, bry * 0.76, 0, 0, TAU); ctx.fill();
    // the water, with the bright grove reflected in it
    const wg = ctx.createLinearGradient(0, rimY - bry, 0, rimY + bry);
    wg.addColorStop(0, "#c9d8b8");
    wg.addColorStop(0.5, "#5b7a62");
    wg.addColorStop(1, "#22362a");
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.ellipse(bx, rimY + 2 * U, brx * 0.84, bry * 0.72, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(bx, rimY + 2 * U, brx * 0.84, bry * 0.72, 0, 0, TAU); ctx.clip();
    const sky = ctx.createLinearGradient(bx - brx, 0, bx + brx, 0);
    sky.addColorStop(0.3, "rgba(255,255,240,0)");
    sky.addColorStop(0.45, "rgba(255,255,240,0.22)");
    sky.addColorStop(0.6, "rgba(255,255,240,0)");
    ctx.fillStyle = sky;
    ctx.fillRect(bx - brx, rimY - bry, brx * 2, bry * 2);
    for (const r of ripples) {
      const k = r.age / 1.8, R = (4 + k * 70) * U;
      ctx.strokeStyle = `rgba(240,250,240,${0.45 * r.amp * (1 - k) * (1 - k)})`;
      ctx.lineWidth = 1.3 * U;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, R, R * 0.28, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWater(g) {
    // the falling stream: a thin line plus glinting drops
    ctx.lineCap = "round";
    ctx.fillStyle = "rgba(220,240,250,0.75)";
    for (const d of drops) { ctx.beginPath(); ctx.ellipse(d.x, d.y, 1.4 * U, 3.2 * U, 0, 0, TAU); ctx.fill(); }
    const e = tubeEnds(g), end = tube.state === "fill" ? e.my - g.tr : g.rimY, flow = (opts.flow + 1) / 3;
    for (const [wd, a] of [[3.2, 0.22], [1.2, 0.55]]) {
      ctx.strokeStyle = `rgba(215,238,248,${a})`;
      ctx.lineWidth = wd * U * (0.7 + flow * 0.4);
      ctx.beginPath(); ctx.moveTo(g.sx, g.sy + 3 * U);
      ctx.quadraticCurveTo(g.sx + 1 * U, (g.sy + end) / 2, g.sx + 2 * U + Math.sin(time * 9) * 0.4 * U, end);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(225,242,250,0.8)";
    for (const d of pours) { ctx.beginPath(); ctx.arc(d.x, d.y, 2.2 * U, 0, TAU); ctx.fill(); }
  }

  function drawLeaves() {
    for (const l of leaves) {
      const a = l.landed ? Math.max(0, 1 - l.age / 9) : 1, s = l.size * U;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      ctx.scale(1, l.landed ? 0.45 : Math.abs(Math.cos(l.age * 3 + l.ph)) * 0.8 + 0.2); // it turns as it falls
      ctx.fillStyle = css(l.c);
      leafShape(-12 * s, 0, 0, 24 * s, 4 * s);
      ctx.restore();
    }
  }

  // ---------- UI ----------
  function syncUi() {
    $("bamboo-flow-lbl").textContent = FLOWS[opts.flow].name;
    $("bamboo-breeze-lbl").textContent = BREEZES[opts.breeze].name;
    $("bamboo-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("bamboo-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("bamboo-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("bamboo-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("bamboo-flow").addEventListener("click", () => { opts.flow = (opts.flow + 1) % FLOWS.length; saveOpts(); syncUi(); Z.ensureAudio(); startLoops(); });
  $("bamboo-breeze").addEventListener("click", () => {
    opts.breeze = (opts.breeze + 1) % BREEZES.length;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    startLoops();
    gust = clamp(gust + 0.3 * opts.breeze, -2, 2);
  });
  $("bamboo-tip").addEventListener("click", () => { Z.ensureAudio(); startLoops(); tipNow(); });
  $("bamboo-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("bamboo-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    U = clamp(Math.min(W / 1.1, H) / 800, 0.5, 1.35);
    cx = W / 2 - 40 * U;
    groundY = H * 0.76;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    makeScene();
    tube.a = clamp(tube.a, geom().aRest, geom().aDown);
    drops.length = pours.length = ripples.length = 0;
  }
  window.addEventListener("resize", resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else if (loops && Z.ac) updateLoops();
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has("debug")) {
    window.__bamboo = { tube, opts, update, render, tap, tipNow, ripples, leaves, ptr, get stalks() { return stalks; }, get gust() { return gust; }, get wind() { return wind; } };
  }

  resize();
  syncUi();
  requestAnimationFrame(frame);
})();
