// Window: rain on a windowpane at night, blurred lights beyond it. Drops land, merge, and slide
// down in stop-start runs; each one is a little lens showing the view upside down. Condensation
// fogs the glass: drag to wipe it, hold to breathe on it and then draw in the fog, tap to tap the
// glass. Shares game.js's audio engine through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("pane");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, U = 1;

  const KEY = "drift-window-v1";
  const RAINS = [{ name: "Drizzle", rate: 45, big: 0.05, roar: 0.025 }, { name: "Rain", rate: 130, big: 0.08, roar: 0.055 }, { name: "Storm", rate: 280, big: 0.12, roar: 0.095 }];
  const VIEWS = ["City", "Forest", "Dusk"];
  const opts = { rain: 1, view: 0, fog: true };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.rain = clamp(opts.rain | 0, 0, RAINS.length - 1);
  opts.view = clamp(opts.view | 0, 0, VIEWS.length - 1);
  opts.fog = opts.fog !== false;
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "window";

  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---------- The view beyond the glass ----------
  // pre-rendered at device resolution so drops can sample it for their lens
  let bg = null, bgx = null;
  const FOG_TINT = [[196, 206, 222], [200, 212, 204], [226, 206, 206]];

  function renderView() {
    bg = document.createElement("canvas");
    bg.width = Math.round(W * DPR);
    bg.height = Math.round(H * DPR);
    bgx = bg.getContext("2d");
    const b = bgx;
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const view = VIEWS[opts.view];
    const sky = b.createLinearGradient(0, 0, 0, H);
    if (view === "City") { sky.addColorStop(0, "#080d24"); sky.addColorStop(0.55, "#1b2550"); sky.addColorStop(1, "#3b2843"); }
    else if (view === "Forest") { sky.addColorStop(0, "#111a17"); sky.addColorStop(0.5, "#26352d"); sky.addColorStop(1, "#3c3d31"); }
    else { sky.addColorStop(0, "#241a3a"); sky.addColorStop(0.45, "#8f4f72"); sky.addColorStop(0.68, "#e59a6c"); sky.addColorStop(1, "#3a2630"); }
    b.fillStyle = sky;
    b.fillRect(0, 0, W, H);

    const blob = (x, y, r, c, a, soft = 0.55) => {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(c, a));
      g.addColorStop(soft, css(c, a * 0.85));
      g.addColorStop(1, css(c, 0));
      b.fillStyle = g;
      b.fillRect(x - r, y - r, r * 2, r * 2);
    };

    if (view === "Forest") {
      // soft dark trunks and crowns, a mist, and a few cabin lights between the trees
      for (let i = 0; i < 26; i++) { const x = rand(-0.05, 1.05) * W; blob(x, H * rand(0.3, 0.7), rand(60, 160) * U, [8, 14, 10], rand(0.35, 0.6), 0.3); }
      for (let i = 0; i < 10; i++) blob(rand(0, W), H * rand(0.55, 0.8), rand(100, 220) * U, [150, 170, 150], rand(0.05, 0.1), 0.2);
    } else if (view === "Dusk") {
      b.fillStyle = "rgba(40,24,40,0.85)"; // far hills
      b.beginPath(); b.moveTo(0, H);
      for (let x = 0; x <= W; x += 40) b.lineTo(x, H * 0.66 + Math.sin(x * 0.006) * 30 * U + Math.sin(x * 0.017) * 12 * U);
      b.lineTo(W, H); b.fill();
      blob(W * 0.62, H * 0.6, 160 * U, [255, 214, 160], 0.35, 0.2); // the low sun behind cloud
    }

    b.globalCompositeOperation = "lighter";
    const palettes = {
      City: [[255, 186, 104], [255, 140, 80], [255, 238, 214], [120, 214, 230], [255, 90, 90], [255, 210, 130]],
      Forest: [[255, 176, 96], [255, 206, 140], [255, 150, 80]],
      Dusk: [[255, 200, 150], [255, 160, 120], [255, 230, 190], [200, 170, 255]],
    }[view];
    const n = view === "City" ? 80 : view === "Forest" ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const y = view === "City" ? H * rand(0.25, 1) : H * rand(0.5, 0.95);
      blob(rand(0, W), y, rand(12, view === "City" ? 70 : 50) * U, palettes[(Math.random() * palettes.length) | 0], rand(0.12, 0.45), 0.72);
    }
    if (view === "City") {
      // streaks of traffic far below
      for (let i = 0; i < 6; i++) {
        const y = H * rand(0.82, 0.97), c = Math.random() < 0.5 ? [255, 90, 70] : [255, 236, 200];
        const g = b.createLinearGradient(0, y, W, y);
        g.addColorStop(0, css(c, 0)); g.addColorStop(rand(0.3, 0.7), css(c, 0.25)); g.addColorStop(1, css(c, 0));
        b.fillStyle = g;
        b.fillRect(0, y - 6 * U, W, 12 * U);
      }
    }
    b.globalCompositeOperation = "source-over";
  }

  // ---------- Condensation ----------
  // three low-resolution layers, stretched over the glass: the natural fog pattern (heavier at the
  // bottom), a mask of where you've wiped (it fades, so the fog creeps back), and your breath
  const FOG_SCALE = 0.33;
  let fogTarget = null, wiped = null, wipedx = null, breath = null, breathx = null, comp = null, compx = null;
  let fogLevel = opts.fog ? 1 : 0;
  const layer = (fw, fh) => { const c = document.createElement("canvas"); c.width = fw; c.height = fh; return [c, c.getContext("2d")]; };
  function makeFog() {
    const fw = Math.max(1, Math.round(W * FOG_SCALE)), fh = Math.max(1, Math.round(H * FOG_SCALE));
    let t;
    [fogTarget, t] = layer(fw, fh);
    [wiped, wipedx] = layer(fw, fh);
    [breath, breathx] = layer(fw, fh);
    [comp, compx] = layer(fw, fh);
    const tint = FOG_TINT[opts.view];
    const g = t.createLinearGradient(0, 0, 0, fh);
    g.addColorStop(0, css(tint, 0.04));
    g.addColorStop(0.55, css(tint, 0.14));
    g.addColorStop(1, css(tint, 0.36));
    t.fillStyle = g;
    t.fillRect(0, 0, fw, fh);
    // uneven: thicker patches here and there
    for (let i = 0; i < 40; i++) {
      const x = rand(0, fw), y = rand(fh * 0.25, fh), r = rand(8, 30);
      const pg = t.createRadialGradient(x, y, 0, x, y, r);
      pg.addColorStop(0, css(tint, 0.12));
      pg.addColorStop(1, css(tint, 0));
      t.fillStyle = pg;
      t.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function wipe(x0, y0, x1, y1, r) {
    for (const [c, op] of [[wipedx, "source-over"], [breathx, "destination-out"]]) {
      c.save();
      c.globalCompositeOperation = op;
      c.lineCap = "round";
      c.strokeStyle = "rgba(0,0,0,0.9)";
      c.lineWidth = r * 2 * FOG_SCALE;
      c.beginPath(); c.moveTo(x0 * FOG_SCALE, y0 * FOG_SCALE); c.lineTo(x1 * FOG_SCALE, y1 * FOG_SCALE); c.stroke();
      c.restore();
    }
  }

  // a soft round stamp made of solid concentric circles: gradients get dithered by the browser,
  // and stamping a dithered gradient on the same spot over and over turns the dither into a grid
  let puff = null;
  function makePuff() {
    const R = 64;
    puff = document.createElement("canvas");
    puff.width = puff.height = R * 2;
    const p = puff.getContext("2d");
    for (let k = 16; k >= 1; k--) {
      p.fillStyle = "rgba(255,255,255,0.08)";
      p.beginPath(); p.arc(R, R, (R * k) / 16, 0, TAU); p.fill();
    }
  }
  let puffTint = null;
  function tintedPuff() {
    if (!puffTint) {
      puffTint = document.createElement("canvas");
      puffTint.width = puff.width; puffTint.height = puff.height;
      const t = puffTint.getContext("2d");
      t.drawImage(puff, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = css(FOG_TINT[opts.view]);
      t.fillRect(0, 0, puff.width, puff.height);
    }
    return puffTint;
  }

  function breatheAt(x, y, k) {
    if (!puff) makePuff();
    const r = (60 + 50 * k) * U * FOG_SCALE, fx = x * FOG_SCALE + rand(-1, 1), fy = y * FOG_SCALE + rand(-1, 1);
    breathx.save();
    breathx.globalAlpha = 0.12;
    breathx.drawImage(tintedPuff(), fx - r, fy - r, r * 2, r * 2);
    breathx.restore();
    // breath on glass you've just wiped fogs it again
    wipedx.save();
    wipedx.globalCompositeOperation = "destination-out";
    wipedx.globalAlpha = 0.12;
    wipedx.drawImage(puff, fx - r, fy - r, r * 2, r * 2);
    wipedx.restore();
  }

  function fade(c, k) {
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = `rgba(0,0,0,${k})`;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }

  function composeFog() {
    compx.clearRect(0, 0, comp.width, comp.height);
    if (fogLevel > 0.01) { compx.globalAlpha = fogLevel; compx.drawImage(fogTarget, 0, 0); compx.globalAlpha = 1; }
    compx.drawImage(breath, 0, 0);
    compx.globalCompositeOperation = "destination-out";
    compx.drawImage(wiped, 0, 0);
    compx.globalCompositeOperation = "source-over";
  }

  // ---------- Drops ----------
  const drops = [];
  const MAX_DROPS = 900;
  const CELL = 28;
  let grid = new Map();
  const cellKey = (x, y) => ((x / CELL) | 0) * 4096 + ((y / CELL) | 0);

  function rebuildGrid() {
    grid = new Map();
    for (const d of drops) {
      if (d.dead) continue;
      const k = cellKey(d.x, d.y);
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(d);
    }
  }
  function neighbours(x, y, fn) {
    const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = grid.get((cx + i) * 4096 + (cy + j));
      if (c) for (const d of c) if (!d.dead) fn(d);
    }
  }

  const SLIDE_R = () => 5.2 * U;
  function addDrop(x, y, r, born = time) {
    const d = { x, y, r, vy: 0, stick: rand(0, 0.6), wob: rand(0, TAU), trail: 0, born, dead: false };
    // landing on another drop joins them
    let merged = null;
    neighbours(x, y, (o) => { if (!merged && Math.hypot(o.x - x, o.y - y) < o.r + r) merged = o; });
    if (merged) { absorb(merged, d); return merged; }
    drops.push(d);
    const k = cellKey(x, y);
    let c = grid.get(k);
    if (!c) grid.set(k, (c = []));
    c.push(d);
    return d;
  }
  function absorb(a, b) {
    const A = a.r * a.r, B = b.r * b.r;
    a.x = (a.x * A + b.x * B) / (A + B);
    a.y = (a.y * A + b.y * B) / (A + B);
    a.r = Math.sqrt(A + B);
    b.dead = true;
  }

  // ---------- Scene state ----------
  let time = 0, flash = 0, flashTimer = rand(10, 25), thunderAt = -1;
  const steam = [];

  // ---------- Audio ----------
  const audio = () => (Z.audioOk() ? Z.ac : null);
  const panOf = (x) => clamp((x / W) * 2 - 1, -0.9, 0.9);

  // a drop striking the glass: tiny, high and glassy
  function tick(x, vol = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x)), f = rand(2600, 5200);
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.03);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rand(0.006, 0.016) * vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.05);
  }

  // a fingertip tapping the pane
  function tink(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    for (const [f, v, decay] of [[2350, 1, 0.3], [5120, 0.35, 0.15], [380, 0.5, 0.06]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f * rand(0.99, 1.01);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045 * v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
  }

  function thunder() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(rand(-0.6, 0.6));
    const n = Z.noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 5);
    g.gain.setValueAtTime(0, t);
    let tt = t + rand(0.3, 0.8);
    g.gain.linearRampToValueAtTime(0.22, tt);
    for (let k = 0; k < 3; k++) { tt += rand(0.5, 1.1); g.gain.linearRampToValueAtTime(rand(0.06, 0.18), tt); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    n.connect(lp).connect(g).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 6.1);
  }

  // continuous layers: the rain outside, a cloth-soft swish when wiping, a breath on the glass
  let loops = null;
  function startLoops() {
    const ac = audio();
    if (loops || !ac) return;
    const layer = (filters, out = Z.output(0)) => {
      const n = Z.noise(), g = ac.createGain();
      let node = n;
      const fs = filters.map(([type, freq, q = 0.7]) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; return f; });
      g.gain.value = 0;
      node.connect(g).connect(out);
      n.start(0, rand(0, 1.9));
      return { g, f: fs[0] };
    };
    loops = { roar: layer([["highpass", 900], ["lowpass", 6500]]), low: layer([["lowpass", 420]]), swish: layer([["bandpass", 1400, 0.8]]), breath: layer([["lowpass", 900], ["highpass", 180]]) };
  }
  function updateLoops(wipeSpeed, breathing) {
    if (!loops) return;
    const t = Z.ac.currentTime, on = here(), R = RAINS[opts.rain];
    loops.roar.g.gain.setTargetAtTime(on ? R.roar : 0, t, 0.6);
    loops.low.g.gain.setTargetAtTime(on ? R.roar * 0.7 : 0, t, 0.6);
    loops.swish.g.gain.setTargetAtTime(on ? clamp(wipeSpeed / 2000, 0, 1) * 0.07 : 0, t, 0.06);
    loops.swish.f.frequency.setTargetAtTime(900 + clamp(wipeSpeed, 0, 2500) * 0.5, t, 0.08);
    loops.breath.g.gain.setTargetAtTime(on && breathing ? 0.05 : 0, t, breathing ? 0.25 : 0.4);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, st: 0, moved: false, breath: 0 };
  let interactions = 0;
  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("pane-title").classList.add("fade");
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false, breath: 0 });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    const px = ptr.x, py = ptr.y;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (!ptr.moved && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) ptr.moved = true;
    if (ptr.moved) {
      const r = 22 * U;
      wipe(px, py, ptr.x, ptr.y, r);
      // the fingertip sweeps the drops it passes off the outside of the pane too
      const len = Math.hypot(ptr.x - px, ptr.y - py), steps = Math.max(1, Math.ceil(len / (r * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const x = lerp(px, ptr.x, s / steps), y = lerp(py, ptr.y, s / steps);
        neighbours(x, y, (d) => { if (Math.hypot(d.x - x, d.y - y) < r + d.r * 0.5) d.dead = true; });
      }
    }
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    if (!ptr.moved && time - ptr.st < 0.35) tapGlass(ptr.x, ptr.y);
    noteInteraction();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());

  function tapGlass(x, y) {
    tink(x);
    // the knock shivers drops loose nearby
    for (const d of drops) {
      if (d.dead) continue;
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < 140 * U) { d.stick = 0; d.vy += (1 - dist / (140 * U)) * 160 * U * (d.r / (4 * U)); d.wob += rand(-1, 1); }
    }
  }

  // ---------- Simulation ----------
  let tickBudget = 0, rebuildTimer = 0, fadeAcc = 0;
  function update(dt) {
    time += dt;
    const R = RAINS[opts.rain];

    // new drops land
    let n = R.rate * dt;
    while (n > 0) {
      if (Math.random() < n) {
        const big = Math.random() < R.big;
        addDrop(rand(0, W), rand(-10, H), big ? rand(3, 6) * U : rand(0.7, 2.4) * U);
        if (Math.random() < 0.12 && tickBudget < 20) { tickBudget++; tick(rand(0, W), big ? 1.6 : 1); }
      }
      n -= 1;
    }
    tickBudget = Math.max(0, tickBudget - dt * 30);

    // the big ones slide: stick, slip, stick again, absorbing what they meet and leaving beads behind
    const sr = SLIDE_R(), g = 520 * U;
    for (const d of drops) {
      if (d.dead || d.r < sr) continue;
      if (d.stick > 0) { d.stick -= dt; d.vy *= 0.8; continue; }
      d.vy = Math.min(d.vy + g * ((d.r - sr) / sr + 0.3) * dt, (90 + d.r * 18) * U);
      const dy = d.vy * dt;
      d.y += dy;
      d.x += Math.sin(time * 1.3 + d.wob) * 6 * U * dt;
      d.trail += dy;
      if (Math.random() < dt * 1.6) { d.stick = rand(0.05, 0.6); d.vy *= 0.3; }
      if (d.trail > d.r * 1.4) {
        d.trail = 0;
        const bead = d.r * rand(0.18, 0.3);
        if (d.r > sr * 0.95) { d.r = Math.sqrt(Math.max(0, d.r * d.r - bead * bead)); drops.push({ x: d.x + rand(-1, 1) * U, y: d.y - d.r * 1.2, r: bead, vy: 0, stick: 0, wob: 0, trail: 0, born: time, dead: false }); }
      }
      neighbours(d.x, d.y, (o) => { if (o !== d && Math.hypot(o.x - d.x, o.y - d.y) < (o.r + d.r) * 0.9) absorb(d, o); });
      if (d.y > H + d.r * 2) d.dead = true;
    }

    // tidy up: drop the dead, keep the count sensible, refresh the grid
    if ((rebuildTimer -= dt) <= 0 || drops.length > MAX_DROPS) {
      rebuildTimer = 0.25;
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
      if (drops.length > MAX_DROPS) {
        // the oldest small beads evaporate first
        drops.sort((a, b) => (a.r < SLIDE_R() ? a.born : 1e9) - (b.r < SLIDE_R() ? b.born : 1e9));
        drops.splice(0, drops.length - MAX_DROPS);
      }
      rebuildGrid();
    }

    // condensation creeps back over wiped glass, and breath slowly clears
    fogLevel = lerp(fogLevel, opts.fog ? 1 : 0, Math.min(1, dt * 0.8));
    // (in batches: tiny per-frame fades would round away in the canvas's 8-bit alpha)
    fadeAcc += dt;
    if (wipedx && fadeAcc > 0.4) { fade(wipedx, Math.min(1, fadeAcc * 0.045)); fade(breathx, Math.min(1, fadeAcc * 0.02)); fadeAcc = 0; }

    // held still: breathe on the glass
    const breathing = ptr.down && !ptr.moved && time - ptr.st > 0.35;
    if (breathing) { ptr.breath = Math.min(1, ptr.breath + dt * 0.8); breatheAt(ptr.x, ptr.y, ptr.breath); }

    // lightning in a storm, thunder a little after
    flash = Math.max(0, flash - dt * 2.5);
    if (opts.rain === 2 && (flashTimer -= dt) <= 0) {
      flashTimer = rand(14, 32);
      flash = 1;
      thunderAt = time + rand(0.6, 2.2);
    }
    if (thunderAt > 0 && time >= thunderAt) { thunderAt = -1; thunder(); }

    // steam from the mug
    if (Math.random() < dt * 9) steam.push({ x: rand(-6, 6) * U, y: 0, age: 0, p: rand(0, TAU) });
    for (const s of steam) { s.age += dt; s.y -= 16 * U * dt; s.x += Math.sin(s.age * 1.6 + s.p) * 6 * U * dt; }
    while (steam.length && steam[0].age > 3.5) steam.shift();

    const wipeSpeed = ptr.down && ptr.moved ? Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly) / Math.max(dt, 1e-3) : 0;
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
    if (Z.ac) { startLoops(); updateLoops(wipeSpeed, breathing); }
  }

  // ---------- Render ----------
  function render() {
    if (!bg) return;
    ctx.drawImage(bg, 0, 0, W, H);
    if (flash > 0.01) {
      ctx.fillStyle = `rgba(210,220,255,${0.22 * flash * flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // drops: small ones are a glint and a shadow; bigger ones are lenses showing the view flipped
    const sr = SLIDE_R();
    for (const d of drops) {
      if (d.dead) continue;
      if (d.r < 2.6 * U) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath(); ctx.arc(d.x, d.y + d.r * 0.35, d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(235,240,255,0.42)";
        ctx.beginPath(); ctx.arc(d.x - d.r * 0.2, d.y - d.r * 0.25, d.r * 0.55, 0, TAU); ctx.fill();
        continue;
      }
      const sliding = d.r >= sr && d.stick <= 0, rx = d.r, ry = d.r * (sliding ? 1.18 : 1.03);
      ctx.save();
      ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU); ctx.clip();
      const span = d.r * 7, sx = (d.x - span / 2) * DPR, sy = (d.y - span / 2) * DPR;
      ctx.translate(d.x, d.y);
      ctx.scale(1, -1);
      ctx.drawImage(bg, clamp(sx, 0, bg.width - 1), clamp(sy, 0, bg.height - 1), span * DPR, span * DPR, -rx, -ry, rx * 2, ry * 2);
      ctx.restore();
      // a darker rim, a bright crescent where it catches the light, a glint
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(0.8, d.r * 0.22);
      ctx.beginPath(); ctx.ellipse(d.x, d.y, rx * 0.92, ry * 0.92, 0, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(0.6, d.r * 0.12);
      ctx.beginPath(); ctx.ellipse(d.x, d.y, rx * 0.88, ry * 0.88, 0, 1.15 * Math.PI, 1.75 * Math.PI); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath(); ctx.arc(d.x - rx * 0.35, d.y - ry * 0.4, Math.max(0.6, d.r * 0.16), 0, TAU); ctx.fill();
    }

    // the condensation, stretched soft over the glass
    if (comp) { composeFog(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(comp, 0, 0, W, H); }

    drawFrame();
    drawMug();

    // a faint reflection of the room on the glass
    const rg = ctx.createLinearGradient(0, 0, W, H);
    rg.addColorStop(0, "rgba(255,230,200,0.05)");
    rg.addColorStop(0.4, "rgba(255,230,200,0)");
    rg.addColorStop(1, "rgba(255,200,150,0.06)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  // window frame with a cross mullion, and the sill in front
  let sillY = 0;
  function drawFrame() {
    const t = Math.max(14, 22 * U), wood = ["#3a2516", "#5a3a22", "#2a190e"];
    const bar = (x, y, w, h, vertical) => {
      const g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, wood[2]); g.addColorStop(0.45, wood[1]); g.addColorStop(1, wood[0]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    bar(0, 0, W, t, false);
    bar(0, 0, t, sillY, true);
    bar(W - t, 0, t, sillY, true);
    bar(W / 2 - t * 0.35, 0, t * 0.7, sillY, true);
    bar(0, sillY * 0.46 - t * 0.35, W, t * 0.7, false);
    // the sill
    const sg = ctx.createLinearGradient(0, sillY, 0, H);
    sg.addColorStop(0, "#6b4528");
    sg.addColorStop(0.12, "#4a2e1a");
    sg.addColorStop(1, "#1e120a");
    ctx.fillStyle = sg;
    ctx.fillRect(0, sillY, W, H - sillY);
    ctx.fillStyle = "rgba(255,210,160,0.18)";
    ctx.fillRect(0, sillY, W, 2);
    // warm lamplight from the room falls on the sill
    const lg = ctx.createRadialGradient(W * 0.8, H, 0, W * 0.8, H, Math.max(W, H) * 0.5);
    lg.addColorStop(0, "rgba(255,170,90,0.18)");
    lg.addColorStop(1, "rgba(255,170,90,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, sillY, W, H - sillY);
  }

  function drawMug() {
    const s = clamp(U, 0.6, 1.2), mx = W - Math.max(90, 150 * U), my = sillY + 18 * s, w = 46 * s, h = 52 * s;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(mx + 6 * s, my + 4 * s, w * 0.75, 8 * s, 0, 0, TAU); ctx.fill();
    // handle, body, rim, tea
    ctx.strokeStyle = "#c9b8a2";
    ctx.lineWidth = 7 * s;
    ctx.beginPath(); ctx.ellipse(mx + w * 0.55, my - h * 0.5, 13 * s, 15 * s, 0, -1.3, 1.3); ctx.stroke();
    const g = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2, 0);
    g.addColorStop(0, "#9e8e7a"); g.addColorStop(0.35, "#efe4d4"); g.addColorStop(1, "#8a7a68");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(mx - w / 2, my - h);
    ctx.lineTo(mx - w / 2 + 2 * s, my - 4 * s);
    ctx.quadraticCurveTo(mx, my + 3 * s, mx + w / 2 - 2 * s, my - 4 * s);
    ctx.lineTo(mx + w / 2, my - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e9dcc8";
    ctx.beginPath(); ctx.ellipse(mx, my - h, w / 2, 6 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#6b3f1c";
    ctx.beginPath(); ctx.ellipse(mx, my - h + 1.5 * s, w / 2 - 3 * s, 4.2 * s, 0, 0, TAU); ctx.fill();
    // steam curling up
    ctx.lineCap = "round";
    for (let i = 1; i < steam.length; i++) {
      const a = steam[i - 1], b = steam[i], k = b.age / 3.5;
      if (b.age < a.age) continue;
      ctx.strokeStyle = `rgba(255,250,240,${0.14 * (1 - k) * Math.min(1, b.age * 2)})`;
      ctx.lineWidth = (2 + b.age * 5) * s;
      ctx.beginPath(); ctx.moveTo(mx + a.x, my - h + a.y); ctx.lineTo(mx + b.x, my - h + b.y); ctx.stroke();
    }
  }

  // ---------- UI ----------
  function syncUi() {
    $("pane-rain-lbl").textContent = RAINS[opts.rain].name;
    $("pane-view-lbl").textContent = VIEWS[opts.view];
    $("pane-fog-lbl").textContent = opts.fog ? "Fog on" : "Fog off";
    $("pane-fog").setAttribute("aria-pressed", opts.fog);
    $("pane-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("pane-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("pane-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("pane-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("pane-rain").addEventListener("click", () => { opts.rain = (opts.rain + 1) % RAINS.length; saveOpts(); syncUi(); Z.ensureAudio(); startLoops(); });
  $("pane-view").addEventListener("click", () => { opts.view = (opts.view + 1) % VIEWS.length; puffTint = null; saveOpts(); syncUi(); renderView(); makeFog(); });
  $("pane-fog").addEventListener("click", () => { opts.fog = !opts.fog; saveOpts(); syncUi(); });
  $("pane-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("pane-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    U = clamp(Math.min(W, H) / 800, 0.6, 1.3);
    sillY = H * 0.86;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    renderView();
    makeFog();
    drops.length = 0;
    // start with the glass already wet
    for (let i = 0; i < Math.min(MAX_DROPS * 0.6, (W * H) / 1400); i++) addDrop(rand(0, W), rand(0, H), Math.random() < 0.12 ? rand(3, 5) * U : rand(0.7, 2.4) * U, -rand(0, 60));
    rebuildGrid();
  }
  window.addEventListener("resize", resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else if (loops && Z.ac) updateLoops(0, false);
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has("debug")) {
    window.__window = { opts, drops, update, render, tapGlass, ptr, get fogLevel() { return fogLevel; } };
  }

  resize();
  syncUi();
  requestAnimationFrame(frame);
})();
