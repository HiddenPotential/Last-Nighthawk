// Pond: a koi pond seen in 3D perspective. Tap to drop food, hold to call the fish, swipe to stir the water.
// Shares game.js's audio engine and sound/music settings through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("pond");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, S = 1; // S scales sizes to the screen (1 on an 800px screen)

  const KEY = "drift-pond-v1";
  const opts = { rain: false, time: 0 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.rain = !!opts.rain;
  opts.time = clamp(opts.time | 0, 0, 2);
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "pond";

  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // ---------- Time of day ----------
  const TIMES = [
    { name: "Day", ico: "☀", deep: [5, 36, 34], mid: [28, 96, 86], light: [255, 248, 215], lightA: 0.08, sky: [200, 236, 255], skyA: 0.07, dim: 0 },
    { name: "Dusk", ico: "◐", deep: [20, 14, 36], mid: [70, 74, 104], light: [255, 172, 118], lightA: 0.075, sky: [255, 150, 108], skyA: 0.11, dim: 0.12 },
    { name: "Night", ico: "☾", deep: [2, 7, 16], mid: [14, 38, 58], light: [150, 190, 255], lightA: 0.035, sky: [190, 215, 255], skyA: 0.04, dim: 0.38 },
  ];
  const pal = JSON.parse(JSON.stringify(TIMES[opts.time]));
  let nightK = opts.time === 2 ? 1 : 0, rainK = opts.rain ? 1 : 0;

  // ---------- Koi ----------
  const WHITE = [246, 241, 232], RED = [228, 70, 34], ORANGE = [242, 128, 44], GOLD = [244, 186, 70], INK = [30, 30, 36], CREAM = [250, 228, 194];
  const VARIETIES = [
    { base: WHITE, spots: [[RED, 4, 0.17]] }, // kohaku
    { base: WHITE, spots: [[RED, 3, 0.16], [INK, 4, 0.065]] }, // sanke
    { base: GOLD, spots: [], sheen: true }, // ogon
    { base: ORANGE, spots: [[WHITE, 2, 0.14]] },
    { base: WHITE, tancho: true }, // tancho: one red crown
    { base: INK, spots: [[ORANGE, 3, 0.13], [WHITE, 2, 0.1]] }, // showa
    { base: CREAM, spots: [[ORANGE, 3, 0.15]] },
    { base: [236, 104, 40], spots: [], sheen: true }, // orange ogon
  ];
  const SEG = 14;
  const fish = [];
  let varietyBag = [];

  function makeFish(x, y) {
    if (!varietyBag.length) varietyBag = VARIETIES.slice().sort(() => Math.random() - 0.5);
    const v = varietyBag.pop();
    const spots = [];
    for (const [c, n, size] of v.spots || []) {
      for (let i = 0; i < n; i++) spots.push({ c, t: rand(0.1, 0.78), s: rand(-0.85, 0.85), r: size * rand(0.7, 1.3) });
    }
    if (v.tancho) spots.push({ c: RED, t: 0.09, s: 0, r: 0.1 });
    const L = rand(78, 128) * S, a = rand(0, TAU);
    const f = {
      x, y, a, sp: rand(18, 30) * S, L, base: L, grown: 1, v, spots,
      fin: mix(v.base, WHITE, 0.45), depth: rand(0.25, 0.8), phase: rand(0, TAU), tail: rand(0, TAU),
      hunger: rand(0.55, 1), think: rand(0, 0.6), target: null, flee: 0, fleeA: 0, kiss: 0, wobble: rand(0.6, 1.4), segs: [],
      av: 0, amp: 0.3, beats: 0, goal: null, goalT: 0, hover: 0, cruise: rand(22, 36) * S,
    };
    for (let i = 0; i < SEG; i++) f.segs.push({ x: x - Math.cos(a) * (i * L) / (SEG - 1), y: y - Math.sin(a) * (i * L) / (SEG - 1) });
    fish.push(f);
    return f;
  }

  // ---------- Surface things ----------
  const food = [];
  const ripples = [];
  const pads = [];
  const petals = [];
  const glints = [];
  const flies = [];
  const lights = Array.from({ length: 11 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.18, 0.4), p: rand(0, TAU), s: rand(0.04, 0.1) }));
  let time = 0;
  let bottom = null; // pre-rendered pebbles

  function ripple(x, y, amp = 1, life = 2.4, speed = 46) {
    if (ripples.length > 180) ripples.shift();
    ripples.push({ x, y, amp, life, speed: speed * S, age: 0 });
    // the wave nudges nearby lily pads
    for (const p of pads) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1, reach = (120 + p.r) * S;
      if (d < reach) { const k = (1 - d / reach) * amp * 14 * S; p.vx += (dx / d) * k; p.vy += (dy / d) * k; p.spin += rand(-0.08, 0.08) * amp; }
    }
  }

  function dropFood(x, y, n = 5, spread = 16) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(0, spread) * S;
      food.push({ x: clamp(x + Math.cos(a) * d, 6, W - 6), y: clamp(y + Math.sin(a) * d, 6, H - 6), vx: Math.cos(a) * rand(2, 8), vy: Math.sin(a) * rand(2, 8), age: 0, sink: 0, land: i * 0.05 });
    }
    ripple(x, y, 0.8, 2.2);
    setTimeout(() => ripple(x, y, 0.4, 1.6), 140);
    plop(x, 1);
    // everyone takes a fresh look for food
    for (const f of fish) f.think = Math.min(f.think, rand(0.05, 0.5));
  }

  function sprinkle() {
    const spots = 3;
    for (let k = 0; k < spots; k++) {
      setTimeout(() => dropFood(rand(W * 0.15, W * 0.85), rand(H * 0.2, H * 0.8), 4, 30), k * 220);
    }
  }

  function makePads() {
    pads.length = 0;
    const n = clamp(Math.round((W * H) / 170000), 3, 7);
    for (let tries = 0; pads.length < n && tries < 200; tries++) {
      const r = rand(30, 58) * S;
      const x = rand(r * 0.4, W - r * 0.4), y = rand(r * 0.4, H - r * 0.4);
      if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 30 * S)) continue;
      if (Math.hypot(x - W / 2, y - H / 2) < Math.min(W, H) * 0.18) continue; // keep the middle open
      if (!seen(x, y, r * 0.6)) continue; // not in the off-screen corners
      pads.push({ x, y, r, rot: rand(0, TAU), notch: rand(0.3, 0.5), vx: 0, vy: 0, spin: rand(-0.03, 0.03), flower: Math.random() < 0.4, bob: rand(0, TAU), shade: rand(-0.08, 0.08) });
    }
  }

  function makeBottom() {
    bottom = document.createElement("canvas");
    bottom.width = Math.ceil(W);
    bottom.height = Math.ceil(H);
    const b = bottom.getContext("2d");
    // sand grain
    for (let i = 0; i < (W * H) / 900; i++) {
      b.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${rand(0.015, 0.04)})` : `rgba(0,0,0,${rand(0.02, 0.05)})`;
      b.fillRect(rand(0, W), rand(0, H), 1.5, 1.5);
    }
    // pebbles, denser toward the banks
    for (let i = 0; i < (W * H) / 5000; i++) {
      const x = rand(0, W), y = rand(0, H);
      const edge = Math.min(x, y, W - x, H - y) / (Math.min(W, H) * 0.5);
      if (Math.random() < edge * 0.8) continue;
      const r = rand(3, 16) * S * (1.4 - edge * 0.6);
      const light = Math.random() < 0.55;
      b.fillStyle = light ? `rgba(255,250,235,${rand(0.04, 0.1)})` : `rgba(0,0,0,${rand(0.08, 0.18)})`;
      b.beginPath();
      b.ellipse(x, y, r, r * rand(0.6, 0.9), rand(0, TAU), 0, TAU);
      b.fill();
    }
    // a few big dark stones
    for (let i = 0; i < 7; i++) {
      const side = i % 4, r = rand(40, 90) * S;
      const x = side === 0 ? rand(-r * 0.3, r * 0.4) : side === 1 ? rand(W - r * 0.4, W + r * 0.3) : rand(0, W);
      const y = side === 2 ? rand(-r * 0.3, r * 0.4) : side === 3 ? rand(H - r * 0.4, H + r * 0.3) : rand(0, H);
      const g = b.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.05)");
      g.addColorStop(0.6, "rgba(0,0,0,0.2)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = g;
      b.beginPath();
      b.ellipse(x, y, r, r * rand(0.6, 0.85), rand(0, TAU), 0, TAU);
      b.fill();
    }
  }

  function seed() {
    const n = clamp(Math.round((W * H) / 95000), 6, 11);
    for (let i = 0; i < n; i++) makeFish(rand(W * 0.15, W * 0.85), rand(H * 0.15, H * 0.85));
    makePads();
    for (let i = 0; i < 22; i++) glints.push({ x: Math.random(), y: Math.random(), p: rand(0, TAU), s: rand(0.6, 1.6) });
    for (let i = 0; i < 16; i++) flies.push({ x: Math.random(), y: Math.random(), p: rand(0, TAU), s: rand(0.3, 0.8) });
  }

  // ---------- Audio ----------
  const panOf = (x) => (x / W) * 2 - 1;
  const audio = () => (Z.audioOk() ? Z.ac : null);

  // food hitting the water: a small drop and a hiss
  function plop(x, vol = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const o = ac.createOscillator(), g = ac.createGain(), f = rand(520, 760);
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.38, t + 0.09);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    const n = Z.noise(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 1.2;
    ng.gain.setValueAtTime(0.025 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.14);
  }

  // a koi taking a pellet: a soft upward gulp and a quiet chime
  let lastChime = 0;
  function gulp(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(430, t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.14);
    if (time - lastChime > 0.25) {
      lastChime = time;
      Z.bell(Z.noteFreq(8 + ((Math.random() * 7) | 0)), 0.02, x, 2.2);
    }
  }

  // a startled fish slapping its tail
  function splash(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x));
    const n = Z.noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.connect(lp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.4);
  }

  // continuous layers: still water, rain, and the swish of a stirring hand
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
    loops = { water: layer("lowpass", 380, 0.5), rain: layer("highpass", 1800, 0.4), swish: layer("bandpass", 500, 0.8) };
  }
  function updateLoops(swishSpeed) {
    if (!loops) return;
    const t = Z.ac.currentTime, on = here();
    loops.water.g.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.5);
    loops.rain.g.gain.setTargetAtTime(on ? 0.055 * rainK : 0, t, 0.4);
    loops.swish.g.gain.setTargetAtTime(on ? clamp(swishSpeed / 2500, 0, 1) * 0.12 : 0, t, 0.08);
    loops.swish.f.frequency.setTargetAtTime(380 + clamp(swishSpeed, 0, 3000) * 0.4, t, 0.1);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, st: 0, lx: 0, ly: 0, moved: false, trail: 0 };
  let call = null, callTick = 0, interactions = 0;

  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("pond-title").classList.add("fade");
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    canvas.setPointerCapture?.(e.pointerId);
    const q = toPond(e.clientX, e.clientY); // the view is in perspective: find where the finger meets the water
    Object.assign(ptr, { down: true, id: e.pointerId, x: q.x, y: q.y, sx: q.x, sy: q.y, lx: q.x, ly: q.y, st: time, moved: false, trail: 0 });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    const q = toPond(e.clientX, e.clientY);
    ptr.x = q.x;
    ptr.y = q.y;
    if (!call && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 10) ptr.moved = true;
    if (call) { call.x = ptr.x; call.y = ptr.y; } // the koi follow a held finger
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    if (!ptr.moved && !call && time - ptr.st < 0.35) dropFood(ptr.x, ptr.y);
    if (call) ripple(call.x, call.y, 0.5, 1.8);
    call = null;
    ptr.down = false;
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
    sprinkle();
  });

  // ---------- Simulation ----------
  function eat(f, p) {
    food.splice(food.indexOf(p), 1);
    f.target = null;
    f.hunger = Math.max(0, f.hunger - 0.12);
    f.grown = Math.min(1.3, f.grown + 0.012);
    f.L = f.base * f.grown;
    ripple(p.x, p.y, 0.55, 1.6);
    gulp(p.x);
  }

  // somewhere new to swim to, not too close; now and then a rest instead
  function pickGoal(f) {
    const m = f.L + 50 * S;
    for (let k = 0; k < 14; k++) {
      const x = rand(m, Math.max(m, W - m)), y = rand(m, Math.max(m, H - m));
      if ((Math.hypot(x - f.x, y - f.y) > f.L * 2.5 && seen(x, y, f.L * 0.6)) || k === 13) { f.goal = { x, y }; break; }
    }
    f.goalT = rand(8, 18);
    f.cruise = rand(20, 38) * S;
    if (Math.random() < 0.2) f.hover = rand(2, 5);
  }

  function updateFish(f, dt) {
    f.hunger = Math.min(1, f.hunger + dt / 45);
    f.kiss = Math.max(0, f.kiss - dt);
    f.think -= dt;
    if (f.think <= 0) {
      f.think = rand(0.25, 0.6);
      f.target = null;
      if (f.hunger > 0.12) {
        let best = Math.pow(lerp(0.15, 0.8, f.hunger) * Math.hypot(W, H), 2);
        for (const p of food) {
          if (p.sink > 0.6 || p.land > 0) continue;
          const d2 = (p.x - f.x) ** 2 + (p.y - f.y) ** 2;
          if (d2 < best) { best = d2; f.target = p; }
        }
      }
    }
    if (f.target && !food.includes(f.target)) f.target = null;

    // what it's after: food, a held finger, fleeing, or just wandering between spots
    let gx, gy, spd, urgency = 0, depthWant = 0.5 + 0.32 * Math.sin(time * 0.05 * f.wobble + f.phase);
    if (f.flee > 0) {
      f.flee -= dt;
      gx = f.x + Math.cos(f.fleeA) * 100;
      gy = f.y + Math.sin(f.fleeA) * 100;
      spd = 170 * S;
      urgency = 1;
      depthWant = 0.9;
    } else if (f.target) {
      const p = f.target, d = Math.hypot(p.x - f.x, p.y - f.y);
      gx = p.x;
      gy = p.y;
      // hurry over, then ease off and glide the last stretch into the pellet
      spd = (45 + 45 * f.hunger) * S * (d < f.L ? 0.35 + (0.65 * d) / f.L : 1);
      urgency = 0.35 + 0.45 * f.hunger;
      depthWant = 0.03;
      if (d < 7 * S + f.L * 0.06) eat(f, p);
    } else if (call && Math.hypot(call.x - f.x, call.y - f.y) < Math.hypot(W, H) * 0.6) {
      // circle the finger, each at its own distance
      const d = Math.hypot(call.x - f.x, call.y - f.y);
      const ang = time * 0.45 + f.phase, rr = f.L * (0.35 + ((f.phase * 7) % 1) * 0.5);
      gx = call.x + Math.cos(ang) * rr;
      gy = call.y + Math.sin(ang) * rr;
      spd = (d > f.L ? 60 : 24) * S;
      urgency = 0.4;
      depthWant = 0.05;
      if (d < 16 * S + f.L * 0.08 && f.kiss <= 0) {
        f.kiss = rand(1.2, 2.4);
        ripple(f.x, f.y, 0.35, 1.2);
        Z.plip(f.x);
      }
    } else if (f.hover > 0) {
      // resting: barely moving, fins sculling to hold still
      f.hover -= dt;
      gx = f.x + Math.cos(f.a) * 100;
      gy = f.y + Math.sin(f.a) * 100;
      spd = 2 * S;
    } else {
      if (!f.goal || Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < f.L * 0.8 || (f.goalT -= dt) <= 0) pickGoal(f);
      gx = f.goal.x;
      gy = f.goal.y;
      spd = f.cruise;
    }

    // desired heading: toward the goal, away from the banks and from neighbours
    let vx = gx - f.x, vy = gy - f.y;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl;
    vy /= vl;
    const m = f.L * 0.9 + 40 * S;
    if (f.x < m) vx += (1 - Math.max(0, f.x) / m) * 2;
    if (f.x > W - m) vx -= (1 - Math.max(0, W - f.x) / m) * 2;
    if (f.y < m) vy += (1 - Math.max(0, f.y) / m) * 2;
    if (f.y > H - m) vy -= (1 - Math.max(0, H - f.y) / m) * 2;
    for (const g of fish) {
      if (g === f || Math.abs(g.depth - f.depth) > 0.35) continue;
      const dx = f.x - g.x, dy = f.y - g.y, d = Math.hypot(dx, dy), room = (f.L + g.L) * 0.35;
      if (d > 0 && d < room) { vx += (dx / d) * (1 - d / room) * 1.2; vy += (dy / d) * (1 - d / room) * 1.2; }
    }

    // turn through a smooth arc: angular velocity eases toward what the heading needs
    const want = Math.atan2(vy, vx);
    const gain = urgency > 0.8 ? 5 : urgency > 0.3 ? 2.4 : 1;
    const maxTurn = urgency > 0.8 ? 4.5 : urgency > 0.3 ? 2.2 : 0.8;
    const avWant = clamp(angleDiff(want, f.a) * gain, -maxTurn, maxTurn);
    f.av = lerp(f.av, avWant, Math.min(1, dt * (urgency > 0.8 ? 8 : 2.2)));
    f.a += f.av * dt;

    // swim like a koi: a few tail beats, then a long glide while the body straightens
    if (f.beats <= 0 && f.sp < spd * 0.8) f.beats = urgency > 0.8 ? 4 : 1 + ((Math.random() * (urgency > 0.3 ? 3 : 2)) | 0);
    if (f.beats > 0) {
      const hz = 1.2 + urgency * 2.3 + clamp(spd / (90 * S), 0, 1) * 0.5;
      const before = Math.floor(f.tail / TAU);
      f.tail += TAU * hz * dt;
      if (Math.floor(f.tail / TAU) > before) f.beats--;
      f.amp = lerp(f.amp, 0.55 + 0.45 * urgency, Math.min(1, dt * 6));
      f.sp += (spd * 1.3 - f.sp) * (1.1 + urgency * 3) * dt;
    } else {
      f.tail += TAU * 0.3 * dt;
      f.amp = lerp(f.amp, f.hover > 0 ? 0.08 : 0.14, Math.min(1, dt * 1.5));
      f.sp -= f.sp * (spd < f.sp * 0.5 ? 0.9 : 0.25) * dt; // glide, or brake to a stop
    }
    f.sp *= 1 - Math.min(0.5, Math.abs(f.av) * 0.12) * dt; // turning costs a little speed

    f.x += Math.cos(f.a) * f.sp * dt;
    f.y += Math.sin(f.a) * f.sp * dt;
    f.x = clamp(f.x, -f.L * 0.2, W + f.L * 0.2);
    f.y = clamp(f.y, -f.L * 0.2, H + f.L * 0.2);
    f.depth = lerp(f.depth, depthWant, Math.min(1, dt * (f.flee > 0 ? 2.5 : 0.5)));

    // the body follows the head like a chain
    const gap = f.L / (SEG - 1);
    f.segs[0].x = f.x;
    f.segs[0].y = f.y;
    for (let i = 1; i < SEG; i++) {
      const a = f.segs[i - 1], b = f.segs[i];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * gap;
      b.y = a.y + (dy / d) * gap;
    }
  }

  let ambient = 4, petalTimer = 3;
  function update(dt) {
    time += dt;

    // ease the light toward the chosen time of day, and the rain in or out
    const T = TIMES[opts.time], k = Math.min(1, dt * 0.8);
    for (const key of ["deep", "mid", "light", "sky"]) pal[key] = mix(pal[key], T[key], k);
    for (const key of ["lightA", "skyA", "dim"]) pal[key] = lerp(pal[key], T[key], k);
    nightK = lerp(nightK, opts.time === 2 ? 1 : 0, k);
    rainK = lerp(rainK, opts.rain ? 1 : 0, Math.min(1, dt * 0.6));

    // held still: call the koi over
    if (ptr.down && !ptr.moved && !call && time - ptr.st > 0.35) {
      call = { x: ptr.x, y: ptr.y };
      callTick = 0;
      ripple(call.x, call.y, 0.6, 2);
      Z.plip(call.x);
    }
    if (call && (callTick -= dt) <= 0) { callTick = 1.3; ripple(call.x, call.y, 0.35, 1.6); }

    // stirring
    const pv = Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly) / dt;
    const stirring = ptr.down && ptr.moved;
    if (stirring) {
      ptr.trail += Math.hypot(ptr.x - ptr.lx, ptr.y - ptr.ly);
      if (ptr.trail > 26 * S) { ptr.trail = 0; ripple(ptr.x, ptr.y, clamp(pv / 1500, 0.25, 0.7), 1.6); }
      for (const f of fish) {
        if (pv > 300 * S && f.flee <= 0 && Math.hypot(f.x - ptr.x, f.y - ptr.y) < 110 * S + f.L * 0.4) {
          f.flee = rand(0.8, 1.2);
          f.fleeA = Math.atan2(f.y - ptr.y, f.x - ptr.x) + rand(-0.4, 0.4);
          f.target = null;
          splash(f.x);
          ripple(f.x, f.y, 0.9, 2);
        }
      }
      const vx = (ptr.x - ptr.lx) / dt, vy = (ptr.y - ptr.ly) / dt;
      for (const p of pads) {
        if (Math.hypot(p.x - ptr.x, p.y - ptr.y) < p.r + 30 * S) { p.vx += vx * 0.6 * dt; p.vy += vy * 0.6 * dt; p.spin += clamp((vx - vy) * 0.0004, -0.3, 0.3) * dt * 10; }
      }
    }
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
    if (Z.ac) { startLoops(); updateLoops(stirring ? pv : 0); }

    for (const f of fish) updateFish(f, dt);

    for (let i = food.length - 1; i >= 0; i--) {
      const p = food[i];
      if (p.land > 0) { p.land -= dt; continue; }
      p.age += dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.x = clamp(p.x + (p.vx + Math.sin(time * 0.4 + i) * 2) * dt, 4, W - 4);
      p.y = clamp(p.y + (p.vy + Math.cos(time * 0.3 + i) * 2) * dt, 4, H - 4);
      if (p.age > 30) p.sink += dt / 6;
      if (p.sink >= 1) food.splice(i, 1);
    }

    for (const r of ripples) r.age += dt;
    for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].age > ripples[i].life) ripples.splice(i, 1);

    for (const p of pads) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.vx *= 1 - 0.6 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.spin *= 1 - 0.4 * dt;
      p.vx += Math.sin(time * 0.07 + p.bob) * 0.6 * dt; // a faint breeze
      const lo = p.r * 0.3;
      if (p.x < lo) p.vx += 20 * dt; if (p.x > W - lo) p.vx -= 20 * dt;
      if (p.y < lo) p.vy += 20 * dt; if (p.y > H - lo) p.vy -= 20 * dt;
      for (const q of pads) {
        if (q === p) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1, min = p.r + q.r;
        if (d < min) { p.vx += (dx / d) * (min - d) * 2 * dt; p.vy += (dy / d) * (min - d) * 2 * dt; }
      }
    }

    // petals drift down now and then
    if ((petalTimer -= dt) <= 0) {
      petalTimer = rand(5, 12);
      if (petals.length < 14) petals.push({ x: rand(W * 0.05, W * 0.95), y: rand(H * 0.05, H * 0.95), h: 1, rot: rand(0, TAU), spin: rand(-1.2, 1.2), age: 0, leaf: Math.random() < 0.3, size: rand(0.8, 1.2) });
    }
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.age += dt;
      if (p.h > 0) {
        p.h -= dt / 3.2;
        p.x += Math.sin(p.age * 2) * 14 * S * dt;
        p.rot += p.spin * dt;
        if (p.h <= 0) { p.h = 0; ripple(p.x, p.y, 0.45, 1.8); Z.plip(p.x); }
      } else {
        p.rot += p.spin * 0.1 * dt;
        p.x += Math.sin(time * 0.1 + i) * 3 * S * dt;
        p.y += Math.cos(time * 0.08 + i) * 3 * S * dt;
      }
      if (p.age > 45) petals.splice(i, 1);
    }

    // rain
    if (rainK > 0.02) {
      let n = rainK * 34 * dt;
      while (n > 0) {
        if (Math.random() < n) {
          const x = rand(0, W), y = rand(0, H);
          ripples.push({ x, y, amp: rand(0.25, 0.5), life: rand(0.7, 1.1), speed: 28 * S, age: 0 });
          if (Math.random() < 0.06) Z.plip(x);
        }
        n -= 1;
      }
      if (ripples.length > 240) ripples.splice(0, ripples.length - 240);
    }

    // life in the pond: a fish noses the surface, a drip somewhere
    if ((ambient -= dt) <= 0) {
      ambient = rand(5, 12);
      const f = fish[(Math.random() * fish.length) | 0];
      if (f && f.depth < 0.45) ripple(f.x, f.y, 0.5, 2);
      Z.plip(rand(0, W));
    }
  }

  // ---------- Render ----------
  const P = Array.from({ length: SEG }, () => ({ x: 0, y: 0, nx: 0, ny: 0, w: 0, a: 0 }));
  const width = (t) => (t < 0.22 ? 0.62 + 0.38 * Math.sin((t / 0.22) * (Math.PI / 2)) : Math.pow(1 - (t - 0.22) / 0.78, 1.25) * 0.93 + 0.07);

  // swimming pose: the chain plus a travelling S-wave that grows toward the tail
  function pose(f) {
    const amp = f.L * 0.085 * f.amp;
    const wmax = f.L * 0.12;
    // the wave runs head to tail, mostly in the back half; the body also bends into turns
    const wave = (k) => Math.sin(f.tail - k * 5.2) * amp * (0.06 + 0.94 * k * k) + f.av * f.L * 0.05 * k * k;
    for (let i = 0; i < SEG; i++) {
      const s = f.segs[i], q = f.segs[Math.max(0, i - 1)], r = f.segs[Math.min(SEG - 1, i + 1)];
      let dx = q.x - r.x, dy = q.y - r.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const k = i / (SEG - 1), off = wave(k);
      Object.assign(P[i], { x: s.x - dy * off, y: s.y + dx * off, w: wmax * width(k) });
    }
    // cross-sections face along the line actually drawn (the waved one), not the straight spine,
    // so the body never shears or twists where the wave is strongest
    let pnx = 0, pny = 0;
    for (let i = 0; i < SEG; i++) {
      const q = P[Math.max(0, i - 1)], r = P[Math.min(SEG - 1, i + 1)];
      let dx = q.x - r.x, dy = q.y - r.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      let nx = -dy, ny = dx;
      if (i && nx * pnx + ny * pny < 0) { nx = -nx; ny = -ny; } // never let a slice flip over
      Object.assign(P[i], { nx, ny, a: Math.atan2(dy, dx) });
      pnx = nx;
      pny = ny;
    }
    // the tail fin points to where the swimming wave would carry on past the body,
    // so it always follows through the tail's sweep instead of kinking against it
    const a = f.segs[SEG - 2], b = f.segs[SEG - 1];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const off = wave(1.27), last = P[SEG - 1];
    P.fin = Math.atan2(b.y + ty * f.L * 0.27 - tx * off - last.y, b.x + tx * f.L * 0.27 + ty * off - last.x);
  }

  function curveThrough(pts) {
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    }
    const e = pts[pts.length - 1];
    ctx.lineTo(e[0], e[1]);
  }

  function bodyPath() {
    const Lp = P.map((p) => [p.x + p.nx * p.w, p.y + p.ny * p.w]);
    const Rp = P.map((p) => [p.x - p.nx * p.w, p.y - p.ny * p.w]).reverse();
    ctx.beginPath();
    ctx.moveTo(Lp[0][0], Lp[0][1]);
    curveThrough(Lp);
    ctx.lineTo(Rp[0][0], Rp[0][1]);
    curveThrough(Rp);
    ctx.ellipse(P[0].x, P[0].y, P[0].w * 1.35, P[0].w, P[0].a, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
  }

  // a point on the body: t along it (0 head, 1 tail root), s across it (-1..1)
  function bodyPoint(t, s) {
    const fi = clamp(t, 0, 1) * (SEG - 1), i = Math.min(SEG - 2, fi | 0), u = fi - i;
    const a = P[i], b = P[i + 1];
    const w = lerp(a.w, b.w, u) * s;
    return { x: lerp(a.x, b.x, u) + lerp(a.nx, b.nx, u) * w, y: lerp(a.y, b.y, u) + lerp(a.ny, b.ny, u) * w, a: lerp(a.a, a.a + angleDiff(b.a, a.a), u) };
  }

  // light for the 3D bodies: from the upper left and above, matching the shadows on the pond floor
  const LIGHT = (() => { const v = [-0.55, -0.76, 0.42], l = Math.hypot(...v); return v.map((c) => c / l); })();
  const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1], l = Math.hypot(...v); return v.map((c) => c / l); })();

  // cross-section rings from the snout to the tail root: a rounded head cap, then the posed spine
  // (with an extra ring between each pair for smoothness)
  function bodyRings() {
    const out = [], p0 = P[0], fx = Math.cos(p0.a), fy = Math.sin(p0.a), cap = p0.w * 1.35;
    for (let k = 0; k < 4; k++) {
      const u = k / 4;
      out.push({ x: p0.x + fx * cap * (1 - u), y: p0.y + fy * cap * (1 - u), nx: p0.nx, ny: p0.ny, w: p0.w * Math.sqrt(1 - (1 - u) ** 2), t: -(1 - u) * 0.06 });
    }
    for (let i = 0; i < SEG; i++) {
      const a = P[i];
      out.push({ x: a.x, y: a.y, nx: a.nx, ny: a.ny, w: a.w, t: i / (SEG - 1) });
      if (i < SEG - 1) {
        const b = P[i + 1];
        let nx = a.nx + b.nx, ny = a.ny + b.ny;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, nx, ny, w: (a.w + b.w) / 2, t: (i + 0.5) / (SEG - 1) });
      }
    }
    return out;
  }

  // the koi's colour at a spot on its skin: t along the body, s across it (-1..1), w the local half-width
  function skinColor(f, t, s, w) {
    let c = f.v.base;
    for (const sp of f.spots) {
      const dt = (t - sp.t) / (sp.r * 1.35), ds = ((s - sp.s * 0.9) * w) / (sp.r * f.L);
      const cover = clamp((1.12 - Math.hypot(dt, ds)) / 0.24, 0, 1);
      if (cover > 0) c = mix(c, sp.c, cover);
    }
    return c;
  }

  function fishShadow(f) {
    pose(f);
    const lift = (0.35 + (1 - f.depth) * 0.9) * f.L * 0.3;
    const ox = lift * 0.55, oy = lift * 0.8;
    ctx.lineCap = "round";
    for (const [mul, a] of [[2.8, 0.05], [2, 0.1]]) {
      ctx.strokeStyle = `rgba(0,0,0,${a * (1 - f.depth * 0.5)})`;
      for (let i = 0; i < SEG - 1; i++) {
        ctx.lineWidth = Math.max(1, (P[i].w + P[i + 1].w) * 0.5 * mul);
        ctx.beginPath();
        ctx.moveTo(P[i].x + ox, P[i].y + oy);
        ctx.lineTo(P[i + 1].x + ox, P[i + 1].y + oy);
        ctx.stroke();
      }
    }
  }

  function drawFish(f) {
    pose(f);
    const veil = f.depth * 0.5 + pal.dim * 0.6;
    ctx.save();
    ctx.globalAlpha = 1 - f.depth * 0.3;

    // fins (under the body): tail, then pectorals
    const last = P[SEG - 1];
    const back = P.fin, bx = Math.cos(back), by = Math.sin(back), sx = -by, sy = bx;
    const Lt = f.L * 0.27, rw = last.w * 1.3;
    const tg = ctx.createLinearGradient(last.x, last.y, last.x + bx * Lt, last.y + by * Lt);
    tg.addColorStop(0, css(f.fin, 0.78));
    tg.addColorStop(1, css(mix(f.fin, WHITE, 0.3), 0.22));
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(last.x + sx * rw, last.y + sy * rw);
    ctx.quadraticCurveTo(last.x + bx * Lt * 0.45 + sx * Lt * 0.45, last.y + by * Lt * 0.45 + sy * Lt * 0.45, last.x + bx * Lt + sx * Lt * 0.5, last.y + by * Lt + sy * Lt * 0.5);
    ctx.quadraticCurveTo(last.x + bx * Lt * 0.62, last.y + by * Lt * 0.62, last.x + bx * Lt * 0.58, last.y + by * Lt * 0.58);
    ctx.quadraticCurveTo(last.x + bx * Lt * 0.62, last.y + by * Lt * 0.62, last.x + bx * Lt - sx * Lt * 0.5, last.y + by * Lt - sy * Lt * 0.5);
    ctx.quadraticCurveTo(last.x + bx * Lt * 0.45 - sx * Lt * 0.45, last.y + by * Lt * 0.45 - sy * Lt * 0.45, last.x - sx * rw, last.y - sy * rw);
    ctx.closePath();
    ctx.fill();
    // fin rays
    ctx.strokeStyle = css(mix(f.fin, WHITE, 0.5), 0.25);
    ctx.lineWidth = Math.max(0.6, f.L * 0.006);
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x + bx * Lt * 0.85 + sx * Lt * 0.18 * k, last.y + by * Lt * 0.85 + sy * Lt * 0.18 * k);
      ctx.stroke();
    }

    // pectorals tuck back while swimming hard, flare out to brake, steer and hover
    const flare = clamp((f.hover > 0 ? 0.8 : 0) + (f.beats > 0 ? 0 : 0.35) + Math.abs(f.av) * 0.25, 0, 1);
    const flap = Math.sin(time * (f.hover > 0 ? 3.2 : 1.6) + f.phase) * 0.2 * (0.3 + flare);
    for (const side of [1, -1]) {
      const root = bodyPoint(0.2, side * 0.8);
      const ang = root.a + side * (Math.PI / 2 + 0.95 - flare * 0.6 + flap - side * f.av * 0.12);
      // the fin twists as it paddles, so it looks thinner when seen edge-on
      const twist = 0.35 + 0.65 * Math.abs(Math.cos(time * (f.hover > 0 ? 3.2 : 1.6) + f.phase + side));
      const rx = f.L * 0.12, ry = f.L * 0.05 * twist;
      const cx = root.x + Math.cos(ang) * rx * 0.85, cy = root.y + Math.sin(ang) * rx * 0.85;
      const pg = ctx.createRadialGradient(root.x, root.y, 0, root.x, root.y, rx * 1.9);
      pg.addColorStop(0, css(f.fin, 0.75));
      pg.addColorStop(1, css(mix(f.fin, WHITE, 0.3), 0.15));
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ang, 0, TAU);
      ctx.fill();
    }

    // solid 3D body: lofted as a tube of oval rings, and every small patch of skin is lit from its
    // own surface angle (soft diffuse light, dark flanks, a sharp wet highlight), so the pattern
    // sits on a properly rounded body. Drawn opaque, with the depth fade mixed into the colour.
    const lx = -0.57, ly = -0.82; // light direction on screen, for the eye catch-lights
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.7;
    ctx.lineJoin = "round";
    const water = mix(pal.mid, pal.deep, 0.5), fade = f.depth * 0.3;
    // fish bank into their turns and rock a little with each tail beat
    const roll = clamp(angleDiff(P[0].a, P[6].a) * 1.4, -0.45, 0.45) + Math.sin(f.tail - 1) * 0.06 * f.amp;
    const gloss = f.v.sheen ? 0.95 + 0.3 * Math.sin(time * 2 + f.phase) : 0.6;
    const rings = bodyRings();
    const ACROSS = 9;
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i], b = rings[i + 1];
      let dx = a.x - b.x, dy = a.y - b.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl; // pointing toward the head
      const slope = (b.w - a.w) / dl; // the surface tips forward where the body widens toward the tail
      const t = (a.t + b.t) / 2, w = (a.w + b.w) / 2, nx = (a.nx + b.nx) / 2, ny = (a.ny + b.ny) / 2;
      for (let j = 0; j < ACROSS; j++) {
        const th0 = -Math.PI / 2 + (j / ACROSS) * Math.PI, th1 = th0 + Math.PI / ACROSS, th = (th0 + th1) / 2 + roll;
        // normal of an oval cross-section (0.8 as tall as it is wide), tipped by the taper
        let Nx = nx * Math.sin(th) * 0.8 + dx * slope * Math.cos(th);
        let Ny = ny * Math.sin(th) * 0.8 + dy * slope * Math.cos(th);
        let Nz = Math.cos(th);
        const nl = Math.hypot(Nx, Ny, Nz) || 1;
        Nx /= nl;
        Ny /= nl;
        Nz /= nl;
        const diff = Math.max(0, Nx * LIGHT[0] + Ny * LIGHT[1] + Nz * LIGHT[2]);
        const spec = Math.pow(Math.max(0, Nx * HALF[0] + Ny * HALF[1] + Nz * HALF[2]), 34) * gloss;
        const skin = skinColor(f, t, Math.sin((th0 + th1) / 2), w);
        const k = 0.2 + 1.0 * diff;
        let col = [
          Math.min(255, skin[0] * k + 255 * spec),
          Math.min(255, skin[1] * k + 252 * spec),
          Math.min(255, skin[2] * k + 240 * spec),
        ];
        if (fade > 0) col = mix(col, water, fade);
        const style = css(col);
        ctx.fillStyle = style;
        ctx.strokeStyle = style; // a hairline in the same colour hides the seams between patches
        const s0 = Math.sin(th0), s1 = Math.sin(th1);
        ctx.beginPath();
        ctx.moveTo(a.x + a.nx * a.w * s0, a.y + a.ny * a.w * s0);
        ctx.lineTo(a.x + a.nx * a.w * s1, a.y + a.ny * a.w * s1);
        ctx.lineTo(b.x + b.nx * b.w * s1, b.y + b.ny * b.w * s1);
        ctx.lineTo(b.x + b.nx * b.w * s0, b.y + b.ny * b.w * s0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // dorsal fin: a thin crest standing up from the spine, casting a soft shadow on the back
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const crest = (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(P[3].x + ox, P[3].y + oy);
      for (let i = 4; i <= 8; i++) ctx.lineTo(P[i].x + ox, P[i].y + oy);
    };
    const fh = f.L * 0.03;
    crest(fh * 0.55, fh * 0.8);
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = Math.max(1, f.L * 0.02);
    ctx.stroke();
    crest(0, 0);
    ctx.strokeStyle = css(mix(f.fin, WHITE, 0.15), 0.7);
    ctx.lineWidth = Math.max(0.8, f.L * 0.013);
    ctx.stroke();

    // eyes: small glossy domes with a catch-light
    for (const side of [1, -1]) {
      const e = bodyPoint(0.035, side * 0.66), er = Math.max(1.2, f.L * 0.016);
      const eg = ctx.createRadialGradient(e.x + lx * er * 0.4, e.y + ly * er * 0.4, 0, e.x, e.y, er);
      eg.addColorStop(0, "rgba(70,64,60,0.95)");
      eg.addColorStop(1, "rgba(12,10,12,0.95)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(e.x, e.y, er, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(e.x + lx * er * 0.4, e.y + ly * er * 0.4, er * 0.32, 0, TAU);
      ctx.fill();
    }

    // water over deeper fish
    if (veil > 0.01) {
      bodyPath();
      ctx.fillStyle = css(mix(pal.mid, pal.deep, 0.5), veil);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPad(p) {
    const lit = mix([92, 156, 76], pal.deep, pal.dim * 1.4 + p.shade);
    const dark = mix([40, 94, 44], pal.deep, pal.dim * 1.4);
    const bob = 1 + Math.sin(time * 0.8 + p.bob) * 0.012;
    const r = p.r * bob;
    const shape = (x, y) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, p.rot + p.notch / 2, p.rot + TAU - p.notch / 2);
      ctx.closePath();
    };
    shape(p.x + 7 * S, p.y + 10 * S);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fill();
    shape(p.x, p.y);
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, css(lit));
    g.addColorStop(1, css(dark));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = css(mix(dark, [0, 0, 0], 0.4), 0.6);
    ctx.lineWidth = 1.4 * S;
    ctx.stroke();
    // veins
    ctx.strokeStyle = css(mix(lit, WHITE, 0.3), 0.18);
    ctx.lineWidth = 1 * S;
    for (let a = p.rot + p.notch; a < p.rot + TAU - p.notch * 0.6; a += 0.42) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * r * 0.9, p.y + Math.sin(a) * r * 0.9);
      ctx.stroke();
    }
    // wet rim catching the light
    ctx.strokeStyle = `rgba(255,255,255,${0.16 * (1 - pal.dim)})`;
    ctx.lineWidth = 1.5 * S;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 1.5 * S, Math.PI * 1.05, Math.PI * 1.55);
    ctx.stroke();
    if (p.flower) drawLotus(p.x + Math.cos(p.rot + Math.PI) * r * 0.2, p.y + Math.sin(p.rot + Math.PI) * r * 0.2, r * 0.55, p.rot);
  }

  function drawLotus(x, y, s, rot) {
    const night = pal.dim * 1.2;
    const outer = mix([248, 150, 186], pal.deep, night), inner = mix([255, 214, 228], pal.deep, night * 0.8);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.arc(x + 5 * S, y + 7 * S, s * 0.8, 0, TAU);
    ctx.fill();
    for (const [n, len, wid, col, off] of [[9, 0.85, 0.32, outer, 0], [7, 0.6, 0.28, inner, 0.3], [5, 0.38, 0.22, mix(inner, WHITE, 0.3), 0.6]]) {
      for (let i = 0; i < n; i++) {
        const a = rot + off + (i / n) * TAU;
        const cx = x + Math.cos(a) * s * len * 0.5, cy = y + Math.sin(a) * s * len * 0.5;
        const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * s * len, y + Math.sin(a) * s * len);
        g.addColorStop(0, css(mix(col, WHITE, 0.35)));
        g.addColorStop(1, css(col));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * len * 0.5, s * wid * 0.5, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = css(mix([255, 214, 90], pal.deep, night * 0.6));
    ctx.beginPath();
    ctx.arc(x, y, s * 0.13, 0, TAU);
    ctx.fill();
  }

  function drawPetal(p) {
    const s = (p.leaf ? 11 : 7) * S * p.size * (1 + p.h * 0.8);
    const fade = p.age > 38 ? 1 - (p.age - 38) / 7 : 1;
    const col = p.leaf ? mix([214, 120, 50], pal.deep, pal.dim) : mix([255, 196, 214], pal.deep, pal.dim);
    // shadow falls away from the petal while it's still in the air
    const off = (3 + p.h * 40) * S;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x + off * 0.55, p.y + off * 0.8);
    ctx.rotate(p.rot);
    ctx.fillStyle = `rgba(0,0,0,${0.18 * (1 - p.h * 0.6)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = css(col);
    ctx.beginPath();
    if (p.leaf) {
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.7, s, 0);
      ctx.quadraticCurveTo(0, s * 0.7, -s, 0);
    } else {
      ctx.moveTo(-s, 0);
      ctx.bezierCurveTo(-s * 0.4, -s * 0.8, s * 0.7, -s * 0.6, s, -s * 0.1);
      ctx.lineTo(s * 0.8, 0.05 * s);
      ctx.lineTo(s, s * 0.15);
      ctx.bezierCurveTo(s * 0.7, s * 0.6, -s * 0.4, s * 0.8, -s, 0);
    }
    ctx.fill();
    ctx.strokeStyle = css(mix(col, [0, 0, 0], 0.25), 0.35);
    ctx.lineWidth = 0.8 * S;
    ctx.beginPath();
    ctx.moveTo(-s * 0.9, 0);
    ctx.lineTo(s * 0.7, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawFood(p) {
    const r = 3.4 * S, a = 1 - p.sink;
    ctx.fillStyle = `rgba(0,0,0,${0.25 * a})`;
    ctx.beginPath();
    ctx.arc(p.x + 2 * S, p.y + 3 * S, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = css(mix([200, 136, 74], pal.deep, pal.dim + p.sink * 0.6), a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,240,210,${0.6 * a * (1 - pal.dim)})`;
    ctx.beginPath();
    ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.35, 0, TAU);
    ctx.fill();
  }

  function drawRipple(r) {
    const k = r.age / r.life, R = r.age * r.speed, a = r.amp * Math.pow(1 - k, 1.6);
    if (R < 1) return;
    ctx.lineWidth = 1.6 * S;
    ctx.strokeStyle = css(mix(pal.sky, WHITE, 0.5), a * 0.4);
    ctx.beginPath();
    ctx.arc(r.x, r.y, R, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0,0,0,${a * 0.16})`;
    ctx.beginPath();
    ctx.arc(r.x, r.y, Math.max(0.5, R - 2.5 * S), 0, TAU);
    ctx.stroke();
    if (r.amp > 0.6 && R > 14 * S) {
      ctx.strokeStyle = css(WHITE, a * 0.18);
      ctx.beginPath();
      ctx.arc(r.x, r.y, R * 0.62, 0, TAU);
      ctx.stroke();
    }
  }

  // ---------- 3D view ----------
  // The simulation lives on a flat W×H pond plane. A tilted camera looks into it, framed so the
  // water fills the whole screen: the floor sits DEEP below the surface and fish swim in between.
  const CAM = { e: 0.98, D: 1, K: 1, OX: 0, OY: 0 }; // e: how steeply the camera looks down (radians)
  let DEEP = 70; // pond depth

  // camera-space position of a pond point (h = height above the water surface), before fitting
  function camRaw(x, y, h) {
    const se = Math.sin(CAM.e), ce = Math.cos(CAM.e);
    const ry = h - CAM.D * se, rz = y - H / 2 - CAM.D * ce;
    const depth = -ry * se - rz * ce;
    return { x: (x - W / 2) / depth, y: (ry * ce - rz * se) / depth };
  }
  function proj(x, y, h = 0) {
    const r = camRaw(x, y, h);
    return { X: CAM.OX + r.x * CAM.K, Y: CAM.OY - r.y * CAM.K };
  }
  // draw in pond coordinates around (x, y, h): the local perspective as an affine transform
  function at(x, y, h = 0) {
    const p = proj(x, y, h), px = proj(x + 1, y, h), py = proj(x, y + 1, h);
    const a = px.X - p.X, b = px.Y - p.Y, c = py.X - p.X, d = py.Y - p.Y;
    ctx.setTransform(DPR * a, DPR * b, DPR * c, DPR * d, DPR * (p.X - a * x - c * y), DPR * (p.Y - b * x - d * y));
  }
  const flat = () => ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // where a screen point's line of sight meets the level h (unclamped)
  function rayAt(X, Y, h) {
    const se = Math.sin(CAM.e), ce = Math.cos(CAM.e);
    const ax = (X - CAM.OX) / CAM.K, ay = -(Y - CAM.OY) / CAM.K;
    const dy = -se + ay * ce, dz = -ce - ay * se;
    const t = dy < -1e-6 ? (CAM.D * se - h) / -dy : 1e6;
    return { x: ax * t + W / 2, y: CAM.D * ce + dz * t + H / 2 };
  }
  // where a screen point lands on the water surface
  function toPond(X, Y) {
    const q = rayAt(X, Y, 0);
    return { x: clamp(q.x, 0, W), y: clamp(q.y, 0, H) };
  }
  // the floor reaches past every screen edge, so the basin walls never show
  const FLOOR = { x0: 0, x1: 0, y0: 0, y1: 0 };
  // fish hang between the floor and the surface (apparent depth, as water makes things look shallower)
  const fishH = (f) => -(0.12 + f.depth * 0.78) * DEEP;

  // Frame the pond so its far edge spans the screen at the top and its near edge reaches the bottom.
  // The tilt is solved for the screen's shape; only slivers at the bottom corners fall off-screen.
  function fitCamera() {
    CAM.D = 1.9 * Math.max(W, H);
    const pad = 3; // a little overscan so no edge ever peeks in
    const measure = (e) => {
      CAM.e = e;
      CAM.K = 1;
      const a = camRaw(0, 0, 0), b = camRaw(W, 0, 0), far = camRaw(W / 2, 0, 0), near = camRaw(W / 2, H, 0);
      return { kw: (W + pad * 2) / (b.x - a.x), span: far.y - near.y };
    };
    // the on-screen height grows with the tilt up to a point: find the gentlest tilt that fills it
    let lo = 0.75, hi = 1.3;
    const fills = (e) => { const m = measure(e); return m.span * m.kw >= H + pad * 2; };
    if (fills(lo)) hi = lo;
    else if (fills(hi)) for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fills(mid)) hi = mid; else lo = mid; }
    const m = measure(hi);
    CAM.K = Math.max(m.kw, (H + pad * 2) / m.span); // whichever way is tighter, cover it
    CAM.OX = W / 2;
    CAM.OY = -pad + camRaw(W / 2, 0, 0).y * CAM.K;
    DEEP = 70 * S;
    const hf = -DEEP * 1.1, c = [[0, 0], [W, 0], [W, H], [0, H]].map(([X, Y]) => rayAt(X, Y, hf));
    FLOOR.x0 = Math.min(0, ...c.map((q) => q.x)) - 20;
    FLOOR.x1 = Math.max(W, ...c.map((q) => q.x)) + 20;
    FLOOR.y0 = Math.min(0, ...c.map((q) => q.y)) - 20;
    FLOOR.y1 = Math.max(H, ...c.map((q) => q.y)) + 20;
  }

  // is a pond point comfortably inside the visible screen?
  function seen(x, y, m = 0) {
    const p = proj(x, y, 0);
    return p.X > m && p.X < W - m && p.Y > m && p.Y < H - m;
  }

  // a closed outline of the pond rectangle at height h (used for the water surface and the clip)
  function rectPath(h) {
    const a = proj(0, 0, h), b = proj(W, 0, h), c = proj(W, H, h), d = proj(0, H, h);
    ctx.beginPath();
    ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.lineTo(c.X, c.Y); ctx.lineTo(d.X, d.Y);
    ctx.closePath();
    return { top: Math.min(a.Y, b.Y), bottom: Math.max(c.Y, d.Y) };
  }

  function drawGround() {
    ctx.fillStyle = css(pal.deep);
    ctx.fillRect(0, 0, W, H);
  }

  // the pond floor in perspective: base colour, then the pebble texture drawn row by row
  // (exact for this camera, since rows across the pond stay level on screen)
  function drawBasin() {
    const hf = -DEEP * 1.1, F = FLOOR;
    const a = proj(F.x0, F.y0, hf), b = proj(F.x1, F.y0, hf), c = proj(F.x1, F.y1, hf), d = proj(F.x0, F.y1, hf);
    const fg = ctx.createLinearGradient(0, a.Y, 0, c.Y);
    fg.addColorStop(0, css(mix(pal.deep, pal.mid, 0.35)));
    fg.addColorStop(1, css(pal.mid));
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.lineTo(c.X, c.Y); ctx.lineTo(d.X, d.Y);
    ctx.closePath();
    ctx.fill();
    if (bottom) {
      const rows = 260, span = F.y1 - F.y0;
      for (let i = 0; i < rows; i++) {
        const y = F.y0 + (span * i) / rows, y2 = F.y0 + (span * (i + 1)) / rows;
        const l = proj(F.x0, y, hf), r = proj(F.x1, y, hf), n = proj(F.x0, y2, hf);
        if (n.Y < -2 || l.Y > H + 2) continue;
        ctx.drawImage(bottom, 0, (bottom.height * i) / rows, bottom.width, bottom.height / rows, l.X, l.Y, r.X - l.X, n.Y - l.Y + 0.6);
      }
    }
    // dappled light on the floor
    ctx.globalCompositeOperation = "screen";
    for (const l of lights) {
      const x = (l.x + Math.sin(time * l.s + l.p) * 0.08) * W, y = (l.y + Math.cos(time * l.s * 0.8 + l.p) * 0.08) * H;
      const r = l.r * Math.min(W, H) * (1 + 0.15 * Math.sin(time * 0.5 + l.p));
      at(x, y, hf);
      const lg = ctx.createRadialGradient(x, y, 0, x, y, r);
      lg.addColorStop(0, css(pal.light, pal.lightA));
      lg.addColorStop(1, css(pal.light, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    flat();
    ctx.globalCompositeOperation = "source-over";
  }

  // the surface: water tint, then more reflection toward the far side (Fresnel), like real water
  function drawSurfaceSheen() {
    const r = rectPath(0);
    const g = ctx.createLinearGradient(0, r.top, 0, r.bottom);
    const sky = mix(pal.sky, pal.mid, 0.35), k = 1 - rainK * 0.35;
    g.addColorStop(0, css(sky, 0.5 * k));
    g.addColorStop(0.35, css(sky, 0.16 * k));
    g.addColorStop(1, css(pal.mid, 0.04));
    ctx.fillStyle = g;
    ctx.fill();
  }

  function render() {
    flat();
    drawGround();

    // everything below the surface is seen through the pond's opening
    ctx.save();
    rectPath(0);
    ctx.clip();
    drawBasin();
    const hf = -DEEP * 1.1;
    for (const f of fish) { at(f.x, f.y, hf); fishShadow(f); }
    const order = fish.slice().sort((a, b) => b.depth - a.depth);
    for (const f of order) { at(f.x, f.y, fishH(f)); drawFish(f); }
    for (const p of food) if (p.land <= 0 && p.sink > 0.05) { at(p.x, p.y, -p.sink * DEEP * 0.6); drawFood(p); }
    flat();
    drawSurfaceSheen();
    ctx.restore();

    // on the surface
    for (const p of food) if (p.land <= 0 && p.sink <= 0.05) { at(p.x, p.y, 0); drawFood(p); }
    for (const p of petals) if (p.h <= 0) { at(p.x, p.y, 0); drawPetal(p); }
    for (const p of pads) { at(p.x, p.y, 0); drawPad(p); }
    for (const r of ripples) { at(r.x, r.y, 0); drawRipple(r); }
    for (const p of petals) if (p.h > 0) { at(p.x, p.y, p.h * 160 * S); drawPetal(p); }
    flat();

    // rain greys the water
    if (rainK > 0.01) {
      rectPath(0);
      ctx.fillStyle = `rgba(30,40,52,${0.22 * rainK})`;
      ctx.fill();
    }

    // sun glitter by day, a wavering moon by night
    const glitter = (1 - nightK) * (1 - rainK * 0.7);
    if (glitter > 0.02) {
      for (const s of glints) {
        const a = Math.pow(Math.max(0, Math.sin(time * s.s + s.p)), 10) * 0.7 * glitter;
        if (a < 0.02) continue;
        const x = (s.x + Math.sin(time * 0.03 + s.p) * 0.02) * W, y = (s.y + Math.cos(time * 0.025 + s.p) * 0.02) * H, r = 2.2 * S;
        at(x, y, 0);
        ctx.fillStyle = css(mix(pal.light, WHITE, 0.5), a);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, TAU);
        ctx.ellipse(x, y, r * 0.6, r * 1.6, 0, 0, TAU);
        ctx.fill();
      }
      flat();
    }
    if (nightK > 0.02) {
      const mx = W * 0.74, my = H * 0.3;
      at(mx, my, 0);
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 120 * S);
      mg.addColorStop(0, `rgba(220,232,255,${0.12 * nightK})`);
      mg.addColorStop(1, "rgba(220,232,255,0)");
      ctx.fillStyle = mg;
      ctx.fillRect(mx - 120 * S, my - 120 * S, 240 * S, 240 * S);
      for (let j = -4; j <= 4; j++) {
        const w = (58 - Math.abs(j) * 9) * S * (1 + 0.15 * Math.sin(time * 1.3 + j));
        ctx.fillStyle = `rgba(235,242,255,${0.16 * nightK * (1 - Math.abs(j) / 5) * (1 - rainK * 0.6)})`;
        ctx.beginPath();
        ctx.ellipse(mx + Math.sin(time * 0.9 + j * 1.7) * 6 * S, my + j * 9 * S, Math.max(1, w), 2.6 * S, 0, 0, TAU);
        ctx.fill();
      }
      // fireflies drift in the air above the water
      ctx.globalCompositeOperation = "lighter";
      for (const fl of flies) {
        const x = (fl.x + Math.sin(time * 0.07 * fl.s + fl.p) * 0.12) * W;
        const y = (fl.y + Math.cos(time * 0.05 * fl.s + fl.p * 2) * 0.1) * H;
        const a = nightK * (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(time * fl.s * 1.6 + fl.p)), 3)) * (1 - rainK);
        at(x, y, (30 + fl.s * 40 + Math.sin(time * 0.6 + fl.p) * 10) * S);
        const fg = ctx.createRadialGradient(x, y, 0, x, y, 16 * S);
        fg.addColorStop(0, `rgba(230,255,150,${0.55 * a})`);
        fg.addColorStop(0.25, `rgba(190,240,110,${0.22 * a})`);
        fg.addColorStop(1, "rgba(190,240,110,0)");
        ctx.fillStyle = fg;
        ctx.fillRect(x - 16 * S, y - 16 * S, 32 * S, 32 * S);
      }
      ctx.globalCompositeOperation = "source-over";
      flat();
    }

    // a soft vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${0.35 + pal.dim * 0.3})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- UI ----------
  function syncUi() {
    const T = TIMES[opts.time];
    $("pond-rain-lbl").textContent = opts.rain ? "Rain on" : "Rain off";
    $("pond-rain").setAttribute("aria-pressed", opts.rain);
    $("pond-time-ico").textContent = T.ico;
    $("pond-time-lbl").textContent = T.name;
    $("pond-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("pond-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("pond-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("pond-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("pond-feed").addEventListener("click", () => { Z.ensureAudio(); startLoops(); sprinkle(); });
  $("pond-rain").addEventListener("click", () => {
    opts.rain = !opts.rain;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    startLoops();
  });
  $("pond-time").addEventListener("click", () => {
    opts.time = (opts.time + 1) % TIMES.length;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    Z.bell(Z.noteFreq(9 - opts.time * 2), 0.03, W / 2, 2.6);
  });
  $("pond-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("pond-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

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
    fitCamera();
    makeBottom();
    // keep everything where it was, proportionally
    const kx = W / oldW, ky = H / oldH;
    for (const f of fish) for (const s of [f, ...f.segs]) { s.x *= kx; s.y *= ky; }
    for (const p of [...pads, ...food, ...petals]) { p.x *= kx; p.y *= ky; }
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
    window.__pond = { pose, P, SEG, fish, food, pads, ripples, petals, opts, update, render, dropFood, sprinkle, ptr, proj, toPond, rayAt, FLOOR, CAM, fishH, seen, get call() { return call; }, set call(v) { call = v; } };
  }

  resize();
  seedOnce();
  syncUi();
  requestAnimationFrame(frame);
})();
