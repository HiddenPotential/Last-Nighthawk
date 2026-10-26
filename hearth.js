// Hearth: a stone fireplace on a quiet night. Logs catch, char and glow along their cracks, then
// collapse into embers; flames lick up from them and sparks rise into the chimney. Tap the fire to
// poke it, hold to fan it, drag to sway the flames, tap the basket to add a log, tap the cat for a
// purr. Shares game.js's audio engine through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("hearth");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, U = 1;

  const KEY = "drift-hearth-v1";
  const opts = { keep: true };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.keep = opts.keep !== false;
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "hearth";

  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // ---------- Layout ----------
  // L holds the fireplace geometry, recomputed on resize
  const L = {};
  function layout() {
    L.floor = H * 0.74;
    L.fw = Math.min(W * 0.86, 760 * U);
    L.fh = Math.min(H * 0.62, 560 * U);
    L.cx = W / 2;
    L.top = L.floor - L.fh;
    L.ow = L.fw * 0.6;
    L.oh = L.fh * 0.62;
    L.arch = L.ow * 0.16;
    L.inset = L.ow * 0.15; // how far the back of the firebox sits in (perspective)
    L.bedY = L.floor - L.oh * 0.07;
    L.mantel = L.floor - L.oh - 30 * U;
    L.catX = clamp(L.cx - L.fw * 0.36, 80 * U, W * 0.4);
    L.catY = L.floor + Math.min(H - L.floor, 200 * U) * 0.52;
    L.basketX = clamp(L.cx + L.fw * 0.56, W * 0.6, W - 70 * U);
    L.basketY = L.floor + Math.min(H - L.floor, 200 * U) * 0.3;
  }

  // the firebox opening: straight sides and a shallow arch on top
  function openingPath(c = ctx, shrink = 0) {
    const x0 = L.cx - L.ow / 2 + shrink, x1 = L.cx + L.ow / 2 - shrink, y0 = L.floor - L.oh + shrink, y1 = L.floor;
    c.beginPath();
    c.moveTo(x0, y1);
    c.lineTo(x0, y0 + L.arch);
    c.quadraticCurveTo(L.cx, y0 - L.arch * 0.6, x1, y0 + L.arch);
    c.lineTo(x1, y1);
    c.closePath();
  }
  const inOpening = (x, y) => Math.abs(x - L.cx) < L.ow / 2 && y < L.floor + 6 * U && y > L.floor - L.oh;

  // ---------- Pre-rendered stone surround ----------
  let stone = null;
  function makeStone() {
    stone = document.createElement("canvas");
    stone.width = Math.round(W * DPR);
    stone.height = Math.round(H * DPR);
    const s = stone.getContext("2d");
    s.setTransform(DPR, 0, 0, DPR, 0, 0);
    const x0 = L.cx - L.fw / 2, y0 = L.top;
    // mortar
    s.fillStyle = "#2a2420";
    s.fillRect(x0, y0, L.fw, L.fh);
    // courses of rounded stones, each a little different
    let y = y0 + 2 * U;
    while (y < L.floor) {
      const h = rand(34, 52) * U;
      let x = x0 + rand(-20, 0) * U;
      while (x < x0 + L.fw) {
        const w = rand(46, 96) * U;
        const tone = rand(-22, 22), warm = rand(0, 14);
        const base = [118 + tone + warm, 108 + tone + warm * 0.5, 98 + tone];
        const g = s.createLinearGradient(x, y, x + w * 0.3, y + h);
        g.addColorStop(0, css(mix(base, [255, 255, 255], 0.12)));
        g.addColorStop(1, css(mix(base, [0, 0, 0], 0.35)));
        s.fillStyle = g;
        s.beginPath();
        if (s.roundRect) s.roundRect(x + 2 * U, y + 2 * U, w - 4 * U, h - 4 * U, Math.min(w, h) * 0.32);
        else s.rect(x + 2 * U, y + 2 * U, w - 4 * U, h - 4 * U);
        s.fill();
        // a few speckles
        for (let k = 0; k < 5; k++) {
          s.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
          s.fillRect(x + rand(6, w - 6) * 1, y + rand(6, h - 6), 2 * U, 2 * U);
        }
        x += w;
      }
      y += h;
    }
    // cut out the firebox (with a solid fill: destination-out removes only as much as the fill's alpha)
    s.globalCompositeOperation = "destination-out";
    s.fillStyle = "#000";
    openingPath(s);
    s.fill();
    s.globalCompositeOperation = "source-over";
  }

  // flame sprites: soft blobs in the colours of a flame from its hot core to its smoky tip
  const RAMP = [[255, 246, 214], [255, 214, 120], [255, 160, 60], [240, 96, 30], [176, 46, 18], [90, 24, 12]];
  const sprites = RAMP.map((c) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const x = cv.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, css(c, 1));
    g.addColorStop(0.35, css(c, 0.55));
    g.addColorStop(1, css(c, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return cv;
  });

  // ---------- Fire state ----------
  const SLOTS = [
    { x: -0.42, row: 0, ang: 0.08 }, { x: 0.4, row: 0, ang: -0.1 },
    { x: -0.25, row: 1, ang: -0.06 }, { x: 0.3, row: 1, ang: 0.12 },
    { x: 0.04, row: 2, ang: 0.32 },
  ];
  const logs = [];
  const flames = [];
  const sparks = [];
  const smoke = [];
  const coals = [];
  let embers = 0.6, flare = 0, fan = 0, wind = 0, time = 0, hiss = 0, purr = 0, catTwitch = 0;
  let F = 0; // overall fire strength, 0..~1.6

  function makeLog(slot, warm) {
    const s = SLOTS[slot];
    const bark = Array.from({ length: 9 }, () => ({ y: rand(-0.85, 0.85), a: rand(-0.5, 0.2), b: rand(-0.1, 0.5) }));
    const cracks = Array.from({ length: 5 }, () => {
      const pts = [];
      let x = rand(-0.4, 0.3), y = rand(-0.6, 0.6);
      for (let k = 0; k < 4; k++) { pts.push([x, y]); x += rand(0.04, 0.12); y = clamp(y + rand(-0.3, 0.3), -0.8, 0.8); }
      return { pts, p: rand(0, TAU) };
    });
    return {
      slot, x: s.x + rand(-0.04, 0.04), row: s.row, ang: s.ang + rand(-0.05, 0.05), len: rand(0.88, 1.06), r: rand(19, 25),
      fuel: 1, heat: warm ? rand(0.6, 0.9) : 0, drop: warm ? 0 : -1, dropV: 0, bark, cracks, wood: rand(-12, 12),
    };
  }

  function addLog(fromBasket = true) {
    const used = new Set(logs.map((l) => l.slot));
    const free = SLOTS.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) { crackle(0.04, 2400, 0.012); return false; }
    // fill the bottom rows first, so logs rest on something
    free.sort((a, b) => SLOTS[a].row - SLOTS[b].row);
    const l = makeLog(free[0], false);
    logs.push(l);
    hiss = Math.min(1.2, hiss + 0.8); // a fresh log hisses as its moisture steams off
    if (fromBasket) noteInteraction();
    return true;
  }

  function poke(x, y) {
    flare = Math.min(1.2, flare + 0.45);
    for (let i = 0; i < 34; i++) {
      const a = -Math.PI / 2 + rand(-0.9, 0.9), sp = rand(120, 360) * U;
      sparks.push({ x: x + rand(-10, 10) * U, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rand(0.6, 1.6), free: Math.random() < 0.25 });
    }
    for (const l of logs) { l.dropV -= rand(30, 80) * U; } // the logs settle with a little bounce
    embers = Math.min(1.3, embers + 0.05);
    scrape();
    for (let i = 0; i < 6; i++) crackle(rand(0.04, 0.1), rand(1500, 4200), rand(0.008, 0.03), i * rand(0.02, 0.06));
  }

  function rowY(row) {
    return row === 0 ? L.bedY - L.oh * 0.075 : row === 1 ? L.bedY + L.oh * 0.005 : L.bedY - L.oh * 0.15;
  }
  const rowScale = (row) => (row === 0 ? 0.86 : row === 1 ? 1 : 0.93);

  function logScreen(l) {
    const sc = rowScale(l.row) * U;
    return { cx: L.cx + l.x * L.ow * 0.3, cy: rowY(l.row) + l.drop * L.oh * 0.4, len: l.len * L.ow * 0.4 * rowScale(l.row), r: l.r * sc };
  }

  function seedCoals() {
    coals.length = 0;
    for (let i = 0; i < 60; i++) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random());
      coals.push({ x: Math.cos(a) * d * 0.46, y: Math.sin(a) * d * 0.08 + rand(-0.01, 0.02), r: rand(5, 12), p: rand(0, TAU), s: rand(0.8, 2.2) });
    }
  }

  // ---------- Audio ----------
  const audio = () => (Z.audioOk() ? Z.ac : null);
  const panOf = (x) => (x / W) * 2 - 1;
  let loops = null, voices = 0;

  function burst(type, freq, q, vol, dur, at = 0, x = L.cx) {
    const ac = audio();
    if (!ac || voices > 40) return;
    voices++;
    const t = ac.currentTime + at, n = Z.noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(Z.output(panOf(x) * 0.5));
    n.start(t, rand(0, 1.8));
    n.stop(t + dur + 0.02);
  }
  // a crackle is a few milliseconds of band-passed noise; louder ones get a tiny thump underneath
  function crackle(vol, freq, dur, at = 0) {
    burst("bandpass", freq, rand(0.8, 2.2), vol, dur, at, L.cx + rand(-L.ow, L.ow) * 0.3);
    if (vol > 0.08) thump(vol * 0.6, rand(70, 120), at);
  }
  function thump(vol, freq, at = 0) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(Z.output(0));
    o.start(t);
    o.stop(t + 0.16);
  }
  // a log landing on the grate
  function clunk() {
    thump(0.16, 95);
    thump(0.08, 160, 0.03);
    burst("lowpass", 700, 0.7, 0.08, 0.12);
    for (let i = 0; i < 4; i++) crackle(rand(0.03, 0.08), rand(1800, 4000), rand(0.01, 0.03), 0.08 + i * rand(0.03, 0.09));
  }
  // the poker scraping through the coals
  function scrape() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, n = Z.noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(1700, t + 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    n.connect(f).connect(g).connect(Z.output(0));
    n.start(t);
    n.stop(t + 0.35);
  }

  function startLoops() {
    const ac = audio();
    if (loops || !ac) return;
    const layer = (filters) => {
      const n = Z.noise(), g = ac.createGain();
      let node = n;
      const fs = filters.map(([type, freq, q = 0.7]) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; node.connect(f); node = f; return f; });
      g.gain.value = 0;
      node.connect(g).connect(Z.output(0));
      n.start(0, rand(0, 1.9));
      return { g, f: fs[0] };
    };
    loops = {
      roar: layer([["lowpass", 320]]), // the deep breath of the fire
      body: layer([["bandpass", 850, 0.6]]),
      fan: layer([["bandpass", 650, 0.8]]),
      hiss: layer([["highpass", 3800]]),
    };
    // purr: low rumble pulsing about 25 times a second
    const n = Z.noise(), lp = ac.createBiquadFilter(), trem = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain(), out = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.value = 170;
    trem.gain.value = 0.55;
    lfo.frequency.value = 25;
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(trem.gain);
    out.gain.value = 0;
    n.connect(lp).connect(trem).connect(out).connect(Z.output(-0.4));
    n.start();
    lfo.start();
    loops.purr = { g: out, lfo };
  }

  function updateLoops() {
    if (!loops || !Z.ac) return;
    const t = Z.ac.currentTime, on = here() && Z.settings.sound;
    loops.roar.g.gain.setTargetAtTime(on ? 0.05 * clamp(F, 0, 1.6) * (1 + fan * 0.8) : 0, t, 0.3);
    loops.body.g.gain.setTargetAtTime(on ? 0.014 * clamp(F, 0, 1.6) : 0, t, 0.3);
    loops.fan.g.gain.setTargetAtTime(on ? fan * 0.09 : 0, t, 0.15);
    loops.fan.f.frequency.setTargetAtTime(500 + fan * 700, t, 0.2);
    loops.hiss.g.gain.setTargetAtTime(on ? clamp(hiss, 0, 1) * 0.022 : 0, t, 0.4);
    loops.purr.g.gain.setTargetAtTime(on ? clamp(purr, 0, 1) * 0.11 : 0, t, purr > 0 ? 0.3 : 0.6);
    loops.purr.lfo.frequency.setTargetAtTime(24 + Math.sin(time * 0.7) * 2, t, 0.5);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, st: 0, moved: false, holding: false };
  let interactions = 0;
  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("hearth-title").classList.add("fade");
  }
  const onCat = (x, y) => Math.hypot((x - L.catX) / 1.5, y - L.catY) < 46 * U;
  const onBasket = (x, y) => Math.abs(x - L.basketX) < 58 * U && Math.abs(y - L.basketY) < 46 * U;

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false, holding: false });
    if (onCat(e.clientX, e.clientY)) { purr = 4; catTwitch = 1; }
    else if (onBasket(e.clientX, e.clientY)) addLog();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 10) ptr.moved = true;
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    const quick = time - ptr.st < 0.32;
    if (!ptr.moved && quick && inOpening(ptr.x, ptr.y) && !onCat(ptr.sx, ptr.sy) && !onBasket(ptr.sx, ptr.sy)) poke(ptr.x, Math.min(ptr.y, L.bedY));
    ptr.down = false;
    ptr.holding = false;
    noteInteraction();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "BUTTON" || !here()) return;
    e.preventDefault();
    Z.ensureAudio();
    startLoops();
    addLog();
  });

  // ---------- Simulation ----------
  let crackleT = 0, autoT = 0, catT = 3;
  function update(dt) {
    time += dt;
    voices = Math.max(0, voices - dt * 60);

    // holding still fans the fire; dragging sways the flames like a draught
    if (ptr.down && !ptr.moved && time - ptr.st > 0.3 && !onCat(ptr.sx, ptr.sy) && !onBasket(ptr.sx, ptr.sy)) ptr.holding = true;
    fan = lerp(fan, ptr.holding ? 1 : 0, Math.min(1, dt * (ptr.holding ? 1.6 : 0.9)));
    const pvx = ptr.down ? (ptr.x - ptr.lx) / dt : 0;
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
    wind = lerp(wind, clamp(pvx / 900, -1, 1), Math.min(1, dt * 3));
    flare = Math.max(0, flare - dt * 0.35);
    hiss = Math.max(0, hiss - dt * 0.12);
    purr = Math.max(0, purr - dt);
    catTwitch = Math.max(0, catTwitch - dt * 1.5);

    // logs catch from the fire around them, burn down, and finally fall to embers
    let burning = 0;
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      if (l.drop < 0 || l.dropV) {
        l.dropV += 1400 * dt;
        l.drop = Math.min(0, l.drop + (l.dropV * dt) / (L.oh * 0.4));
        if (l.drop >= 0) { if (Math.abs(l.dropV) > 300) clunk(); l.dropV = l.dropV > 300 ? -l.dropV * 0.12 : 0; }
      }
      const catching = 0.05 + F * 0.12 + embers * 0.05;
      l.heat = Math.min(1, l.heat + dt * catching * (1 - l.heat) * (1 + fan));
      l.fuel -= dt * l.heat * 0.0055 * (1 + fan * 0.9 + flare * 0.5);
      if (l.heat > 0.3) burning++;
      if (l.fuel < 0.12) {
        // it gives way: a shower of sparks, a soft crunch, and more embers
        const s = logScreen(l);
        for (let k = 0; k < 22; k++) sparks.push({ x: s.cx + rand(-s.len, s.len) * 0.4, y: s.cy, vx: rand(-60, 60) * U, vy: -rand(80, 260) * U, age: 0, life: rand(0.6, 1.4), free: false });
        thump(0.07, 80);
        for (let k = 0; k < 5; k++) crackle(rand(0.03, 0.08), rand(1200, 3600), rand(0.01, 0.03), k * rand(0.02, 0.07));
        embers = Math.min(1.3, embers + 0.3);
        logs.splice(i, 1);
      }
    }
    embers = clamp(embers + dt * (F * 0.012 - 0.006), 0, 1.3);

    F = flare * 0.6 + embers * 0.22;
    for (const l of logs) F += l.heat * Math.min(1, l.fuel * 2.5) * 0.36;
    F *= 1 + fan * 0.45;

    // keep it going: lay on a log when the fire runs low
    autoT -= dt;
    if (opts.keep && autoT <= 0 && burning < 2 && logs.length < 4) { addLog(false); autoT = 8; }

    // flames rise from every burning log
    for (const l of logs) {
      if (l.drop < -0.05) continue;
      const s = logScreen(l), rate = l.heat * Math.min(1, l.fuel * 2) * (26 + fan * 34 + flare * 20);
      let n = rate * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const u = rand(-0.42, 0.42), ca = Math.cos(l.ang), sa = Math.sin(l.ang);
          flames.push({
            x: s.cx + ca * u * s.len * 2, y: s.cy + sa * u * s.len * 2 - s.r * 0.7, z: l.row === 1 ? 1 : 0,
            vx: rand(-10, 10) * U, vy: -rand(45, 85) * U * (1 + fan * 0.8 + flare * 0.5),
            size: rand(15, 28) * U * (0.6 + l.heat * 0.55) * (1 + fan * 0.3), age: 0, life: rand(0.5, 1.05) * (1 + fan * 0.3), p: rand(0, TAU),
          });
        }
        n -= 1;
      }
    }
    // the ember bed licks up small flames of its own
    if (Math.random() < embers * dt * 14) {
      const c = coals[(Math.random() * coals.length) | 0];
      flames.push({ x: L.cx + c.x * L.ow, y: L.bedY + c.y * L.oh, z: 1, vx: rand(-6, 6) * U, vy: -rand(25, 45) * U, size: rand(8, 14) * U, age: 0, life: rand(0.3, 0.6), p: rand(0, TAU) });
    }
    for (const f of flames) {
      f.age += dt;
      f.vy -= 40 * U * dt; // hot gas speeds up as it rises
      f.vx += (wind * 160 * U - f.vx) * dt * 2;
      f.x += (f.vx + Math.sin(f.age * 9 + f.p) * 18 * U) * dt;
      f.y += f.vy * dt;
    }
    for (let i = flames.length - 1; i >= 0; i--) if (flames[i].age > flames[i].life) flames.splice(i, 1);
    if (flames.length > 700) flames.splice(0, flames.length - 700);

    // sparks: a steady trickle, more when the fire is lively
    if (Math.random() < dt * F * 3) sparks.push({ x: L.cx + rand(-0.3, 0.3) * L.ow, y: L.bedY - L.oh * 0.1, vx: rand(-30, 30) * U, vy: -rand(120, 240) * U, age: 0, life: rand(0.8, 1.8), free: false });
    for (const s of sparks) {
      s.age += dt;
      s.vx += (wind * 120 * U - s.vx) * dt * 0.8 + rand(-40, 40) * U * dt;
      s.vy += (s.free ? 260 : -30) * U * dt; // escaped sparks arc back down onto the hearth
      s.vx *= 1 - dt * 0.6;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.free && s.y > L.floor + 30 * U) s.age = s.life;
    }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age > sparks[i].life) sparks.splice(i, 1);

    // a thin smoke drifts up the chimney
    if (Math.random() < dt * (0.8 + F * 2)) smoke.push({ x: L.cx + rand(-0.2, 0.2) * L.ow, y: L.bedY - L.oh * 0.35, vx: rand(-6, 6) * U, vy: -rand(30, 50) * U, r: rand(14, 26) * U, age: 0, life: rand(2, 3.5) });
    for (const s of smoke) { s.age += dt; s.x += (s.vx + wind * 40 * U) * dt; s.y += s.vy * dt; s.r += dt * 10 * U; }
    for (let i = smoke.length - 1; i >= 0; i--) if (smoke[i].age > smoke[i].life) smoke.splice(i, 1);

    // crackles and pops, in little clusters, busier when the fire is strong
    crackleT -= dt;
    if (crackleT <= 0) {
      if (F > 0.05 && audio()) {
        const n = 1 + ((Math.random() * 3) | 0);
        for (let k = 0; k < n; k++) crackle(rand(0.015, 0.07) * Math.min(1, F) * (1 + fan * 0.5), rand(1400, 4800), rand(0.006, 0.03), k * rand(0.012, 0.05));
        if (Math.random() < 0.05 * F) { crackle(0.13, rand(900, 1800), 0.05); for (let k = 0; k < 6; k++) sparks.push({ x: L.cx + rand(-0.3, 0.3) * L.ow, y: L.bedY - L.oh * 0.08, vx: rand(-90, 90) * U, vy: -rand(160, 320) * U, age: 0, life: rand(0.5, 1.2), free: Math.random() < 0.3 }); }
      }
      crackleT = rand(0.05, 0.45) / Math.max(0.25, F);
    }

    // the cat flicks its tail now and then
    catT -= dt;
    if (catT <= 0) { catTwitch = Math.max(catTwitch, 0.6); catT = rand(5, 14); }

    if (Z.ac) updateLoops();
  }

  // ---------- Render ----------
  let glow = 0;
  function render() {
    const flick = 0.86 + 0.07 * Math.sin(time * 7.3) + 0.05 * Math.sin(time * 13.7 + 1.3) + 0.03 * Math.sin(time * 23.1 + 2.1);
    glow = clamp(F, 0, 1.6) * flick;
    const warm = [255, 150, 70];

    // the room: a dark wall, then wooden floorboards running toward you
    const wall = ctx.createLinearGradient(0, 0, 0, L.floor);
    wall.addColorStop(0, "#120c0a");
    wall.addColorStop(1, "#2a1a12");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, L.floor);
    const fl = ctx.createLinearGradient(0, L.floor, 0, H);
    fl.addColorStop(0, "#3a2416");
    fl.addColorStop(1, "#1c110a");
    ctx.fillStyle = fl;
    ctx.fillRect(0, L.floor, W, H - L.floor);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.2;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 26 * U, L.floor);
      ctx.lineTo(W / 2 + i * 120 * U, H);
      ctx.stroke();
    }
    // a rug in front of the hearth
    const ry = L.floor + Math.min(H - L.floor, 200 * U) * 0.55;
    ctx.fillStyle = "#5a1f1a";
    ctx.beginPath();
    ctx.ellipse(L.cx, ry, L.fw * 0.5, Math.min(H - L.floor, 200 * U) * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(214,170,110,0.35)";
    ctx.lineWidth = 3 * U;
    ctx.beginPath();
    ctx.ellipse(L.cx, ry, L.fw * 0.44, Math.min(H - L.floor, 200 * U) * 0.25, 0, 0, TAU);
    ctx.stroke();

    // inside the firebox: sooty back and side walls (the back sits further in), and the ash floor
    ctx.save();
    openingPath();
    ctx.clip();
    const x0 = L.cx - L.ow / 2, x1 = L.cx + L.ow / 2, yTop = L.floor - L.oh - L.arch, bx0 = x0 + L.inset, bx1 = x1 - L.inset, by1 = L.floor - L.oh * 0.12;
    ctx.fillStyle = "#0d0807";
    ctx.fillRect(x0, yTop, L.ow, L.oh + L.arch);
    const back = ctx.createLinearGradient(0, yTop, 0, by1);
    back.addColorStop(0, "#090605");
    back.addColorStop(1, css(mix([40, 24, 18], warm, 0.18 * glow)));
    ctx.fillStyle = back;
    ctx.fillRect(bx0, yTop, bx1 - bx0, by1 - yTop);
    // firebrick courses on the back wall
    ctx.strokeStyle = `rgba(0,0,0,${0.5})`;
    ctx.lineWidth = 1.5 * U;
    for (let y = by1; y > yTop; y -= 22 * U) { ctx.beginPath(); ctx.moveTo(bx0, y); ctx.lineTo(bx1, y); ctx.stroke(); }
    for (const [ax, bx] of [[x0, bx0], [x1, bx1]]) {
      const side = ctx.createLinearGradient(ax, 0, bx, 0);
      side.addColorStop(0, "#1a0f0b");
      side.addColorStop(1, css(mix([30, 18, 14], warm, 0.12 * glow)));
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.moveTo(ax, yTop); ctx.lineTo(bx, yTop); ctx.lineTo(bx, by1); ctx.lineTo(ax, L.floor);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#1a1210";
    ctx.beginPath();
    ctx.moveTo(bx0, by1); ctx.lineTo(bx1, by1); ctx.lineTo(x1, L.floor); ctx.lineTo(x0, L.floor);
    ctx.closePath();
    ctx.fill();
    // the fire lights up the inside of the box
    ctx.globalCompositeOperation = "lighter";
    const ig = ctx.createRadialGradient(L.cx, L.bedY - L.oh * 0.15, 0, L.cx, L.bedY - L.oh * 0.15, L.ow * 0.7);
    ig.addColorStop(0, css(warm, 0.35 * glow));
    ig.addColorStop(1, css(warm, 0));
    ctx.fillStyle = ig;
    ctx.fillRect(x0, yTop, L.ow, L.oh + L.arch);
    ctx.globalCompositeOperation = "source-over";

    drawCoals();
    const core = ctx.createRadialGradient(L.cx, L.bedY - L.oh * 0.06, 0, L.cx, L.bedY - L.oh * 0.06, L.ow * 0.32);
    core.addColorStop(0, css([255, 214, 130], 0.55 * clamp(glow, 0, 1.2)));
    core.addColorStop(0.5, css([255, 120, 40], 0.22 * clamp(glow, 0, 1.2)));
    core.addColorStop(1, css([255, 90, 30], 0));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = core;
    ctx.fillRect(L.cx - L.ow * 0.4, L.bedY - L.oh * 0.4, L.ow * 0.8, L.oh * 0.5);
    ctx.globalCompositeOperation = "source-over";
    smoke.forEach((s) => {
      const a = 0.1 * Math.sin((s.age / s.life) * Math.PI);
      ctx.fillStyle = `rgba(70,64,62,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });
    for (const l of logs) if (l.row === 0 || l.row === 2) drawLog(l);
    drawFlames(0);
    for (const l of logs) if (l.row === 1) drawLog(l);
    drawFlames(1);
    drawGrate();
    ctx.restore();

    // the stone surround, then the mantel
    if (stone) ctx.drawImage(stone, 0, 0, W, H);
    const mw = L.fw * 1.1, mh = 26 * U, mx = L.cx - mw / 2;
    const mg = ctx.createLinearGradient(0, L.mantel, 0, L.mantel + mh);
    mg.addColorStop(0, "#6e4628");
    mg.addColorStop(0.4, "#4e2f1a");
    mg.addColorStop(1, "#24150c");
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(mx + 6 * U, L.mantel + mh, mw - 12 * U, 10 * U);
    ctx.fillStyle = mg;
    ctx.fillRect(mx, L.mantel, mw, mh);
    drawMantelThings(mx, mw);
    // the hearth slab in front of the opening
    const sx0 = L.cx - L.fw * 0.56, sx1 = L.cx + L.fw * 0.56, sy = L.floor, sh = 26 * U;
    const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, "#7a7068");
    sg.addColorStop(1, "#3a3430");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(sx0 + 14 * U, sy); ctx.lineTo(sx1 - 14 * U, sy); ctx.lineTo(sx1, sy + sh); ctx.lineTo(sx0, sy + sh);
    ctx.closePath();
    ctx.fill();

    drawBasket();
    drawCat();

    // firelight: the room falls into darkness away from the fire, warm light spills from it
    const fx = L.cx, fy = L.bedY - L.oh * 0.2, reach = Math.max(W, H) * (0.45 + 0.35 * clamp(glow, 0, 1.4));
    const dark = ctx.createRadialGradient(fx, fy, reach * 0.12, fx, fy, reach);
    dark.addColorStop(0, "rgba(6,3,2,0)");
    dark.addColorStop(1, `rgba(6,3,2,${0.88 - 0.18 * clamp(glow, 0, 1)})`);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const lg = ctx.createRadialGradient(fx, fy, 0, fx, fy, reach * 0.9);
    lg.addColorStop(0, css(warm, 0.16 * glow));
    lg.addColorStop(0.5, css(warm, 0.05 * glow));
    lg.addColorStop(1, css(warm, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    // sparks are drawn last so the ones that escape glow over the room
    drawSparks();
    ctx.globalCompositeOperation = "source-over";
  }

  function drawCoals() {
    const bedW = L.ow, bedH = L.oh;
    ctx.fillStyle = "#151010";
    ctx.beginPath();
    ctx.ellipse(L.cx, L.bedY + bedH * 0.01, bedW * 0.48, bedH * 0.06, 0, 0, TAU);
    ctx.fill();
    for (const c of coals) {
      const x = L.cx + c.x * bedW, y = L.bedY + c.y * bedH, r = c.r * U;
      ctx.fillStyle = "#1e1512";
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r * 0.75, 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "lighter";
    for (const c of coals) {
      const x = L.cx + c.x * bedW, y = L.bedY + c.y * bedH, r = c.r * U;
      const i = clamp(embers * 0.75 + F * 0.3, 0, 1.2) * (0.55 + 0.45 * Math.sin(time * c.s + c.p));
      if (i < 0.03) continue;
      ctx.globalAlpha = clamp(i, 0, 1);
      ctx.drawImage(sprites[i > 0.8 ? 2 : 3], x - r * 1.6, y - r * 1.1, r * 3.2, r * 2.2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawLog(l) {
    const s = logScreen(l), char = clamp(1 - l.fuel + l.heat * 0.25, 0, 1), hot = l.heat * Math.min(1, l.fuel * 3);
    ctx.save();
    ctx.translate(s.cx, s.cy);
    ctx.rotate(l.ang);
    const half = s.len, r = s.r;
    // bark, lit from the flames above it
    const bark = [96 + l.wood, 66 + l.wood * 0.6, 42];
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, css(mix(bark, [255, 170, 90], 0.25 * glow)));
    g.addColorStop(0.45, css(bark));
    g.addColorStop(1, css(mix(bark, [0, 0, 0], 0.7)));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-half, -r, half * 2, r * 2, r * 0.5);
    else ctx.rect(-half, -r, half * 2, r * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (const b of l.bark) {
      ctx.beginPath();
      ctx.moveTo(-half + (b.a + 0.5) * half * 0.6, b.y * r);
      ctx.lineTo(half * (b.b + 0.5), b.y * r + r * 0.05);
      ctx.stroke();
    }
    // charring creeps over it, and the cracks glow with the heat inside
    if (char > 0.02) {
      ctx.fillStyle = `rgba(16,10,8,${char * 0.85})`;
      ctx.fillRect(-half, -r, half * 2, r * 2);
    }
    if (hot > 0.05 && char > 0.2) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const c of l.cracks) {
        const a = hot * char * (0.55 + 0.45 * Math.sin(time * 2.6 + c.p));
        for (const [w, al] of [[r * 0.28, 0.25], [r * 0.1, 0.9]]) {
          ctx.strokeStyle = css(al > 0.5 ? [255, 170, 70] : [255, 90, 30], a * al);
          ctx.lineWidth = Math.max(1, w);
          ctx.beginPath();
          c.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * half * 2, y * r) : ctx.moveTo(x * half * 2, y * r)));
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
    // the cut end, with its rings
    const ex = half - r * 0.15;
    ctx.fillStyle = css(mix([170, 128, 84], [24, 14, 10], char * 0.9));
    ctx.beginPath(); ctx.ellipse(ex, 0, r * 0.32, r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(60,36,20,${0.5 * (1 - char * 0.6)})`;
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(ex, 0, r * 0.32 * (k / 4), r * 0.95 * (k / 4), 0, 0, TAU); ctx.stroke(); }
    if (hot > 0.3) {
      ctx.strokeStyle = css([255, 120, 40], 0.5 * hot * (0.7 + 0.3 * Math.sin(time * 3 + l.x * 7)));
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.beginPath(); ctx.ellipse(ex, 0, r * 0.3, r * 0.92, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // a flickering value between about 0.25 and 1, different for every phase
  const flicker = (t, p) => 0.5 + 0.25 * Math.sin(t * 5.1 + p) + 0.15 * Math.sin(t * 9.7 + p * 2) + 0.1 * Math.sin(t * 17.3 + p * 3);

  // tongues of flame: teardrop shapes along each burning log, hot white-yellow at the root fading to red
  function drawTongues(row) {
    ctx.globalCompositeOperation = "lighter";
    for (const l of logs) {
      if ((l.row === 1 ? 1 : 0) !== row || l.drop < -0.05) continue;
      const s = logScreen(l), hot = l.heat * Math.min(1, l.fuel * 2.5);
      if (hot < 0.05) continue;
      const ca = Math.cos(l.ang), sa = Math.sin(l.ang), n = 6;
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1) - 0.5) * 0.85, p = l.x * 13 + i * 2.3;
        const bx = s.cx + ca * u * s.len * 2, by = s.cy + sa * u * s.len * 2 - s.r * 0.55;
        const h = s.r * (3.2 + 2.6 * Math.cos(u * Math.PI)) * hot * flicker(time, p) * (1 + fan * 0.7 + flare * 0.6);
        const w = s.r * (1.5 + 0.5 * Math.cos(u * Math.PI)) * (0.7 + 0.3 * hot);
        const sway = (Math.sin(time * 3.3 + p) * 0.18 + wind * 0.6) * h;
        for (const [k, cols] of [[1, [[255, 196, 92, 0.75], [244, 104, 34, 0.45], [170, 40, 12, 0]]], [0.55, [[255, 250, 226, 0.9], [255, 210, 110, 0.6], [255, 150, 60, 0]]]]) {
          const hh = h * k, ww = w * k;
          const g = ctx.createLinearGradient(bx, by, bx + sway * k, by - hh);
          g.addColorStop(0, css(cols[0], cols[0][3]));
          g.addColorStop(0.45, css(cols[1], cols[1][3]));
          g.addColorStop(1, css(cols[2], 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(bx - ww / 2, by);
          ctx.bezierCurveTo(bx - ww * 0.55, by - hh * 0.45, bx + sway * k * 0.6 - ww * 0.15, by - hh * 0.8, bx + sway * k, by - hh);
          ctx.bezierCurveTo(bx + sway * k * 0.6 + ww * 0.15, by - hh * 0.8, bx + ww * 0.55, by - hh * 0.45, bx + ww / 2, by);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawFlames(z) {
    drawTongues(z);
    ctx.globalCompositeOperation = "lighter";
    for (const f of flames) {
      if (f.z !== z) continue;
      const k = f.age / f.life;
      const idx = Math.min(RAMP.length - 1, Math.floor(k * RAMP.length * 0.98));
      const s = f.size * (1 - k * 0.65);
      ctx.globalAlpha = Math.pow(1 - k, 1.1) * 0.72;
      ctx.drawImage(sprites[idx], f.x - s, f.y - s * 1.35, s * 2, s * 2.7); // tall and narrow, like a tongue of flame
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSparks() {
    ctx.lineCap = "round";
    for (const s of sparks) {
      const k = s.age / s.life, a = (1 - k) * (0.6 + 0.4 * Math.sin(s.age * 40 + s.x));
      ctx.strokeStyle = css([255, 200 - k * 80, 120 - k * 80], a);
      ctx.lineWidth = Math.max(1, 1.8 * U * (1 - k * 0.5));
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025);
      ctx.stroke();
    }
  }

  function drawGrate() {
    const y = L.bedY + L.oh * 0.03, w = L.ow * 0.62;
    ctx.strokeStyle = "#141212";
    ctx.lineWidth = 6 * U;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(L.cx - w / 2, y); ctx.lineTo(L.cx + w / 2, y); ctx.stroke();
    for (const side of [-1, 1]) {
      const x = L.cx + side * w * 0.42;
      ctx.beginPath(); ctx.moveTo(x, y - 26 * U); ctx.lineTo(x, L.floor); ctx.stroke();
      ctx.fillStyle = "#1c1a1a";
      ctx.beginPath(); ctx.arc(x, y - 30 * U, 7 * U, 0, TAU); ctx.fill();
      // a glint of firelight on the iron
      ctx.fillStyle = css([255, 160, 90], 0.35 * clamp(glow, 0, 1));
      ctx.beginPath(); ctx.arc(x - 2 * U, y - 32 * U, 2.5 * U, 0, TAU); ctx.fill();
    }
  }

  function drawMantelThings(mx, mw) {
    const y = L.mantel;
    // a little clock, a candle and a stack of books, lit from below by the fire
    const cx = mx + mw * 0.2, s = U;
    ctx.fillStyle = "#3a2618";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - 22 * s, y - 52 * s, 44 * s, 52 * s, 10 * s); else ctx.rect(cx - 22 * s, y - 52 * s, 44 * s, 52 * s);
    ctx.fill();
    ctx.fillStyle = "#d8cbb2";
    ctx.beginPath(); ctx.arc(cx, y - 30 * s, 14 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 1.6 * s;
    const hm = (time / 3600) * TAU, mm = (time / 60) * TAU;
    ctx.beginPath(); ctx.moveTo(cx, y - 30 * s); ctx.lineTo(cx + Math.sin(hm) * 7 * s, y - 30 * s - Math.cos(hm) * 7 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, y - 30 * s); ctx.lineTo(cx + Math.sin(mm) * 11 * s, y - 30 * s - Math.cos(mm) * 11 * s); ctx.stroke();
    // candle
    const kx = mx + mw * 0.78;
    ctx.fillStyle = "#e9e0cc";
    ctx.fillRect(kx - 7 * s, y - 40 * s, 14 * s, 40 * s);
    ctx.globalCompositeOperation = "lighter";
    const ff = 1 + 0.12 * Math.sin(time * 11 + 1) + 0.06 * Math.sin(time * 23);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(sprites[1], kx - 6 * s, y - 62 * s * ff, 12 * s, 24 * s * ff);
    ctx.globalAlpha = 0.25;
    ctx.drawImage(sprites[2], kx - 30 * s, y - 75 * s, 60 * s, 60 * s);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // books
    const bx = mx + mw * 0.6;
    [["#4a2a2a", 30], ["#2a3a4a", 26], ["#3a4a2a", 32]].forEach(([c, w], i) => {
      ctx.fillStyle = c;
      ctx.fillRect(bx - w * s * 0.5 + i * 2 * s, y - (i + 1) * 9 * s, w * s, 9 * s);
    });
  }

  function drawBasket() {
    const x = L.basketX, y = L.basketY, s = U;
    // spare logs poking out of a woven basket
    for (const [dx, dy, r] of [[-18, -26, 11], [4, -32, 12], [22, -24, 10]]) {
      ctx.fillStyle = "#6a4a2c";
      ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, r * s * 0.55, r * s, 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = "#b08a5c";
      ctx.beginPath(); ctx.ellipse(x + dx * s + r * s * 0.25, y + dy * s - r * s * 0.6, r * s * 0.5, r * s * 0.32, 0.2, 0, TAU); ctx.fill();
    }
    const g = ctx.createLinearGradient(x - 50 * s, 0, x + 50 * s, 0);
    g.addColorStop(0, "#3e2a16");
    g.addColorStop(0.5, "#7a5630");
    g.addColorStop(1, "#3a2614");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 50 * s, y - 20 * s);
    ctx.lineTo(x + 50 * s, y - 20 * s);
    ctx.lineTo(x + 40 * s, y + 26 * s);
    ctx.lineTo(x - 40 * s, y + 26 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5 * s;
    for (let k = 0; k < 4; k++) { const yy = y - 12 * s + k * 10 * s; ctx.beginPath(); ctx.moveTo(x - 47 * s + k * 2 * s, yy); ctx.lineTo(x + 47 * s - k * 2 * s, yy); ctx.stroke(); }
  }

  function drawCat() {
    const x = L.catX, y = L.catY, s = U * 1.1;
    const breathe = 1 + 0.035 * Math.sin(time * (purr > 0 ? 2.2 : 1.3));
    const fur = [58, 50, 48], lit = mix(fur, [255, 160, 90], 0.35 * clamp(glow, 0, 1));
    // tail curled around, flicking now and then
    const flick = Math.sin(time * 9) * catTwitch * 0.4;
    ctx.strokeStyle = css(fur);
    ctx.lineWidth = 9 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 40 * s, y + 8 * s);
    ctx.quadraticCurveTo(x + 30 * s, y + 34 * s, x - 10 * s + flick * 20 * s, y + 28 * s + flick * 8 * s);
    ctx.stroke();
    // body: a curled loaf, lit on the side facing the fire
    const bg = ctx.createLinearGradient(x, y - 30 * s, x, y + 26 * s);
    bg.addColorStop(0, css(lit));
    bg.addColorStop(1, css(mix(fur, [0, 0, 0], 0.5)));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(x, y, 52 * s, 28 * s * breathe, 0, 0, TAU);
    ctx.fill();
    // head tucked in, ears up
    const hx = x - 38 * s, hy = y - 8 * s;
    ctx.fillStyle = css(lit);
    ctx.beginPath(); ctx.arc(hx, hy, 18 * s, 0, TAU); ctx.fill();
    const ear = catTwitch > 0.5 ? Math.sin(time * 20) * 0.15 : 0;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx + side * 6 * s, hy - 12 * s);
      ctx.lineTo(hx + side * 15 * s + ear * 10 * s, hy - 28 * s);
      ctx.lineTo(hx + side * 17 * s, hy - 6 * s);
      ctx.closePath();
      ctx.fill();
    }
    // closed eyes: two little curves
    ctx.strokeStyle = "rgba(20,14,12,0.85)";
    ctx.lineWidth = 1.6 * s;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * 7 * s, hy - 1 * s, 4 * s, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    if (purr > 0) {
      ctx.fillStyle = `rgba(255,230,200,${0.35 * Math.min(1, purr)})`;
      ctx.font = `${12 * s}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText("purr", hx - 20 * s, hy - 34 * s - Math.sin(time * 2) * 3 * s);
    }
  }

  // ---------- UI ----------
  function syncUi() {
    $("hearth-keep-lbl").textContent = opts.keep ? "Keep it going" : "Let it burn down";
    $("hearth-keep").setAttribute("aria-pressed", opts.keep);
    $("hearth-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("hearth-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("hearth-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("hearth-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("hearth-log").addEventListener("click", () => { Z.ensureAudio(); startLoops(); addLog(); });
  $("hearth-poke").addEventListener("click", () => { Z.ensureAudio(); startLoops(); poke(L.cx + rand(-0.15, 0.15) * L.ow, L.bedY); });
  $("hearth-keep").addEventListener("click", () => { opts.keep = !opts.keep; saveOpts(); syncUi(); });
  $("hearth-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("hearth-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    U = clamp(Math.min(W, H) / 800, 0.55, 1.4);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    makeStone();
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
    window.__hearth = { drawTongues, logScreen, ctx, get glow() { return glow; }, logs, flames, sparks, opts, update, render, addLog, poke, ptr, L, get F() { return F; }, get embers() { return embers; }, get purr() { return purr; }, get fan() { return fan; } };
  }

  resize();
  seedCoals();
  // the fire is already going when you arrive
  for (const i of [0, 1, 2]) logs.push(makeLog(i, true));
  syncUi();
  requestAnimationFrame(frame);
})();
