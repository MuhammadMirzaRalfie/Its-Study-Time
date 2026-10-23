// Semua suara (alarm & ambient) dibuat langsung dengan Web Audio API,
// jadi tidak butuh file audio dan tidak ada masalah hak cipta.

const AudioEngine = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  return { getCtx };
})();

// ---------------------------------------------------------------- Alarm

const Alarm = (() => {
  const SOUNDS = { bell: 'Lonceng', chime: 'Chime', marimba: 'Marimba', digital: 'Digital' };

  function tone(ac, out, { freq, type = 'sine', start, dur, gain = 0.3, attack = 0.005 }) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  const patterns = {
    bell(ac, out, t) {
      // Nada dasar + beberapa partial supaya terdengar seperti lonceng, dibunyikan dua kali.
      for (const offset of [0, 1.3]) {
        [[523.25, 0.32], [1046.5, 0.14], [1410, 0.07], [2093, 0.04]].forEach(([freq, gain]) =>
          tone(ac, out, { freq, gain, start: t + offset, dur: 2.4 }));
      }
    },
    chime(ac, out, t) {
      [659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(ac, out, { freq, start: t + i * 0.22, dur: 1.5, gain: 0.25 });
        tone(ac, out, { freq: freq * 2, start: t + i * 0.22, dur: 0.8, gain: 0.05 });
      });
    },
    marimba(ac, out, t) {
      [523.25, 659.25, 783.99, 659.25, 1046.5].forEach((freq, i) => {
        tone(ac, out, { freq, start: t + i * 0.16, dur: 0.55, gain: 0.3, attack: 0.002 });
        tone(ac, out, { freq: freq * 4, start: t + i * 0.16, dur: 0.08, gain: 0.05, attack: 0.001 });
      });
    },
    digital(ac, out, t) {
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 2; i++) {
          tone(ac, out, { freq: 880, type: 'square', start: t + r * 0.7 + i * 0.15, dur: 0.1, gain: 0.08, attack: 0.002 });
        }
      }
    },
  };

  function play(name, volume) {
    const ac = AudioEngine.getCtx();
    const out = ac.createGain();
    out.gain.value = volume;
    out.connect(ac.destination);
    (patterns[name] || patterns.bell)(ac, out, ac.currentTime + 0.05);
    setTimeout(() => out.disconnect(), 4000);
  }

  return { SOUNDS, play };
})();

// ---------------------------------------------------------------- Ambient

const Ambient = (() => {
  const SOUNDS = [
    { id: 'rain', name: 'Hujan', icon: 'rain' },
    { id: 'fire', name: 'Api unggun', icon: 'flame' },
    { id: 'waves', name: 'Ombak', icon: 'waves' },
    { id: 'wind', name: 'Angin', icon: 'wind' },
    { id: 'white', name: 'White noise', icon: 'wave' },
    { id: 'brown', name: 'Brown noise', icon: 'wave' },
  ];

  const LOOP_SECONDS = 12;
  const buffers = {};
  const active = {}; // id -> { out, sources }
  let master = null;
  let masterVolume = 0.8;

  // Buat buffer yang bisa di-loop tanpa bunyi "klik": isi sedikit lebih panjang,
  // lalu ekornya di-crossfade ke bagian awal.
  function makeLoop(ac, fill) {
    const sr = ac.sampleRate;
    const len = sr * LOOP_SECONDS;
    const fade = Math.floor(sr * 0.5);
    const raw = new Float32Array(len + fade);
    fill(raw, sr);
    const buf = ac.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    d.set(raw.subarray(0, len));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = raw[i] * k + raw[len + i] * (1 - k);
    }
    return buf;
  }

  function pinkNoise(d) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  function brownNoise(d) {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }

  const fills = {
    white(d) {
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },
    pink: pinkNoise,
    brown: brownNoise,
    // Hujan = desis pink noise + tetesan acak yang meluruh cepat.
    rain(d, sr) {
      pinkNoise(d);
      const p = 140 / sr;
      const decay = Math.exp(-1 / (sr * 0.004));
      let env = 0;
      for (let i = 0; i < d.length; i++) {
        if (Math.random() < p) env = Math.max(env, 0.15 + Math.random() * 0.5);
        env *= decay;
        d[i] = d[i] * 0.55 + (Math.random() * 2 - 1) * env;
      }
    },
    // Api = gemuruh brown noise + letupan kecil yang kadang bergerombol.
    fire(d, sr) {
      brownNoise(d);
      const decay = Math.exp(-1 / (sr * 0.0015));
      let env = 0;
      let burst = 0;
      for (let i = 0; i < d.length; i++) {
        if (burst <= 0 && Math.random() < 1.5 / sr) burst = sr * (0.05 + Math.random() * 0.25);
        const rate = burst > 0 ? 60 : 6;
        if (burst > 0) burst--;
        if (Math.random() < rate / sr) env = Math.max(env, 0.2 + Math.random() * 0.8);
        env *= decay;
        d[i] = d[i] * 0.7 + (Math.random() * 2 - 1) * env;
      }
    },
  };

  function buffer(ac, kind) {
    if (!buffers[kind]) buffers[kind] = makeLoop(ac, fills[kind]);
    return buffers[kind];
  }

  function source(ac, kind) {
    const src = ac.createBufferSource();
    src.buffer = buffer(ac, kind);
    src.loop = true;
    return src;
  }

  function filter(ac, type, frequency, Q = 0.7) {
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  }

  function lfo(ac, rate, depth, target) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = rate;
    g.gain.value = depth;
    osc.connect(g).connect(target);
    return osc;
  }

  function trim(ac, value) {
    const g = ac.createGain();
    g.gain.value = value;
    return g;
  }

  // Setiap builder menyambungkan node ke `out` dan mengembalikan node yang perlu di-start/stop.
  // Nilai trim disetel (diukur bersama limiter di bawah) supaya tiap suara di volume
  // default (50%) punya level ~-15 dBFS: jelas terdengar, tapi tidak lebih keras dari musik.
  const builders = {
    rain(ac, out) {
      const src = source(ac, 'rain');
      src.connect(filter(ac, 'highpass', 400)).connect(filter(ac, 'lowpass', 7000)).connect(trim(ac, 2.4)).connect(out);
      return [src];
    },
    fire(ac, out) {
      const src = source(ac, 'fire');
      src.connect(filter(ac, 'lowpass', 3200)).connect(trim(ac, 1.9)).connect(out);
      return [src];
    },
    waves(ac, out) {
      const src = source(ac, 'pink');
      const amp = trim(ac, 0.5);
      const swell = lfo(ac, 0.09, 0.45, amp.gain);
      src.connect(filter(ac, 'lowpass', 1100)).connect(amp).connect(trim(ac, 2.6)).connect(out);
      return [src, swell];
    },
    wind(ac, out) {
      const src = source(ac, 'pink');
      const band = filter(ac, 'bandpass', 500, 0.9);
      const amp = trim(ac, 0.6);
      const sweep = lfo(ac, 0.05, 280, band.frequency);
      const gust = lfo(ac, 0.13, 0.35, amp.gain);
      src.connect(band).connect(amp).connect(trim(ac, 4.6)).connect(out);
      return [src, sweep, gust];
    },
    white(ac, out) {
      const src = source(ac, 'white');
      src.connect(filter(ac, 'lowpass', 9000)).connect(trim(ac, 0.6)).connect(out);
      return [src];
    },
    brown(ac, out) {
      const src = source(ac, 'brown');
      src.connect(trim(ac, 1.5)).connect(out);
      return [src];
    },
  };

  function ensureMaster(ac) {
    if (!master) {
      master = ac.createGain();
      master.gain.value = masterVolume;
      // Limiter: mencegah suara pecah kalau beberapa ambient dinyalakan bersamaan.
      const limiter = ac.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.25;
      master.connect(limiter).connect(ac.destination);
    }
    return master;
  }

  function start(id, volume) {
    if (active[id]) return;
    const ac = AudioEngine.getCtx();
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(ensureMaster(ac));
    const sources = builders[id](ac, out);
    sources.forEach((n) => n.start());
    out.gain.setTargetAtTime(volume, ac.currentTime, 0.4); // fade in
    active[id] = { out, sources };
  }

  function stop(id) {
    const a = active[id];
    if (!a) return;
    const ac = AudioEngine.getCtx();
    a.out.gain.setTargetAtTime(0, ac.currentTime, 0.2); // fade out
    setTimeout(() => {
      a.sources.forEach((n) => n.stop());
      a.out.disconnect();
    }, 1200);
    delete active[id];
  }

  function setVolume(id, volume) {
    const a = active[id];
    if (a) a.out.gain.setTargetAtTime(volume, AudioEngine.getCtx().currentTime, 0.05);
  }

  function setMaster(volume) {
    masterVolume = volume;
    if (master) master.gain.setTargetAtTime(volume, AudioEngine.getCtx().currentTime, 0.05);
  }

  const isPlaying = (id) => Boolean(active[id]);
  const anyPlaying = () => Object.keys(active).length > 0;

  return { SOUNDS, start, stop, setVolume, setMaster, isPlaying, anyPlaying };
})();
