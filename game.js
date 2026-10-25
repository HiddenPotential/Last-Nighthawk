(() => {
  "use strict";

  // ---------- Setup ----------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let W = 0, H = 0, DPR = 1;
  let shelfY = 0; // floor used in Fall mode, just above the control bar

  const TAU = Math.PI * 2;
  const SETTINGS_KEY = "drift-settings-v1";

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  const THEMES = [
    { name: "Aurora", bg: ["#101640", "#03040c"], orbs: ["#7cf5d2", "#6aa8ff", "#b28dff", "#ff8ad8", "#8affb0"], swatch: "conic-gradient(#7cf5d2,#6aa8ff,#b28dff,#ff8ad8,#7cf5d2)" },
    { name: "Sunset", bg: ["#33122f", "#0a0410"], orbs: ["#ff9a76", "#ffcf6e", "#ff6f91", "#c86bfa", "#ffd6a5"], swatch: "conic-gradient(#ff9a76,#ffcf6e,#ff6f91,#c86bfa,#ff9a76)" },
    { name: "Ocean", bg: ["#07324a", "#010a12"], orbs: ["#4cc9f0", "#4895ef", "#56cfe1", "#72efdd", "#a9def9"], swatch: "conic-gradient(#4cc9f0,#4895ef,#72efdd,#a9def9,#4cc9f0)" },
    { name: "Candy", bg: ["#2a1c45", "#0a0612"], orbs: ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff"], swatch: "conic-gradient(#ffadad,#fdffb6,#9bf6ff,#bdb2ff,#ffadad)" },
    { name: "Pearl", bg: ["#1d1d26", "#050507"], orbs: ["#f4f4f8", "#d2d4de", "#a9abb8", "#ece4d6"], swatch: "conic-gradient(#f4f4f8,#a9abb8,#ece4d6,#f4f4f8)", film: 0.32 },
    { name: "Prism", bg: ["#16163a", "#04040c"], orbs: ["#ff5e7e", "#ffa95e", "#ffe45e", "#6bff9e", "#5ed4ff", "#7b8bff", "#d47bff"], swatch: "conic-gradient(#ff5e7e,#ffe45e,#6bff9e,#5ed4ff,#d47bff,#ff5e7e)", film: 0.22 },
    { name: "Neon", bg: ["#220b40", "#05010d"], orbs: ["#ff2fd1", "#2fffe1", "#fffb2f", "#8a3bff", "#2f8bff", "#ff6a3d"], swatch: "conic-gradient(#ff2fd1,#fffb2f,#2fffe1,#8a3bff,#ff2fd1)", film: 0.16 },
    { name: "Forest", bg: ["#0d2c20", "#020a06"], orbs: ["#9be564", "#d7f75b", "#4fd1a1", "#f4c95d", "#7fb069", "#b5e48c"], swatch: "conic-gradient(#9be564,#d7f75b,#f4c95d,#4fd1a1,#9be564)", film: 0.1 },
    { name: "Galaxy", bg: ["#1c0b42", "#030010"], orbs: ["#ff7ad9", "#8c7bff", "#4de1ff", "#ffd36e", "#c2f0ff", "#b388ff"], swatch: "conic-gradient(#ff7ad9,#8c7bff,#4de1ff,#ffd36e,#ff7ad9)", film: 0.2 },
  ];
  const MODES = [
    { id: "float", label: "Float", ico: "◌" },
    { id: "fall", label: "Fall", ico: "↓" },
    { id: "swirl", label: "Swirl", ico: "◎" },
    { id: "shapes", label: "Shapes", ico: "✧" },
  ];

  const settings = { theme: 0, mode: 0, sound: true, size: 1, auto: false, autoSpeed: 0.35, music: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  settings.theme = clamp(settings.theme | 0, 0, THEMES.length - 1);
  settings.mode = clamp(settings.mode | 0, 0, MODES.length - 1);
  settings.size = clamp(+settings.size || 1, 0.5, 2);
  settings.auto = !!settings.auto;
  settings.music = settings.music !== false;
  settings.track = ["lofi", "dream", "space", "rain", "musicbox", "waves", "jazz"].includes(settings.track) ? settings.track : "lofi";
  settings.autoSpeed = clamp(settings.autoSpeed ?? 0.35, 0, 1);
  const here = () => (document.body.dataset.place || "orbs") === "orbs";
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ } };

  // ---------- Color ----------
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const theme = () => THEMES[settings.theme];
  const bg = { a: rgb(theme().bg[0]), b: rgb(theme().bg[1]) };

  // ---------- Audio ----------
  // Soft bell voices through a generated reverb, panned by position.
  const PENTA = [0, 2, 4, 7, 9];
  const noteFreq = (i) => 130.81 * Math.pow(2, (Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5]) / 12);
  const noteFor = (r) => Math.round(clamp(lerp(15, 1, (r - 10) / 55), 0, 16));

  let ac = null, master = null, verb = null, pad = null;
  let voiceBudget = 0;

  function ensureAudio() {
    if (!settings.sound) return;
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        comp.connect(ac.destination);
        master = ac.createGain();
        master.gain.value = 0.9;
        master.connect(comp);
        verb = ac.createConvolver();
        verb.buffer = impulse(3.2);
        const wet = ac.createGain();
        wet.gain.value = 0.45;
        verb.connect(wet).connect(master);
      }
      if (ac.state === "suspended") ac.resume();
      master.gain.setTargetAtTime(0.9, ac.currentTime, 0.1);
      startPad();
      startLoops();
      startMusic();
    } catch (_) { ac = null; }
  }

  function impulse(sec) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    return buf;
  }

  function output(pan) {
    const g = ac.createGain();
    let node = g;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan || 0, -0.9, 0.9); // NaN when the room hasn't been sized yet
      g.connect(p);
      node = p;
    }
    node.connect(master);
    node.connect(verb);
    return g;
  }

  function bell(freq, vol, x, decay = 1.6) {
    if (!ac || !settings.sound || voiceBudget > 12 || vol < 0.004) return;
    voiceBudget += 1;
    const t = ac.currentTime;
    const out = output((x / W) * 2 - 1);
    // fundamental + glassy partials
    for (const [mult, v, dk, type] of [[1, 1, 1, "sine"], [2.01, 0.22, 0.55, "sine"], [3.98, 0.06, 0.3, "triangle"]]) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * dk);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay * dk + 0.05);
    }
  }

  function bloop(r, x, up = false, pitch = 1) {
    if (!ac || !settings.sound || voiceBudget > 14) return;
    voiceBudget += 1;
    const t = ac.currentTime;
    const out = output((x / W) * 2 - 1);
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f0 = clamp(900 * (22 / r), 180, 1400) * pitch;
    o.type = "sine";
    o.frequency.setValueAtTime(up ? f0 * 0.45 : f0, t);
    o.frequency.exponentialRampToValueAtTime(up ? f0 : f0 * 0.32, t + 0.13);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(up ? 0.09 : 0.16, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.25);
    if (!up) {
      // tiny wet click
      const n = ac.createBufferSource();
      const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.03), ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.4;
      const ng = ac.createGain();
      ng.gain.value = 0.07;
      n.connect(bp).connect(ng).connect(out);
      n.start(t);
    }
  }

  function startPad() {
    if (pad || !ac) return;
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.028, t + 4);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    lp.connect(g);
    g.connect(master);
    g.connect(verb);
    const oscs = [65.41, 98.0, 130.81 * 1.003, 164.81].map((f, i) => {
      const o = ac.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = rand(-6, 6);
      o.connect(lp);
      o.start();
      return o;
    });
    pad = { g, oscs, lfo };
  }

  // --- extra sound effects ---
  const audioOk = () => ac && settings.sound;
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const n = ac.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    return n;
  }

  // airy swoosh when an orb is flung
  function whoosh(speed, x) {
    if (!audioOk() || voiceBudget > 14) return;
    voiceBudget += 1;
    const t = ac.currentTime, out = output((x / W) * 2 - 1);
    const n = noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(clamp(speed * 0.9, 900, 2600), t + 0.16);
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.45);
    const vol = clamp(speed / 2600, 0.15, 1) * 0.14;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.55);
  }

  // soft pluck when you pick an orb up
  function pluck(freq, x, vol = 0.06) {
    if (!audioOk() || voiceBudget > 14) return;
    voiceBudget += 1;
    const t = ac.currentTime, out = output((x / W) * 2 - 1);
    for (const [mult, v, dk, type] of [[1, 1, 0.22, "triangle"], [2, 0.4, 0.09, "sine"]]) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dk + 0.02);
    }
  }

  // rubbery pitch glide for resizing
  function glide(f0, f1, x, vol = 0.04, dur = 0.12) {
    if (!audioOk() || voiceBudget > 14) return;
    voiceBudget += 0.5;
    const t = ac.currentTime, out = output((x / W) * 2 - 1);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.08);
  }

  // distant water drip for ambience
  function plip(x) {
    if (!audioOk() || voiceBudget > 10) return;
    const t = ac.currentTime, out = output((x / W) * 2 - 1);
    const o = ac.createOscillator(), g = ac.createGain();
    const f = rand(1300, 2300);
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.06);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(rand(0.012, 0.028), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  // rising/falling run of bells
  function arpeggio(start, count, dir = 1, gap = 0.09, vol = 0.055) {
    for (let k = 0; k < count; k++) {
      setTimeout(() => bell(noteFreq(start + k * dir), vol, W * (0.25 + (0.5 * k) / Math.max(1, count - 1)), 2.4), k * gap * 1000);
    }
  }

  // low swell as a formation begins
  function swell() {
    if (!audioOk()) return;
    const t = ac.currentTime, out = output(0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(82, t);
    o.frequency.exponentialRampToValueAtTime(123, t + 1.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 2.3);
  }

  // muffled knock against the back of the room
  function thud(freq, vol, x) {
    if (!audioOk() || voiceBudget > 12 || vol < 0.004) return;
    voiceBudget += 1;
    const t = ac.currentTime, out = output((x / W) * 2 - 1);
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.35);
  }

  // continuous layers: a swish while stirring and a hum while holding a gravity well
  let stirLoop = null, humLoop = null;
  function startLoops() {
    if (stirLoop || !ac) return;
    const n = noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    bp.frequency.value = 600;
    g.gain.value = 0;
    n.connect(bp).connect(g);
    g.connect(master);
    g.connect(verb);
    n.start();
    stirLoop = { bp, g };

    const hg = ac.createGain();
    hg.gain.value = 0;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 110;
    o2.type = "triangle";
    o2.frequency.value = 165;
    o2.detune.value = 7;
    const o2g = ac.createGain();
    o2g.gain.value = 0.35;
    const n2 = noise(), lp = ac.createBiquadFilter(), ng = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    ng.gain.value = 0.5;
    o1.connect(hg);
    o2.connect(o2g).connect(hg);
    n2.connect(lp).connect(ng).connect(hg);
    hg.connect(master);
    hg.connect(verb);
    o1.start(); o2.start(); n2.start();
    humLoop = { hg, o1, o2, lp };
  }

  function updateLoops(stirSpeed, wellHeld) {
    if (!stirLoop) return;
    const t = ac.currentTime;
    const sv = settings.sound ? clamp(stirSpeed / 3000, 0, 1) * 0.1 : 0;
    stirLoop.g.gain.setTargetAtTime(sv, t, 0.08);
    stirLoop.bp.frequency.setTargetAtTime(380 + clamp(stirSpeed, 0, 3000) * 0.5, t, 0.1);
    const on = wellHeld >= 0 && settings.sound;
    const k = Math.max(0, wellHeld);
    humLoop.hg.gain.setTargetAtTime(on ? 0.045 + k * 0.03 : 0, t, on ? 0.25 : 0.35);
    humLoop.o1.frequency.setTargetAtTime(110 * (1 + k * 0.5), t, 0.3);
    humLoop.o2.frequency.setTargetAtTime(165 * (1 + k * 0.5), t, 0.3);
    humLoop.lp.frequency.setTargetAtTime(300 + k * 900, t, 0.3);
  }

  function setSound(on) {
    settings.sound = on;
    saveSettings();
    if (on) ensureAudio();
    else if (ac) master.gain.setTargetAtTime(0, ac.currentTime, 0.15);
    syncUi();
  }

  // ---------- Background music ----------
  // Seven generative pieces, all in C major / A minor so they always blend with the orb chimes.
  // Each one writes itself as it plays: chords cycle through a few progressions, melodies are short
  // motifs that repeat with small variations, and parts drop in and out across 8- and 16-bar sections.
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PENTA_MIDI = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]; // C major pentatonic, C4..C6
  // each chord is [bass, ...voicing] in MIDI note numbers
  const TRACKS = {
    lofi: {
      label: "Lo-fi", bpm: 74, chordBars: 1, swing: 0.58, level: 0.8, verb: 0.3, warmth: 4600,
      progs: [
        [[41, 52, 57, 60, 64], [40, 50, 55, 59, 62], [38, 53, 57, 60, 64], [36, 52, 55, 59, 62]], // Fmaj7 Em7 Dm9 Cmaj9
        [[45, 55, 59, 60, 64], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64], [36, 52, 55, 59, 64]], // Am9 Dm9 G13 Cmaj7
      ],
    },
    dream: {
      label: "Dream", bpm: 66, chordBars: 2, swing: 0.5, level: 0.75, verb: 0.75, warmth: 8000,
      progs: [
        [[36, 52, 55, 59, 62], [45, 55, 59, 60, 64], [41, 52, 55, 57, 64], [43, 50, 55, 57, 64]], // Cmaj9 Am9 Fmaj9 G6sus
        [[41, 52, 57, 60, 64], [43, 50, 55, 59, 64], [40, 50, 55, 59, 62], [45, 52, 55, 60, 64]], // Fmaj7 G6 Em7 Am7
      ],
    },
    space: {
      label: "Space", bpm: 52, chordBars: 2, swing: 0.5, level: 0.75, verb: 0.95, warmth: 6500,
      progs: [
        [[36, 55, 59, 62, 64], [41, 52, 57, 60, 67], [45, 52, 59, 60, 64], [43, 50, 55, 60, 62]], // Cmaj9 Fmaj7 Am(add9) Gsus
        [[45, 52, 57, 60, 64], [41, 53, 57, 60, 64], [36, 52, 55, 59, 62], [43, 50, 55, 59, 62]], // Am Fmaj7 Cmaj9 G
      ],
    },
    rain: {
      label: "Rain", bpm: 62, chordBars: 2, swing: 0.5, level: 0.85, verb: 0.6, warmth: 6000, density: 0.5, ambience: "rain",
      progs: [
        [[45, 52, 55, 60, 64], [41, 52, 57, 60, 64], [36, 52, 55, 59, 64], [43, 50, 55, 59, 64]], // Am7 Fmaj7 Cmaj7 G6
        [[38, 53, 57, 60, 64], [45, 52, 55, 60, 64], [40, 50, 55, 59, 62], [41, 52, 57, 60, 64]], // Dm7 Am7 Em7 Fmaj7
      ],
    },
    musicbox: {
      label: "Music box", bpm: 92, beats: 3, chordBars: 1, swing: 0.5, level: 0.75, verb: 0.55, warmth: 9000, density: 0.7,
      progs: [
        [[36, 52, 55, 60, 64], [43, 50, 55, 59, 62], [45, 52, 57, 60, 64], [41, 53, 57, 60, 65]], // C G Am F
        [[41, 53, 57, 60, 65], [36, 52, 55, 60, 64], [43, 50, 55, 59, 62], [36, 52, 55, 60, 67]], // F C G C
      ],
    },
    waves: {
      label: "Waves", bpm: 58, chordBars: 2, swing: 0.5, level: 0.85, verb: 0.65, warmth: 5500, density: 0.5, ambience: "waves",
      progs: [
        [[36, 52, 55, 60, 64], [41, 53, 57, 60, 64], [45, 52, 57, 60, 64], [43, 50, 55, 59, 62]], // C Fmaj7 Am G
        [[45, 52, 57, 60, 64], [43, 50, 55, 59, 62], [41, 52, 57, 60, 64], [36, 52, 55, 59, 62]], // Am G Fmaj7 Cmaj9
      ],
    },
    jazz: {
      label: "Night jazz", bpm: 84, chordBars: 1, swing: 0.66, level: 0.85, verb: 0.4, warmth: 5200, density: 0.55,
      progs: [
        [[38, 53, 57, 60, 64], [43, 53, 57, 59, 64], [36, 52, 55, 59, 62], [45, 55, 59, 60, 64]], // Dm9 G13 Cmaj9 Am9
        [[41, 52, 55, 57, 64], [40, 50, 55, 59, 62], [38, 53, 57, 60, 64], [43, 53, 57, 59, 64]], // Fmaj9 Em7 Dm9 G13
      ],
    },
  };
  const TRACK_ORDER = ["lofi", "dream", "space", "rain", "musicbox", "waves", "jazz"];
  const music = {
    track: null, out: null, duck: null, drums: null, echo: null, stoppers: [],
    step: 0, nextStep: 0, prog: 0, cycle: -1, motif: null, motifB: null, arp: 0, timer: 0,
  };

  function startMusic() {
    if (!ac) return;
    if (!music.timer) music.timer = setInterval(scheduleMusic, 100);
    if (settings.music && music.track !== settings.track) switchTrack(settings.track);
    duckDrone();
  }

  function duckDrone() {
    if (pad) pad.g.gain.setTargetAtTime(settings.music ? 0.008 : 0.028, ac.currentTime, 1.5);
  }

  // build a fresh signal chain for a piece and crossfade from the previous one
  function switchTrack(name) {
    const t = ac.currentTime;
    if (music.out) {
      const old = music.out, stop = music.stoppers;
      old.gain.cancelScheduledValues(t);
      old.gain.setTargetAtTime(0, t, 0.8);
      setTimeout(() => { for (const n of stop) try { n.stop(); } catch (_) { /* already stopped */ } try { old.disconnect(); } catch (_) { /* gone */ } }, 6000);
    }
    const tr = TRACKS[name];
    const out = ac.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(settings.music ? tr.level : 0, t + 3);
    out.connect(master);
    const send = ac.createGain();
    send.gain.value = tr.verb;
    out.connect(send).connect(verb);

    const warm = ac.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = tr.warmth;
    warm.Q.value = 0.5;
    const stoppers = [];
    let tail = warm;
    if (name === "lofi") {
      // tape wow: a tiny delay line whose length wobbles bends the pitch ever so slightly
      const wow = ac.createDelay(0.05), lfo = ac.createOscillator(), amt = ac.createGain();
      wow.delayTime.value = 0.012;
      lfo.frequency.value = 0.55;
      amt.gain.value = 0.0015;
      lfo.connect(amt).connect(wow.delayTime);
      lfo.start(t);
      stoppers.push(lfo);
      warm.connect(wow);
      tail = wow;
    }
    tail.connect(out);

    const mix = ac.createGain();
    mix.connect(warm);
    const duck = ac.createGain(); // tonal parts dip gently under each kick
    duck.connect(mix);
    const drums = ac.createGain();
    drums.connect(mix);
    const echo = ac.createDelay(2), fb = ac.createGain(), tone = ac.createBiquadFilter();
    echo.delayTime.value = (60 / tr.bpm) * 0.75; // dotted eighth
    fb.gain.value = 0.34;
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    echo.connect(tone).connect(fb).connect(echo);
    tone.connect(mix);
    if (name === "lofi") stoppers.push(crackle(mix));
    if (tr.ambience === "rain") stoppers.push(...rainBed(mix));
    if (tr.ambience === "waves") stoppers.push(...wavesBed(mix));

    Object.assign(music, { track: name, out, duck, drums, echo, stoppers, step: 0, nextStep: t + 0.3, cycle: -1, prog: 0, arp: 0 });
  }

  // vinyl crackle: sparse clicks over a whisper of hiss
  function crackle(dest) {
    const len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.012;
      if (Math.random() < 0.0003) d[i] += (Math.random() < 0.5 ? -1 : 1) * rand(0.2, 0.9);
    }
    const src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf;
    src.loop = true;
    hp.type = "highpass";
    hp.frequency.value = 1400;
    g.gain.value = 0.05;
    src.connect(hp).connect(g).connect(dest);
    src.start();
    return src;
  }

  function scheduleMusic() {
    if (!ac || !music.out) return;
    const now = ac.currentTime;
    if (!settings.music || !settings.sound || ac.state !== "running") { music.nextStep = now + 0.2; return; }
    const tr = TRACKS[music.track], sd = 60 / tr.bpm / 4, ahead = now + 1.2;
    while (music.nextStep < ahead) {
      const swing = music.step % 2 ? (tr.swing - 0.5) * 2 * sd : 0;
      playStep(tr, music.nextStep + swing, music.step, sd);
      music.step++;
      music.nextStep += sd;
    }
  }

  // a two-bar melody on the pentatonic scale, plus a slightly varied answer
  function makeMotif(density, len = 32) {
    const notes = new Map();
    let s = 0, deg = 3 + ((Math.random() * 3) | 0), last = null;
    while (s < len) {
      const dur = [2, 2, 3, 4, 4, 6, 8][(Math.random() * 7) | 0];
      if (Math.random() < density) {
        deg = clamp(deg + [-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0], 0, PENTA_MIDI.length - 1);
        last = { deg, dur: Math.min(dur, len - s) };
        notes.set(s, last);
      }
      s += dur;
    }
    if (last) last.deg = [2, 3, 5, 7][(Math.random() * 4) | 0]; // settle on E, G, C or E
    const answer = new Map();
    for (const [k, n] of notes) answer.set(k, { ...n, deg: Math.random() < 0.25 ? clamp(n.deg + (Math.random() < 0.5 ? -1 : 1), 0, PENTA_MIDI.length - 1) : n.deg });
    if (last) { const keys = [...answer.keys()]; answer.get(keys[keys.length - 1]).deg = 5; } // the answer comes home to C
    return [notes, answer];
  }

  function playStep(tr, t, step, sd) {
    const spb = (tr.beats || 4) * 4; // sixteenth steps per bar
    const s = step % spb, bar = Math.floor(step / spb), beat = sd * 4;
    const cycle = Math.floor(bar / (4 * tr.chordBars));
    if (cycle !== music.cycle) {
      music.cycle = cycle;
      if (cycle > 0 && Math.random() < 0.5) music.prog = (Math.random() * tr.progs.length) | 0;
      [music.motif, music.motifB] = makeMotif(tr.density || 0.62, spb * 2);
    }
    const ci = Math.floor(bar / tr.chordBars) % 4;
    const prog = tr.progs[music.prog];
    const pb = bar % 8;
    PLAYERS[music.track]({
      t, s, bar, beat, sd, spb, pb,
      chord: prog[ci],
      next: prog[(ci + 1) % 4],
      chordStart: s === 0 && bar % tr.chordBars === 0,
      chordLen: beat * (tr.beats || 4) * tr.chordBars,
      melody(bars) {
        if (!bars.includes(pb)) return null;
        const m = pb >= 4 ? music.motifB : music.motif;
        return m.get((pb % 2) * spb + s) || null;
      },
    });
  }

  const PLAYERS = {
    lofi({ t, s, bar, beat, sd, chord, chordStart, melody }) {
      const intro = bar < 2, breakdown = bar % 16 >= 14;
      if (chordStart) strum(chord.slice(1), t, 0.85, beat * 3.6);
      if (s === 10 && Math.random() < 0.4) strum(chord.slice(2), t, 0.45, beat * 1.4);
      if (!intro) {
        if (s === 0) bassNote(midi(chord[0]), t, beat * 1.8, 0.9);
        if (s === 10 && Math.random() < 0.7) bassNote(midi(chord[0] + (Math.random() < 0.5 ? 7 : 12)), t, beat * 1.1, 0.6);
        if (s === 14 && Math.random() < 0.3) bassNote(midi(chord[0] + 2), t, beat * 0.4, 0.45);
      }
      if (!intro && !breakdown) {
        if (s === 0 || s === 10 || (s === 7 && Math.random() < 0.3)) kick(t, s === 0 ? 1 : 0.75);
        if (s === 4 || s === 12) snare(t, 0.9);
        if (s % 2 === 0) hat(t, s % 4 === 0 ? 0.5 : 0.85);
        else if (Math.random() < 0.15) hat(t, 0.3);
      }
      const n = bar >= 2 && melody([2, 3, 6, 7]);
      if (n) softPluck(midi(PENTA_MIDI[n.deg] + 12), t, 0.75, n.dur * sd);
    },

    dream({ t, s, bar, chord, chordStart, chordLen, melody }) {
      if (chordStart) {
        padChord(chord.slice(1), t, chordLen + 0.8, 0.9, 1.8);
        bassNote(midi(chord[0]), t, chordLen, 0.6);
      }
      // kalimba arpeggio on eighths, rising then falling, skipping the odd note
      if (s % 2 === 0 && bar >= 1 && Math.random() < 0.88) {
        const tones = [...chord.slice(1).map((m) => m + 12), chord[2] + 24];
        const cycleLen = tones.length * 2 - 2;
        const i = music.arp++ % cycleLen, k = i < tones.length ? i : cycleLen - i;
        kalimba(midi(tones[k]), t, s % 8 === 0 ? 0.6 : 0.42, false);
      }
      const n = melody([4, 5, 6, 7]);
      if (n) kalimba(midi(PENTA_MIDI[n.deg] + 12), t, 0.85, true);
    },

    space({ t, s, beat, sd, chord, chordStart, chordLen, melody }) {
      if (chordStart) {
        padChord(chord.slice(1), t, chordLen + 1.5, 1, 3.5);
        bassNote(midi(chord[0] - 12), t, chordLen + 0.5, 0.75);
        chord.slice(2).forEach((m, k) => glassBell(midi(m + 24), t + beat * (2 + k * 0.5), 0.5));
      }
      if (s % 4 === 0 && Math.random() < 0.18) epiano(midi(PENTA_MIDI[(Math.random() * PENTA_MIDI.length) | 0]), t, 0.4, beat * 2, true);
      const n = melody([2, 3, 6, 7]);
      if (n) epiano(midi(PENTA_MIDI[n.deg] + 12), t, 0.7, n.dur * sd, true);
    },

    // soft piano: a rolled chord, a quiet broken-chord accompaniment, and a melody over the rain
    rain({ t, s, bar, sd, chord, chordStart, chordLen, melody }) {
      if (chordStart) {
        piano(midi(chord[0]), t, 0.55, chordLen);
        chord.slice(1).forEach((m, i) => piano(midi(m), t + 0.05 + i * 0.06, 0.38, chordLen * 0.9));
      }
      if (s % 2 === 0 && s !== 0 && Math.random() < 0.6) {
        const v = chord.slice(1);
        piano(midi(v[(s / 2 + bar) % v.length]), t, 0.22, sd * 6);
      }
      const n = melody([2, 3, 6, 7]);
      if (n) piano(midi(PENTA_MIDI[n.deg] + 12), t, 0.62, n.dur * sd + 0.4, true);
    },

    // a lullaby in 3/4: low note on one, a two-note "pah-pah", and a tinkling tune
    musicbox({ t, s, chord, melody }) {
      if (s === 0) musicBox(midi(chord[0] + 24), t, 0.6);
      if (s === 4 || s === 8) {
        musicBox(midi(chord[2] + 12), t, 0.32);
        musicBox(midi(chord[3] + 12), t + 0.012, 0.28);
      }
      const n = melody([0, 1, 2, 3, 4, 5, 6, 7]);
      if (n) musicBox(midi(PENTA_MIDI[n.deg] + 12), t, 0.7);
      if (s === 10 && Math.random() < 0.15) musicBox(midi(PENTA_MIDI[8 + ((Math.random() * 3) | 0)] + 12), t, 0.25);
    },

    // fingerpicked guitar and a breathy flute over the sea
    waves({ t, s, sd, chord, chordStart, chordLen, melody }) {
      if (chordStart) {
        padChord(chord.slice(1), t, chordLen + 1, 0.5, 2.5);
        bassNote(midi(chord[0]), t, chordLen, 0.5);
      }
      if (s % 2 === 0) {
        const tones = [chord[0] + 12, chord[2], chord[3], chord[4]];
        const pick = [0, 2, 1, 3, 0, 2, 1, 3][(s / 2) % 8];
        guitar(midi(tones[pick]), t + rand(0, 0.01), pick === 0 ? 0.6 : 0.45);
      }
      const n = melody([4, 5, 6, 7]);
      if (n) flute(midi(PENTA_MIDI[n.deg] + 12), t, n.dur * sd, 0.7);
    },

    // swing: brushes and ride, a walking bass, electric-piano comping and a vibraphone tune
    jazz({ t, s, bar, beat, sd, chord, next, chordStart, melody }) {
      // ride: ding, ding-da-ding (the swing shifts the "da" late)
      if (s === 0 || s === 4 || s === 8 || s === 12) ride(t, s % 8 === 4 ? 0.9 : 0.7);
      if ((s === 6 || s === 14) && Math.random() < 0.85) ride(t, 0.45);
      if (s === 4 || s === 12) brush(t, 0.8);
      if (s === 0 || s === 8) kick(t, 0.18);
      // walking bass: root, a chord tone, the fifth, then a half step into the next chord
      if (s % 4 === 0) {
        const root = chord[0], ivs = chord.slice(1).map((m) => (((m - root) % 12) + 12) % 12);
        const third = ivs.includes(3) ? 3 : ivs.includes(4) ? 4 : 2;
        const line = [root, root + third, root + 7, next[0] + (Math.random() < 0.5 ? -1 : 1)];
        let m = line[s / 4];
        while (m > 50) m -= 12;
        while (m < 33) m += 12;
        bassNote(midi(m), t, beat * 0.9, 0.85);
      }
      if ((s === 6 && Math.random() < 0.6) || (s === 14 && Math.random() < 0.35) || (chordStart && Math.random() < 0.3)) {
        strum(chord.slice(1), t, 0.55, beat * 0.7);
      }
      const n = bar >= 1 && melody([2, 3, 6, 7]);
      if (n) vibes(midi(PENTA_MIDI[n.deg] + 12), t, 0.7, true);
    },
  };

  // --- instruments ---
  // piano: a handful of partials, the higher ones dying away first
  function piano(f, t, vel, dur, echo = false) {
    const g = ac.createGain();
    route(g, echo);
    const len = clamp(3.2 - Math.log2(f / 130) * 0.6, 0.9, 3.5);
    for (const [mult, v] of [[1, 1], [2, 0.42], [3, 0.16], [4, 0.09], [5.02, 0.04]]) {
      const o = ac.createOscillator(), og = ac.createGain(), dk = len / mult ** 0.6;
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.045 * vel * v, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.018 * vel * v, t + 0.25);
      og.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dk, dur + 0.6));
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
  }

  // music box: a bright tine with quick metallic overtones
  function musicBox(f, t, vel) {
    const g = ac.createGain();
    route(g, true);
    for (const [mult, v, dk] of [[1, 1, 1.6], [3, 0.22, 0.5], [5.6, 0.1, 0.18]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.05 * vel * v, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
  }

  // vibraphone: soft bars with a slow tremolo
  function vibes(f, t, vel, echo) {
    const g = ac.createGain(), trem = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
    trem.gain.value = 0.75;
    lfo.frequency.value = 5;
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(trem.gain);
    g.connect(trem);
    route(trem, echo);
    for (const [mult, v, dk] of [[1, 1, 2.2], [4, 0.16, 0.45]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.05 * vel * v, t + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
    lfo.start(t);
    lfo.stop(t + 2.3);
  }

  // flute: a sine with delayed vibrato and a little breath noise
  function flute(f, t, dur, vel) {
    const o = ac.createOscillator(), g = ac.createGain(), vib = ac.createOscillator(), vibAmt = ac.createGain();
    o.frequency.value = f;
    vib.frequency.value = 5.2;
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(f * 0.005, t + 0.35);
    vib.connect(vibAmt).connect(o.frequency);
    const len = Math.max(0.3, dur);
    const peak = 0.04 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.08);
    g.gain.setValueAtTime(peak * 0.85, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.25);
    o.connect(g);
    const n = noise(), bp = ac.createBiquadFilter(), ng = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    ng.gain.value = 0.18;
    n.connect(bp).connect(ng).connect(g);
    route(g, true);
    for (const x of [o, vib, n]) { x.start(t); x.stop(t + len + 0.3); }
  }

  // nylon-ish guitar pluck: a saw through a filter that closes quickly, plus a round body
  function guitar(f, t, vel) {
    const o = ac.createOscillator(), body = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    body.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    const bg = ac.createGain();
    bg.gain.value = 0.6;
    o.connect(lp).connect(g);
    body.connect(bg).connect(g);
    route(g, false);
    for (const x of [o, body]) { x.start(t); x.stop(t + 1.9); }
  }

  // ride cymbal: bright noise and two clangy partials
  function ride(t, vel) {
    const n = noise(), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = "highpass";
    hp.frequency.value = 5200;
    g.gain.setValueAtTime(0.02 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    n.connect(hp).connect(g).connect(music.drums);
    n.start(t);
    n.stop(t + 0.6);
    for (const fr of [3150, 4730]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = "square";
      o.frequency.value = fr;
      og.gain.setValueAtTime(0.0025 * vel, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(og).connect(hp);
      o.start(t);
      o.stop(t + 0.45);
    }
  }

  // brush on the snare: a short swish rather than a hit
  function brush(t, vel) {
    const n = noise(), bp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 3000;
    bp.Q.value = 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    n.connect(bp).connect(g).connect(music.drums);
    n.start(t);
    n.stop(t + 0.3);
  }

  // --- ambience beds ---
  function rainBed(dest) {
    const out = [];
    for (const [type, freq, vol] of [["lowpass", 1700, 0.06], ["highpass", 5200, 0.018]]) {
      const n = noise(), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = type;
      f.frequency.value = freq;
      g.gain.value = vol;
      n.connect(f).connect(g).connect(dest);
      n.start();
      out.push(n);
    }
    return out;
  }

  function wavesBed(dest) {
    const n = noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.value = 750;
    g.gain.value = 0.045;
    // one slow swell drives both brightness and loudness, like waves rolling in
    const lfo = ac.createOscillator(), cut = ac.createGain(), amp = ac.createGain();
    lfo.frequency.value = 0.085;
    cut.gain.value = 480;
    amp.gain.value = 0.035;
    lfo.connect(cut).connect(lp.frequency);
    lfo.connect(amp).connect(g.gain);
    n.connect(lp).connect(g).connect(dest);
    n.start();
    lfo.start();
    return [n, lfo];
  }

  function route(g, echo) {
    g.connect(music.duck);
    if (echo) g.connect(music.echo);
  }

  // electric piano: two-operator FM with a short bright "tine" on the attack
  function epiano(f, t, vel, dur, echo = false) {
    const g = ac.createGain(), car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain();
    car.frequency.value = f;
    mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.1 * vel, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.08 + 1, t + 0.9);
    mod.connect(mg).connect(car.frequency);
    const tine = ac.createOscillator(), tg = ac.createGain();
    tine.frequency.value = f * 4.01;
    tg.gain.setValueAtTime(0.16 * vel, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    tine.connect(tg).connect(g);
    car.connect(g);
    const peak = 0.05 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.7);
    g.gain.setTargetAtTime(0.0001, t + Math.max(0.3, dur), 0.25);
    route(g, echo);
    const end = t + dur + 1.6;
    for (const o of [car, mod, tine]) { o.start(t); o.stop(end); }
  }

  function strum(notes, t, vel, dur) {
    notes.forEach((m, i) => epiano(midi(m), t + i * 0.018 + rand(0, 0.006), vel * rand(0.85, 1), dur));
  }

  // kalimba: a sine with faint inharmonic overtones and a quick decay
  function kalimba(f, t, vel, echo) {
    const g = ac.createGain();
    route(g, echo);
    for (const [mult, v, dk] of [[1, 1, 1.4], [2, 0.08, 0.35], [5.4, 0.12, 0.12]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.045 * vel * v, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
  }

  // soft plucked lead: triangle through a closing filter
  function softPluck(f, t, vel, dur) {
    const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.35, dur) + 0.4);
    o.connect(lp).connect(g);
    route(g, true);
    o.start(t);
    o.stop(t + dur + 0.5);
  }

  function glassBell(f, t, vel) {
    const g = ac.createGain();
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = rand(-0.7, 0.7);
      g.connect(p);
      p.connect(music.duck);
      p.connect(music.echo);
    } else route(g, true);
    for (const [mult, v, dk] of [[1, 1, 2.4], [2.76, 0.3, 1.2], [5.4, 0.1, 0.5]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult;
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.012 * vel * v, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dk + 0.05);
    }
  }

  // warm pad: detuned saws through a slowly opening filter
  function padChord(notes, t, dur, vel, attack) {
    const lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.linearRampToValueAtTime(1150, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(600, t + dur + 2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + attack);
    g.gain.setValueAtTime(vel, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
    lp.connect(g);
    route(g, false);
    for (const m of notes) {
      for (const det of [-8, 0, 8]) {
        const o = ac.createOscillator(), og = ac.createGain();
        o.type = "sawtooth";
        o.frequency.value = midi(m);
        o.detune.value = det + rand(-2, 2);
        og.gain.value = 0.0055;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + dur + 2.6);
      }
    }
  }

  function bassNote(f, t, dur, vel) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), o2g = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.frequency.value = f;
    o2.type = "triangle";
    o2.frequency.value = f;
    o2g.gain.value = 0.25;
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const peak = 0.12 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.3);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
    o.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(g);
    route(g, false);
    for (const n of [o, o2]) { n.start(t); n.stop(t + dur + 0.8); }
  }

  function kick(t, vel) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    g.gain.setValueAtTime(0.3 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(music.drums);
    o.start(t);
    o.stop(t + 0.5);
    // gentle side-chain breathing on everything tonal
    music.duck.gain.setValueAtTime(1, t);
    music.duck.gain.linearRampToValueAtTime(0.62, t + 0.03);
    music.duck.gain.linearRampToValueAtTime(1, t + 0.32);
  }

  function snare(t, vel) {
    const n = noise(), bp = ac.createBiquadFilter(), lp = ac.createBiquadFilter(), g = ac.createGain();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    lp.type = "lowpass";
    lp.frequency.value = 3800;
    g.gain.setValueAtTime(0.09 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp).connect(lp).connect(g).connect(music.drums);
    n.start(t);
    n.stop(t + 0.25);
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = "triangle";
    o.frequency.value = 185;
    og.gain.setValueAtTime(0.045 * vel, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(music.drums);
    o.start(t);
    o.stop(t + 0.12);
  }

  function hat(t, vel) {
    const n = noise(), hp = ac.createBiquadFilter(), g = ac.createGain();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    g.gain.setValueAtTime(0.022 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(hp).connect(g).connect(music.drums);
    n.start(t);
    n.stop(t + 0.07);
  }

  // on/off switch kept as a boolean so other parts of the app can share it
  function setMusic(on) {
    settings.music = !!on;
    saveSettings();
    if (on) {
      ensureAudio();
      if (music.out && music.track === settings.track) music.out.gain.setTargetAtTime(TRACKS[settings.track].level, ac.currentTime, 1);
    } else if (music.out) music.out.gain.setTargetAtTime(0, ac.currentTime, 0.6);
    if (ac) duckDrone();
    syncUi();
  }

  function setTrack(name) {
    settings.track = name;
    saveSettings();
    if (!settings.music) { setMusic(true); return; }
    ensureAudio();
    if (ac && music.track !== name) switchTrack(name);
    syncUi();
  }

  // the ♫ button steps through every piece in TRACK_ORDER, then off, then back to the first
  function nextMusic() {
    if (!settings.music) { settings.track = TRACK_ORDER[0]; setMusic(true); }
    else {
      const i = TRACK_ORDER.indexOf(settings.track);
      if (i === TRACK_ORDER.length - 1) setMusic(false);
      else setTrack(TRACK_ORDER[i + 1]);
    }
    if (settings.music) caption(TRACKS[settings.track].label.toLowerCase());
  }

  // ---------- 3D space ----------
  // Orbs live in a box: x 0..W, y 0..floor, z 0..D (0 = the glass you look through).
  const FOCAL = 1000;
  let D = 700, VX = 0, VY = 0; // depth, vanishing point
  const scaleAt = (z) => FOCAL / (FOCAL + z);
  const proj = (x, y, z) => { const s = scaleAt(z); return { X: VX + (x - VX) * s, Y: VY + (y - VY) * s, s }; };
  const unproj = (X, Y, z) => { const s = scaleAt(z); return { x: VX + (X - VX) / s, y: VY + (Y - VY) / s }; };
  const floorY = () => (MODES[settings.mode].id === "fall" ? shelfY : H);

  // ---------- World ----------
  const orbs = [];
  let drawList = [];
  const particles = [];
  const rings = [];
  const bokeh = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), r: rand(40, 170), z: rand(0.2, 1), ci: (Math.random() * 8) | 0, p: rand(0, TAU), a: rand(0.03, 0.08) }));
  let time = 0;
  let nextCi = 0;

  const maxR = () => Math.min(W, H, D) * 0.28;
  // r is the orb's base size; the size slider and scroll-resizing scale it
  function makeOrb(x, y, z, base, ci = nextCi++, v = [rand(-40, 40), rand(-40, 40), rand(-30, 30)]) {
    const list = theme().orbs;
    const r = Math.min(maxR(), base * settings.size);
    const o = {
      base, own: 1, home: null,
      x: clamp(x, r, W - r), y: clamp(y, r, floorY() - r), z: clamp(z, r, D - r),
      vx: v[0], vy: v[1], vz: v[2], r, ci, rgb: rgb(list[ci % list.length]),
      born: time, squash: 0, squashV: 0, angle: 0, phase: rand(0, TAU), note: noteFor(r),
      cool: 0, dying: 0, rx: rand(0, TAU), ry: rand(0, TAU), P: null,
    };
    o.P = proj(o.x, o.y, o.z);
    orbs.push(o);
    return o;
  }

  function seed() {
    const n = Math.round(clamp((W * H) / 40000, 12, 26));
    for (let i = 0; i < n; i++) {
      const r = rand(16, 52);
      makeOrb(rand(r, W - r), rand(r, H - r), rand(r, D - r), r).born = time + i * 0.06;
    }
  }

  function popOrb(o, split = true, cascade = -1) {
    const i = orbs.indexOf(o);
    if (i < 0) return;
    orbs.splice(i, 1);
    if (drag.orb === o) drag.orb = null;
    const P = o.P, R = o.r * P.s;
    bloop(o.r, P.X);
    if (cascade >= 0) bell(noteFreq(3 + (cascade % 14)), 0.05, P.X, 1.4);
    try { navigator.vibrate?.(8); } catch (_) { /* unsupported */ }

    const n = Math.round(14 + o.r * 0.5);
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), sp = rand(50, 230) * (0.5 + o.r / 50) * P.s;
      particles.push({ x: P.X + Math.cos(a) * R * 0.5, y: P.Y + Math.sin(a) * R * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.5, 1.2), age: 0, size: rand(1.2, 3.4) * P.s, rgb: Math.random() < 0.5 ? o.rgb : rgb(theme().orbs[(Math.random() * theme().orbs.length) | 0]) });
    }
    rings.push({ x: P.X, y: P.Y, r: R, rgb: o.rgb, age: 0 });

    // soft shockwave nudges neighbours
    for (const q of orbs) {
      const dx = q.x - o.x, dy = q.y - o.y, dz = q.z - o.z, d = Math.hypot(dx, dy, dz) || 1;
      const reach = o.r * 5;
      if (d < reach) {
        const f = (1 - d / reach) * 260;
        q.vx += (dx / d) * f; q.vy += (dy / d) * f; q.vz += (dz / d) * f;
      }
    }

    // big orbs split into smaller ones, scattering in all three directions
    if (split && o.r > 24) {
      const kids = o.r > 40 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const a = (k / kids) * TAU + rand(-0.3, 0.3), b = rand(-0.8, 0.8);
        const r = o.base * rand(0.5, 0.62);
        const dir = [Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)];
        makeOrb(o.x + dir[0] * o.r * 0.4, o.y + dir[1] * o.r * 0.4, o.z + dir[2] * o.r * 0.4, r, o.ci + k,
          [o.vx * 0.4 + dir[0] * 170, o.vy * 0.4 + dir[1] * 170, o.vz * 0.4 + dir[2] * 170]);
      }
    }
  }

  // "Pop all" sweeps left to right without splitting
  let popQueue = [];
  let popTimer = 0;
  let popIndex = 0;
  function popAll() {
    popIndex = 0;
    popQueue = orbs.filter((o) => !o.dying).sort((a, b) => a.P.X - b.P.X);
    popTimer = 0;
  }

  // ---------- Input ----------
  const ptr = { x: 0, y: 0, down: false, sx: 0, sy: 0, st: 0, moved: false, lx: 0, ly: 0, id: null };
  const drag = { orb: null, ox: 0, oy: 0 };
  let well = false;
  let interactions = 0;

  // nearest orb under the pointer (front-most wins)
  function orbAt(X, Y) {
    for (let i = drawList.length - 1; i >= 0; i--) {
      const o = drawList[i];
      if (!o.dying && orbs.includes(o) && Math.hypot(o.P.X - X, o.P.Y - Y) < o.r * o.P.s * 1.1 + 6) return o;
    }
    return null;
  }

  function noteInteraction() {
    interactions++;
    if (interactions === 4) $("title").classList.add("fade");
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (ptr.down) return;
    ensureAudio();
    canvas.setPointerCapture?.(e.pointerId);
    Object.assign(ptr, { down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, st: time, moved: false });
    const hitOrb = orbAt(e.clientX, e.clientY);
    lastInteract = time;
    if (hitOrb) {
      pluck(noteFreq(hitOrb.note) * 2, hitOrb.P.X);
      drag.orb = hitOrb;
      drag.ox = hitOrb.P.X - e.clientX;
      drag.oy = hitOrb.P.Y - e.clientY;
      canvas.className = "grabbing";
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!ptr.down) {
      canvas.className = orbAt(e.clientX, e.clientY) ? "grab" : "";
      ptr.x = e.clientX;
      ptr.y = e.clientY;
      return;
    }
    if (e.pointerId !== ptr.id) return;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 8) ptr.moved = true;
  });

  function endPointer(e) {
    if (!ptr.down || (e && e.pointerId !== ptr.id)) return;
    const quick = time - ptr.st < 0.3;
    if (drag.orb) {
      const o = drag.orb;
      if (!ptr.moved && quick) popOrb(o);
      else {
        const sp = Math.hypot(o.vx, o.vy, o.vz), max = 2600;
        if (sp > max) { o.vx *= max / sp; o.vy *= max / sp; o.vz *= max / sp; }
        if (sp > 500) whoosh(Math.min(sp, max), o.P.X);
        o.home = null; // a thrown orb leaves its formation
      }
      drag.orb = null;
    } else if (!well && !ptr.moved && quick) {
      const r = rand(16, 46);
      const z = rand(D * 0.05, D * 0.45);
      const p = unproj(ptr.x, ptr.y, z);
      const o = makeOrb(p.x, p.y, z, r, nextCi++, [rand(-20, 20), rand(-20, 20), rand(-20, 20)]);
      o.squashV = 3;
      bloop(r, ptr.x, true);
    }
    noteInteraction();
    lastInteract = time;
    well = false;
    ptr.down = false;
    canvas.className = "";
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  window.addEventListener("blur", () => endPointer());

  // ---------- Formations ----------
  // In Shapes mode (or after a while idle in Float) the orbs glide into 3D shapes.
  const SHAPES = [
    "ring", "sphere", "helix", "heart", "star", "cube", "galaxy", "wave",
    "donut", "pyramid", "diamond", "infinity", "spiral", "moon", "flower", "smiley", "tornado", "atom", "saturn",
  ];
  const FLAT = new Set(["heart", "star", "ring", "infinity", "spiral", "moon", "flower", "smiley", "atom"]);
  const SHAPES_MIN_ORBS = 30;
  let shapeBag = [];
  const IDLE_SHAPES_AFTER = 25;

  // auto speed slider 0..1 maps to 0.2..5 orbs per second on a log scale
  const autoInterval = () => 1 / (0.2 * Math.pow(25, settings.autoSpeed));

  // Auto orbs are temporary: they only arrive while there's room and pop on their own after a while.
  // Orbs you make yourself are never removed.
  const AUTO_COVER_SPAWN = 0.22; // stop adding orbs once they cover this much of the screen
  const AUTO_COVER_MAX = 0.3; // past this, the oldest auto orbs pop to make room
  const AUTO_MAX = 60;
  const AUTO_LIFE = [18, 40]; // seconds
  const WARN_TIME = 1.2; // wobble before popping

  // share of the screen covered by orbs (overlaps counted twice, which is fine as a crowding gauge)
  function coverage() {
    let a = 0;
    for (const o of orbs) if (!o.dying && o.P) a += Math.PI * (o.r * o.P.s) ** 2;
    return a / Math.max(1, W * H);
  }

  function autoSpawn() {
    if (orbs.filter((o) => !o.dying).length >= AUTO_MAX || coverage() >= AUTO_COVER_SPAWN) return;
    const r = rand(14, 44);
    const falling = MODES[settings.mode].id === "fall";
    const x = rand(r, W - r);
    const o = makeOrb(x, falling ? r : rand(r, floorY() - r), rand(r, D - r), r);
    o.auto = true;
    o.life = rand(AUTO_LIFE[0], AUTO_LIFE[1]);
    if (falling) o.vy = rand(0, 60);
    bloop(o.r, x, true, 0.9);
  }

  let autoCareTimer = 0;
  function tendAutoOrbs(dt) {
    const free = (o) => o.auto && !o.dying && o !== drag.orb && !(o.home && formHolding());
    // a little shiver just before an orb's time is up
    for (const o of orbs) {
      if (!free(o)) continue;
      const left = o.life - (time - o.born);
      if (left > 0 && left < WARN_TIME) o.squashV += Math.sin(time * 24 + o.phase) * 30 * dt;
    }
    autoCareTimer -= dt;
    if (autoCareTimer > 0) return;
    autoCareTimer = 0.2;
    const autos = orbs.filter(free);
    if (!autos.length) return;
    let victim = null;
    if (coverage() > AUTO_COVER_MAX) victim = autos.reduce((a, b) => (a.born < b.born ? a : b));
    else victim = autos.find((o) => time - o.born > o.life);
    if (victim) {
      popOrb(victim, false);
      autoCareTimer = 0.35; // stagger pops so they never all go at once
    }
  }
  const SHAPE_SCALE = { galaxy: 1.55, wave: 1.4, donut: 1.25, saturn: 1.2, infinity: 1.25, atom: 1.45 };
  const form = { phase: "idle", t: 0, idx: -1, name: "", spin: 0, tilt: 0, scale: 1 };
  let lastInteract = 0, stirSpeed = 0, wellStart = -1, plipTimer = 3, spawnTimer = 0, autoTimer = 1;

  // spread point i of n evenly along a wireframe's edges
  function edgePoint(V, E, i, n) {
    const per = Math.ceil(n / E.length), e = E[i % E.length], f = (Math.floor(i / E.length) + 0.5) / per;
    return [lerp(V[e[0]][0], V[e[1]][0], f), lerp(V[e[0]][1], V[e[1]][1], f), lerp(V[e[0]][2], V[e[1]][2], f)];
  }

  function shapePoints(name, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      let p;
      switch (name) {
        case "ring": { const a = u * TAU; p = [Math.cos(a), Math.sin(a), 0]; break; }
        case "sphere": {
          const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
          p = [Math.cos(a) * rr * 0.9, y * 0.9, Math.sin(a) * rr * 0.9];
          break;
        }
        case "helix": {
          const t = n > 1 ? i / (n - 1) : 0, a = t * TAU * 2 + (i % 2) * Math.PI;
          p = [Math.cos(a) * 0.55, t * 2 - 1, Math.sin(a) * 0.55];
          break;
        }
        case "heart": {
          const t = u * TAU;
          const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          p = [x / 17, -y / 17 - 0.1, Math.sin(t * 2) * 0.1];
          break;
        }
        case "star": {
          const f = u * 10, k = Math.floor(f), fr = f - k;
          const v = (j) => { const a = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? 0.42 : 1; return [Math.cos(a) * rr, Math.sin(a) * rr]; };
          const a0 = v(k), a1 = v(k + 1);
          p = [lerp(a0[0], a1[0], fr), lerp(a0[1], a1[1], fr), 0];
          break;
        }
        case "cube": {
          const c = 0.62, V = [[-c, -c, -c], [c, -c, -c], [c, c, -c], [-c, c, -c], [-c, -c, c], [c, -c, c], [c, c, c], [-c, c, c]];
          const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
          const per = Math.ceil(n / 12), e = E[i % 12], f = (Math.floor(i / 12) + 0.5) / per;
          p = [lerp(V[e[0]][0], V[e[1]][0], f), lerp(V[e[0]][1], V[e[1]][1], f), lerp(V[e[0]][2], V[e[1]][2], f)];
          break;
        }
        case "galaxy": {
          const arm = i % 3, t = (Math.floor(i / 3) + 1) / Math.ceil(n / 3), a = (arm * TAU) / 3 + t * 3.4;
          p = [Math.cos(a) * t, Math.sin(i * 12.9898) * 0.07, Math.sin(a) * t];
          break;
        }
        case "donut": {
          // two concentric rings read as a chunky ring with a hole, even with few orbs
          const outer = i % 5 < 3, a = u * TAU + (outer ? 0 : 0.3);
          const rr = outer ? 1 : 0.55;
          p = [Math.cos(a) * rr, (outer ? 0 : 0.08) * Math.sin(a * 3), Math.sin(a) * rr];
          break;
        }
        case "pyramid": {
          const c = 0.75, top = [0, -0.85, 0];
          const V = [[-c, 0.6, -c], [c, 0.6, -c], [c, 0.6, c], [-c, 0.6, c], top];
          p = edgePoint(V, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]], i, n);
          break;
        }
        case "diamond": {
          const V = [[0, -1, 0], [0, 1, 0], [0.7, 0, 0], [-0.7, 0, 0], [0, 0, 0.7], [0, 0, -0.7]];
          p = edgePoint(V, [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]], i, n);
          break;
        }
        case "infinity": {
          const t = u * TAU, d = 1 + Math.sin(t) ** 2;
          p = [Math.cos(t) / d, (Math.sin(t) * Math.cos(t)) / d * 1.3, Math.sin(t) * 0.18];
          break;
        }
        case "spiral": {
          const t = n > 1 ? i / (n - 1) : 0, a = t * TAU * 2.25;
          p = [Math.cos(a) * (0.12 + 0.88 * t), Math.sin(a) * (0.12 + 0.88 * t), 0];
          break;
        }
        case "moon": {
          // outer arc opening to the right, inner arc carved from a second circle
          const outer = Math.round(n * 0.6);
          if (i < outer) {
            const a = lerp(0.25 * Math.PI, 1.75 * Math.PI, outer > 1 ? i / (outer - 1) : 0.5);
            p = [Math.cos(a), Math.sin(a), 0];
          } else {
            const k = n - outer > 1 ? (i - outer) / (n - outer - 1) : 0.5, lim = 1.286;
            const a = lerp(lim, TAU - lim, k);
            p = [0.5 + Math.cos(a) * 0.737, Math.sin(a) * 0.737, 0];
          }
          break;
        }
        case "flower": {
          const t = u * Math.PI, r = Math.cos(5 * t);
          p = [r * Math.cos(t), r * Math.sin(t), 0];
          break;
        }
        case "smiley": {
          const face = Math.round(n * 0.58), eyes = Math.max(2, Math.round(n * 0.12));
          if (i < face) { const a = (i / face) * TAU; p = [Math.cos(a), Math.sin(a), 0]; }
          else if (i < face + eyes) {
            const k = i - face, side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
            p = [side * 0.36, -0.32 + row * 0.16, 0];
          } else {
            const m = n - face - eyes, k = m > 1 ? (i - face - eyes) / (m - 1) : 0.5;
            const a = lerp(0.18 * Math.PI, 0.82 * Math.PI, k);
            p = [Math.cos(a) * 0.58, 0.02 + Math.sin(a) * 0.5, 0];
          }
          break;
        }
        case "tornado": {
          const t = n > 1 ? i / (n - 1) : 0, a = t * TAU * 3;
          const rr = 0.1 + 0.85 * (1 - t);
          p = [Math.cos(a) * rr, -1 + 2 * t, Math.sin(a) * rr];
          break;
        }
        case "atom": {
          // classic atom logo: a small nucleus and three elliptical orbits crossing at 60°
          const core = 3;
          if (i < core) { const a = (i / core) * TAU; p = [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0]; break; }
          const k = (i - core) % 3, m = Math.ceil((n - core) / 3);
          const a = (Math.floor((i - core) / 3) / m) * TAU + k * 0.4;
          const ex = Math.cos(a), ey = Math.sin(a) * 0.27, rot = (k * Math.PI) / 3;
          p = [ex * Math.cos(rot) - ey * Math.sin(rot), ex * Math.sin(rot) + ey * Math.cos(rot), Math.sin(a) * 0.2];
          break;
        }
        case "saturn": {
          const ball = Math.round(n * 0.38);
          if (i < ball) {
            const y = 1 - (2 * (i + 0.5)) / ball, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
            p = [Math.cos(a) * rr * 0.42, y * 0.42, Math.sin(a) * rr * 0.42];
          } else {
            const a = ((i - ball) / (n - ball)) * TAU;
            p = [Math.cos(a), 0, Math.sin(a)];
          }
          break;
        }
        default: { // wave
          const cols = Math.ceil(Math.sqrt(n)), cx = (i % cols) / Math.max(1, cols - 1) * 2 - 1, cz = Math.floor(i / cols) / Math.max(1, cols - 1) * 2 - 1;
          p = [cx, Math.sin(cx * 3) * Math.cos(cz * 2.5) * 0.3, cz];
        }
      }
      pts.push(p);
    }
    return pts;
  }

  function homeWorld(h) {
    const S = Math.min(W, H) * 0.3 * form.scale * (SHAPE_SCALE[form.name] || 1), Sz = Math.min(S, D * 0.45);
    // spin around the shape's own vertical axis, then tilt it toward the viewer
    const cs = Math.cos(form.spin), sn = Math.sin(form.spin);
    const sx = h[0] * cs - h[2] * sn, sz = h[0] * sn + h[2] * cs;
    let sy = h[1];
    if (form.name === "wave") sy += Math.sin(time * 1.2 + h[0] * 3) * 0.08;
    const ct = Math.cos(form.tilt), st = Math.sin(form.tilt);
    const y = sy * ct - sz * st, z = sy * st + sz * ct;
    return { x: W / 2 + sx * S, y: H * 0.45 + y * S, z: D / 2 + z * Sz };
  }

  const formHolding = () => form.phase === "gather" || form.phase === "hold";
  const wantsShapes = () => {
    const m = MODES[settings.mode].id;
    return m === "shapes" || (m === "float" && time - lastInteract > IDLE_SHAPES_AFTER);
  };

  function startShape() {
    if (!shapeBag.length) {
      shapeBag = SHAPES.slice();
      for (let i = shapeBag.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [shapeBag[i], shapeBag[j]] = [shapeBag[j], shapeBag[i]]; }
      if (shapeBag[shapeBag.length - 1] === form.name) shapeBag.unshift(shapeBag.pop());
    }
    form.name = shapeBag.pop();
    form.idx = SHAPES.indexOf(form.name);
    form.tilt = { galaxy: -0.95, wave: -0.6, ring: 0.3, donut: -0.75, saturn: -0.4, pyramid: -0.2 }[form.name] || 0;
    form.spin = 0;
    form.phase = "gather";
    form.t = 0;
    const pool = orbs.filter((o) => !o.dying && o !== drag.orb);
    form.scale = clamp(Math.sqrt(pool.length / 26), 0.8, 1.25);
    // greedily hand each point to the nearest free orb so paths stay short
    const free = new Set(pool);
    for (const o of orbs) o.home = null;
    for (const h of shapePoints(form.name, pool.length)) {
      const t = homeWorld(h);
      let best = null, bd = Infinity;
      for (const o of free) {
        const d = (o.x - t.x) ** 2 + (o.y - t.y) ** 2 + (o.z - t.z) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
      if (best) { best.home = h; free.delete(best); }
    }
    caption(form.name);
    swell();
  }

  function releaseShape() {
    for (const o of orbs) {
      if (o.home) { o.vx += rand(-50, 50); o.vy += rand(-50, 50); o.vz += rand(-50, 50); }
      o.home = null;
    }
    if (form.phase === "hold") arpeggio(12, 4, -1, 0.11, 0.04);
    form.phase = "rest";
    form.t = 0;
  }

  function updateForm(dt) {
    if (!wantsShapes()) {
      if (form.phase !== "idle") { releaseShape(); form.phase = "idle"; }
      return;
    }
    form.t += dt;
    form.spin += FLAT.has(form.name) ? 0 : dt * 0.3;
    if (FLAT.has(form.name)) form.spin = Math.sin(time * 0.35) * 0.55;

    // Shapes mode keeps enough orbs around to draw with
    if (MODES[settings.mode].id === "shapes") {
      spawnTimer -= dt;
      if (spawnTimer <= 0 && orbs.filter((o) => !o.dying).length < SHAPES_MIN_ORBS) {
        const r = rand(16, 34);
        makeOrb(rand(r, W - r), rand(r, H - r), rand(r, D - r), r);
        spawnTimer = 0.12;
      }
    }

    const toppingUp = MODES[settings.mode].id === "shapes" && orbs.filter((o) => !o.dying).length < SHAPES_MIN_ORBS;
    if (!toppingUp && (form.phase === "idle" || (form.phase === "rest" && form.t > 2.5))) startShape();
    else if (form.phase === "gather") {
      const homed = orbs.filter((o) => o.home);
      const close = homed.filter((o) => { const t = homeWorld(o.home); return Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z) < o.r + 24; }).length;
      if ((homed.length && close / homed.length > 0.8) || form.t > 6) {
        form.phase = "hold";
        form.t = 0;
        arpeggio(5, 5, 1);
      }
    } else if (form.phase === "hold" && form.t > 7) releaseShape();
  }

  let captionTimer = 0;
  function caption(text) {
    const el = $("caption");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  // ---------- Size ----------
  let lastTick = 0;
  function setSize(v, x = W / 2) {
    const prev = settings.size;
    settings.size = clamp(v, 0.5, 2);
    $("size").value = settings.size;
    saveSettings();
    if (time - lastTick > 0.06 && Math.abs(prev - settings.size) > 0.001) {
      const f = 520 / settings.size;
      glide(f * (prev / settings.size), f, x, 0.035, 0.08);
      lastTick = time;
    }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    ensureAudio();
    lastInteract = time;
    const k = Math.exp(-e.deltaY * 0.0015);
    const o = orbAt(e.clientX, e.clientY);
    if (o) {
      const before = o.own;
      o.own = clamp(o.own * k, 0.35, 3);
      if (time - lastTick > 0.05 && before !== o.own) {
        const f = noteFreq(o.note) * 2;
        glide(f, f * (before / o.own), o.P.X, 0.04, 0.1);
        lastTick = time;
      }
    } else setSize(settings.size * k, e.clientX);
    noteInteraction();
  }, { passive: false });

  // ---------- Physics ----------
  function hit(o, impact, nx, ny, wall) {
    o.squashV += clamp(impact / 260, 0, 6);
    if (nx || ny) o.angle = Math.atan2(ny, nx);
    if (o.cool <= 0 && impact > 45) {
      const s = o.P ? o.P.s : 1; // far orbs sound quieter
      const x = o.P ? o.P.X : o.x;
      const vol = clamp(impact / 900, 0, 1) * (wall ? 0.09 : 0.16) * (0.6 + o.r / 90) * (s * s * 1.2);
      if (wall === "front") bell(noteFreq(o.note) * 4, vol * 0.7, x, 0.45); // tink on the glass
      else if (wall === "back") thud(noteFreq(o.note) * 0.25, vol * 1.6, x);
      else bell(noteFreq(o.note) * (wall ? 0.5 : 1), vol, x, wall ? 0.7 : 1.7);
      o.cool = 0.09;
    }
  }

  function step(dt, pvx, pvy) {
    const mode = MODES[settings.mode].id;
    const cx = W / 2, cy = H / 2, cz = D / 2;
    const floor = floorY();
    const stirring = ptr.down && !drag.orb && ptr.moved && !well;
    const wellPt = well ? { ...unproj(ptr.x, ptr.y, D * 0.3), z: D * 0.3 } : null;

    for (const o of orbs) {
      o.cool -= dt;
      if (o === drag.orb) {
        const t = unproj(ptr.x + drag.ox, ptr.y + drag.oy, o.z);
        o.vx = (t.x - o.x) * 16;
        o.vy = (t.y - o.y) * 16;
        o.vz *= 1 - 6 * dt;
      } else if (o.home && formHolding()) {
        const t = homeWorld(o.home);
        const k = form.phase === "gather" ? 5 : 9;
        o.vx += (t.x - o.x) * k * dt;
        o.vy += (t.y - o.y) * k * dt;
        o.vz += (t.z - o.z) * k * dt;
        const damp = 1 - 3.2 * dt;
        o.vx *= damp; o.vy *= damp; o.vz *= damp;
      } else {
        if (mode === "float" || mode === "shapes") {
          o.vx += Math.sin(time * 0.31 + o.phase) * 9 * dt;
          o.vy += Math.cos(time * 0.27 + o.phase * 1.3) * 9 * dt;
          o.vz += Math.sin(time * 0.23 + o.phase * 0.7) * 9 * dt;
          const damp = 1 - 0.32 * dt;
          o.vx *= damp; o.vy *= damp; o.vz *= damp;
          // never quite still
          if (Math.hypot(o.vx, o.vy, o.vz) < 10) {
            o.vx += Math.cos(o.phase + time * 0.2) * 6 * dt;
            o.vy += Math.sin(o.phase + time * 0.2) * 6 * dt;
            o.vz += Math.sin(o.phase * 2 + time * 0.15) * 6 * dt;
          }
        } else if (mode === "fall") {
          o.vy += 980 * dt;
          const damp = 1 - 0.08 * dt;
          o.vx *= damp; o.vy *= damp; o.vz *= damp;
        } else {
          // carousel: orbit the vertical axis through the middle of the room
          const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz) || 1;
          const pull = 150 * Math.min(1, d / 120);
          o.vx += (dx / d) * pull * dt + (-dz / d) * 150 * dt;
          o.vz += (dz / d) * pull * dt + (dx / d) * 150 * dt;
          o.vy += (cy - o.y) * 0.25 * dt + Math.sin(time * 0.5 + o.phase) * 14 * dt;
          const damp = 1 - 0.55 * dt;
          o.vx *= damp; o.vy *= damp; o.vz *= damp;
        }
        if (wellPt) {
          const dx = wellPt.x - o.x, dy = wellPt.y - o.y, dz = wellPt.z - o.z, d = Math.max(20, Math.hypot(dx, dy, dz));
          const f = 2200 * Math.min(1, 160 / d);
          o.vx += (dx / d) * f * dt + (-dy / d) * f * 0.35 * dt;
          o.vy += (dy / d) * f * dt + (dx / d) * f * 0.35 * dt;
          o.vz += (dz / d) * f * dt;
          const damp = 1 - 1.4 * dt;
          o.vx *= damp; o.vy *= damp; o.vz *= damp;
        }
        if (stirring && o.P) {
          const d = Math.hypot(ptr.x - o.P.X, ptr.y - o.P.Y);
          const reach = o.r * o.P.s + 70;
          if (d < reach) {
            const k = ((1 - d / reach) * 9 * dt) / o.P.s;
            o.vx += clamp(pvx, -3000, 3000) * k;
            o.vy += clamp(pvy, -3000, 3000) * k;
          }
        }
      }

      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.z += o.vz * dt;
      // rolling: spin the inner core with the motion
      o.ry += (o.vx * dt) / o.r;
      o.rx += (o.vy * dt) / o.r;

      const e = mode === "fall" ? 0.72 : 0.88;
      if (o.x < o.r) { const imp = -o.vx; o.x = o.r; o.vx = Math.abs(o.vx) * e; hit(o, imp, 1, 0, true); }
      if (o.x > W - o.r) { const imp = o.vx; o.x = W - o.r; o.vx = -Math.abs(o.vx) * e; hit(o, imp, -1, 0, true); }
      if (o.y < o.r) { const imp = -o.vy; o.y = o.r; o.vy = Math.abs(o.vy) * e; hit(o, imp, 0, 1, true); }
      if (o.y > floor - o.r) {
        const imp = o.vy;
        o.y = floor - o.r;
        o.vy = -Math.abs(o.vy) * e;
        if (mode === "fall") { o.vx *= 1 - 1.5 * dt; o.vz *= 1 - 1.5 * dt; } // floor friction
        hit(o, imp, 0, -1, true);
      }
      if (o.z < o.r) { const imp = -o.vz; o.z = o.r; o.vz = Math.abs(o.vz) * e; hit(o, imp, 0, 0, "front"); }
      if (o.z > D - o.r) { const imp = o.vz; o.z = D - o.r; o.vz = -Math.abs(o.vz) * e; hit(o, imp, 0, 0, "back"); }

      // squash spring
      o.squashV += (-o.squash * 320 - o.squashV * 11) * dt;
      o.squash += o.squashV * dt;
    }

    // orb-orb collisions in 3D
    for (let i = 0; i < orbs.length; i++) {
      const a = orbs[i];
      if (a.dying) continue;
      for (let j = i + 1; j < orbs.length; j++) {
        const b = orbs[j];
        if (b.dying) continue;
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, rr = a.r + b.r;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
        const ia = a === drag.orb ? 0 : 1 / (a.r * a.r);
        const ib = b === drag.orb ? 0 : 1 / (b.r * b.r);
        const isum = ia + ib || 1;
        const overlap = rr - d;
        a.x -= nx * overlap * (ia / isum); a.y -= ny * overlap * (ia / isum); a.z -= nz * overlap * (ia / isum);
        b.x += nx * overlap * (ib / isum); b.y += ny * overlap * (ib / isum); b.z += nz * overlap * (ib / isum);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
        if (vn < 0) {
          const jImp = (-(1 + 0.86) * vn) / isum;
          a.vx -= jImp * nx * ia; a.vy -= jImp * ny * ia; a.vz -= jImp * nz * ia;
          b.vx += jImp * nx * ib; b.vy += jImp * ny * ib; b.vz += jImp * nz * ib;
          hit(a, -vn, -nx, -ny, false);
          hit(b, -vn, nx, ny, false);
        }
      }
    }
  }

  function update(dt) {
    time += dt;
    voiceBudget = Math.max(0, voiceBudget - dt * 40);

    if (ptr.down && !drag.orb && !ptr.moved && !well && time - ptr.st > 0.28) well = true;

    const pvx = (ptr.x - ptr.lx) / dt, pvy = (ptr.y - ptr.ly) / dt;
    updateForm(dt);

    // ease every orb toward its target size
    const cap = maxR();
    for (const o of orbs) {
      const tr = Math.min(cap, o.base * settings.size * o.own);
      if (Math.abs(o.r - tr) > 0.05) {
        o.r = lerp(o.r, tr, Math.min(1, dt * 6));
        o.note = noteFor(o.r);
      }
    }

    // continuous sound layers + ambient drips
    if (ac) {
      const stirring = ptr.down && !drag.orb && ptr.moved && !well;
      stirSpeed = lerp(stirSpeed, stirring ? Math.hypot(pvx, pvy) : 0, Math.min(1, dt * 10));
      if (well && wellStart < 0) wellStart = time;
      if (!well) wellStart = -1;
      updateLoops(stirSpeed, well ? Math.min(1, (time - wellStart) / 3) : -1);
      plipTimer -= dt;
      if (plipTimer <= 0) {
        if (MODES[settings.mode].id !== "fall") plip(rand(0, W));
        plipTimer = rand(2.5, 7);
      }
    }

    tendAutoOrbs(dt);

    // auto mode: new orbs drift in on their own
    if (settings.auto) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        autoTimer = autoInterval() * rand(0.6, 1.4);
        autoSpawn();
      }
    }

    const sub = 3;
    for (let s = 0; s < sub; s++) step(dt / sub, pvx, pvy);
    ptr.lx = ptr.x;
    ptr.ly = ptr.y;

    // theme colour transitions
    const list = theme().orbs;
    const k = Math.min(1, dt * 2.2);
    for (const o of orbs) o.rgb = mix(o.rgb, rgb(list[o.ci % list.length]), k);
    bg.a = mix(bg.a, rgb(theme().bg[0]), k);
    bg.b = mix(bg.b, rgb(theme().bg[1]), k);

    for (let i = orbs.length - 1; i >= 0; i--) if (orbs[i].dying && time - orbs[i].dying > 0.9) orbs.splice(i, 1);
    for (const o of orbs) o.P = proj(o.x, o.y, o.z);
    drawList = orbs.slice().sort((a, b) => b.z - a.z);

    const fall = MODES[settings.mode].id === "fall";
    for (const p of particles) {
      p.age += dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;
      if (fall) p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].age > particles[i].life) particles.splice(i, 1);
    for (const r of rings) r.age += dt;
    for (let i = rings.length - 1; i >= 0; i--) if (rings[i].age > 0.9) rings.splice(i, 1);

    if (popQueue.length) {
      popTimer -= dt;
      if (popTimer <= 0) {
        const o = popQueue.shift();
        if (o) popOrb(o, false, popIndex++);
        popTimer = 0.045;
      }
    }
  }

  // ---------- Render ----------
  function render() {
    const g = ctx.createRadialGradient(VX, VY, 0, VX, VY + H * 0.1, Math.max(W, H) * 0.8);
    g.addColorStop(0, css(bg.a));
    g.addColorStop(1, css(bg.b));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawBokeh();
    drawRoom();
    if (MODES[settings.mode].id === "fall") drawReflections();
    for (const o of drawList) drawShadow(o);
    if (well) drawWell();
    for (const o of drawList) drawOrb(o);
    drawPops();

    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBokeh() {
    const list = theme().orbs;
    const px = (ptr.x - W / 2) / W, py = (ptr.y - H / 2) / H;
    ctx.globalCompositeOperation = "lighter";
    for (const b of bokeh) {
      const span = W + 200;
      const x = (((b.x * W + Math.sin(time * 0.05 * b.z + b.p) * 60 - px * 40 * b.z) % span) + span) % span - 100;
      const y = b.y * H + Math.cos(time * 0.04 * b.z + b.p) * 40 - py * 30 * b.z;
      const col = rgb(list[b.ci % list.length]);
      const a = b.a * (0.5 + 0.4 * Math.sin(time * 0.3 + b.p));
      const bgr = ctx.createRadialGradient(x, y, 0, x, y, b.r);
      bgr.addColorStop(0, css(col, a));
      bgr.addColorStop(0.7, css(col, a * 0.4));
      bgr.addColorStop(1, css(col, 0));
      ctx.fillStyle = bgr;
      ctx.fillRect(x - b.r, y - b.r, b.r * 2, b.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // faint wireframe room: back wall, edges and a floor grid give the scene depth
  function drawRoom() {
    const fy = floorY();
    const fall = MODES[settings.mode].id === "fall";
    const b = [proj(0, 0, D), proj(W, 0, D), proj(W, fy, D), proj(0, fy, D)];
    const f = [{ X: 0, Y: 0 }, { X: W, Y: 0 }, { X: W, Y: fy }, { X: 0, Y: fy }];
    const accent = mix(rgb(theme().orbs[0]), WHITE, 0.6);

    // back wall glow
    const wg = ctx.createRadialGradient(VX, VY, 0, VX, VY, (b[1].X - b[0].X) * 0.7);
    wg.addColorStop(0, css(accent, 0.05));
    wg.addColorStop(1, css(accent, 0));
    ctx.fillStyle = wg;
    ctx.fillRect(b[0].X, b[0].Y, b[1].X - b[0].X, b[2].Y - b[0].Y);

    // coloured light pools that wander slowly over the walls and floor
    const pal = theme().orbs;
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const col = rgb(pal[(k * 2 + 1) % pal.length]);
      const x = W * (0.5 + 0.38 * Math.sin(time * 0.045 + k * 2.1));
      const y = H * (0.45 + 0.3 * Math.cos(time * 0.037 + k * 1.7));
      const rr = Math.max(W, H) * (0.32 + 0.06 * Math.sin(time * 0.1 + k));
      const lg = ctx.createRadialGradient(x, y, 0, x, y, rr);
      lg.addColorStop(0, css(col, 0.075));
      lg.addColorStop(0.5, css(col, 0.03));
      lg.addColorStop(1, css(col, 0));
      ctx.fillStyle = lg;
      ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    // floor plane
    const fl = ctx.createLinearGradient(0, b[3].Y, 0, fy);
    fl.addColorStop(0, css(accent, fall ? 0.02 : 0.01));
    fl.addColorStop(1, css(accent, fall ? 0.08 : 0.035));
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.moveTo(b[3].X, b[3].Y); ctx.lineTo(b[2].X, b[2].Y); ctx.lineTo(f[2].X, f[2].Y); ctx.lineTo(f[3].X, f[3].Y);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = css(accent, 0.07);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(f[i].X, f[i].Y); ctx.lineTo(b[i].X, b[i].Y); }
    ctx.moveTo(b[0].X, b[0].Y); ctx.lineTo(b[1].X, b[1].Y); ctx.lineTo(b[2].X, b[2].Y); ctx.lineTo(b[3].X, b[3].Y); ctx.closePath();
    ctx.stroke();

    // floor grid
    ctx.strokeStyle = css(accent, fall ? 0.07 : 0.04);
    ctx.beginPath();
    for (let i = 1; i < 10; i++) {
      const x = (W * i) / 10;
      const a = proj(x, fy, 0), c = proj(x, fy, D);
      ctx.moveTo(a.X, a.Y); ctx.lineTo(c.X, c.Y);
    }
    for (let i = 1; i < 7; i++) {
      const z = D * Math.pow(i / 7, 1.3);
      const a = proj(0, fy, z), c = proj(W, fy, z);
      ctx.moveTo(a.X, a.Y); ctx.lineTo(c.X, c.Y);
    }
    ctx.stroke();

    if (fall) {
      const lg = ctx.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, "rgba(255,255,255,0)");
      lg.addColorStop(0.5, "rgba(255,255,255,0.3)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, fy, W, 1);
    }
  }

  // mirror images in the glass shelf (Fall mode)
  function drawReflections() {
    const fy = floorY();
    const b2 = proj(W, fy, D), b3 = proj(0, fy, D);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(b3.X, b3.Y); ctx.lineTo(b2.X, b2.Y); ctx.lineTo(W, fy); ctx.lineTo(0, fy);
    ctx.closePath();
    ctx.clip();
    for (const o of drawList) {
      const s = orbScale(o);
      if (s <= 0.01) continue;
      const h = fy - o.y - o.r;
      const a = 0.22 * clamp(1 - h / 260, 0, 1);
      if (a <= 0.01) continue;
      const P = proj(o.x, 2 * fy - o.y, o.z);
      const R = o.r * P.s * s;
      const body = ctx.createRadialGradient(P.X - R * 0.3, P.Y + R * 0.35, R * 0.05, P.X, P.Y, R);
      body.addColorStop(0, css(mix(o.rgb, WHITE, 0.4), a));
      body.addColorStop(0.6, css(o.rgb, a * 0.8));
      body.addColorStop(1, css(mix(o.rgb, BLACK, 0.5), 0));
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.ellipse(P.X, P.Y, R, R * 0.92, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // shadow on the floor; softer and fainter the higher the orb floats
  function drawShadow(o) {
    const s = orbScale(o);
    if (s <= 0.01) return;
    const fy = floorY();
    const h = Math.max(0, fy - o.y - o.r);
    const a = 0.5 * clamp(1 - h / (H * 0.9), 0.06, 1) * s;
    const P = proj(o.x + h * 0.12, fy, o.z);
    const front = proj(o.x, fy, o.z - o.r), back = proj(o.x, fy, o.z + o.r);
    const spread = 1 + h / 380;
    const rx = o.r * P.s * 1.05 * spread * s;
    const ry = Math.max(1.5, Math.abs(front.Y - back.Y) * 0.55 * spread * s);
    ctx.save();
    ctx.translate(P.X, P.Y);
    ctx.scale(1, ry / rx);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    sg.addColorStop(0, `rgba(0,0,0,${a})`);
    sg.addColorStop(0.5 / spread, `rgba(0,0,0,${a * 0.6})`);
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawWell() {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const k = 1 - ((time * 0.8 + i / 4) % 1);
      ctx.strokeStyle = `rgba(200,215,255,${0.22 * (1 - k)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 12 + k * 140, 0, TAU); ctx.stroke();
    }
    const wg = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, 60);
    wg.addColorStop(0, "rgba(210,220,255,0.35)");
    wg.addColorStop(1, "rgba(210,220,255,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(ptr.x - 60, ptr.y - 60, 120, 120);
    ctx.globalCompositeOperation = "source-over";
  }

  function drawPops() {
    ctx.globalCompositeOperation = "lighter";
    for (const r of rings) {
      const k = r.age / 0.9;
      ctx.strokeStyle = css(r.rgb, 0.5 * (1 - k));
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + k * r.r * 2.4, 0, TAU); ctx.stroke();
    }
    for (const p of particles) {
      const a = 1 - p.age / p.life;
      const s = p.size * (0.5 + a * 0.7);
      const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3);
      pg.addColorStop(0, css(mix(p.rgb, WHITE, 0.5), a));
      pg.addColorStop(0.35, css(p.rgb, a * 0.5));
      pg.addColorStop(1, css(p.rgb, 0));
      ctx.fillStyle = pg;
      ctx.fillRect(p.x - s * 3, p.y - s * 3, s * 6, s * 6);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function orbPath(r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
  }

  function orbScale(o) {
    const t = clamp((time - o.born) / 0.5, 0, 1);
    let s = t <= 0 ? 0 : easeOutBack(t);
    s *= 1 + Math.sin(time * 1.4 + o.phase) * 0.012;
    if (o.dying) s *= 1 - clamp((time - o.dying) / 0.9, 0, 1);
    return Math.max(0, s);
  }

  function drawOrb(o) {
    const s = orbScale(o);
    if (s <= 0.01) return;
    const P = o.P;
    const r = o.r * P.s * s;
    if (r < 0.5) return;
    const fog = (o.z / D) * 0.55; // atmospheric depth: far orbs fade into the room
    const c = mix(o.rgb, bg.a, fog * 0.6);
    const sq = clamp(o.squash * 0.09, -0.22, 0.22);

    // light comes from the upper left, so highlights shift a little with screen position
    let lx = W * 0.12 - P.X, ly = -H * 0.35 - P.Y;
    const ll = Math.hypot(lx, ly) || 1;
    lx /= ll; ly /= ll;
    const hx = lx * r * 0.42, hy = ly * r * 0.46;

    ctx.save();
    ctx.translate(P.X, P.Y);

    // outer glow
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 2.3);
    glow.addColorStop(0, css(c, 0.2 * (1 - fog)));
    glow.addColorStop(1, css(c, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-r * 2.3, -r * 2.3, r * 4.6, r * 4.6);
    ctx.globalCompositeOperation = "source-over";

    // squash & stretch along the last impact normal
    ctx.rotate(o.angle);
    ctx.scale(1 - sq, 1 + sq * 0.8);
    ctx.rotate(-o.angle);

    // body
    const body = ctx.createRadialGradient(hx * 0.85, hy * 0.85, r * 0.04, 0, 0, r);
    body.addColorStop(0, css(mix(c, WHITE, 0.7)));
    body.addColorStop(0.3, css(mix(c, WHITE, 0.08)));
    body.addColorStop(0.68, css(mix(c, BLACK, 0.38)));
    body.addColorStop(1, css(mix(c, BLACK, 0.82)));
    ctx.fillStyle = body;
    orbPath(r);
    ctx.fill();

    ctx.save();
    ctx.clip();

    // environment reflection: dark floor below a soft horizon, bright sky above
    const env = ctx.createLinearGradient(0, -r, 0, r);
    env.addColorStop(0, "rgba(255,255,255,0.14)");
    env.addColorStop(0.45, "rgba(255,255,255,0.02)");
    env.addColorStop(0.58, "rgba(0,0,0,0.13)");
    env.addColorStop(1, "rgba(0,0,0,0.05)");
    ctx.fillStyle = env;
    ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);

    // glowing core that turns as the orb rolls
    ctx.globalCompositeOperation = "screen";
    for (const [ph, amt] of [[0, 1], [Math.PI, 0.45]]) {
      const ax = o.ry + ph, ay = o.rx + ph * 0.5;
      const front = (Math.cos(ax) + Math.cos(ay)) / 2; // 1 = facing us
      const cxp = Math.sin(ax) * r * 0.42, cyp = Math.sin(ay) * r * 0.42;
      const cr = r * (0.36 + 0.1 * front);
      const core = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, cr);
      core.addColorStop(0, css(mix(c, WHITE, 0.55), (0.16 + 0.24 * Math.max(0, front)) * amt));
      core.addColorStop(1, css(c, 0));
      ctx.fillStyle = core;
      ctx.fillRect(cxp - cr, cyp - cr, cr * 2, cr * 2);
    }

    // caustic: light focused through the glass on the side away from the light
    const kx = -lx * r * 0.5, ky = -ly * r * 0.52;
    const caustic = ctx.createRadialGradient(kx, ky, 0, kx, ky, r * 0.62);
    caustic.addColorStop(0, css(mix(c, WHITE, 0.4), 0.42));
    caustic.addColorStop(1, css(c, 0));
    ctx.fillStyle = caustic;
    ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);

    // iridescent film: a faint rainbow drifting across the glass, like a soap bubble
    const filmA = (theme().film || 0.13) * (1 - fog);
    if (filmA > 0.01) {
      const ia = time * 0.22 + o.phase;
      const fx = Math.cos(ia) * r, fy = Math.sin(ia) * r;
      const film = ctx.createLinearGradient(-fx, -fy, fx, fy);
      const hue0 = time * 18 + o.phase * 57;
      for (let k = 0; k <= 6; k++) film.addColorStop(k / 6, `hsla(${(hue0 + k * 60) % 360},95%,65%,${filmA})`);
      ctx.fillStyle = film;
      ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
    }
    ctx.globalCompositeOperation = "source-over";

    // soft inner rim that follows the silhouette, so every form looks puffy
    const rimCol = mix(c, BLACK, 0.75);
    for (const [w, a] of [[0.55, 0.06], [0.34, 0.08], [0.16, 0.11]]) {
      ctx.lineWidth = r * w;
      ctx.strokeStyle = css(rimCol, a);
      ctx.stroke();
    }
    // fresnel: the very edge catches light
    ctx.globalCompositeOperation = "screen";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = css(mix(c, WHITE, 0.6), 0.24);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    // specular: soft window reflection + a sharp glint
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(Math.atan2(ly, lx) + Math.PI / 2);
    ctx.scale(1, 0.58);
    const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.36);
    spec.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - fog * 0.6)})`);
    spec.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spec;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${0.95 * (1 - fog * 0.5)})`;
    ctx.beginPath(); ctx.arc(hx * 1.08, hy * 1.08, Math.max(0.7, r * 0.06), 0, TAU); ctx.fill();
    // second, dimmer reflection of the room's floor light
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = Math.max(0.7, r * 0.045);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.8, Math.atan2(-ly, -lx) - 0.5, Math.atan2(-ly, -lx) + 0.5); ctx.stroke();

    // fog veil
    if (fog > 0.02) {
      ctx.fillStyle = css(bg.a, fog * 0.55);
      orbPath(r);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- UI ----------
  function syncUi() {
    const m = MODES[settings.mode];
    $("mode-ico").textContent = m.ico;
    $("mode-lbl").textContent = m.label;
    $("theme-lbl").textContent = theme().name;
    $("theme-ico").style.background = theme().swatch;
    $("sound-ico").textContent = settings.sound ? "♪" : "–";
    $("sound-lbl").textContent = settings.sound ? "Sound on" : "Sound off";
    $("music-lbl").textContent = settings.music ? TRACKS[settings.track].label : "Music off";
    $("music").setAttribute("aria-pressed", settings.music);
    $("auto-lbl").textContent = settings.auto ? "Auto on" : "Auto off";
    $("auto").setAttribute("aria-pressed", settings.auto);
    $("auto-speed").value = settings.autoSpeed;
    $("auto-speed-wrap").classList.toggle("off", !settings.auto);
    $("size").value = settings.size;
    if (here()) document.querySelector('meta[name="theme-color"]').setAttribute("content", theme().bg[1]);
    window.dispatchEvent(new Event("zen-settings"));
  }
  $("mode").addEventListener("click", () => {
    settings.mode = (settings.mode + 1) % MODES.length;
    saveSettings();
    syncUi();
    // a little kick so the change is felt
    for (const o of orbs) { o.vx += rand(-60, 60); o.vy += rand(-60, 60); o.vz += rand(-60, 60); }
    ensureAudio();
    pluck(noteFreq(7 + settings.mode * 2), W / 2, 0.05);
    setTimeout(() => pluck(noteFreq(9 + settings.mode * 2), W / 2, 0.05), 90);
    lastInteract = time;
  });
  $("theme").addEventListener("click", () => {
    settings.theme = (settings.theme + 1) % THEMES.length;
    saveSettings();
    syncUi();
    ensureAudio();
    arpeggio(4 + settings.theme, 4, 1, 0.06, 0.045);
  });
  $("sound").addEventListener("click", () => setSound(!settings.sound));
  $("music").addEventListener("click", nextMusic);
  $("auto").addEventListener("click", () => {
    settings.auto = !settings.auto;
    autoTimer = 0.3;
    saveSettings();
    syncUi();
  });
  $("auto-speed").addEventListener("input", (e) => {
    settings.autoSpeed = clamp(+e.target.value, 0, 1);
    autoTimer = Math.min(autoTimer, autoInterval());
    saveSettings();
  });
  $("size").addEventListener("input", (e) => { ensureAudio(); lastInteract = time; setSize(+e.target.value); });
  $("clear").addEventListener("click", () => { ensureAudio(); popAll(); });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.target.tagName === "BUTTON" || !here()) return;
    e.preventDefault();
    ensureAudio();
    lastInteract = time;
    const r = rand(16, 46);
    makeOrb(rand(r, W - r), rand(r, H * 0.5), rand(r, D * 0.6), r);
    bloop(r, W / 2, true);
  });

  // ---------- Loop ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    shelfY = Math.min(H, $("bar").getBoundingClientRect().top - 10);
    VX = W / 2;
    VY = H * 0.42;
    D = clamp(Math.min(W, H) * 1.1, 420, 820);
    for (const o of orbs) {
      o.x = clamp(o.x, o.r, W - o.r);
      o.y = clamp(o.y, o.r, H - o.r);
      o.z = clamp(o.z, o.r, D - o.r);
      o.P = proj(o.x, o.y, o.z);
    }
  }
  window.addEventListener("resize", resize);

  let last = performance.now(), wasHere = true;
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    if (here()) {
      if (dt > 0) update(dt);
      render();
    } else {
      // another place is showing: hold still, silence our loops, keep the shared voice budget draining
      if (wasHere && stirLoop) updateLoops(0, -1);
      voiceBudget = Math.max(0, voiceBudget - dt * 40);
    }
    wasHere = here();
    requestAnimationFrame(frame);
  }

  // shared with the other places (pond.js): one audio engine and one set of sound/music settings
  window.Zen = {
    settings, saveSettings, syncUi, ensureAudio, setSound, setMusic, audioOk,
    output, noise, bell, plip, pluck, noteFreq, rand, clamp, lerp,
    get ac() { return ac; },
    get master() { return master; },
    get verb() { return verb; },
  };

  // dev hook: open with ?debug to inspect from the console
  if (new URLSearchParams(location.search).has("debug")) {
    window.__drift = { music, get ac() { return ac; }, orbs, update, render, popOrb, makeOrb, popAll, settings, ptr, proj, form, setSize, homeWorld, shape(name) { shapeBag = [name]; form.phase = "rest"; form.t = 99; }, set lastInteract(v) { lastInteract = v; }, get D() { return D; }, get well() { return well; } };
  }

  resize();
  ptr.x = ptr.lx = W / 2;
  ptr.y = ptr.ly = H / 2;
  syncUi();
  seed();
  for (const o of orbs) o.P = proj(o.x, o.y, o.z);
  drawList = orbs.slice().sort((a, b) => b.z - a.z);
  requestAnimationFrame(frame);
})();
