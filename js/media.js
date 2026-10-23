// Background, efek partikel, dan music player.

// ---------------------------------------------------------------- Background

const Background = (() => {
  // `light: true` = background terang, jadi teks otomatis dibuat gelap.
  const PRESETS = [
    { id: 'midnight', name: 'Midnight', css: 'radial-gradient(ellipse at 20% 10%, #2b3a67 0%, #0f1229 55%, #05060f 100%)' },
    { id: 'senja', name: 'Senja', css: 'linear-gradient(165deg, #2d1b4e 0%, #7b3f72 40%, #e0726a 75%, #f6b682 100%)' },
    { id: 'aurora', name: 'Aurora', css: 'linear-gradient(-45deg, #1a1440, #3b2667, #0f5e6e, #2a8c82, #1a1440)', animated: true },
    { id: 'ocean', name: 'Laut', css: 'linear-gradient(180deg, #0b2a4a 0%, #145d7e 50%, #3fa7b5 100%)' },
    { id: 'forest', name: 'Hutan', css: 'linear-gradient(180deg, #0d1b16 0%, #1e3a2f 60%, #2f5446 100%)' },
    { id: 'mocha', name: 'Mocha', css: 'linear-gradient(160deg, #3b2a24 0%, #6b4a3a 55%, #a47e64 100%)' },
    { id: 'lavender', name: 'Lavender', css: 'linear-gradient(140deg, #f3e7ff 0%, #d9c8ff 45%, #b8d4ff 100%)', light: true },
    { id: 'peach', name: 'Peach', css: 'linear-gradient(150deg, #ffe8d6 0%, #ffcdb2 50%, #e5989b 100%)', light: true },
    { id: 'sakura', name: 'Sakura', css: 'radial-gradient(circle at 30% 20%, #fff0f5 0%, #ffd1dc 45%, #f4a6b8 100%)', light: true },
    { id: 'matcha', name: 'Matcha', css: 'linear-gradient(160deg, #eef5e2 0%, #c4dbb0 50%, #8db287 100%)', light: true },
  ];

  // Foto bawaan di folder backgrounds/ (thumbnail kecil di backgrounds/thumbs/ untuk pilihan di panel).
  // `css` = warna rata-rata foto, tampil selama fotonya belum selesai dimuat.
  const WALLPAPERS = [
    { id: 'wp-gunung-salju', name: 'Salju', css: '#162d47' },
    { id: 'wp-tebing', name: 'Tebing', css: '#6d7778' },
    { id: 'wp-lembah-kabut', name: 'Kabut', css: '#858981' },
    { id: 'wp-pulau', name: 'Pulau', css: '#388c9a' },
    { id: 'wp-orbit', name: 'Orbit', css: '#444c4b' },
    { id: 'wp-kosmos', name: 'Kosmos', css: '#132d3e' },
    { id: 'wp-tinta', name: 'Tinta', css: '#3d4761' },
    { id: 'wp-ungu', name: 'Ungu', css: '#361758' },
  ].map((w) => {
    const file = w.id.slice(3) + '.jpg';
    return { ...w, img: 'backgrounds/' + file, thumb: 'backgrounds/thumbs/' + file };
  });
  const ALL = [...PRESETS, ...WALLPAPERS];

  const layer = $('#bg-layer');
  const video = $('#bg-video');
  const dim = $('#bg-dim');
  let objectUrl = null;
  let isLight = false;
  let applyId = 0;

  const isVideoUrl = (url) => /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url);

  function clear() {
    layer.removeAttribute('style');
    layer.classList.remove('bg-animated');
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function showImage(url) {
    layer.style.backgroundImage = `url(${JSON.stringify(url)})`;
    layer.style.backgroundSize = 'cover';
    layer.style.backgroundPosition = 'center';
  }

  function showVideo(url) {
    video.src = url;
    video.hidden = false;
    video.play().catch(() => {});
  }

  async function apply(s) {
    const id = ++applyId;
    clear();
    isLight = false;
    if (s.bgType === 'upload') {
      let blob = null;
      try { blob = await DB.get('bg'); } catch { /* IndexedDB tidak tersedia */ }
      if (id !== applyId) return; // sudah diganti background lain
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        if (blob.type.startsWith('video/')) showVideo(objectUrl);
        else showImage(objectUrl);
      } else {
        toast('Background yang di-upload tidak ditemukan, kembali ke preset.');
        applyPreset(PRESETS[0]);
      }
    } else if (s.bgType === 'url' && s.bgUrl) {
      if (isVideoUrl(s.bgUrl)) showVideo(s.bgUrl);
      else showImage(s.bgUrl);
    } else {
      applyPreset(ALL.find((p) => p.id === s.bg) || PRESETS[0]);
    }
    applyLook(s);
  }

  function applyPreset(p) {
    layer.style.background = p.css;
    if (p.img) showImage(p.img);
    if (p.animated) layer.classList.add('bg-animated');
    isLight = Boolean(p.light);
  }

  function applyLook(s) {
    dim.style.background = `rgba(0, 0, 0, ${s.dim})`;
    document.documentElement.style.setProperty('--bg-blur', s.blur + 'px');
    const dark = s.ink === 'dark' || (s.ink === 'auto' && isLight && s.dim < 0.35);
    document.body.classList.toggle('ink-dark', dark);
  }

  return { PRESETS, WALLPAPERS, apply, applyLook };
})();

// ---------------------------------------------------------------- Partikel (hujan, salju, kunang-kunang)

const Particles = (() => {
  const canvas = $('#particles');
  const ctx = canvas.getContext('2d');
  let kind = 'none';
  let parts = [];
  let raf = null;
  let w = 0;
  let h = 0;

  const rand = (a, b) => a + Math.random() * (b - a);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const kinds = {
    rain: {
      density: 0.00022,
      spawn: (initial) => ({ x: rand(-100, w), y: initial ? rand(-h, h) : rand(-60, -10), len: rand(12, 26), speed: rand(9, 16), alpha: rand(0.12, 0.4) }),
      step(p) {
        p.y += p.speed;
        p.x += p.speed * 0.18;
        ctx.strokeStyle = `rgba(220, 230, 255, ${p.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.len * 0.18, p.y + p.len);
        ctx.stroke();
        return p.y < h + 30;
      },
    },
    snow: {
      density: 0.00012,
      spawn: (initial) => ({ x: rand(0, w), y: initial ? rand(-h, h) : -10, r: rand(1, 3.2), speed: rand(0.3, 1.1), phase: rand(0, Math.PI * 2), alpha: rand(0.4, 0.9) }),
      step(p) {
        p.y += p.speed;
        p.phase += 0.01;
        p.x += Math.sin(p.phase) * 0.4;
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        return p.y < h + 10;
      },
    },
    fireflies: {
      density: 0.00004,
      spawn: () => ({ x: rand(0, w), y: rand(h * 0.2, h), r: rand(1.2, 2.6), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), phase: rand(0, Math.PI * 2) }),
      step(p) {
        p.phase += 0.02;
        p.vx = clamp(p.vx + rand(-0.03, 0.03), -0.5, 0.5);
        p.vy = clamp(p.vy + rand(-0.03, 0.03), -0.5, 0.5);
        p.x = (p.x + p.vx + w) % w;
        p.y = (p.y + p.vy + h) % h;
        const glow = 0.35 + 0.65 * Math.abs(Math.sin(p.phase));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, `rgba(255, 236, 150, ${glow})`);
        g.addColorStop(1, 'rgba(255, 236, 150, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
        return true;
      },
    },
  };

  function frame() {
    ctx.clearRect(0, 0, w, h);
    const k = kinds[kind];
    parts = parts.map((p) => (k.step(p) ? p : k.spawn(false)));
    raf = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function startLoop() {
    if (!raf && kind !== 'none' && !document.hidden) raf = requestAnimationFrame(frame);
  }

  function set(next) {
    kind = kinds[next] ? next : 'none';
    stopLoop();
    ctx.clearRect(0, 0, w, h);
    if (kind === 'none') { parts = []; return; }
    const k = kinds[kind];
    const count = Math.round(clamp(w * h * k.density, 15, 400));
    parts = Array.from({ length: count }, () => k.spawn(true));
    startLoop();
  }

  resize();
  window.addEventListener('resize', () => { resize(); if (kind !== 'none') set(kind); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));

  return { set };
})();

// ---------------------------------------------------------------- Music player

const Music = (() => {
  // Stasiun live Lofi Girl (dicek Oktober 2026). ID live stream kadang diganti channel-nya;
  // kalau ada yang mati, ambil ID baru dari youtube.com/@LofiGirl/streams.
  const YT_PRESETS = [
    { id: 'rFZHOHl-L8A', name: 'Lofi hip hop radio', sub: 'beats to relax/study to' },
    { id: '4xDzrJKXOOY', name: 'Synthwave radio', sub: 'beats to chill/game to' },
    { id: '3PFJ9SETS4M', name: 'Lofi house radio', sub: 'lounge music to vibe/chill to' },
    { id: 'nI725iVsyoQ', name: 'Deep sleep music', sub: 'calm ambient to sleep & dream to' },
  ];

  let onChange = () => {};
  let volume = 60;

  // ---- YouTube (IFrame API)
  let yt = null;
  let ytApi = null;
  let ytPlaying = false;

  function parseYouTube(input) {
    const value = input.trim();
    if (/^[\w-]{11}$/.test(value)) return { id: value };
    let u;
    try { u = new URL(value); } catch { return null; }
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) return null;
    const list = u.searchParams.get('list');
    let id = u.searchParams.get('v');
    if (!id && u.hostname.endsWith('youtu.be')) id = u.pathname.slice(1, 12);
    if (!id) {
      const m = u.pathname.match(/\/(embed|live|shorts)\/([\w-]{11})/);
      if (m) id = m[2];
    }
    if (!id && !list) return null;
    return { id, list };
  }

  function loadApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!ytApi) {
      ytApi = new Promise((resolve, reject) => {
        window.onYouTubeIframeAPIReady = resolve;
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.onerror = () => { ytApi = null; reject(new Error('api')); };
        document.head.append(s);
      });
    }
    return ytApi;
  }

  async function playYouTube(target) {
    try {
      await loadApi();
    } catch {
      toast('Player YouTube gagal dimuat. Cek koneksi internet.');
      return;
    }
    pauseLocal();
    $('.yt-frame').classList.add('has-player');
    if (!yt) {
      const vars = { autoplay: 1, playsinline: 1, rel: 0 };
      if (target.list) Object.assign(vars, { listType: 'playlist', list: target.list });
      yt = new YT.Player('yt-player', {
        width: '100%',
        height: '100%',
        videoId: target.id || undefined,
        playerVars: vars,
        events: {
          onReady: (e) => { e.target.setVolume(volume); e.target.playVideo(); },
          onStateChange: (e) => {
            ytPlaying = e.data === YT.PlayerState.PLAYING;
            if (ytPlaying) pauseLocal();
            onChange();
          },
          onError: () => toast('Video ini tidak bisa diputar. Coba link lain.'),
        },
      });
    } else if (target.list) {
      yt.loadPlaylist({ list: target.list, listType: 'playlist' });
    } else {
      yt.loadVideoById(target.id);
    }
  }

  function pauseYT() {
    if (yt && ytPlaying && yt.pauseVideo) yt.pauseVideo();
  }

  // ---- File lokal
  const audio = new Audio();
  const tracks = [];
  let index = -1;

  function addFiles(files) {
    const first = tracks.length;
    for (const f of files) {
      if (!f.type.startsWith('audio/')) continue;
      tracks.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
    }
    renderTracks();
    if (tracks.length > first && audio.paused) playTrack(first);
  }

  function playTrack(i) {
    if (!tracks.length) return;
    index = (i + tracks.length) % tracks.length;
    audio.src = tracks[index].url;
    audio.volume = volume / 100;
    audio.play().catch(() => {});
    renderTracks();
  }

  function toggleLocal() {
    if (!tracks.length) return;
    if (index < 0) return playTrack(0);
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function pauseLocal() {
    if (!audio.paused) audio.pause();
  }

  function renderTracks() {
    $('#tracklist').innerHTML = tracks.map((t, i) =>
      `<li class="${i === index ? 'current' : ''}" data-i="${i}">${escapeHtml(t.name)}</li>`).join('');
  }

  function syncPlayButton() {
    $('#lp-play').innerHTML = icon(audio.paused ? 'play' : 'pause');
  }

  audio.addEventListener('ended', () => playTrack(index + 1));
  audio.addEventListener('play', () => { pauseYT(); syncPlayButton(); onChange(); });
  audio.addEventListener('pause', () => { syncPlayButton(); onChange(); });

  // ---- Jeda saat istirahat
  let resumeYT = false;
  let resumeLocal = false;

  function pauseForBreak() {
    resumeYT = ytPlaying;
    resumeLocal = !audio.paused;
    pauseYT();
    pauseLocal();
  }

  function resumeAfterBreak() {
    if (resumeYT && yt) yt.playVideo();
    if (resumeLocal) audio.play().catch(() => {});
    resumeYT = resumeLocal = false;
  }

  function setVolume(v) {
    volume = v;
    audio.volume = v / 100;
    if (yt && yt.setVolume) yt.setVolume(v);
  }

  const isPlaying = () => ytPlaying || !audio.paused;

  function init(opts) {
    onChange = opts.onChange;
    volume = opts.volume;

    if (location.protocol === 'file:') $('#yt-file-note').hidden = false;

    $('#yt-presets').innerHTML = YT_PRESETS.map((p) =>
      `<button class="yt-preset" data-id="${p.id}"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.sub)}</small></button>`).join('');
    $('#yt-presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) playYouTube({ id: b.dataset.id });
    });

    $('#yt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const target = parseYouTube($('#yt-url').value);
      if (!target) return toast('Link YouTube tidak dikenali.');
      playYouTube(target);
    });

    $('#music-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      $$('#music-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.music-pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.value; });
    });

    $('#local-files').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('#tracklist').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) playTrack(Number(li.dataset.i));
    });
    $('#lp-play').addEventListener('click', toggleLocal);
    $('#lp-prev').addEventListener('click', () => playTrack(index - 1));
    $('#lp-next').addEventListener('click', () => playTrack(index + 1));
  }

  return { init, setVolume, isPlaying, pauseForBreak, resumeAfterBreak };
})();
