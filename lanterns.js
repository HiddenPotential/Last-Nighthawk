// Lanterns: a night lake under the mountains. Tap the sky to light a paper lantern and let it rise,
// hold to let a bigger one fill with warm air, tap the lake to float one, drag to send a breeze.
// Shares game.js's audio engine and sound/music settings through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("lanterns");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, S = 1, HY = 0; // HY: the far shore, where sky meets water

  const KEY = "drift-lanterns-v1";
  const opts = { color: 0 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  const COLORS = [
    { name: "Amber", c: [255, 168, 78] },
    { name: "Rose", c: [255, 136, 140] },
    { name: "Moon", c: [255, 232, 196] },
    { name: "Jade", c: [196, 236, 150] },
    { name: "Mixed", c: null },
  ];
  opts.color = clamp(opts.color | 0, 0, COLORS.length - 1);
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "lanterns";

  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const pickColor = () => (COLORS[opts.color].c || COLORS[(Math.random() * 4) | 0].c);
  const WHITE = [255, 255, 255];

  let time = 0;

  // ---------- Scene: sky, mountains, moon, shore ----------
  let mountains = null, moonImg = null;
  const stars = [], lights = [], reeds = [];
  let moon = { x: 0, y: 0, r: 20 };
  let shooting = null, shootTimer = rand(12, 30);

  // a jagged ridge by midpoint displacement
  function ridge(n, rough) {
    const h = new Float32Array(n + 1);
    h[0] = Math.random();
    h[n] = Math.random();
    for (let step = n; step > 1; step >>= 1) {
      const half = step >> 1, amp = rough * (step / n);
      for (let i = half; i < n; i += step) h[i] = (h[i - half] + h[i + half]) / 2 + (Math.random() - 0.5) * amp;
    }
    return h;
  }

  function makeScene() {
    HY = Math.round(H * (W > H ? 0.64 : 0.6));
    // mountains, far to near, hazier with distance
    mountains = document.createElement("canvas");
    mountains.width = Math.ceil(W * DPR);
    mountains.height = Math.ceil(HY * DPR);
    const m = mountains.getContext("2d");
    m.scale(DPR, DPR);
    const layers = [
      { top: 0.5, span: 0.28, col: [44, 46, 92], rough: 1.1 },
      { top: 0.66, span: 0.2, col: [28, 29, 64], rough: 1.3 },
      { top: 0.8, span: 0.13, col: [15, 16, 38], rough: 1.6 },
    ];
    for (const L of layers) {
      const n = 256, h = ridge(n, L.rough);
      let lo = Infinity, hi = -Infinity;
      for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      m.beginPath();
      m.moveTo(0, HY);
      for (let i = 0; i <= n; i++) m.lineTo((i / n) * W, HY * (L.top + L.span * ((h[i] - lo) / (hi - lo || 1) - 0.5) * 2) + 2);
      m.lineTo(W, HY);
      m.closePath();
      const g = m.createLinearGradient(0, HY * (L.top - L.span), 0, HY);
      g.addColorStop(0, css(mix(L.col, [90, 96, 150], 0.18)));
      g.addColorStop(1, css(L.col));
      m.fillStyle = g;
      m.fill();
    }
    // mist settling along the far shore
    const mist = m.createLinearGradient(0, HY * 0.82, 0, HY);
    mist.addColorStop(0, "rgba(120,120,180,0)");
    mist.addColorStop(1, "rgba(120,120,180,0.16)");
    m.fillStyle = mist;
    m.fillRect(0, HY * 0.82, W, HY * 0.18);

    // a waxing crescent moon
    moon = { x: W * 0.78, y: HY * (W > H ? 0.24 : 0.4), // clear of the title on tall screens
      r: clamp(Math.min(W, H) * 0.035, 12, 30) };
    const mr = moon.r, size = Math.ceil(mr * 2.4 * DPR);
    moonImg = document.createElement("canvas");
    moonImg.width = moonImg.height = size;
    const mc = moonImg.getContext("2d");
    mc.scale(DPR, DPR);
    const mg = mc.createRadialGradient(mr * 1.05, mr * 1.05, 0, mr * 1.2, mr * 1.2, mr);
    mg.addColorStop(0, "#fffbea");
    mg.addColorStop(1, "#efe4c4");
    mc.fillStyle = mg;
    mc.beginPath();
    mc.arc(mr * 1.2, mr * 1.2, mr, 0, TAU);
    mc.fill();
    mc.globalCompositeOperation = "destination-out";
    mc.beginPath();
    mc.arc(mr * 1.2 - mr * 0.55, mr * 1.2 - mr * 0.18, mr * 0.95, 0, TAU);
    mc.fill();

    stars.length = 0;
    for (let i = 0; i < (W * HY) / 2600; i++) {
      const y = Math.pow(Math.random(), 1.4) * HY * 0.9;
      stars.push({ x: rand(0, W), y, r: rand(0.35, 1.25) * (Math.random() < 0.06 ? 1.6 : 1), p: rand(0, TAU), s: rand(0.4, 1.6), a: rand(0.35, 0.95) * (1 - y / HY) });
    }
    // a distant village on the far shore
    lights.length = 0;
    for (let i = 0; i < 9; i++) {
      const x = rand(W * 0.04, W * 0.96);
      if (Math.abs(x - moon.x) < W * 0.06) continue;
      lights.push({ x, y: HY - rand(1, 5) * S, p: rand(0, TAU), r: rand(0.8, 1.5) });
    }
    // reeds at the near corners
    reeds.length = 0;
    const tall = Math.min(H - HY, W * 0.5);
    for (let i = 0; i < 34; i++) {
      const left = i % 2 === 0, k = Math.pow(Math.random(), 1.6);
      reeds.push({ x: left ? k * W * 0.2 : W - k * W * 0.2, h: rand(0.35, 0.95) * tall * (1 - k * 0.5), w: rand(1.2, 3) * S, p: rand(0, TAU), lean: rand(-0.15, 0.15) + (left ? 0.08 : -0.08), head: Math.random() < 0.3 });
    }
  }

  // ---------- Lanterns ----------
  const sky = []; // paper sky lanterns
  const floats = []; // little box lanterns floating on the lake
  const ripples = [];
  const embers = [];
  const MAX_SKY = 46, MAX_FLOAT = 14;
  let gust = 0; // the breeze you make by dragging, felt by the reeds

  function makeSky(x, y, opt = {}) {
    if (sky.length >= MAX_SKY) {
      // let the farthest one go
      let far = sky[0];
      for (const l of sky) if (l.z > far.z) far = l;
      far.fade = Math.max(far.fade, 0.01);
    }
    const l = {
      x, y, vx: 0, vy: 0, z: opt.z || 0, zr: rand(0.025, 0.05), size: (opt.size || rand(26, 34)) * S, grow: 1,
      col: opt.col || pickColor(), ph: rand(0, TAU), rot: 0, vr: 0, age: 0, inflate: opt.inflate ?? 0, held: !!opt.held,
      rise: rand(15, 24) * S, fade: 0, alpha: 0, chimed: false,
    };
    sky.push(l);
    return l;
  }

  function makeFloat(x, y, quiet = false) {
    if (floats.length >= MAX_FLOAT) floats[0].fade = Math.max(floats[0].fade, 0.01);
    const f = { x, y, vx: rand(-2, 2) * S, ph: rand(0, TAU), col: pickColor(), age: 0, fade: 0, alpha: 0, ring: rand(0.5, 2) };
    floats.push(f);
    ripple(x, y, 1);
    if (!quiet) floatChime(x, y);
    return f;
  }

  const persp = (y) => clamp((y - HY) / (H - HY), 0.04, 1); // 0 at the far shore, 1 at your feet

  function ripple(x, y, amp = 1) {
    if (ripples.length > 60) ripples.shift();
    ripples.push({ x, y, amp, age: 0, life: 2.6 });
  }

  function release() {
    // a festival moment: lanterns go up all along the far shore
    const n = 7;
    for (let k = 0; k < n; k++) {
      setTimeout(() => {
        if (!here()) return;
        const l = makeSky(rand(W * 0.1, W * 0.9), HY - rand(4, 26) * S, { z: rand(0.5, 1.2), inflate: 0.5 });
        lightUp(l.x, 0.5);
        Z.bell(Z.noteFreq(5 + k), 0.024, l.x, 3.4);
      }, k * 380);
    }
  }

  // ---------- Audio ----------
  const panOf = (x) => (x / W) * 2 - 1;
  const audio = () => (Z.audioOk() ? Z.ac : null);

  // a wick catching: a soft breathy swell
  function lightUp(x, vol = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const n = Z.noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.22);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    n.connect(lp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.75);
  }

  function riseChime(l) {
    const note = clamp(Math.round(12 - (l.size / S - 22) / 4), 3, 13);
    Z.bell(Z.noteFreq(note), 0.026, l.x, 3.6);
  }

  function floatChime(x, y) {
    Z.plip(x);
    Z.bell(Z.noteFreq(4 + Math.round((1 - persp(y)) * 5)), 0.018, x, 2.8);
  }

  // a temple bell across the water
  function templeBell() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(rand(-0.4, 0.4)), f = 98;
    for (const [m, v, dk] of [[1, 0.05, 7], [2.0, 0.025, 4.5], [2.76, 0.018, 3.2], [5.4, 0.006, 1.6]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
  }

  // continuous layers: water lapping at the shore, and the breeze you make
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
    loops = { lap: layer("lowpass", 420, 0.6), wind: layer("bandpass", 650, 0.6) };
  }
  function updateLoops(speed) {
    if (!loops) return;
    const t = Z.ac.currentTime, on = here();
    const lap = 0.022 + 0.014 * Math.max(0, Math.sin(time * 0.9)) * Math.max(0, Math.sin(time * 0.37 + 1));
    loops.lap.g.gain.setTargetAtTime(on ? lap : 0, t, 0.3);
    loops.wind.g.gain.setTargetAtTime(on ? clamp(speed / 2200, 0, 1) * 0.1 : 0, t, 0.1);
    loops.wind.f.frequency.setTargetAtTime(450 + clamp(speed, 0, 3000) * 0.3, t, 0.15);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, st: 0, moved: false, held: null, water: false, trail: 0, touch: 0 };
  let interactions = 0;

  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("lanterns-title").classList.add("fade");
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* pointer already gone */ }
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false, held: null, water: e.clientY > HY + 2, trail: 0, touch: 0 });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (!ptr.moved && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 10) ptr.moved = true;
    if (ptr.held) { ptr.held.x = ptr.x; ptr.held.y = Math.min(ptr.y, HY - 6 * S); }
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    if (ptr.held) {
      // let it go
      ptr.held.held = false;
      riseChime(ptr.held);
    } else if (!ptr.moved && time - ptr.st < 0.3) {
      if (ptr.water) makeFloat(ptr.x, ptr.y);
      else { const l = makeSky(ptr.x, ptr.y); lightUp(l.x); }
    }
    ptr.down = false;
    ptr.held = null;
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
    release();
  });

  // ---------- Simulation ----------
  let ambient = rand(6, 12), bellTimer = rand(25, 50), dragSpeed = 0;
  function update(dt) {
    time += dt;

    // held still on the sky: a lantern fills with warm air in your hand
    if (ptr.down && !ptr.moved && !ptr.held && !ptr.water && time - ptr.st > 0.3) {
      ptr.held = makeSky(ptr.x, ptr.y, { held: true });
      lightUp(ptr.x, 0.8);
    }
    if (ptr.held) ptr.held.grow = Math.min(1.8, ptr.held.grow + dt * 0.32);
    // held still on the water: your finger rings the surface
    if (ptr.down && !ptr.moved && ptr.water && time - ptr.st > 0.3 && (ptr.touch -= dt) <= 0) { ptr.touch = 0.7; ripple(ptr.x, ptr.y, 0.7); }

    // dragging sends a breeze through the lanterns, or stirs the lake
    const vx = (ptr.x - ptr.lx) / dt, vy = (ptr.y - ptr.ly) / dt, sp = Math.hypot(vx, vy);
    const dragging = ptr.down && ptr.moved && !ptr.held;
    dragSpeed = lerp(dragSpeed, dragging ? sp : 0, Math.min(1, dt * 8));
    if (dragging) {
      gust = clamp(gust + vx * dt * 0.0008, -1.5, 1.5);
      for (const l of sky) {
        const d = Math.hypot(l.x - ptr.x, l.y - ptr.y), reach = 170 * S;
        if (d < reach && !l.held) {
          const k = (1 - d / reach) * (1 + l.z);
          l.vx += vx * 0.5 * k * dt;
          l.vy += vy * 0.3 * k * dt;
          l.vr += clamp(vx * 0.00025, -0.4, 0.4) * k * dt * 8;
        }
      }
      if (ptr.y > HY) {
        ptr.trail += Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly);
        if (ptr.trail > 30 * S) { ptr.trail = 0; ripple(ptr.x, ptr.y, 0.6); }
        for (const f of floats) {
          const d = Math.hypot(f.x - ptr.x, f.y - ptr.y), reach = 90 * S * persp(f.y) + 20 * S;
          if (d < reach) { f.vx += vx * 0.4 * dt; f.y += vy * 0.06 * dt * persp(f.y); }
        }
      }
    }
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
    gust *= Math.exp(-0.8 * dt);
    if (Z.ac) { startLoops(); updateLoops(dragSpeed); }

    const breeze = (Math.sin(time * 0.045) * 7 + Math.sin(time * 0.13 + 1) * 3) * S + gust * 40 * S;
    for (let i = sky.length - 1; i >= 0; i--) {
      const l = sky[i];
      l.age += dt;
      l.inflate = Math.min(1, l.inflate + dt / 1.3);
      l.alpha = Math.min(1, l.alpha + dt * 1.5);
      if (!l.held && l.inflate >= 1 && !l.chimed) { l.chimed = true; if (l.age > 1) riseChime(l); }
      if (!l.held) {
        // warm air lifts it once it has filled; the breeze carries it away into the distance
        const lift = l.inflate >= 1 ? l.rise : l.rise * 0.1;
        l.vy = lerp(l.vy, -lift, Math.min(1, dt * 0.6));
        l.vx = lerp(l.vx, breeze, Math.min(1, dt * 0.25));
        const k = 1 / (1 + l.z);
        l.x += l.vx * dt * k;
        l.y += l.vy * dt * k;
        if (l.inflate >= 1) l.z += l.zr * dt * (1 + l.z * 0.3);
      }
      // sway on its strings of hot air
      l.vr += (-l.vx * 0.004 + Math.sin(time * 0.8 + l.ph) * 0.03 - l.rot) * dt * 3;
      l.vr *= Math.exp(-2 * dt);
      l.rot = clamp(l.rot + l.vr * dt, -0.32, 0.32);
      // a few sparks drift up from the wick
      if (l.inflate > 0.5 && l.z < 1.2 && Math.random() < dt * 1.2) {
        const s = l.size * l.grow / (1 + l.z);
        embers.push({ x: l.x + rand(-0.1, 0.1) * s, y: l.y + s * 0.45, vx: rand(-6, 6) * S, vy: rand(-26, -12) * S, age: 0, life: rand(0.8, 1.6), col: l.col });
      }
      if (l.z > 5 || l.y < -40 * S) l.fade = Math.max(l.fade, 0.01);
      if (l.x < -80 * S || l.x > W + 80 * S) l.fade = Math.max(l.fade, 0.01);
      if (l.fade) { l.fade += dt / 3; if (l.fade >= 1) sky.splice(i, 1); }
    }

    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i], p = persp(f.y);
      f.age += dt;
      f.alpha = Math.min(1, f.alpha + dt);
      // the current carries them slowly out toward the far shore
      f.vx = lerp(f.vx, Math.sin(time * 0.05 + f.ph) * 4 * S + gust * 10 * S, Math.min(1, dt * 0.3));
      f.x += f.vx * dt * p;
      f.y -= 3.2 * S * p * dt;
      if ((f.ring -= dt) <= 0) { f.ring = rand(2.5, 5); ripple(f.x, f.y, 0.4); }
      if (p < 0.08 || f.x < -40 || f.x > W + 40) f.fade = Math.max(f.fade, 0.01);
      if (f.fade) { f.fade += dt / 4; if (f.fade >= 1) floats.splice(i, 1); }
    }
    // keep floating lanterns from sitting on top of each other
    for (let i = 0; i < floats.length; i++) {
      for (let j = i + 1; j < floats.length; j++) {
        const a = floats[i], b = floats[j], p = persp((a.y + b.y) / 2), min = 34 * S * p;
        const dx = b.x - a.x, dy = (b.y - a.y) * 2.5, d = Math.hypot(dx, dy) || 1;
        if (d < min) { const k = ((min - d) / d) * 0.5 * Math.min(1, dt * 4); a.x -= dx * k; b.x += dx * k; a.y -= (dy / 2.5) * k; b.y += (dy / 2.5) * k; }
      }
    }

    for (const r of ripples) r.age += dt;
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].age > ripples[i].life) ripples.splice(i, 1);
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      e.x += (e.vx + breeze * 0.3) * dt;
      e.y += e.vy * dt;
      if (e.age > e.life) embers.splice(i, 1);
    }
    if (embers.length > 160) embers.splice(0, embers.length - 160);

    // now and then a shooting star, and someone far off lets a lantern go
    if (!shooting && (shootTimer -= dt) <= 0) {
      shootTimer = rand(25, 60);
      const a = rand(0.25, 0.55) * (Math.random() < 0.5 ? 1 : -1) + (Math.random() < 0.5 ? 0 : Math.PI);
      shooting = { x: rand(W * 0.15, W * 0.85), y: rand(HY * 0.05, HY * 0.4), a, age: 0, len: rand(80, 160) * S, sp: rand(500, 800) * S };
      setTimeout(() => { if (here()) { Z.bell(Z.noteFreq(14), 0.012, shooting ? shooting.x : W / 2, 2.4); setTimeout(() => here() && Z.bell(Z.noteFreq(16), 0.01, W / 2, 2.4), 120); } }, 80);
    }
    if (shooting && (shooting.age += dt) > 0.9) shooting = null;
    if ((ambient -= dt) <= 0) {
      ambient = rand(14, 30);
      if (sky.length < MAX_SKY - 6) makeSky(rand(W * 0.08, W * 0.92), HY - rand(2, 10) * S, { z: rand(1.2, 2.2), inflate: 0.7 });
    }
    if ((bellTimer -= dt) <= 0) { bellTimer = rand(45, 90); templeBell(); }
  }

  // ---------- Render ----------
  function glow(x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, css(col, a));
    g.addColorStop(0.35, css(col, a * 0.35));
    g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const flicker = (ph) => 0.88 + 0.06 * Math.sin(time * 7.3 + ph) + 0.06 * Math.sin(time * 12.7 + ph * 2.3);

  function drawSkyLantern(l) {
    const s = (l.size * l.grow * (0.55 + 0.45 * l.inflate)) / (1 + l.z);
    const a = l.alpha * (1 - l.fade) * (1 - clamp((l.z - 3) / 3, 0, 0.7));
    const b = flicker(l.ph) * (0.35 + 0.65 * l.inflate) * a;
    ctx.globalCompositeOperation = "lighter";
    glow(l.x, l.y + s * 0.15, s * 2.6, l.col, 0.22 * b);
    ctx.globalCompositeOperation = "source-over";
    if (s < 5) {
      // far off: just a warm point of light
      ctx.fillStyle = css(mix(l.col, WHITE, 0.5), Math.min(1, b * 1.2));
      ctx.beginPath();
      ctx.arc(l.x, l.y, Math.max(0.7, s * 0.35), 0, TAU);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate(l.rot);
    ctx.globalAlpha = a;
    const wt = s * 0.62, wb = s * 0.44, h = s;
    // the paper body, lit from the flame inside
    ctx.beginPath();
    ctx.moveTo(-wb / 2, h / 2);
    ctx.bezierCurveTo(-wb * 0.7, h * 0.1, -wt * 0.62, -h * 0.3, -wt / 2, -h / 2 + s * 0.06);
    ctx.quadraticCurveTo(0, -h / 2 - s * 0.08, wt / 2, -h / 2 + s * 0.06);
    ctx.bezierCurveTo(wt * 0.62, -h * 0.3, wb * 0.7, h * 0.1, wb / 2, h / 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, css(mix(l.col, [80, 30, 20], 0.45 - 0.2 * b)));
    g.addColorStop(0.55, css(mix(l.col, WHITE, 0.15 * b)));
    g.addColorStop(1, css(mix(l.col, WHITE, 0.55 * b)));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // the bright heart near the wick
    ctx.globalCompositeOperation = "lighter";
    glow(0, h * 0.42, s * 0.75, mix(l.col, [255, 240, 200], 0.6), 0.55 * b);
    ctx.globalCompositeOperation = "source-over";
    // bamboo ribs
    ctx.strokeStyle = css(mix(l.col, [60, 20, 10], 0.6), 0.28);
    ctx.lineWidth = Math.max(0.6, s * 0.025);
    for (const k of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(k * wb * 0.6, h / 2);
      ctx.quadraticCurveTo(k * wt * 0.85, 0, k * wt * 0.62, -h / 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-wt, -h * 0.1);
    ctx.quadraticCurveTo(0, -h * 0.05, wt, -h * 0.1);
    ctx.stroke();
    ctx.restore();
    // the open bottom with its little flame
    ctx.fillStyle = css(mix(l.col, [40, 14, 8], 0.7), 0.85);
    ctx.beginPath();
    ctx.ellipse(0, h / 2, wb / 2, s * 0.05, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,246,210,${0.9 * b})`;
    ctx.beginPath();
    ctx.ellipse(0, h / 2 - s * 0.04, s * 0.045, s * 0.08 * flicker(l.ph + 1), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawFloat(f) {
    const p = persp(f.y), s = 26 * S * (0.2 + 0.8 * p), a = f.alpha * (1 - f.fade), b = flicker(f.ph) * a;
    const bob = Math.sin(time * 1.3 + f.ph) * s * 0.04, x = f.x, y = f.y + bob;
    const w = s * 0.78, h = s * 0.7;
    ctx.globalCompositeOperation = "lighter";
    // light spilling on the water around it
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.32);
    glow(0, 0, s * 2.6, f.col, 0.28 * b);
    ctx.restore();
    // its reflection, broken up by the water
    for (let k = 0; k < 5; k++) {
      const yy = y + s * 0.12 + k * s * 0.17, ww = w * (0.9 - k * 0.12) * (1 + 0.1 * Math.sin(time * 2.4 + k + f.ph));
      ctx.fillStyle = css(f.col, 0.22 * b * (1 - k / 5));
      ctx.fillRect(x - ww / 2 + Math.sin(time * 1.7 + k * 1.3 + f.ph) * s * 0.06, yy, ww, Math.max(1, s * 0.07));
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;
    // wooden base
    ctx.fillStyle = "#2a1a12";
    ctx.fillRect(x - w * 0.62, y - s * 0.1, w * 1.24, s * 0.14);
    // glowing paper box
    const g = ctx.createLinearGradient(0, y - h - s * 0.1, 0, y - s * 0.1);
    g.addColorStop(0, css(mix(f.col, [90, 40, 20], 0.35)));
    g.addColorStop(1, css(mix(f.col, WHITE, 0.45 * b)));
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h - s * 0.1, w, h);
    ctx.globalCompositeOperation = "lighter";
    glow(x, y - s * 0.3, s * 0.6, mix(f.col, [255, 240, 200], 0.5), 0.45 * b);
    ctx.globalCompositeOperation = "source-over";
    // frame
    ctx.strokeStyle = "rgba(40,22,14,0.8)";
    ctx.lineWidth = Math.max(0.7, s * 0.05);
    ctx.strokeRect(x - w / 2, y - h - s * 0.1, w, h);
    ctx.beginPath();
    ctx.moveTo(x, y - h - s * 0.1);
    ctx.lineTo(x, y - s * 0.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function render() {
    // night sky
    const sg = ctx.createLinearGradient(0, 0, 0, HY);
    sg.addColorStop(0, "#05061a");
    sg.addColorStop(0.55, "#121338");
    sg.addColorStop(1, "#2c2650");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, HY + 1);
    // the glow of all those lanterns warms the sky a little
    let warm = 0;
    for (const l of sky) warm += (l.alpha * (1 - l.fade)) / (1 + l.z);
    if (warm > 0.05) {
      const wg = ctx.createLinearGradient(0, HY * 0.3, 0, HY);
      wg.addColorStop(0, "rgba(255,150,80,0)");
      wg.addColorStop(1, `rgba(255,150,80,${Math.min(0.12, warm * 0.01)})`);
      ctx.fillStyle = wg;
      ctx.fillRect(0, HY * 0.3, W, HY * 0.7);
    }
    for (const s of stars) {
      const a = s.a * (0.6 + 0.4 * Math.sin(time * s.s + s.p));
      ctx.fillStyle = `rgba(236,240,255,${a})`;
      ctx.fillRect(s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
    }
    if (shooting) {
      const k = shooting.age / 0.9, d = shooting.age * shooting.sp, x = shooting.x + Math.cos(shooting.a) * d, y = shooting.y + Math.abs(Math.sin(shooting.a)) * d;
      const tx = x - Math.cos(shooting.a) * shooting.len, ty = y - Math.abs(Math.sin(shooting.a)) * shooting.len;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, `rgba(255,255,255,${0.8 * Math.sin(k * Math.PI)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    // moon
    ctx.globalCompositeOperation = "lighter";
    glow(moon.x, moon.y, moon.r * 5, [200, 210, 255], 0.12);
    ctx.globalCompositeOperation = "source-over";
    if (moonImg) ctx.drawImage(moonImg, moon.x - moon.r * 1.2, moon.y - moon.r * 1.2, moon.r * 2.4, moon.r * 2.4);

    // far lanterns slip behind the mountains' haze, near ones are drawn later in front
    const order = sky.slice().sort((a, b) => b.z - a.z);
    for (const l of order) if (l.z > 2.2) drawSkyLantern(l);
    if (mountains) ctx.drawImage(mountains, 0, 0, W, HY);
    for (const v of lights) {
      ctx.globalCompositeOperation = "lighter";
      glow(v.x, v.y, 6 * S, [255, 190, 110], 0.35 * (0.75 + 0.25 * Math.sin(time * 1.3 + v.p)));
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255,214,150,0.9)";
      ctx.fillRect(v.x - v.r / 2, v.y - v.r / 2, v.r, v.r);
    }

    // the lake: dark water holding the mountains upside down
    const wg = ctx.createLinearGradient(0, HY, 0, H);
    wg.addColorStop(0, "#1a1a3c");
    wg.addColorStop(1, "#04050f");
    ctx.fillStyle = wg;
    ctx.fillRect(0, HY, W, H - HY);
    if (mountains) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.translate(0, HY * 2);
      ctx.scale(1, -1);
      ctx.drawImage(mountains, 0, 0, W, HY);
      ctx.restore();
    }
    // reflections shimmer in broken bands
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 26; k++) {
      const y = HY + 3 + Math.pow(k / 26, 1.6) * (H - HY) * 0.8, w = (10 + k * 2.4) * S * (1 + 0.3 * Math.sin(time * 1.1 + k * 2.1));
      ctx.fillStyle = `rgba(230,236,255,${0.14 * (1 - k / 30)})`;
      ctx.fillRect(moon.x - w / 2 + Math.sin(time * 0.9 + k * 1.7) * 5 * S, y, w, Math.max(1, (1 + k * 0.08) * S));
    }
    for (const v of lights) {
      ctx.fillStyle = "rgba(255,190,110,0.18)";
      for (let k = 0; k < 4; k++) ctx.fillRect(v.x - 2 * S + Math.sin(time * 1.5 + k + v.p) * 1.5 * S, HY + 2 + k * 3 * S, 4 * S, 1.2 * S);
    }
    for (const l of sky) {
      // a lantern's light laid across the water below it
      const s = (l.size * l.grow) / (1 + l.z), a = l.alpha * (1 - l.fade) * flicker(l.ph) * (0.35 + 0.65 * l.inflate);
      const ry = HY + (HY - l.y) * 0.8;
      if (ry > H + 20 || a < 0.02) continue;
      for (let k = 0; k < 5; k++) {
        const ww = s * (0.8 + k * 0.15) * (1 + 0.15 * Math.sin(time * 2 + k + l.ph));
        ctx.fillStyle = css(l.col, 0.16 * a * (1 - k / 5));
        ctx.fillRect(l.x - ww / 2 + Math.sin(time * 1.6 + k * 1.2 + l.ph) * s * 0.15, ry - s * 0.3 + k * s * 0.18, ww, Math.max(1, s * 0.07));
      }
    }
    ctx.globalCompositeOperation = "source-over";
    // ripples, squashed by perspective
    for (const r of ripples) {
      const k = r.age / r.life, p = persp(r.y), R = (6 + r.age * 34) * S * (0.25 + 0.75 * p);
      ctx.strokeStyle = `rgba(200,210,255,${0.22 * r.amp * Math.pow(1 - k, 1.5)})`;
      ctx.lineWidth = Math.max(0.6, 1.2 * S * p);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, R, R * 0.3, 0, 0, TAU);
      ctx.stroke();
    }
    floats.sort((a, b) => a.y - b.y);
    for (const f of floats) drawFloat(f);

    for (const l of order) if (l.z <= 2.2) drawSkyLantern(l);
    ctx.globalCompositeOperation = "lighter";
    for (const e of embers) {
      const k = e.age / e.life;
      ctx.fillStyle = css(mix(e.col, [255, 230, 170], 0.5), 0.7 * (1 - k));
      ctx.fillRect(e.x - 0.7, e.y - 0.7, 1.4, 1.4);
    }
    ctx.globalCompositeOperation = "source-over";

    // reeds in the near corners, leaning in the breeze
    ctx.strokeStyle = "#03040b";
    ctx.fillStyle = "#03040b";
    ctx.lineCap = "round";
    for (const r of reeds) {
      const bend = (r.lean + gust * 0.35 + Math.sin(time * 0.7 + r.p) * 0.04 + Math.sin(time * 0.045) * 0.05) * r.h;
      const tx = r.x + bend, ty = H - r.h;
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.moveTo(r.x, H + 4);
      ctx.quadraticCurveTo(r.x + bend * 0.2, H - r.h * 0.5, tx, ty);
      ctx.stroke();
      if (r.head) {
        ctx.beginPath();
        ctx.ellipse(tx - bend * 0.06, ty + r.h * 0.07, r.w * 1.6, r.h * 0.07, Math.atan2(bend, r.h) * 0.6, 0, TAU);
        ctx.fill();
      }
    }

    const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.65);
    v.addColorStop(0, "rgba(0,0,8,0)");
    v.addColorStop(1, "rgba(0,0,8,0.5)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- UI ----------
  function syncUi() {
    const c = COLORS[opts.color];
    $("lanterns-color-lbl").textContent = c.name;
    $("lanterns-color-ico").style.background = c.c ? css(c.c) : "conic-gradient(#ffa84e, #ff888c, #ffe8c4, #c4ec96, #ffa84e)";
    $("lanterns-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("lanterns-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("lanterns-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("lanterns-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("lanterns-release").addEventListener("click", () => { Z.ensureAudio(); startLoops(); release(); });
  $("lanterns-color").addEventListener("click", () => {
    opts.color = (opts.color + 1) % COLORS.length;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    Z.bell(Z.noteFreq(7 + opts.color), 0.025, W / 2, 2.4);
  });
  $("lanterns-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("lanterns-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    const oldW = W || Math.max(1, window.innerWidth), oldH = H || Math.max(1, window.innerHeight), oldHY = HY || oldH * 0.6;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    S = clamp(Math.min(W, H) / 800, 0.55, 1.25);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    makeScene();
    // keep everything where it was, proportionally, sky above the shore and lake below it
    const kx = W / oldW;
    for (const l of sky) { l.x *= kx; l.y *= HY / oldHY; }
    for (const f of floats) { f.x *= kx; f.y = HY + ((f.y - oldHY) * (H - HY)) / Math.max(1, oldH - oldHY); }
    for (const r of ripples) { r.x *= kx; r.y = HY + ((r.y - oldHY) * (H - HY)) / Math.max(1, oldH - oldHY); }
  }

  function seed() {
    // a few lanterns already up, and two floating near the shore
    for (let i = 0; i < 6; i++) {
      const l = makeSky(rand(W * 0.1, W * 0.9), rand(HY * 0.15, HY * 0.8), { z: rand(0.6, 3.2), inflate: 1 });
      l.alpha = 1;
      l.chimed = true;
      l.vy = -l.rise;
    }
    for (let i = 0; i < 2; i++) { const f = makeFloat(rand(W * 0.25, W * 0.75), HY + (H - HY) * rand(0.35, 0.7), true); f.alpha = 1; }
    ripples.length = 0;
  }

  // a frame hidden at load can report a 0 size: wait for a real one before laying things out
  let seeded = false;
  const seedOnce = () => { if (!seeded && window.innerWidth > 0 && window.innerHeight > 0) { seeded = true; seed(); } };
  window.addEventListener("resize", () => { resize(); seedOnce(); });

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
    window.__lanterns = { sky, floats, ripples, embers, opts, ptr, update, render, makeSky, makeFloat, release, get HY() { return HY; } };
  }

  resize();
  seedOnce();
  syncUi();
  requestAnimationFrame(frame);
})();
