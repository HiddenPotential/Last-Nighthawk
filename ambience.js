// Ambient soundscapes: rain, sea, storm, wind, stream, forest, night and fire, built from
// filtered noise and oscillators on game.js's shared audio engine (window.Zen).
// They play under every place; the picker sits in the top-right corner.
(() => {
  "use strict";

  const Z = window.Zen;
  const { rand, clamp } = Z;
  const $ = (id) => document.getElementById(id);

  const KEY = "drift-ambience-v1";
  const opts = { track: "off", vol: 0.7 };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { /* storage unavailable */ }
  opts.vol = clamp(+opts.vol || 0, 0, 1);
  const saveOpts = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (_) { /* ignore */ } };

  const LEVEL = 0.9; // overall ambience loudness at full volume
  let bus = null; // every track plays into this, then into the master
  let current = null; // { id, out, timers, sources }
  let building = null; // looping sources made by the track being built, so they can be stopped later

  // ---------- Building blocks ----------
  // each helper takes the track's own output node so a whole track can fade as one

  // steady filtered noise; returns its gain (and filter) so a track can move them
  function bed(out, filters, vol, pan = 0) {
    const ac = Z.ac, n = Z.noise(), g = ac.createGain();
    let node = n;
    const made = filters.map(([type, freq, q = 0.7]) => {
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      node.connect(f);
      node = f;
      return f;
    });
    g.gain.value = vol;
    node.connect(g);
    connectPanned(g, out, pan);
    n.start(0, rand(0, 1.9));
    if (building) building.push(n);
    return { g, f: made[0], filters: made, src: n };
  }

  function connectPanned(node, out, pan) {
    const ac = Z.ac;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -0.95, 0.95);
      node.connect(p).connect(out);
      return p;
    }
    node.connect(out);
    return null;
  }

  // a tiny burst of noise through a band-pass: rain ticks, crackles, splashes
  function tick(out, t, freq, q, dur, vol, pan = 0) {
    const ac = Z.ac, n = Z.noise(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    connectPanned(g, out, pan);
    n.start(t, rand(0, 1.9));
    n.stop(t + dur + 0.02);
  }

  // a pitched sweep: drips, bubbles, bird notes
  function chirp(out, t, f0, f1, dur, vol, pan = 0, type = "sine") {
    const ac = Z.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    connectPanned(g, out, pan);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // A track's scheduler: every 50ms it lays down the next slice of random events.
  // rate is events per second; each event gets a time slightly ahead of now.
  function sprinkler(timers, fn, rate) {
    const id = setInterval(() => {
      if (!Z.ac || Z.ac.state !== "running" || !Z.settings.sound) return;
      const now = Z.ac.currentTime;
      let n = rate() * 0.05;
      while (n > 0) {
        if (Math.random() < n) fn(now + 0.06 + Math.random() * 0.05);
        n -= 1;
      }
    }, 50);
    timers.push(id);
  }

  // like sprinkler, but for slow events that plan their own next time (waves, thunder, birds)
  function every(timers, fn, first) {
    let next = -1;
    const id = setInterval(() => {
      if (!Z.ac || Z.ac.state !== "running" || !Z.settings.sound) return;
      const now = Z.ac.currentTime;
      if (next < 0) next = now + first;
      if (now + 0.15 >= next) next = Math.max(now, next) + fn(Math.max(now + 0.05, next));
    }, 50);
    timers.push(id);
  }

  // ---------- Layers shared by several tracks ----------
  function rainLayer(out, timers, heavy) {
    bed(out, [["highpass", 500], ["lowpass", heavy ? 7500 : 6000]], heavy ? 0.16 : 0.1);
    bed(out, [["lowpass", 900]], heavy ? 0.08 : 0.05);
    // drops on leaves and stone
    sprinkler(timers, (t) => tick(out, t, rand(2200, 6500), 1.4, rand(0.01, 0.03), rand(0.01, 0.04), rand(-0.9, 0.9)), () => (heavy ? 90 : 42));
    // bigger drops landing in puddles
    sprinkler(timers, (t) => { const f = rand(900, 1900); chirp(out, t, f, f * 0.45, 0.06, rand(0.012, 0.028), rand(-0.8, 0.8)); }, () => (heavy ? 6 : 3));
    // a gutter dripping somewhere close
    sprinkler(timers, (t) => chirp(out, t, 1700, 750, 0.08, 0.02, 0.5), () => 0.4);
  }

  function windLayer(out, timers, strength) {
    const a = bed(out, [["bandpass", 450, 0.9]], 0.05 * strength, -0.3);
    const b = bed(out, [["bandpass", 800, 1.2]], 0.03 * strength, 0.35);
    const whistle = bed(out, [["bandpass", 1200, 14]], 0.008 * strength);
    // gusts: the wind keeps changing its mind
    every(timers, (t) => {
      const k = rand(0.3, 1);
      a.g.gain.setTargetAtTime(0.03 + 0.11 * k * strength, t, 1.2);
      a.f.frequency.setTargetAtTime(250 + 650 * k, t, 1.4);
      b.g.gain.setTargetAtTime(0.02 + 0.07 * (1 - k * 0.5) * strength, t, 1.6);
      b.f.frequency.setTargetAtTime(500 + 700 * rand(0, 1), t, 1.8);
      whistle.g.gain.setTargetAtTime(0.004 + 0.02 * k * k * strength, t, 1.5);
      whistle.f.frequency.setTargetAtTime(900 + 900 * k, t, 2);
      return rand(1.5, 4);
    }, 0.1);
  }

  function brookLayer(out, timers, amount) {
    bed(out, [["bandpass", 1200, 0.5]], 0.05 * amount);
    bed(out, [["lowpass", 500]], 0.04 * amount);
    // babbling: lots of tiny rising bubbles
    sprinkler(timers, (t) => {
      const f = rand(500, 1500);
      chirp(out, t, f, f * rand(1.3, 2.2), rand(0.02, 0.06), rand(0.006, 0.02) * amount, rand(-0.7, 0.7));
    }, () => 30 * amount);
  }

  // waves that swell, break into foam and wash back out
  function wavesLayer(out, timers, amount) {
    const ac = Z.ac;
    bed(out, [["lowpass", 220]], 0.08 * amount); // the deep, constant roll
    // two wave voices so each wave can overlap the last one's wash
    const voices = [0, 1].map(() => {
      const body = bed(out, [["lowpass", 500, 0.5]], 0.0001);
      const foam = bed(out, [["highpass", 2500]], 0.0001);
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (pan) { body.g.disconnect(); foam.g.disconnect(); body.g.connect(pan); foam.g.connect(pan); pan.connect(out); }
      return { body, foam, pan };
    });
    let turn = 0;
    every(timers, (t) => {
      const v = voices[turn++ % 2], D = rand(7, 11), rise = D * rand(0.35, 0.45), peak = rand(0.12, 0.2) * amount;
      if (v.pan) v.pan.pan.setValueAtTime(rand(-0.45, 0.45), t);
      const g = v.body.g.gain, f = v.body.f.frequency, fg = v.foam.g.gain;
      g.cancelScheduledValues(t); f.cancelScheduledValues(t); fg.cancelScheduledValues(t);
      // swell, break, then wash back out
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(peak, t + rise);
      g.exponentialRampToValueAtTime(0.004, t + D);
      f.setValueAtTime(380, t);
      f.exponentialRampToValueAtTime(2200, t + rise);
      f.exponentialRampToValueAtTime(500, t + D);
      fg.setValueAtTime(0.0001, t);
      fg.linearRampToValueAtTime(0.0001, t + rise * 0.85);
      fg.linearRampToValueAtTime(peak * 0.28, t + rise + 0.6);
      fg.exponentialRampToValueAtTime(0.0005, t + D * 0.95);
      return D * rand(0.55, 0.8);
    }, 0.2);
  }

  // ---------- Tracks ----------
  const TRACKS = [
    { id: "off", label: "Off", ico: "∅" },
    { id: "rain", label: "Rain", ico: "☂︎", gain: 1, make: (out, timers) => rainLayer(out, timers, false) },
    {
      id: "sea", label: "Sea", ico: "≋", gain: 2.2,
      make: (out, timers) => wavesLayer(out, timers, 1),
    },
    {
      id: "storm", label: "Storm", ico: "ϟ", gain: 0.8,
      make(out, timers) {
        rainLayer(out, timers, true);
        windLayer(out, timers, 1.3);
        every(timers, (t) => { thunder(out, t); return rand(10, 26); }, rand(3, 7));
      },
    },
    { id: "wind", label: "Wind", ico: "∿", gain: 2, make: (out, timers) => windLayer(out, timers, 1.4) },
    { id: "stream", label: "Stream", ico: "∾", gain: 2.5, make: (out, timers) => brookLayer(out, timers, 1) },
    {
      id: "forest", label: "Forest", ico: "♣︎", gain: 3.5,
      make(out, timers) {
        windLayer(out, timers, 0.45);
        brookLayer(out, timers, 0.35);
        every(timers, (t) => { bird(out, t); return rand(1.2, 5); }, 0.6);
      },
    },
    {
      id: "night", label: "Night", ico: "☾", gain: 3,
      make(out, timers) {
        bed(out, [["lowpass", 400]], 0.03);
        // a few crickets, each with its own pitch, pace and place
        for (let c = 0; c < 3; c++) {
          const freq = rand(4200, 4900), period = rand(0.6, 1.1), pulses = 3 + (c % 2), pan = -0.7 + c * 0.7, vol = rand(0.008, 0.016);
          every(timers, (t) => {
            for (let p = 0; p < pulses; p++) chirp(out, t + p * 0.035, freq, freq * 0.98, 0.018, vol, pan);
            return period * rand(0.9, 1.1) * (Math.random() < 0.1 ? 3 : 1);
          }, rand(0, 1));
        }
        every(timers, (t) => {
          const n = 1 + ((Math.random() * 3) | 0), f = rand(130, 210), pan = rand(-0.8, 0.8);
          for (let k = 0; k < n; k++) croak(out, t + k * 0.38, f, pan);
          return rand(4, 12);
        }, rand(2, 5));
      },
    },
    {
      id: "fire", label: "Fire", ico: "♨︎", gain: 3.5,
      make(out, timers) {
        const roar = bed(out, [["lowpass", 350]], 0.08);
        const hiss = bed(out, [["bandpass", 900, 0.6]], 0.02);
        every(timers, (t) => {
          roar.g.gain.setTargetAtTime(rand(0.05, 0.11), t, 0.4);
          hiss.g.gain.setTargetAtTime(rand(0.01, 0.03), t, 0.3);
          return rand(0.3, 0.9);
        }, 0.1);
        // crackles come in little clusters
        sprinkler(timers, (t) => {
          const n = 1 + ((Math.random() * 6) | 0), pan = rand(-0.5, 0.5);
          let tt = t;
          for (let k = 0; k < n; k++) { tick(out, tt, rand(1500, 6000), 3, rand(0.003, 0.012), rand(0.02, 0.08), pan); tt += rand(0.005, 0.03); }
        }, () => 6);
        // the odd pop of a knot in the wood
        sprinkler(timers, (t) => { tick(out, t, rand(400, 900), 2, 0.05, 0.1, rand(-0.4, 0.4)); chirp(out, t, 220, 90, 0.08, 0.04); }, () => 0.3);
      },
    },
    {
      id: "thunder", label: "Thunder", ico: "☁\uFE0E", gain: 2.2,
      make(out, timers) {
        bed(out, [["lowpass", 90]], 0.05); // the heavy air before a storm
        windLayer(out, timers, 0.35);
        every(timers, (t) => { thunder(out, t); return rand(6, 16); }, rand(1, 3));
      },
    },
    {
      id: "seabirds", label: "Seabirds", ico: "⌒", gain: 2,
      make(out, timers) {
        wavesLayer(out, timers, 0.85);
        windLayer(out, timers, 0.3);
        every(timers, (t) => { gull(out, t); return rand(2, 7); }, 1);
      },
    },
    {
      id: "waterfall", label: "Waterfall", ico: "⫶", gain: 1.4,
      make(out, timers) {
        bed(out, [["highpass", 200], ["lowpass", 3200]], 0.1); // the falling sheet
        bed(out, [["lowpass", 140]], 0.12, -0.2); // the plunge pool's roar
        const mid = bed(out, [["bandpass", 900, 0.8]], 0.04, 0.25);
        every(timers, (t) => { mid.g.gain.setTargetAtTime(rand(0.025, 0.06), t, 0.8); mid.f.frequency.setTargetAtTime(rand(600, 1300), t, 1); return rand(0.8, 2); }, 0.1);
        sprinkler(timers, (t) => tick(out, t, rand(1500, 5000), 1.2, rand(0.01, 0.025), rand(0.008, 0.02), rand(-0.9, 0.9)), () => 60);
      },
    },
    {
      id: "cave", label: "Cave", ico: "◠", gain: 3.5,
      make(out, timers) {
        // every sound in here comes back off the walls
        const ac = Z.ac, room = ac.createGain(), echo = ac.createDelay(2), fb = ac.createGain(), tone = ac.createBiquadFilter();
        echo.delayTime.value = 0.42;
        fb.gain.value = 0.45;
        tone.type = "lowpass";
        tone.frequency.value = 2200;
        room.connect(out);
        room.connect(echo);
        echo.connect(tone).connect(fb).connect(echo);
        tone.connect(out);
        bed(out, [["lowpass", 120]], 0.035); // still, cold air
        every(timers, (t) => {
          const f = rand(1400, 3200);
          chirp(room, t, f, f * 0.5, 0.07, rand(0.02, 0.05), rand(-0.8, 0.8));
          return rand(0.6, 3.5);
        }, 0.5);
        // a big drop into a deep pool, far off
        every(timers, (t) => { chirp(room, t, rand(500, 800), 180, 0.18, 0.04, rand(-0.6, 0.6)); return rand(6, 15); }, 4);
      },
    },
    {
      id: "chimes", label: "Chimes", ico: "♪", gain: 1.8,
      make(out, timers) {
        windLayer(out, timers, 0.4);
        // a gust sets the chimes knocking together for a moment
        every(timers, (t) => {
          const n = 2 + ((Math.random() * 6) | 0);
          let tt = t;
          for (let k = 0; k < n; k++) { chime(out, tt, CHIME[(Math.random() * CHIME.length) | 0], rand(0.015, 0.035), rand(-0.5, 0.5)); tt += rand(0.08, 0.4); }
          return rand(2, 7);
        }, 0.5);
      },
    },
  ];

  function thunder(out, t) {
    const ac = Z.ac, pan = rand(-0.7, 0.7), near = Math.random() < 0.45;
    if (near) tick(out, t, 1200, 0.7, 0.45, 0.12, pan); // the crack of a close strike
    const n = Z.noise(), lp = ac.createBiquadFilter(), g = ac.createGain();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(near ? 320 : 200, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 6);
    const D = rand(5, 8);
    g.gain.setValueAtTime(0, t);
    let tt = t + rand(0.2, near ? 0.3 : 1);
    g.gain.linearRampToValueAtTime(near ? 0.4 : 0.25, tt);
    // it rolls: a few swells and dips before it dies away
    for (let k = 0; k < 4; k++) { tt += rand(0.5, 1.2); g.gain.linearRampToValueAtTime(rand(0.08, 0.3), tt); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    n.connect(lp).connect(g);
    connectPanned(g, out, pan);
    n.start(t, rand(0, 1.9));
    n.stop(t + D + 0.1);
  }

  function bird(out, t) {
    const pan = rand(-0.85, 0.85), kind = (Math.random() * 3) | 0;
    if (kind === 0) {
      // a quick trill of falling notes
      const n = 6 + ((Math.random() * 7) | 0), f = rand(3000, 4500);
      for (let k = 0; k < n; k++) chirp(out, t + k * 0.06, f, f * 0.7, 0.04, 0.012, pan);
    } else if (kind === 1) {
      // a two-note whistle
      const f = rand(2000, 2600);
      chirp(out, t, f, f * 1.15, 0.25, 0.014, pan);
      chirp(out, t + 0.32, f * 0.85, f * 0.82, 0.3, 0.012, pan);
    } else {
      // a warble
      const ac = Z.ac, o = ac.createOscillator(), lfo = ac.createOscillator(), depth = ac.createGain(), g = ac.createGain();
      const f = rand(2400, 3400);
      o.frequency.value = f;
      lfo.frequency.value = rand(18, 32);
      depth.gain.value = f * 0.08;
      lfo.connect(depth).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.012, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g);
      connectPanned(g, out, pan);
      o.start(t); lfo.start(t);
      o.stop(t + 0.5); lfo.stop(t + 0.5);
    }
  }

  // a herring gull: a long rising-and-falling cry, or a run of short laughing calls
  function gull(out, t) {
    const ac = Z.ac, pan = rand(-0.9, 0.9), far = rand(0.35, 1);
    const call = (t0, f0, f1, f2, dur, vol) => {
      const o = ac.createOscillator(), vib = ac.createOscillator(), vibAmt = ac.createGain(), bp = ac.createBiquadFilter(), g = ac.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.3);
      o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      vib.frequency.value = rand(20, 32);
      vibAmt.gain.value = f1 * 0.03;
      vib.connect(vibAmt).connect(o.frequency);
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      bp.Q.value = 1.6;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * far, t0 + 0.03);
      g.gain.setValueAtTime(vol * far, t0 + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(bp).connect(g);
      connectPanned(g, out, pan);
      o.start(t0); vib.start(t0);
      o.stop(t0 + dur + 0.02); vib.stop(t0 + dur + 0.02);
    };
    if (Math.random() < 0.5) {
      const f = rand(1100, 1500);
      call(t, f, f * 1.6, f * 0.75, rand(0.45, 0.7), 0.03);
      if (Math.random() < 0.5) call(t + rand(0.7, 1), f * 1.05, f * 1.55, f * 0.8, 0.5, 0.025);
    } else {
      const n = 4 + ((Math.random() * 5) | 0), f = rand(1500, 1900);
      for (let k = 0; k < n; k++) call(t + k * rand(0.14, 0.18), f * (1 - k * 0.03), f * 1.1 * (1 - k * 0.03), f * 0.8 * (1 - k * 0.04), 0.12, 0.024);
    }
  }

  // wind chimes: metal tubes tuned to a pentatonic scale, with slightly inharmonic overtones
  const CHIME = [784, 880, 1047, 1175, 1319, 1568, 1760];
  function chime(out, t, f, vol, pan) {
    const ac = Z.ac, g = ac.createGain();
    connectPanned(g, out, pan);
    for (const [mult, v, decay] of [[1, 1, 4.5], [2.76, 0.35, 2.2], [5.4, 0.12, 1.1]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * mult * rand(0.998, 1.002);
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(vol * v, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  function croak(out, t, f, pan) {
    const ac = Z.ac, o = ac.createOscillator(), lp = ac.createBiquadFilter(), am = ac.createOscillator(), amDepth = ac.createGain(), g = ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.85, t + 0.25);
    lp.type = "lowpass";
    lp.frequency.value = 900;
    am.frequency.value = rand(20, 30);
    amDepth.gain.value = 0.02;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.03);
    g.gain.setValueAtTime(0.025, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + 0.28);
    am.connect(amDepth).connect(g.gain);
    o.connect(lp).connect(g);
    connectPanned(g, out, pan);
    o.start(t); am.start(t);
    o.stop(t + 0.3); am.stop(t + 0.3);
  }

  // ---------- Playing ----------
  function ensureBus() {
    if (bus || !Z.ac || !Z.master) return !!bus;
    bus = Z.ac.createGain();
    bus.gain.value = opts.vol * LEVEL;
    bus.connect(Z.master);
    const send = Z.ac.createGain(); // a touch of the room's reverb so it sits with everything else
    send.gain.value = 0.15;
    bus.connect(send).connect(Z.verb);
    return true;
  }

  function play(id) {
    if (current && current.id === id) return;
    if (current) fadeOut(current);
    current = null;
    const track = TRACKS.find((t) => t.id === id);
    if (!track || !track.make || !ensureBus()) return;
    const ac = Z.ac, out = ac.createGain(), timers = [], t = ac.currentTime;
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(track.gain || 1, t + 2.5); // gains even out how loud the tracks feel
    out.connect(bus);
    building = [];
    track.make(out, timers);
    current = { id, out, timers, sources: building };
    building = null;
  }

  function fadeOut(c) {
    const t = Z.ac.currentTime;
    c.timers.forEach(clearInterval);
    c.out.gain.cancelScheduledValues(t);
    c.out.gain.setValueAtTime(c.out.gain.value, t);
    c.out.gain.linearRampToValueAtTime(0, t + 1.8);
    setTimeout(() => {
      for (const n of c.sources) { try { n.stop(); } catch (_) { /* already stopped */ } }
      c.out.disconnect();
    }, 2000);
  }

  // audio can only start after the visitor touches the page; pick up a remembered track then
  function wake() {
    if (opts.track === "off" || current) return;
    Z.ensureAudio();
    if (Z.ac) play(opts.track);
  }
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);

  // ---------- UI ----------
  const btn = $("sounds-btn"), panel = $("sounds-panel"), list = $("sounds-list");
  for (const t of TRACKS) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.track = t.id;
    b.innerHTML = `<span class="ico" aria-hidden="true">${t.ico}</span><span>${t.label}</span>`;
    b.addEventListener("click", () => choose(t.id));
    list.appendChild(b);
  }

  function choose(id) {
    opts.track = id;
    saveOpts();
    syncUi();
    Z.ensureAudio();
    if (id === "off") {
      if (current) fadeOut(current);
      current = null;
    } else if (Z.ac) play(id);
  }

  function syncUi() {
    const t = TRACKS.find((x) => x.id === opts.track) || TRACKS[0];
    $("sounds-ico").textContent = t.id === "off" ? "∿" : t.ico;
    $("sounds-lbl").textContent = t.id === "off" ? "Sounds" : t.label;
    btn.classList.toggle("on", t.id !== "off");
    for (const b of list.children) b.setAttribute("aria-checked", b.dataset.track === t.id);
    $("sounds-vol").value = opts.vol;
  }

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open);
  }
  btn.addEventListener("click", () => setOpen(panel.hidden));
  document.addEventListener("pointerdown", (e) => { if (!panel.hidden && !$("sounds").contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { setOpen(false); btn.focus(); } });
  $("sounds-vol").addEventListener("input", (e) => {
    opts.vol = clamp(+e.target.value, 0, 1);
    saveOpts();
    if (bus) bus.gain.setTargetAtTime(opts.vol * LEVEL, Z.ac.currentTime, 0.1);
  });

  if (new URLSearchParams(location.search).has("debug")) {
    window.__ambience = { opts, play, choose, get current() { return current; }, get bus() { return bus; }, TRACKS };
  }

  syncUi();
})();
