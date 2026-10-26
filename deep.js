// Deep: the dark open ocean, where glowing jellyfish drift and pulse. Each bell squeezes to push
// itself along, then glides; its tentacles flow behind it. Light shafts fall from far above and
// sea snow sinks through the water. Tap to scatter glowing plankton, tap a jellyfish to make it
// flash and dart, drag to stir a current, hold to call them toward a soft light.
// Shares game.js's audio engine through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("deep");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1, U = 1;

  const KEY = "drift-deep-v1";
  const GLOWS = [
    { name: "Aurora", cols: [[110, 240, 255], [170, 140, 255], [120, 255, 210], [255, 150, 230]], water: [[6, 34, 58], [2, 8, 20]] },
    { name: "Ember", cols: [[255, 170, 110], [255, 120, 150], [255, 210, 140], [240, 120, 90]], water: [[30, 18, 44], [8, 4, 14]] },
    { name: "Moon", cols: [[200, 220, 255], [160, 190, 255], [230, 236, 255], [150, 230, 255]], water: [[16, 26, 52], [3, 6, 16]] },
  ];
  const opts = { glow: 0 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.glow = clamp(opts.glow | 0, 0, GLOWS.length - 1);
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "deep";

  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const pal = () => GLOWS[opts.glow];

  // a soft glow sprite, tinted per colour on demand
  const spriteCache = new Map();
  function sprite(c) {
    const key = c.map((v) => v | 0).join(",");
    let s = spriteCache.get(key);
    if (!s) {
      s = document.createElement("canvas");
      s.width = s.height = 64;
      const x = s.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, css(c, 1));
      g.addColorStop(0.3, css(c, 0.45));
      g.addColorStop(1, css(c, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      spriteCache.set(key, s);
    }
    return s;
  }

  // ---------- Creatures and particles ----------
  const jellies = [];
  const plankton = [];
  const bubbles = [];
  const snow = [];
  const rays = Array.from({ length: 6 }, () => ({ x: Math.random(), w: rand(0.05, 0.14), tilt: rand(-0.18, 0.18), p: rand(0, TAU), s: rand(0.05, 0.12) }));
  const SEGS = 15;
  const MAX_JELLIES = 16;
  const MAX_TILT = 0.75; // how far a jellyfish leans from upright (about 43 degrees)
  let time = 0;

  function makeJelly(x, y, z = rand(0.3, 1)) {
    const R = rand(24, 44) * (0.5 + z * 0.6) * U;
    const nT = 8 + ((Math.random() * 5) | 0);
    const ang = -Math.PI / 2 + rand(-0.35, 0.35);
    const chain = (len) => Array.from({ length: SEGS }, (_, i) => ({ x, y: y + (i * len) / (SEGS - 1), px: x, py: y + (i * len) / (SEGS - 1) }));
    const tents = Array.from({ length: nT }, (_, k) => {
      const len = R * rand(2.4, 4.6);
      return { u: -0.92 + (1.84 * k) / (nT - 1), len, pts: chain(len), p: rand(0, TAU) };
    });
    const arms = Array.from({ length: 4 }, (_, k) => {
      const len = R * rand(1.4, 2.4);
      return { u: -0.3 + k * 0.2, len, pts: chain(len), p: rand(0, TAU) };
    });
    const j = {
      x, y, z, R, ang, vx: 0, vy: 0, phase: Math.random(), period: rand(2.2, 3.8), col: (Math.random() * 4) | 0,
      glow: 0, wander: rand(0, TAU), tents, arms, squeeze: 0, born: time,
    };
    jellies.push(j);
    jellies.sort((a, b) => a.z - b.z); // far ones first
    return j;
  }

  function addJelly() {
    if (jellies.length >= MAX_JELLIES) { sparkle(W / 2, 0.4); return false; }
    // a newcomer rises into view from the deep
    const j = makeJelly(rand(W * 0.15, W * 0.85), H + 60 * U, rand(0.4, 1));
    j.vy = -rand(40, 70) * U;
    j.ang = -Math.PI / 2;
    arrive(j.x);
    return true;
  }

  function releaseBubbles(x = rand(W * 0.2, W * 0.8)) {
    for (let i = 0; i < 18; i++) {
      setTimeout(() => {
        bubbles.push({ x: x + rand(-30, 30) * U, y: H + rand(0, 40) * U, r: rand(2, 7) * U, vy: -rand(50, 110) * U, p: rand(0, TAU), age: 0 });
      }, i * rand(40, 120));
    }
  }

  // tapping open water scatters a cloud of glowing plankton
  function scatter(x, y) {
    const c = pal().cols;
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU), sp = rand(20, 150) * U;
      plankton.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rand(2.5, 5), size: rand(1.5, 4) * U, col: c[(Math.random() * c.length) | 0], p: rand(0, TAU) });
    }
    sparkle(x, 1);
  }

  // tapping a jellyfish: it flashes and pulses hard away from your finger
  function startle(j, x, y) {
    j.glow = 1;
    let dx = j.x - x, dy = j.y - y;
    const d = Math.hypot(dx, dy) || 1;
    j.vx += (dx / d) * 140 * U * j.z;
    j.vy += (dy / d) * 140 * U * j.z;
    j.phase = 0; // squeeze right away
    bloom(j.x, j.z);
  }

  function jellyAt(x, y) {
    for (let i = jellies.length - 1; i >= 0; i--) {
      const j = jellies[i];
      if (Math.hypot(x - j.x, y - j.y) < j.R * 1.25 + 10 * U) return j;
    }
    return null;
  }

  // ---------- Audio ----------
  const audio = () => (Z.audioOk() ? Z.ac : null);
  const panOf = (x) => clamp((x / W) * 2 - 1, -1, 1);
  let loops = null, lastPulse = 0;

  function sparkle(x, k) {
    if (!audio()) return;
    const base = 10 + ((Math.random() * 4) | 0);
    for (let i = 0; i < 4; i++) setTimeout(() => Z.bell(Z.noteFreq(base + i * 2 - ((Math.random() * 2) | 0)), 0.022 * k, x, 2.2), i * rand(50, 110));
  }
  // a jellyfish lighting up: a soft rising tone and a low bell
  function bloom(x, k) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.04 * k, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g).connect(Z.output(panOf(x)));
    o.start(t);
    o.stop(t + 1.5);
    Z.bell(Z.noteFreq(5 + ((Math.random() * 4) | 0)), 0.03 * k, x, 3);
  }
  // a newcomer rising from the deep: the water swells as it parts, a slow breathy glide upward,
  // a trail of bubbles, then a soft two-note chime as it reaches the light
  function arrive(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(x) * 0.7);
    const n = Z.noise(), lp = ac.createBiquadFilter(), ng = ac.createGain();
    lp.type = "lowpass";
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 1.1);
    lp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.07, t + 0.7);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    n.connect(lp).connect(ng).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 2.5);
    // two voices gliding up a fifth, drifting slightly apart
    const f0 = Z.noteFreq(2);
    for (const det of [-5, 5]) {
      const o = ac.createOscillator(), g = ac.createGain(), vib = ac.createOscillator(), va = ac.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 1.3);
      o.detune.value = det;
      vib.frequency.value = 4.2;
      va.gain.value = 6;
      vib.connect(va).connect(o.detune);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
      o.connect(g).connect(out);
      o.start(t);
      vib.start(t);
      o.stop(t + 2.05);
      vib.stop(t + 2.05);
    }
    for (let i = 0; i < 5; i++) setTimeout(() => here() && bubbleSound(x + rand(-20, 20) * U), 250 + i * rand(90, 180));
    setTimeout(() => {
      if (!here()) return;
      const b = 7 + ((Math.random() * 3) | 0);
      Z.bell(Z.noteFreq(b), 0.026, x, 3.4);
      setTimeout(() => here() && Z.bell(Z.noteFreq(b + 2), 0.02, x, 3.6), 170);
    }, 1100);
  }
  // the gentle push of a nearby bell squeezing
  function pulseSound(j) {
    const ac = audio();
    if (!ac || time - lastPulse < 0.35 || j.z < 0.6) return;
    lastPulse = time;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.25);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018 * j.z, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(Z.output(panOf(j.x) * 0.6));
    o.start(t);
    o.stop(t + 0.45);
  }
  function bubbleSound(x) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), f = rand(500, 900);
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.06);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.02, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(Z.output(panOf(x)));
    o.start(t);
    o.stop(t + 0.1);
  }
  // somewhere far off, a whale
  function whale() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), vib = ac.createOscillator(), va = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
    const f0 = rand(150, 210);
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * rand(1.5, 1.9), t + 1.6);
    o.frequency.linearRampToValueAtTime(f0 * rand(1.1, 1.3), t + 3.2);
    o.frequency.linearRampToValueAtTime(f0 * 0.9, t + 4.4);
    vib.frequency.value = 5.5;
    va.gain.value = f0 * 0.012;
    vib.connect(va).connect(o.frequency);
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.8);
    g.gain.setValueAtTime(0.035, t + 3.4);
    g.gain.linearRampToValueAtTime(0, t + 4.6);
    o.connect(lp).connect(g).connect(Z.output(rand(-0.6, 0.6)));
    o.start(t);
    vib.start(t);
    o.stop(t + 4.7);
    vib.stop(t + 4.7);
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
      deep: layer([["lowpass", 170]]), // the weight of all that water
      murmur: layer([["bandpass", 700, 0.5]]),
      current: layer([["bandpass", 500, 0.9]]),
    };
  }
  function updateLoops(stir) {
    if (!loops || !Z.ac) return;
    const t = Z.ac.currentTime, on = here() && Z.settings.sound;
    loops.deep.g.gain.setTargetAtTime(on ? 0.075 * (0.8 + 0.2 * Math.sin(time * 0.13)) : 0, t, 0.8);
    loops.murmur.g.gain.setTargetAtTime(on ? 0.006 : 0, t, 0.8);
    loops.current.g.gain.setTargetAtTime(on ? clamp(stir / 2500, 0, 1) * 0.06 : 0, t, 0.12);
    loops.current.f.frequency.setTargetAtTime(380 + clamp(stir, 0, 3000) * 0.35, t, 0.15);
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, lx: 0, ly: 0, st: 0, moved: false, holding: false, speed: 0 };
  let interactions = 0;
  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("deep-title").classList.add("fade");
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    Z.ensureAudio();
    startLoops();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false, holding: false });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down || e.pointerId !== ptr.id) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 10) ptr.moved = true;
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    if (!ptr.moved && !ptr.holding && time - ptr.st < 0.35) tapAt(ptr.x, ptr.y);
    ptr.down = false;
    ptr.holding = false;
    noteInteraction();
  }
  function tapAt(x, y) {
    const j = jellyAt(x, y);
    if (j) startle(j, x, y);
    else scatter(x, y);
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "BUTTON" || !here()) return;
    e.preventDefault();
    Z.ensureAudio();
    startLoops();
    releaseBubbles();
  });

  // ---------- Simulation ----------
  let whaleT = rand(20, 40), bubbleT = rand(6, 14);

  // the water's own slow drift, plus whatever current your finger is making
  function flow(x, y, cvx, cvy) {
    let fx = Math.sin(y * 0.004 + time * 0.15) * 6 * U, fy = Math.cos(x * 0.003 + time * 0.11) * 3 * U;
    if (ptr.down && ptr.moved) {
      const d = Math.hypot(x - ptr.x, y - ptr.y), reach = 170 * U;
      if (d < reach) { const k = (1 - d / reach) ** 2; fx += cvx * k; fy += cvy * k; }
    }
    return [fx, fy];
  }

  function update(dt) {
    time += dt;
    const cvx = ptr.down ? clamp((ptr.x - ptr.lx) / dt, -2500, 2500) : 0, cvy = ptr.down ? clamp((ptr.y - ptr.ly) / dt, -2500, 2500) : 0;
    ptr.speed = lerp(ptr.speed, ptr.down && ptr.moved ? Math.hypot(cvx, cvy) : 0, Math.min(1, dt * 8));
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;
    if (ptr.down && !ptr.moved && time - ptr.st > 0.35) ptr.holding = true;
    const lure = ptr.holding ? { x: ptr.x, y: ptr.y } : null;

    for (const j of jellies) {
      // pulse: a quick squeeze pushes the bell forward, then it glides and slowly sinks
      const before = j.phase;
      j.phase = (j.phase + dt / j.period) % 1;
      if (j.phase < before) pulseSound(j);
      j.squeeze = j.phase < 0.28 ? Math.sin((j.phase / 0.28) * Math.PI) : 0;
      const ux = Math.cos(j.ang), uy = Math.sin(j.ang);
      // jellyfish stay bell-up: they steer by tilting, and to go down they stop pulsing and sink
      const m = j.R * 2;
      let rel = Math.sin(time * 0.09 + j.wander) * 0.5; // tilt from straight up (positive leans right)
      let effort = 1; // how hard it pulses
      if (j.x < m) rel = 0.6;
      else if (j.x > W - m) rel = -0.6;
      if (j.y < m * 1.5) effort = 0.08; // at the surface it rests and drifts back down
      else if (j.y < m * 3) effort = 0.5;
      if (j.y > H - m) effort = 1.4;
      if (lure) {
        const dx = lure.x - j.x, dy = lure.y - j.y;
        rel = Math.atan2(dx, -dy); // the light's direction, measured from straight up
        if (dy > j.R) effort = Math.min(effort, 0.15); // the light is below: relax and sink toward it
        else effort *= 1.25;
        j.vx += Math.sign(dx) * Math.min(1, Math.abs(dx) / (200 * U)) * 14 * U * dt;
      }
      rel = clamp(rel, -MAX_TILT, MAX_TILT);
      const thrust = 95 * U * (0.5 + j.z * 0.6) * effort;
      j.vx += ux * thrust * j.squeeze * dt;
      j.vy += uy * thrust * j.squeeze * dt;
      j.vy += (7 + (1 - Math.min(1, effort)) * 7) * U * dt; // a gentle sink between pulses, more when resting
      const [fx, fy] = flow(j.x, j.y, cvx * 0.5, cvy * 0.5);
      j.vx += (fx - j.vx * 0.15) * dt * 2;
      j.vy += (fy * 0.5) * dt * 2;
      j.vx *= 1 - dt * 0.7;
      j.vy *= 1 - dt * 0.7;
      j.x += j.vx * dt;
      j.y += j.vy * dt;

      // turn gently toward the chosen lean
      const want = -Math.PI / 2 + rel;
      j.ang += Math.atan2(Math.sin(want - j.ang), Math.cos(want - j.ang)) * dt * (lure ? 0.9 : 0.35);
      // never tip past a steep lean, whatever pushed it
      const lean = Math.atan2(Math.sin(j.ang + Math.PI / 2), Math.cos(j.ang + Math.PI / 2));
      j.ang = -Math.PI / 2 + clamp(lean, -MAX_TILT - 0.15, MAX_TILT + 0.15);
      // drifted far off-screen (or just arrived from below): ease back into view
      if (j.y > H + j.R * 6) j.vy -= 60 * U * dt;
      if (j.x < -j.R * 4) j.vx += 40 * U * dt;
      if (j.x > W + j.R * 4) j.vx -= 40 * U * dt;
      j.glow = Math.max(0, j.glow - dt * 0.6);

      // tentacles and oral arms: verlet chains hanging from the rim, trailing as the bell moves
      const rx = -uy, ry = ux, wScale = 1 - 0.2 * j.squeeze;
      for (const group of [j.tents, j.arms]) {
        for (const t of group) {
          const ax = j.x + rx * t.u * j.R * 0.9 * wScale - ux * j.R * 0.05, ay = j.y + ry * t.u * j.R * 0.9 * wScale - uy * j.R * 0.05;
          const pts = t.pts, seg = t.len / (SEGS - 1);
          pts[0].x = ax; pts[0].y = ay; pts[0].px = ax; pts[0].py = ay;
          for (let i = 1; i < SEGS; i++) {
            const p = pts[i];
            const [gx, gy] = flow(p.x, p.y, cvx, cvy);
            const sway = Math.sin(time * 1.6 + i * 0.45 + t.p) * 0.12 * U;
            const vx = (p.x - p.px) * 0.94 + (gx * 0.02 + rx * sway) * dt * 60 * 0.2;
            const vy = (p.y - p.py) * 0.94 + (gy * 0.02 + 14 * U * dt) * dt * 60 * 0.2;
            p.px = p.x; p.py = p.y;
            p.x += vx; p.y += vy;
          }
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 1; i < SEGS; i++) {
              const a = pts[i - 1], b = pts[i];
              const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (d - seg) / d;
              if (i === 1) { b.x -= dx * k; b.y -= dy * k; }
              else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; }
            }
          }
        }
      }
    }

    // plankton: drift, slow, and draw toward a held light
    for (const p of plankton) {
      p.age += dt;
      const [fx, fy] = flow(p.x, p.y, cvx, cvy);
      p.vx += (fx - p.vx) * dt * 1.2;
      p.vy += (fy - p.vy) * dt * 1.2;
      if (lure) { const dx = lure.x - p.x, dy = lure.y - p.y, d = Math.hypot(dx, dy) || 1; p.vx += (dx / d) * 60 * U * dt; p.vy += (dy / d) * 60 * U * dt; p.age = Math.min(p.age, p.life * 0.5); }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = plankton.length - 1; i >= 0; i--) if (plankton[i].age > plankton[i].life) plankton.splice(i, 1);
    if (plankton.length > 900) plankton.splice(0, plankton.length - 900);
    // a held light gathers a little glowing cloud of its own
    if (lure && Math.random() < dt * 14) {
      const c = pal().cols, a = rand(0, TAU), r = rand(60, 160) * U;
      plankton.push({ x: lure.x + Math.cos(a) * r, y: lure.y + Math.sin(a) * r, vx: 0, vy: 0, age: 0, life: rand(2, 4), size: rand(1.2, 3) * U, col: c[(Math.random() * c.length) | 0], p: rand(0, TAU) });
    }

    // bubbles wobble up and pop at the top
    for (const b of bubbles) {
      b.age += dt;
      b.vy -= 20 * U * dt;
      const [fx] = flow(b.x, b.y, cvx, cvy);
      b.x += (fx + Math.sin(b.age * 6 + b.p) * 18 * U) * dt;
      b.y += b.vy * dt;
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].y < -10) { if (Math.random() < 0.4) bubbleSound(bubbles[i].x); bubbles.splice(i, 1); }
    }

    // sea snow sinks slowly; nearer flakes move faster
    for (const s of snow) {
      const [fx, fy] = flow(s.x, s.y, cvx * 0.6, cvy * 0.6);
      s.x += (fx * 0.6 + Math.sin(time * 0.5 + s.p) * 4 * U) * s.z * dt;
      s.y += (8 + 10 * s.z) * U * dt + fy * 0.3 * s.z * dt;
      if (s.y > H + 4) { s.y = -4; s.x = rand(0, W); }
      if (s.x < -4) s.x = W + 4;
      if (s.x > W + 4) s.x = -4;
    }

    // now and then: a stream of bubbles from somewhere below, a whale far away
    if ((bubbleT -= dt) <= 0) { bubbleT = rand(10, 22); releaseBubbles(); }
    if ((whaleT -= dt) <= 0) { whaleT = rand(35, 80); if (here()) { whale(); if (Math.random() < 0.6) setTimeout(whale, rand(2500, 4500)); } }

    if (Z.ac) updateLoops(ptr.speed);
  }

  // ---------- Render ----------
  function render() {
    const P = pal(), [top, bottom] = P.water;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(mix(top, [70, 130, 160], 0.25)));
    g.addColorStop(0.35, css(top));
    g.addColorStop(1, css(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // light shafts falling from the surface far above, swaying slowly
    ctx.globalCompositeOperation = "lighter";
    for (const r of rays) {
      const x = (r.x + Math.sin(time * r.s + r.p) * 0.05) * W, w = r.w * W, a = 0.045 * (0.6 + 0.4 * Math.sin(time * r.s * 2 + r.p));
      const rg = ctx.createLinearGradient(0, 0, 0, H * 0.85);
      rg.addColorStop(0, `rgba(170,220,255,${a})`);
      rg.addColorStop(1, "rgba(170,220,255,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, 0);
      ctx.lineTo(x + w * 0.3, 0);
      ctx.lineTo(x + w + r.tilt * H, H * 0.85);
      ctx.lineTo(x - w + r.tilt * H, H * 0.85);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    drawSnow(0, 0.55);
    for (const j of jellies) drawJelly(j);
    drawSnow(0.55, 1.01);

    // plankton and bubbles
    ctx.globalCompositeOperation = "lighter";
    for (const p of plankton) {
      const k = p.age / p.life, a = Math.min(1, p.age * 4) * (1 - k) * (0.6 + 0.4 * Math.sin(time * 6 + p.p));
      if (a < 0.02) continue;
      const s = p.size * 3;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite(p.col), p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    if (ptr.holding) {
      const lg = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 90 * U);
      lg.addColorStop(0, "rgba(220,240,255,0.22)");
      lg.addColorStop(1, "rgba(220,240,255,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(ptr.x - 90 * U, ptr.y - 90 * U, 180 * U, 180 * U);
    }
    ctx.globalCompositeOperation = "source-over";
    for (const b of bubbles) {
      ctx.strokeStyle = "rgba(210,236,255,0.45)";
      ctx.lineWidth = Math.max(0.8, b.r * 0.18);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, TAU); ctx.fill();
    }

    // the deep closes in at the edges
    const v = ctx.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.hypot(W, H) * 0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,2,8,0.6)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawSnow(z0, z1) {
    ctx.fillStyle = "rgba(200,220,235,0.5)";
    for (const s of snow) {
      if (s.z < z0 || s.z >= z1) continue;
      ctx.globalAlpha = 0.15 + s.z * 0.45;
      const r = (0.5 + s.z * 1.3) * U;
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawJelly(j) {
    const P = pal(), base = P.cols[j.col % P.cols.length];
    // far jellies sink into the blue: dimmer and tinted toward the water
    const depth = 0.35 + j.z * 0.65, col = mix(base, P.water[0], (1 - j.z) * 0.45), lit = 1 + j.glow * 1.4;
    const ux = Math.cos(j.ang), uy = Math.sin(j.ang), rx = -uy, ry = ux;
    const wS = 1 - 0.2 * j.squeeze, hS = 1 + 0.18 * j.squeeze; // squeezes narrow and tall to push, relaxes wide
    const R = j.R, w = R * wS, h = R * 0.82 * hS;
    const L = (lx, ly) => [j.x + rx * lx + ux * ly, j.y + ry * lx + uy * ly];

    ctx.globalCompositeOperation = "lighter";
    // halo
    ctx.globalAlpha = clamp(0.16 * depth * lit, 0, 1);
    const hs = R * 2.6;
    ctx.drawImage(sprite(col), j.x + ux * h * 0.3 - hs, j.y + uy * h * 0.3 - hs, hs * 2, hs * 2);
    ctx.globalAlpha = 1;

    // tentacles: fine glowing threads, fading toward their tips
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const t of j.tents) {
      const pts = t.pts;
      for (let band = 0; band < 3; band++) {
        const i0 = Math.floor((band * (SEGS - 1)) / 3), i1 = Math.floor(((band + 1) * (SEGS - 1)) / 3);
        ctx.strokeStyle = css(col, (0.42 - band * 0.13) * depth * lit);
        ctx.lineWidth = Math.max(0.6, (1.3 - band * 0.3) * U * (0.5 + j.z * 0.6));
        ctx.beginPath();
        ctx.moveTo(pts[i0].x, pts[i0].y);
        for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    // oral arms: frilly ribbons under the bell
    for (const a of j.arms) {
      const pts = a.pts;
      ctx.strokeStyle = css(mix(col, [255, 255, 255], 0.2), 0.2 * depth * lit);
      ctx.lineWidth = Math.max(1, R * 0.16);
      ctx.beginPath();
      for (let i = 0; i < SEGS; i++) {
        const wob = Math.sin(time * 2.2 + i * 0.9 + a.p) * R * 0.07 * (i / SEGS);
        const x = pts[i].x + rx * wob, y = pts[i].y + ry * wob;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }

    // the bell: a see-through dome with a scalloped rim
    ctx.beginPath();
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = Math.PI - (i / N) * Math.PI; // left rim, over the top, to the right rim
      const [x, y] = L(Math.cos(t) * w, Math.sin(t) * h);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    // the rim curls in, in little scallops
    const sc = 8;
    for (let i = 0; i <= sc; i++) {
      const lx = w - (2 * w * i) / sc;
      const [x, y] = L(lx, -R * (i % 2 ? 0.1 : 0.03));
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    const [cx, cy] = L(-w * 0.15, h * 0.55);
    const bg = ctx.createRadialGradient(cx, cy, R * 0.05, j.x, j.y, R * 1.1);
    bg.addColorStop(0, css(mix(col, [255, 255, 255], 0.35), 0.38 * depth * lit));
    bg.addColorStop(0.55, css(col, 0.14 * depth * lit));
    bg.addColorStop(1, css(col, 0.3 * depth * lit));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = css(mix(col, [255, 255, 255], 0.25), 0.5 * depth * lit);
    ctx.lineWidth = Math.max(0.8, 1.3 * U * (0.5 + j.z * 0.6));
    ctx.stroke();

    // inside: four soft petals near the crown
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + time * 0.2, [px, py] = L(Math.cos(a) * w * 0.28, h * 0.5 + Math.sin(a) * h * 0.12);
      ctx.fillStyle = css(mix(col, [255, 255, 255], 0.5), 0.16 * depth * lit);
      ctx.beginPath();
      ctx.ellipse(px, py, R * 0.13, R * 0.07, j.ang + a, 0, TAU);
      ctx.fill();
    }
    // a glossy highlight across the dome
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * depth})`;
    ctx.lineWidth = Math.max(0.8, R * 0.06);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const t = Math.PI * (0.62 + i * 0.03);
      const [x, y] = L(Math.cos(t) * w * 0.82, Math.sin(t) * h * 0.82);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  // ---------- UI ----------
  function syncUi() {
    const P = pal();
    $("deep-glow-lbl").textContent = P.name;
    $("deep-glow-ico").style.background = `conic-gradient(${P.cols.map((c) => css(c)).join(",")},${css(P.cols[0])})`;
    $("deep-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("deep-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("deep-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("deep-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("deep-jelly").addEventListener("click", () => { Z.ensureAudio(); startLoops(); addJelly(); });
  $("deep-bubbles").addEventListener("click", () => { Z.ensureAudio(); startLoops(); releaseBubbles(); });
  $("deep-glow").addEventListener("click", () => { opts.glow = (opts.glow + 1) % GLOWS.length; saveOpts(); syncUi(); Z.ensureAudio(); sparkle(W / 2, 0.6); });
  $("deep-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("deep-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));

  // ---------- Loop ----------
  function resize() {
    const oldW = W || window.innerWidth, oldH = H || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    U = clamp(Math.min(W, H) / 800, 0.55, 1.4);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const kx = W / oldW, ky = H / oldH;
    for (const j of jellies) {
      j.x *= kx; j.y *= ky;
      for (const t of [...j.tents, ...j.arms]) for (const p of t.pts) { p.x *= kx; p.y *= ky; p.px *= kx; p.py *= ky; }
    }
    for (const s of snow) { s.x *= kx; s.y *= ky; }
  }
  window.addEventListener("resize", resize);

  function seed() {
    const n = clamp(Math.round((W * H) / 90000), 6, 10);
    for (let i = 0; i < n; i++) makeJelly(rand(W * 0.12, W * 0.88), rand(H * 0.2, H * 0.85));
    for (let i = 0; i < 160; i++) snow.push({ x: rand(0, W), y: rand(0, H), z: Math.random(), p: rand(0, TAU) });
    // let the tentacles settle into a natural hang before anyone sees them
    for (let i = 0; i < 120; i++) update(1 / 60);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else if (loops && Z.ac) updateLoops(0);
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has("debug")) {
    window.__deep = { jellies, plankton, bubbles, opts, update, render, addJelly, tapAt, releaseBubbles, ptr };
  }

  resize();
  seed();
  syncUi();
  requestAnimationFrame(frame);
})();
