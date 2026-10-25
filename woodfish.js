// Wooden fish: a muyu on a silk cushion in a candlelit temple. Tap to strike it, hold to keep a
// steady chant, tap the singing bowl to ring it. Every strike earns a little merit, and it's counted.
// Shares game.js's audio engine and sound/music settings through window.Zen.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp, lerp } = Z;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("woodfish");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1;

  const KEY = "drift-woodfish-v1";
  const WORDS = ["Merit", "功德", "Peace", "Calm", "Wisdom", "Luck"];
  const opts = { count: 0, auto: false, bpm: 72, words: 0 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.count = Math.max(0, Math.floor(+opts.count || 0));
  opts.auto = !!opts.auto;
  opts.bpm = clamp(Math.round(+opts.bpm || 72), 40, 160);
  opts.words = clamp(opts.words | 0, 0, WORDS.length - 1);
  let saveTimer = 0;
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };
  const here = () => document.body.dataset.place === "woodfish";

  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const GOLD = [255, 204, 120];

  // ---------- Layout ----------
  // everything is placed around the fish: centre (cx, cy), radius R
  let cx = 0, cy = 0, R = 100, tableY = 0;
  let bowl = { x: 0, y: 0, r: 30 }, burner = { x: 0, y: 0 }, candles = [];
  let grain = [];

  function layout() {
    R = clamp(Math.min(W * 0.2, H * 0.19), 64, 180);
    cx = W / 2;
    cy = H * 0.53;
    tableY = cy + R * 0.98;
    const spread = Math.min(W * 0.5 - R * 0.35, R * 3.2);
    candles = [-1, 1].map((side) => ({ x: cx + side * spread, y: tableY + R * 0.06, h: R * 0.58, w: R * 0.17, p: rand(0, TAU) }));
    bowl = { x: cx - Math.max(R * 1.55, spread * 0.55), y: tableY + R * 0.04, r: R * 0.36 };
    burner = { x: cx + Math.max(R * 1.55, spread * 0.55), y: tableY + R * 0.05 };
    grain = Array.from({ length: 9 }, (_, i) => ({ y: tableY + R * (0.06 + i * 0.045), a: rand(0, TAU), k: rand(0.004, 0.012), amp: rand(1, 4) }));
  }

  // ---------- State ----------
  let time = 0;
  let squash = 0, squashV = 0, glow = 0, bowlGlow = 0, countPop = 0;
  const mallet = { ang: 0, t: 1, from: 0 }; // t: 0..1 through a swing
  const words = []; // floating "+1" text
  const motes = [];
  const rings = [];
  const smoke = [[], [], []];
  let smokeTimer = 0;

  // the mallet pivots at the hand and its head lands on the top of the fish
  function malletGeom() {
    const px = cx + R * 1.95, py = cy - R * 0.15, headR = R * 0.17;
    const th = -1.3, sx = cx + R * Math.cos(th), sy = cy + R * 0.82 * Math.sin(th);
    const hx = sx + Math.cos(th) * headR, hy = sy + Math.sin(th) * headR;
    const contact = Math.atan2(hy - py, hx - px);
    return { px, py, headR, len: Math.hypot(hx - px, hy - py), contact, rest: contact + 0.3 };
  }

  // ---------- Audio ----------
  const audio = () => (Z.audioOk() ? Z.ac : null);
  const panOf = (x) => clamp((x / W) * 2 - 1, -0.9, 0.9);

  // the hollow tok of the wooden fish: a click, a few body resonances and the ring of its cavity
  function tok(vel = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(cx) * 0.3), f0 = 540 * rand(0.985, 1.015);
    for (const [mult, v, decay] of [[1, 1, 0.17], [2.31, 0.32, 0.07], [0.52, 0.55, 0.12], [3.9, 0.08, 0.035]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(f0 * mult * 1.03, t);
      o.frequency.exponentialRampToValueAtTime(f0 * mult, t + 0.02);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11 * v * vel, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
    const n = Z.noise(), cav = ac.createBiquadFilter(), click = ac.createBiquadFilter(), cg = ac.createGain(), kg = ac.createGain();
    cav.type = "bandpass";
    cav.frequency.value = f0 * 1.01;
    cav.Q.value = 14;
    cg.gain.setValueAtTime(0.5 * vel, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    click.type = "bandpass";
    click.frequency.value = 2600;
    click.Q.value = 0.9;
    kg.gain.setValueAtTime(0.09 * vel, t);
    kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
    n.connect(cav).connect(cg).connect(out);
    n.connect(click).connect(kg).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 0.25);
  }

  // a singing bowl: inharmonic partials, each a slightly detuned pair so the tone slowly beats
  function bowlRing(vol = 1) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(panOf(bowl.x));
    for (const [mult, v, decay] of [[1, 1, 10], [2.76, 0.45, 7], [5.4, 0.2, 4.5], [8.93, 0.07, 2.6]]) {
      for (const det of [-0.45, 0.45]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 196 * mult + det * mult;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03 * v * vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    }
    const n = Z.noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    g.gain.setValueAtTime(0.05 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp).connect(g).connect(out);
    n.start(t, rand(0, 1.9));
    n.stop(t + 0.05);
  }

  // a great temple bell somewhere far off
  function templeBell() {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime, out = Z.output(rand(-0.5, 0.5));
    for (const [mult, v, decay] of [[1, 1, 12], [2.02, 0.5, 8], [2.92, 0.3, 6], [4.1, 0.15, 3.5]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 98 * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025 * v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  let room = null; // the hush of a quiet hall
  function startRoom() {
    const ac = audio();
    if (room || !ac) return;
    const n = Z.noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    g.gain.value = 0;
    n.connect(lp).connect(g).connect(Z.output(0));
    n.start();
    room = g;
  }

  // ---------- Actions ----------
  function strike(vel = 1) {
    Z.ensureAudio();
    startRoom();
    tok(vel);
    const m = malletGeom();
    mallet.from = mallet.ang || m.rest;
    mallet.t = 0;
    squashV += 3.2 * vel;
    glow = Math.min(1, glow + 0.8 * vel);
    countPop = 1;
    opts.count++;
    saveTimer = 0.8;
    const top = { x: cx + R * 0.2, y: cy - R * 0.95 };
    words.push({ x: top.x + rand(-R * 0.35, R * 0.35), y: top.y, age: 0, text: `${WORDS[opts.words]} +1` });
    if (words.length > 24) words.shift();
    rings.push({ age: 0 });
    for (let i = 0; i < 7; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      motes.push({ x: top.x + rand(-R * 0.2, R * 0.2), y: top.y + R * 0.15, vx: Math.cos(a) * rand(20, 70), vy: Math.sin(a) * rand(30, 90), age: 0, life: rand(0.8, 1.6) });
    }
    // the knock stirs the incense smoke
    for (const s of smoke) for (const p of s) p.vx += rand(-6, 6) * (R / 100);
    if (navigator.vibrate && vel >= 0.95 && navigator.userActivation?.hasBeenActive !== false) { try { navigator.vibrate(6); } catch (_) { /* unsupported */ } }
    noteInteraction();
  }

  function ringBowl() {
    Z.ensureAudio();
    startRoom();
    bowlRing();
    bowlGlow = 1;
    noteInteraction();
  }

  let interactions = 0;
  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("woodfish-title").classList.add("fade");
  }

  // ---------- Input ----------
  const ptr = { down: false, id: null, st: 0, held: false, beat: 0 };
  const onBowl = (x, y) => Math.hypot(x - bowl.x, (y - (bowl.y - bowl.r * 0.35)) * 1.4) < bowl.r * 1.15;

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    canvas.setPointerCapture?.(e.pointerId);
    if (onBowl(e.clientX, e.clientY)) { ringBowl(); return; }
    Object.assign(ptr, { down: true, id: e.pointerId, st: time, held: false, beat: 0 });
    strike(1);
  });
  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    ptr.down = false;
    ptr.held = false;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "BUTTON" || e.target.tagName === "INPUT" || !here() || e.repeat) return;
    e.preventDefault();
    strike(1);
  });

  // ---------- Simulation ----------
  let autoBeat = 0, autoCount = 0, bellTimer = rand(40, 80);
  function update(dt) {
    time += dt;
    const beat = 60 / opts.bpm;

    // holding down keeps a steady chant at the tempo
    if (ptr.down) {
      if (!ptr.held && time - ptr.st > 0.45) { ptr.held = true; ptr.beat = beat; }
      if (ptr.held && (ptr.beat -= dt) <= 0) { ptr.beat += beat; strike(0.9); }
    }
    if (opts.auto && !ptr.held) {
      autoBeat -= dt;
      if (autoBeat <= 0) {
        autoBeat = beat * rand(0.985, 1.015); // a human hand, not a metronome
        strike(0.85);
        if (++autoCount % 64 === 0) setTimeout(ringBowl, beat * 500);
      }
    }

    if ((bellTimer -= dt) <= 0) { bellTimer = rand(45, 100); templeBell(); }
    if (room) room.gain.setTargetAtTime(here() ? 0.018 : 0, Z.ac.currentTime, 0.4);
    if (saveTimer > 0 && (saveTimer -= dt) <= 0) saveOpts();

    squashV += (-squash * 380 - squashV * 13) * dt;
    squash += squashV * dt;
    glow = Math.max(0, glow - dt * 2.2);
    bowlGlow = Math.max(0, bowlGlow - dt * 0.35);
    countPop = Math.max(0, countPop - dt * 4);

    // mallet: snap down in 60ms, then lift back over 0.4s
    const m = malletGeom();
    if (mallet.t < 1) {
      mallet.t = Math.min(1, mallet.t + dt / 0.46);
      const k = mallet.t;
      if (k < 0.13) mallet.ang = lerp(mallet.from, m.contact, k / 0.13);
      else { const u = (k - 0.13) / 0.87; mallet.ang = lerp(m.contact, m.rest, 1 - Math.pow(1 - u, 3)); }
    } else mallet.ang = m.rest + Math.sin(time * 1.1) * 0.025; // resting in a relaxed hand

    for (const w of words) { w.age += dt; w.y -= (40 + 30 * (1 - w.age)) * (R / 100) * dt; }
    while (words.length && words[0].age > 1.6) words.shift();
    for (const r of rings) r.age += dt;
    while (rings.length && rings[0].age > 1.2) rings.shift();
    for (const p of motes) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 40 * dt; p.vx *= 1 - dt; }
    for (let i = motes.length - 1; i >= 0; i--) if (motes[i].age > motes[i].life) motes.splice(i, 1);

    // incense smoke: rises from each stick and curls in the still air
    smokeTimer -= dt;
    const sticks = incenseTips();
    if (smokeTimer <= 0) {
      smokeTimer = 0.06;
      sticks.forEach((tip, i) => smoke[i].push({ x: tip.x, y: tip.y, vx: 0, age: 0, p: rand(0, TAU) }));
    }
    const s = R / 100;
    for (const trail of smoke) {
      for (const p of trail) {
        p.age += dt;
        p.y -= (18 + p.age * 4) * s * dt;
        // thin and straight at first, then curling wider as it climbs
        p.x += (Math.sin(p.y / (38 * s) + time * 0.9) * (2 + p.age * 5) * s + p.vx) * dt;
        p.vx *= 1 - 0.8 * dt;
      }
      while (trail.length && trail[0].age > 7) trail.shift();
    }
  }

  function incenseTips() {
    const s = R / 100;
    return [-1, 0, 1].map((k) => ({ x: burner.x + k * 9 * s + k * 4 * s, y: burner.y - R * 0.95 + Math.abs(k) * 6 * s }));
  }

  // ---------- Render ----------
  function render() {
    const flicker = 0.85 + 0.1 * Math.sin(time * 7.3) + 0.05 * Math.sin(time * 13.1 + 1);

    // the hall: warm dark, a pool of candlelight around the altar
    const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.hypot(W, H) * 0.7);
    bg.addColorStop(0, "#3a1d12");
    bg.addColorStop(0.45, "#1d0e09");
    bg.addColorStop(1, "#080403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // wall panels
    ctx.strokeStyle = "rgba(255,200,150,0.035)";
    ctx.lineWidth = 1;
    const step = Math.max(60, R * 0.9);
    for (let x = (cx % step) - step; x < W + step; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tableY); ctx.stroke();
    }
    // a hanging scroll behind the altar
    drawScroll();

    // altar table
    const tg = ctx.createLinearGradient(0, tableY, 0, H);
    tg.addColorStop(0, "#5a2e17");
    tg.addColorStop(0.08, "#3d1e0f");
    tg.addColorStop(1, "#140905");
    ctx.fillStyle = tg;
    ctx.fillRect(0, tableY, W, H - tableY);
    ctx.strokeStyle = "rgba(255,190,130,0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, tableY + 0.5); ctx.lineTo(W, tableY + 0.5); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    for (const g of grain) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) { const y = g.y + Math.sin(x * g.k + g.a) * g.amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }

    // candlelight warms everything near it
    ctx.globalCompositeOperation = "lighter";
    for (const c of candles) {
      const f = flicker + 0.06 * Math.sin(time * 9 + c.p);
      const fy = c.y - c.h - R * 0.1;
      const lg = ctx.createRadialGradient(c.x, fy, 0, c.x, fy, R * 2.4);
      lg.addColorStop(0, `rgba(255,160,70,${0.2 * f})`);
      lg.addColorStop(1, "rgba(255,160,70,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(c.x - R * 2.4, fy - R * 2.4, R * 4.8, R * 4.8);
    }
    if (glow > 0.01) {
      const gg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2);
      gg.addColorStop(0, `rgba(255,190,110,${0.22 * glow})`);
      gg.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    }
    ctx.globalCompositeOperation = "source-over";

    for (const c of candles) drawCandle(c, flicker);
    drawBowl();
    drawBurner();
    drawSmoke();
    drawCushion();
    drawFish();
    drawRings();
    drawMallet();
    drawMotes();
    drawWords();
    drawCount();

    // vignette
    const v = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.4, cx, cy, Math.hypot(W, H) * 0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawScroll() {
    // it hangs on the wall above the singing bowl
    const w = Math.min(R * 0.9, Math.abs(cx - bowl.x) * 0.9), bottom = tableY - R * 0.95, h = Math.min(R * 1.9, bottom - 70);
    const x = bowl.x - w / 2, y = bottom - h, mid = bowl.x;
    if (h < R * 0.7 || w < 30) return;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(x + 6, y + 8, w, h);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#5a4632");
    g.addColorStop(0.5, "#6e5840");
    g.addColorStop(1, "#5a4632");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(225,205,165,0.55)";
    ctx.fillRect(x + w * 0.12, y + h * 0.06, w * 0.76, h * 0.88);
    // an ensō: one brushed circle, open where the brush lifted
    ctx.strokeStyle = "rgba(30,20,14,0.7)";
    ctx.lineCap = "round";
    const er = Math.min(w * 0.28, h * 0.22), ex = mid, ey = y + h * 0.42;
    for (let k = 0; k < 3; k++) {
      ctx.lineWidth = er * (0.2 - k * 0.05);
      ctx.beginPath();
      ctx.arc(ex + k * 0.6, ey, er - k * 0.8, -1.2 + k * 0.05, TAU - 1.65 - k * 0.1);
      ctx.stroke();
    }
    // rods
    ctx.fillStyle = "#2a1a10";
    ctx.fillRect(x - w * 0.06, y - 4, w * 1.12, 7);
    ctx.fillRect(x - w * 0.04, y + h - 3, w * 1.08, 7);
  }

  function drawCandle(c, flicker) {
    const top = c.y - c.h;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(c.x + c.w * 0.4, c.y + 2, c.w * 1.2, c.w * 0.25, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(c.x - c.w / 2, 0, c.x + c.w / 2, 0);
    g.addColorStop(0, "#c9a07a");
    g.addColorStop(0.35, "#fbe7c8");
    g.addColorStop(1, "#a07a58");
    ctx.fillStyle = g;
    ctx.fillRect(c.x - c.w / 2, top, c.w, c.h);
    ctx.fillStyle = "#e9cfa8";
    ctx.beginPath(); ctx.ellipse(c.x, top, c.w / 2, c.w * 0.15, 0, 0, TAU); ctx.fill();
    // wick and flame
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(c.x, top); ctx.lineTo(c.x, top - c.w * 0.3); ctx.stroke();
    const f = flicker + 0.08 * Math.sin(time * 11 + c.p), fh = c.w * 1.5 * f, sway = Math.sin(time * 3 + c.p) * c.w * 0.08;
    const fx = c.x, fy = top - c.w * 0.25;
    const fg = ctx.createRadialGradient(fx, fy - fh * 0.3, 0, fx, fy - fh * 0.3, fh);
    fg.addColorStop(0, "rgba(255,255,230,1)");
    fg.addColorStop(0.35, "rgba(255,200,90,0.95)");
    fg.addColorStop(1, "rgba(255,120,30,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(fx - c.w * 0.22, fy);
    ctx.quadraticCurveTo(fx - c.w * 0.3, fy - fh * 0.5, fx + sway, fy - fh);
    ctx.quadraticCurveTo(fx + c.w * 0.3, fy - fh * 0.5, fx + c.w * 0.22, fy);
    ctx.quadraticCurveTo(fx, fy + c.w * 0.18, fx - c.w * 0.22, fy);
    ctx.fill();
  }

  function drawBowl() {
    const { x, y, r } = bowl;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + 2, r * 1.15, r * 0.22, 0, 0, TAU); ctx.fill();
    // a small cushion ring under it
    ctx.fillStyle = "#6b1d1d";
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.05, r * 0.85, r * 0.2, 0, 0, TAU); ctx.fill();
    const body = ctx.createLinearGradient(x - r, 0, x + r, 0);
    body.addColorStop(0, "#5b3c18");
    body.addColorStop(0.3, "#c79a52");
    body.addColorStop(0.55, "#8d6229");
    body.addColorStop(1, "#3e2810");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.7);
    ctx.bezierCurveTo(x - r, y - r * 0.05, x - r * 0.55, y + r * 0.05, x, y + r * 0.05);
    ctx.bezierCurveTo(x + r * 0.55, y + r * 0.05, x + r, y - r * 0.05, x + r, y - r * 0.7);
    ctx.closePath();
    ctx.fill();
    // the open mouth
    ctx.fillStyle = "#2a1a0a";
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.7, r, r * 0.22, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,220,150,${0.55 + bowlGlow * 0.45})`;
    ctx.lineWidth = Math.max(1.2, r * 0.05);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.7, r, r * 0.22, 0, 0, TAU); ctx.stroke();
    // while it sings, rings of light shimmer off the rim
    if (bowlGlow > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 3; k++) {
        const ph = (time * 0.6 + k / 3) % 1;
        ctx.strokeStyle = `rgba(255,214,140,${0.35 * bowlGlow * (1 - ph)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(x, y - r * 0.7, r * (1 + ph * 0.9), r * 0.22 * (1 + ph * 0.9), 0, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }

  function drawBurner() {
    const s = R / 100, x = burner.x, y = burner.y, r = R * 0.3;
    for (const tip of incenseTips()) {
      ctx.strokeStyle = "#7a3b1e";
      ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(x + (tip.x - x) * 0.4, y - r * 0.55); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      const pulse = 0.7 + 0.3 * Math.sin(time * 2 + tip.x);
      ctx.fillStyle = `rgba(255,110,40,${pulse})`;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.2 * s, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 9 * s);
      gg.addColorStop(0, `rgba(255,120,50,${0.5 * pulse})`);
      gg.addColorStop(1, "rgba(255,120,50,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(tip.x - 9 * s, tip.y - 9 * s, 18 * s, 18 * s);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x + r * 0.2, y + 2, r * 1.1, r * 0.22, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, "#2e2a1e");
    g.addColorStop(0.35, "#7d6c46");
    g.addColorStop(1, "#1f1c14");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.55);
    ctx.quadraticCurveTo(x - r * 1.05, y, x - r * 0.5, y);
    ctx.lineTo(x + r * 0.5, y);
    ctx.quadraticCurveTo(x + r * 1.05, y, x + r, y - r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#4a3f2a";
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r, r * 0.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#9a8a6a";
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.55, r * 0.82, r * 0.14, 0, 0, TAU); ctx.fill(); // ash
  }

  function drawSmoke() {
    const s = R / 100;
    ctx.lineCap = "round";
    for (const trail of smoke) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], k = b.age / 7;
        ctx.strokeStyle = `rgba(230,225,215,${0.16 * (1 - k) * Math.min(1, b.age * 2)})`;
        ctx.lineWidth = (1.2 + b.age * 2.4) * s;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
  }

  function drawCushion() {
    const y = cy + R * 0.8, rx = R * 1.18, ry = R * 0.32;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.ellipse(cx + R * 0.1, tableY + 2, rx * 1.02, ry * 0.5, 0, 0, TAU); ctx.fill();
    // a plump silk cushion: side then top
    ctx.fillStyle = "#5e1212";
    ctx.beginPath(); ctx.ellipse(cx, y + ry * 0.45, rx, ry, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(cx - rx * 0.3, y - ry * 0.4, 0, cx, y, rx);
    g.addColorStop(0, "#c8383a");
    g.addColorStop(0.6, "#8e1d1f");
    g.addColorStop(1, "#5a1010");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(240,190,90,0.7)";
    ctx.lineWidth = Math.max(1.2, R * 0.025);
    ctx.beginPath(); ctx.ellipse(cx, y, rx * 0.9, ry * 0.8, 0, 0, TAU); ctx.stroke();
    // tassels at the corners
    for (const side of [-1, 1]) {
      const tx = cx + side * rx * 0.98, ty = y + ry * 0.4;
      ctx.strokeStyle = "rgba(240,190,90,0.85)";
      ctx.lineWidth = Math.max(1, R * 0.018);
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + k * R * 0.012 + side * R * 0.02, ty + R * 0.16); ctx.stroke(); }
      ctx.fillStyle = "#e8b85a";
      ctx.beginPath(); ctx.arc(tx, ty, R * 0.03, 0, TAU); ctx.fill();
    }
  }

  function drawFish() {
    const sq = clamp(squash, -0.2, 0.2);
    ctx.save();
    ctx.translate(cx, cy + R * 0.7);
    ctx.scale(1 + sq * 0.6, 1 - sq);
    ctx.translate(0, -R * 0.7);
    const rx = R, ry = R * 0.82;

    // body: deep red-brown lacquer over wood
    const body = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.05, 0, 0, R * 1.05);
    body.addColorStop(0, "#d56a3a");
    body.addColorStop(0.35, "#9c3417");
    body.addColorStop(0.8, "#561808");
    body.addColorStop(1, "#2c0b03");
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();

    // carved scales across the back
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = "rgba(255,190,110,0.16)";
    ctx.lineWidth = Math.max(1, R * 0.018);
    const sc = R * 0.2;
    for (let row = 0; row < 4; row++) {
      const yy = -ry * 0.75 + row * sc * 0.75;
      for (let xx = -rx + (row % 2) * sc * 0.5; xx < rx; xx += sc) {
        ctx.beginPath(); ctx.arc(xx, yy, sc * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
    }
    ctx.restore();

    // the mouth: a long smiling slit that curls into a round hole at each end
    const my = R * 0.18, mw = R * 0.72;
    const slit = () => {
      ctx.beginPath();
      ctx.moveTo(-mw, my);
      ctx.quadraticCurveTo(0, my + R * 0.34, mw, my);
    };
    ctx.lineCap = "round";
    slit();
    ctx.strokeStyle = "rgba(255,170,110,0.22)"; // lit lower lip
    ctx.lineWidth = R * 0.12;
    ctx.save(); ctx.translate(0, R * 0.03); ctx.stroke(); ctx.restore();
    slit();
    ctx.strokeStyle = "#140402";
    ctx.lineWidth = R * 0.08;
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#140402";
      ctx.beginPath(); ctx.arc(side * mw, my, R * 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(240,180,90,0.55)";
      ctx.lineWidth = Math.max(1, R * 0.02);
      ctx.beginPath(); ctx.arc(side * mw, my, R * 0.14, 0, TAU); ctx.stroke();
    }
    // gilded bands framing the mouth
    ctx.strokeStyle = "rgba(240,185,95,0.6)";
    ctx.lineWidth = Math.max(1, R * 0.022);
    ctx.beginPath(); ctx.moveTo(-mw * 0.82, my - R * 0.12); ctx.quadraticCurveTo(0, my + R * 0.16, mw * 0.82, my - R * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-mw * 0.7, my + R * 0.24); ctx.quadraticCurveTo(0, my + R * 0.52, mw * 0.7, my + R * 0.24); ctx.stroke();

    // carved handle on top: two fish curling into an arch
    const hy = -ry * 0.92;
    ctx.strokeStyle = "#7a2510";
    ctx.lineWidth = R * 0.13;
    ctx.beginPath(); ctx.moveTo(-R * 0.3, hy + R * 0.06); ctx.bezierCurveTo(-R * 0.28, hy - R * 0.32, R * 0.28, hy - R * 0.32, R * 0.3, hy + R * 0.06); ctx.stroke();
    ctx.strokeStyle = "rgba(255,170,100,0.35)";
    ctx.lineWidth = R * 0.04;
    ctx.beginPath(); ctx.moveTo(-R * 0.26, hy - R * 0.02); ctx.bezierCurveTo(-R * 0.24, hy - R * 0.3, R * 0.2, hy - R * 0.32, R * 0.24, hy - R * 0.08); ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#140402";
      ctx.beginPath(); ctx.arc(side * R * 0.19, hy - R * 0.14, R * 0.025, 0, TAU); ctx.fill(); // the little fish eyes
    }

    // lacquer shine: a soft window reflection and a sharp glint
    ctx.save();
    ctx.translate(-R * 0.42, -R * 0.42);
    ctx.rotate(-0.6);
    const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
    sh.addColorStop(0, `rgba(255,235,210,${0.42 + glow * 0.2})`);
    sh.addColorStop(1, "rgba(255,235,210,0)");
    ctx.fillStyle = sh;
    ctx.scale(1, 0.5);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,248,235,0.85)";
    ctx.beginPath(); ctx.arc(-R * 0.5, -R * 0.45, R * 0.035, 0, TAU); ctx.fill();
    // candle reflections along the rim
    ctx.strokeStyle = "rgba(255,190,120,0.25)";
    ctx.lineWidth = Math.max(1, R * 0.03);
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.95, ry * 0.95, 0, 0.15 * Math.PI, 0.45 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  function drawRings() {
    for (const r of rings) {
      const k = r.age / 1.2;
      ctx.strokeStyle = css(GOLD, 0.35 * (1 - k) * (1 - k));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, R * (1.05 + k * 0.9), R * 0.82 * (1.05 + k * 0.9), 0, 0, TAU); ctx.stroke();
    }
  }

  function drawMallet() {
    const m = malletGeom(), a = mallet.ang, ux = Math.cos(a), uy = Math.sin(a);
    const hx = m.px + ux * m.len, hy = m.py + uy * m.len, back = R * 0.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = R * 0.08;
    ctx.beginPath(); ctx.moveTo(m.px - ux * back + 6, m.py - uy * back + 10); ctx.lineTo(hx + 6, hy + 10); ctx.stroke();
    const sg = ctx.createLinearGradient(m.px - uy * R * 0.04, m.py + ux * R * 0.04, m.px + uy * R * 0.04, m.py - ux * R * 0.04);
    sg.addColorStop(0, "#4a2a12");
    sg.addColorStop(0.5, "#b37a44");
    sg.addColorStop(1, "#4a2a12");
    ctx.strokeStyle = sg;
    ctx.lineWidth = R * 0.075;
    ctx.beginPath(); ctx.moveTo(m.px - ux * back, m.py - uy * back); ctx.lineTo(hx, hy); ctx.stroke();
    // a red cord wrapped at the grip
    ctx.strokeStyle = "#a3201f";
    ctx.lineWidth = R * 0.085;
    ctx.beginPath(); ctx.moveTo(m.px - ux * back * 0.85, m.py - uy * back * 0.85); ctx.lineTo(m.px - ux * back * 0.45, m.py - uy * back * 0.45); ctx.stroke();
    const hg = ctx.createRadialGradient(hx - m.headR * 0.35, hy - m.headR * 0.35, m.headR * 0.1, hx, hy, m.headR);
    hg.addColorStop(0, "#e6b27a");
    hg.addColorStop(0.6, "#9c6232");
    hg.addColorStop(1, "#4a2a12");
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, m.headR, 0, TAU); ctx.fill();
  }

  function drawMotes() {
    ctx.globalCompositeOperation = "lighter";
    for (const p of motes) {
      const a = 1 - p.age / p.life;
      ctx.fillStyle = css(GOLD, 0.8 * a);
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.8 * (R / 100) * (0.5 + a), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawWords() {
    const size = Math.round(R * 0.17);
    ctx.font = `500 ${size}px ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const w of words) {
      const a = w.age < 0.15 ? w.age / 0.15 : Math.max(0, 1 - (w.age - 0.5) / 1.1);
      ctx.shadowColor = `rgba(255,170,80,${0.8 * a})`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(255,226,170,${a})`;
      ctx.fillText(w.text, w.x, w.y);
    }
    ctx.shadowBlur = 0;
  }

  function drawCount() {
    // gilt lettering on the front of the altar, clear of the title and the bar
    const y = Math.min(tableY + R * 0.62, H - 120), s = 1 + countPop * 0.08;
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(s, s);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,226,180,0.55)";
    ctx.font = `400 ${Math.round(R * 0.11)}px ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText(WORDS[opts.words].toLowerCase(), 0, -R * 0.16);
    ctx.fillStyle = "rgba(255,232,190,0.92)";
    ctx.shadowColor = "rgba(255,170,80,0.5)";
    ctx.shadowBlur = 12;
    ctx.font = `300 ${Math.round(R * 0.26)}px ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif`;
    ctx.fillText(opts.count.toLocaleString(), 0, R * 0.06);
    ctx.restore();
  }

  // ---------- UI ----------
  function syncUi() {
    $("woodfish-auto-lbl").textContent = opts.auto ? "Auto on" : "Auto off";
    $("woodfish-auto").setAttribute("aria-pressed", opts.auto);
    $("woodfish-tempo").value = opts.bpm;
    $("woodfish-bpm").textContent = `${opts.bpm} bpm`;
    $("woodfish-tempo-wrap").classList.toggle("off", !opts.auto);
    $("woodfish-words-lbl").textContent = WORDS[opts.words];
    $("woodfish-sound-ico").textContent = Z.settings.sound ? "♪" : "–";
    $("woodfish-sound-lbl").textContent = Z.settings.sound ? "Sound on" : "Sound off";
    $("woodfish-music-lbl").textContent = Z.settings.music ? "Music on" : "Music off";
    $("woodfish-music").setAttribute("aria-pressed", Z.settings.music);
  }
  window.addEventListener("zen-settings", syncUi);
  $("woodfish-auto").addEventListener("click", () => {
    opts.auto = !opts.auto;
    autoBeat = 0.25;
    saveOpts();
    syncUi();
    Z.ensureAudio();
  });
  $("woodfish-tempo").addEventListener("input", (e) => {
    opts.bpm = clamp(Math.round(+e.target.value), 40, 160);
    autoBeat = Math.min(autoBeat, 60 / opts.bpm);
    saveOpts();
    syncUi();
  });
  $("woodfish-words").addEventListener("click", () => {
    opts.words = (opts.words + 1) % WORDS.length;
    saveOpts();
    syncUi();
  });
  $("woodfish-bowl").addEventListener("click", ringBowl);
  $("woodfish-music").addEventListener("click", () => Z.setMusic(!Z.settings.music));
  $("woodfish-sound").addEventListener("click", () => Z.setSound(!Z.settings.sound));
  window.addEventListener("pagehide", saveOpts);

  // ---------- Loop ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth); // a hidden frame can report 0 until its first resize
    H = Math.max(1, window.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    for (const s of smoke) s.length = 0;
  }
  window.addEventListener("resize", resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else if (room && Z.ac) room.gain.setTargetAtTime(0, Z.ac.currentTime, 0.4);
    requestAnimationFrame(frame);
  }

  if (new URLSearchParams(location.search).has("debug")) {
    window.__woodfish = { opts, update, render, strike, ringBowl, words, mallet, get count() { return opts.count; } };
  }

  resize();
  syncUi();
  requestAnimationFrame(frame);
})();
