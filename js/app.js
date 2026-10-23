// Inti aplikasi: pengaturan, mesin timer, dan sambungan ke UI.

// ---------------------------------------------------------------- Pengaturan

const DEFAULTS = {
  // timer
  focus: 25, short: 5, long: 15, interval: 4, countdownMin: 10,
  autoBreak: true, autoFocus: false, pauseMusicOnBreak: false, wakeLock: true, notify: false,
  alarm: 'bell', alarmVol: 0.7,
  // tampilan jam
  clockStyle: 'digital', font: 'sans', accent: '#ffffff', clockScale: 1, digitColor: '', // '' = ikut warna teks
  // background
  bgType: 'preset', bg: 'midnight', bgUrl: '', dim: 0.1, blur: 0, particles: 'none', ink: 'auto',
  // suara
  musicVol: 60, ambientMaster: 0.8,
  ambient: Object.fromEntries(Ambient.SOUNDS.map((s) => [s.id, { on: false, vol: 0.5 }])),
};

const savedSettings = Store.get('settings', {});
const S = { ...DEFAULTS, ...savedSettings, ambient: { ...DEFAULTS.ambient, ...(savedSettings.ambient || {}) } };
const saveSettings = () => Store.set('settings', S);

const FONTS = {
  sans: ["'Inter', system-ui, sans-serif", 200],
  serif: ["'Playfair Display', Georgia, serif", 400],
  mono: ["'JetBrains Mono', ui-monospace, monospace", 300],
  hand: ["'Caveat', cursive", 600],
};
const ACCENTS = ['#ffffff', '#ffb4a2', '#c8b6ff', '#a0e7e5', '#ffd166', '#ff7b7b', '#9be29b'];
const DIGIT_COLORS = ['#ffffff', '#f4ead5', '#ffb4a2', '#c8b6ff', '#a0e7e5', '#ffd166', '#221d2e'];
const PHASE_LABEL = { focus: 'Fokus', short: 'Istirahat pendek', long: 'Istirahat panjang' };

// ---------------------------------------------------------------- Progres (riwayat & tugas)

// Satu sesi fokus Pomodoro selesai: catat ke riwayat hari ini dan ke tugas yang aktif.
function recordFocusSession(ms) {
  History.add(ms);
  Tasks.credit(ms);
  Progress.renderTopbar();
  Progress.renderTasks();
  if (openPanelName() === 'stats') Progress.renderStats();
}

// ---------------------------------------------------------------- Wake lock (layar tidak mati)

const WakeLock = {
  lock: null,
  async acquire() {
    if (!S.wakeLock || this.lock || !('wakeLock' in navigator) || document.hidden) return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => { this.lock = null; });
    } catch { /* tidak didukung / ditolak */ }
  },
  release() {
    if (this.lock) this.lock.release();
    this.lock = null;
  },
};

// ---------------------------------------------------------------- Mesin timer
// Waktu dihitung dari timestamp (endAt / swStart), bukan dari jumlah tick,
// jadi tetap akurat walau tab di-background dan setInterval diperlambat browser.

const T = {
  mode: 'pomodoro',
  phase: 'focus',
  cycle: 0,          // jumlah sesi fokus yang selesai di set ini
  running: false,
  duration: 0,       // ms
  remaining: 0,      // ms, dipakai saat timer berhenti
  endAt: 0,          // timestamp, dipakai saat timer jalan
  swStart: 0,
  swElapsed: 0,
  // Sisa waktu yang disimpan saat pindah tab, per fase Pomodoro & countdown:
  // { focus: { duration, remaining }, countdown: {...} }. Stopwatch tidak perlu,
  // karena swElapsed hanya dipakai stopwatch.
  stash: {},
};

const saveTimer = () => Store.set('timer', T);

function durationFor() {
  if (T.mode === 'pomodoro') return S[T.phase] * 60000;
  if (T.mode === 'countdown') return S.countdownMin * 60000;
  return 0;
}

function remainingNow() {
  return T.running ? Math.max(0, T.endAt - Date.now()) : T.remaining;
}

function elapsedNow() {
  return T.running ? Date.now() - T.swStart : T.swElapsed;
}

// Timer belum disentuh: aman untuk menerapkan durasi baru dari pengaturan.
function isFresh() {
  if (T.running) return false;
  return T.mode === 'stopwatch' ? T.swElapsed === 0 : (T.remaining === T.duration || T.remaining === 0);
}

function resetTimer() {
  T.running = false;
  // Hanya reset mode yang sedang tampil, jangan sentuh waktu mode lain.
  if (T.mode === 'stopwatch') T.swElapsed = 0;
  else { T.duration = durationFor(); T.remaining = T.duration; }
  WakeLock.release();
  saveTimer();
  render();
}

function startTimer() {
  if (T.running) return;
  AudioEngine.getCtx(); // buka kunci audio lewat interaksi user, supaya alarm nanti bisa bunyi
  if (T.mode === 'stopwatch') {
    T.swStart = Date.now() - T.swElapsed;
  } else {
    if (T.remaining <= 0) { T.duration = durationFor(); T.remaining = T.duration; }
    T.endAt = Date.now() + T.remaining;
  }
  T.running = true;
  if (T.mode === 'pomodoro' && T.phase === 'focus') Music.resumeAfterBreak();
  WakeLock.acquire();
  saveTimer();
  render();
}

// Hentikan timer dan bekukan waktunya, tanpa simpan/render.
function haltTimer() {
  if (!T.running) return;
  if (T.mode === 'stopwatch') T.swElapsed = Date.now() - T.swStart;
  else T.remaining = Math.max(0, T.endAt - Date.now());
  T.running = false;
  WakeLock.release();
}

function pauseTimer() {
  if (!T.running) return;
  haltTimer();
  saveTimer();
  render();
}

const toggleTimer = () => (T.running ? pauseTimer() : startTimer());

// Kunci stash untuk tampilan sekarang: fase Pomodoro, atau 'countdown'.
const stashKey = () => (T.mode === 'pomodoro' ? T.phase : T.mode);

// Simpan posisi timer sebelum pindah tab. Timer yang masih "fresh" tidak disimpan,
// supaya nanti ikut durasi terbaru dari pengaturan.
function stashTime() {
  if (T.mode === 'stopwatch') return;
  if (isFresh()) delete T.stash[stashKey()];
  else T.stash[stashKey()] = { duration: T.duration, remaining: T.remaining };
}

// Ambil lagi posisi timer untuk tab yang baru dibuka (atau durasi penuh kalau belum ada).
function loadTime() {
  if (T.mode === 'stopwatch') return;
  const saved = T.stash[stashKey()];
  delete T.stash[stashKey()];
  T.duration = saved ? saved.duration : durationFor();
  T.remaining = saved ? saved.remaining : T.duration;
}

// Pindah mode/fase tanpa reset. Timer yang sedang jalan dijeda, waktunya tetap tersimpan.
function switchView(change) {
  const wasRunning = T.running;
  const label = currentLabel();
  haltTimer();
  stashTime();
  change();
  loadTime();
  saveTimer();
  render();
  if (wasRunning) toast(`${label} dijeda. Waktunya tetap tersimpan.`);
}

function setPhase(phase) {
  T.phase = phase;
  loadTime();
}

// Pindah ke fase Pomodoro berikutnya (fokus -> istirahat -> fokus ...).
function advancePhase() {
  if (T.phase === 'focus') {
    T.cycle += 1;
    setPhase(T.cycle >= S.interval ? 'long' : 'short');
  } else {
    if (T.phase === 'long') T.cycle = 0;
    setPhase('focus');
  }
}

// natural = waktunya habis sendiri (bukan di-skip).
function completePhase(natural) {
  const finished = T.phase;
  T.running = false;

  if (natural) {
    Alarm.play(S.alarm, S.alarmVol);
    if (T.mode === 'pomodoro' && finished === 'focus') recordFocusSession(T.duration);
  }

  if (T.mode === 'countdown') {
    T.remaining = 0;
    if (natural) notify('Waktu habis ⏰', `Countdown ${S.countdownMin} menit selesai.`);
    WakeLock.release();
    saveTimer();
    render();
    return;
  }

  advancePhase();
  if (natural) {
    if (T.phase === 'focus') notify('Istirahat selesai', 'Yuk lanjut fokus lagi!');
    else notify('Sesi fokus selesai 🎉', `Waktunya ${PHASE_LABEL[T.phase].toLowerCase()} ${S[T.phase]} menit.`);
  }
  if (T.phase !== 'focus' && S.pauseMusicOnBreak) Music.pauseForBreak();

  const auto = T.phase === 'focus' ? S.autoFocus : S.autoBreak;
  if (auto) startTimer();
  else { WakeLock.release(); saveTimer(); render(); }
}

function skipPhase() {
  if (T.mode === 'pomodoro') completePhase(false);
}

function setMode(mode) {
  if (mode === T.mode) return;
  switchView(() => { T.mode = mode; });
}

function notify(title, body) {
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden && document.hasFocus()) return; // user sedang melihat layar
  try { new Notification(title, { body, silent: true }); } catch { /* abaikan */ }
}

function tick() {
  if (T.running && T.mode !== 'stopwatch' && Date.now() >= T.endAt) completePhase(true);
  else if (T.running) render();
}

// ---------------------------------------------------------------- Render

function fmt(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function currentLabel() {
  if (T.mode === 'pomodoro') return PHASE_LABEL[T.phase];
  return T.mode === 'countdown' ? 'Countdown' : 'Stopwatch';
}

function render() {
  let text;
  let fill;
  if (T.mode === 'stopwatch') {
    const el = elapsedNow();
    text = fmt(el);
    fill = (el % 60000) / 60000;
  } else {
    const rem = remainingNow();
    text = fmt(Math.ceil(rem / 1000) * 1000);
    fill = T.duration ? rem / T.duration : 0;
  }
  const label = currentLabel();
  Clock.render({ text, fill, label });

  document.title = T.running || !isFresh() ? `${text} · ${label}` : 'Study Timer';

  // tombol mulai
  let startText = 'Mulai';
  if (T.running) startText = 'Jeda';
  else if (T.mode !== 'stopwatch' && T.remaining === 0) startText = 'Ulang';
  else if (!isFresh()) startText = 'Lanjut';
  $('#start-label').textContent = startText;
  $('#start-icon').innerHTML = ICONS[T.running ? 'pause' : 'play'];
  $('#btn-start').classList.toggle('is-running', T.running);

  const task = T.mode === 'pomodoro' && Tasks.active();
  MiniTimer.update({ text, fill, label, task: task ? task.title : '', running: T.running, startText, canSkip: T.mode === 'pomodoro' });

  renderModeUi();
}

function renderModeUi() {
  $$('.modes [data-mode]').forEach((b) => {
    const on = b.dataset.mode === T.mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  document.body.dataset.mode = T.mode;
  document.body.dataset.phase = T.mode === 'pomodoro' ? T.phase : '';
  $$('#phases [data-phase]').forEach((b) => b.classList.toggle('active', b.dataset.phase === T.phase));
  $$('#cd-chips [data-min]').forEach((b) => b.classList.toggle('active', Number(b.dataset.min) === S.countdownMin));

  const dots = $('#dots');
  dots.innerHTML = T.mode === 'pomodoro'
    ? Array.from({ length: S.interval }, (_, i) => `<i class="${i < T.cycle ? 'done' : ''}"></i>`).join('')
    : '';
  dots.setAttribute('aria-label', T.mode === 'pomodoro' ? `${T.cycle} dari ${S.interval} sesi selesai` : '');
}

// ---------------------------------------------------------------- Terapkan pengaturan

function applyClockLook() {
  const [family, weight] = FONTS[S.font] || FONTS.sans;
  const root = document.documentElement.style;
  root.setProperty('--clock-font', family);
  root.setProperty('--clock-weight', weight);
  root.setProperty('--accent', S.accent);
  root.setProperty('--clock-scale', S.clockScale);
  if (S.digitColor) root.setProperty('--digit', S.digitColor);
  else root.removeProperty('--digit');
  $$('#style-grid [data-style]').forEach((b) => b.classList.toggle('active', b.dataset.style === S.clockStyle));
  $$('#accent-swatches [data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color.toLowerCase() === S.accent.toLowerCase()));
  $$('#digit-swatches [data-digit]').forEach((b) => b.classList.toggle('active', b.dataset.digit.toLowerCase() === S.digitColor.toLowerCase()));
}

function applySetting(key) {
  switch (key) {
    case 'focus': case 'short': case 'long': case 'countdownMin':
      if (isFresh()) { T.duration = durationFor(); T.remaining = T.duration; saveTimer(); }
      render();
      break;
    case 'interval':
      render();
      break;
    case 'clockStyle':
      Clock.setStyle(S.clockStyle);
      applyClockLook();
      render();
      break;
    case 'font': case 'accent': case 'clockScale': case 'digitColor':
      applyClockLook();
      break;
    case 'bg': case 'bgType': case 'bgUrl':
      Background.apply(S);
      renderBgActive();
      break;
    case 'dim': case 'blur': case 'ink':
      Background.applyLook(S);
      break;
    case 'particles':
      Particles.set(S.particles);
      break;
    case 'musicVol':
      Music.setVolume(S.musicVol);
      break;
    case 'ambientMaster':
      Ambient.setMaster(S.ambientMaster);
      break;
    case 'wakeLock':
      if (S.wakeLock && T.running) WakeLock.acquire();
      else WakeLock.release();
      break;
    case 'notify':
      if (S.notify) requestNotifications();
      break;
    default:
      break;
  }
}

function updateSettings(changes) {
  Object.assign(S, changes);
  saveSettings();
  Object.keys(changes).forEach(applySetting);
  syncControls();
}

async function requestNotifications() {
  if (!('Notification' in window)) {
    toast('Browser ini tidak mendukung notifikasi.');
    return updateSettings({ notify: false });
  }
  if (Notification.permission === 'granted') return;
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    toast('Izin notifikasi ditolak. Bisa diubah di pengaturan situs browser.');
    updateSettings({ notify: false });
  }
}

// Semua elemen dengan data-setting otomatis tersambung ke S[key].
function bindSettingControls() {
  $$('[data-setting]').forEach((el) => {
    const key = el.dataset.setting;
    if (el.classList.contains('seg')) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (b) updateSettings({ [key]: b.dataset.value });
      });
      return;
    }
    const live = el.type === 'range' || el.type === 'color';
    el.addEventListener(live ? 'input' : 'change', () => {
      let v = el.value;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'range') v = Number(v);
      else if (el.type === 'number') {
        v = clamp(Math.round(Number(v) || 0), Number(el.min) || 1, Number(el.max) || 600);
        el.value = v;
      }
      updateSettings({ [key]: v });
    });
  });
}

function syncControls() {
  $$('[data-setting]').forEach((el) => {
    const v = S[el.dataset.setting];
    if (el.classList.contains('seg')) {
      $$('button[data-value]', el).forEach((b) => b.classList.toggle('active', b.dataset.value === String(v)));
    } else if (el.type === 'checkbox') {
      el.checked = Boolean(v);
    } else if (document.activeElement !== el) {
      el.value = v;
    }
  });
}

// ---------------------------------------------------------------- Panel & tampilan

function openPanel(name) {
  if (name === 'stats') Progress.renderStats(); // tanggal bisa sudah berganti sejak terakhir dibuka
  $$('.panel').forEach((p) => p.classList.toggle('open', p.dataset.name === name));
  $$('.dock-btn[data-panel]').forEach((b) => b.setAttribute('aria-expanded', b.dataset.panel === name));
  document.body.classList.toggle('panel-open', Boolean(name));
}

function closePanels() {
  openPanel(null);
}

const openPanelName = () => ($('.panel.open') || {}).dataset?.name || null;

function toggleFocusMode(force) {
  const on = document.body.classList.toggle('focus-mode', force);
  closePanels();
  if (on) toast('Mode fokus. Tekan H / Esc untuk keluar.');
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Layar penuh tidak didukung di sini.'));
}

function buildPanels() {
  // Background presets
  $('#bg-presets').innerHTML = Background.PRESETS.map((p) =>
    `<button class="bg-swatch" data-bg="${p.id}" style="background:${p.css}"><span>${p.name}</span></button>`).join('');
  $('#bg-wallpapers').innerHTML = Background.WALLPAPERS.map((p) =>
    `<button class="bg-swatch" data-bg="${p.id}" style="background:${p.css}"><img src="${p.thumb}" alt="" loading="lazy"><span>${p.name}</span></button>`).join('');
  $$('#bg-presets, #bg-wallpapers').forEach((grid) => grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bg]');
    if (b) updateSettings({ bgType: 'preset', bg: b.dataset.bg });
  }));

  $('#bg-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) return toast('File harus berupa gambar atau video.');
    try {
      await DB.put('bg', file);
      // Paksa apply ulang walau bgType sudah 'upload'.
      S.bgType = 'upload';
      saveSettings();
      Background.apply(S);
      syncControls();
      renderBgActive();
    } catch {
      toast('Gagal menyimpan file. Mungkin ukurannya terlalu besar.');
    }
  });

  $('#bg-url-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('#bg-url').value.trim();
    if (!/^https?:\/\//i.test(url)) return toast('Link harus diawali http:// atau https://');
    updateSettings({ bgType: 'url', bgUrl: url });
  });

  // Gaya jam
  $('#style-grid').innerHTML = Clock.STYLES.map((s) =>
    `<button class="style-card" data-style="${s.id}"><span class="pv">${s.preview}</span><span>${s.name}</span></button>`).join('');
  $('#style-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (b) updateSettings({ clockStyle: b.dataset.style });
  });

  $('#accent-swatches').insertAdjacentHTML('afterbegin', ACCENTS.map((c) =>
    `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="Warna ${c}"></button>`).join(''));
  $('#accent-swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) updateSettings({ accent: b.dataset.color });
  });

  $('#digit-swatches').insertAdjacentHTML('afterbegin',
    '<button class="swatch swatch--auto" data-digit="" title="Otomatis (ikut warna teks)" aria-label="Warna angka otomatis"></button>' +
    DIGIT_COLORS.map((c) => `<button class="swatch" data-digit="${c}" style="background:${c}" aria-label="Warna angka ${c}"></button>`).join(''));
  $('#digit-swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-digit]');
    if (b) updateSettings({ digitColor: b.dataset.digit });
  });

  // Alarm
  $('#alarm-select').innerHTML = Object.entries(Alarm.SOUNDS).map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  $('#alarm-test').addEventListener('click', () => Alarm.play(S.alarm, S.alarmVol));

  $('#pomo-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const [focus, short, long] = b.dataset.preset.split(',').map(Number);
    updateSettings({ focus, short, long });
  });

  $('#reset-settings').addEventListener('click', () => {
    if (!confirm('Kembalikan semua pengaturan ke awal?')) return;
    Store.remove('settings');
    Store.remove('timer');
    location.reload();
  });

  buildAmbientPanel();
}

function renderBgActive() {
  $$('.bg-grid [data-bg]').forEach((b) => b.classList.toggle('active', S.bgType === 'preset' && b.dataset.bg === S.bg));
}

// ---------------------------------------------------------------- Ambient

function buildAmbientPanel() {
  $('#amb-list').innerHTML = Ambient.SOUNDS.map((s) => `
    <div class="amb-row" data-id="${s.id}">
      <button class="amb-toggle" aria-pressed="false">${icon(s.icon)}<span>${s.name}</span></button>
      <input type="range" min="0" max="1" step="0.01" value="${S.ambient[s.id].vol}" aria-label="Volume ${s.name}">
    </div>`).join('');

  $('#amb-list').addEventListener('click', (e) => {
    const b = e.target.closest('.amb-toggle');
    if (!b) return;
    // Pakai status bunyi sebenarnya, bukan S.ambient[id].on: setelah reload tombol bisa
    // menyala (tersimpan ON) padahal suaranya belum jalan karena belum ada klik.
    const id = b.closest('[data-id]').dataset.id;
    setAmbient(id, !Ambient.isPlaying(id));
  });
  $('#amb-list').addEventListener('input', (e) => {
    const id = e.target.closest('[data-id]').dataset.id;
    S.ambient[id].vol = Number(e.target.value);
    Ambient.setVolume(id, S.ambient[id].vol);
    saveSettings();
  });
  $('#amb-off').addEventListener('click', () => Ambient.SOUNDS.forEach((s) => setAmbient(s.id, false)));
}

function setAmbient(id, on) {
  S.ambient[id].on = on;
  if (on) Ambient.start(id, S.ambient[id].vol);
  else Ambient.stop(id);
  saveSettings();
  renderAmbient();
}

function renderAmbient() {
  $$('#amb-list [data-id]').forEach((row) => {
    const on = S.ambient[row.dataset.id].on;
    row.classList.toggle('on', on);
    $('.amb-toggle', row).setAttribute('aria-pressed', on);
  });
  $('#ambient-dot').classList.toggle('on', Ambient.SOUNDS.some((s) => S.ambient[s.id].on));
}

// Browser melarang audio sebelum ada interaksi, jadi ambient yang tersimpan
// baru dinyalakan setelah klik/tombol pertama.
function resumeAmbientOnGesture() {
  const pending = Ambient.SOUNDS.filter((s) => S.ambient[s.id].on);
  if (!pending.length) return;
  toast('Klik di mana saja untuk melanjutkan suara ambient.');
  // Pakai 'click' (bukan 'pointerdown') supaya jalan SETELAH handler tombol ambient,
  // jadi klik pertama di tombol Hujan tidak langsung mematikan hujan yang baru dinyalakan.
  const go = () => {
    pending.forEach((s) => { if (S.ambient[s.id].on) Ambient.start(s.id, S.ambient[s.id].vol); });
    window.removeEventListener('click', go);
    window.removeEventListener('keydown', go);
  };
  window.addEventListener('click', go);
  window.addEventListener('keydown', go);
}

// ---------------------------------------------------------------- Event

function bindEvents() {
  $('.modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  $('#phases').addEventListener('click', (e) => {
    const b = e.target.closest('[data-phase]');
    if (!b || b.dataset.phase === T.phase) return;
    switchView(() => { T.phase = b.dataset.phase; });
  });

  $('#cd-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-min]');
    if (!b) return;
    S.countdownMin = Number(b.dataset.min);
    saveSettings();
    syncControls();
    resetTimer();
  });

  $('#btn-start').addEventListener('click', toggleTimer);
  $('#btn-reset').addEventListener('click', resetTimer);
  $('#btn-skip').addEventListener('click', skipPhase);

  $$('.dock-btn[data-panel]').forEach((b) => b.addEventListener('click', () => {
    openPanel(openPanelName() === b.dataset.panel ? null : b.dataset.panel);
  }));
  $$('.panel-close').forEach((b) => b.addEventListener('click', closePanels));
  $('#btn-focus').addEventListener('click', () => toggleFocusMode(true));
  $('#focus-exit').addEventListener('click', () => toggleFocusMode(false));
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-pip').hidden = !('documentPictureInPicture' in window); // tidak ada di Firefox, Safari, & HP
  $('#btn-pip').addEventListener('click', MiniTimer.toggle);
  $('#today').addEventListener('click', () => openPanel(openPanelName() === 'stats' ? null : 'stats'));
  $('#task-chip').addEventListener('click', () => {
    openPanel('tasks');
    if (!Tasks.all().length) $('#task-input').focus();
  });

  // Klik di luar panel menutup panel.
  document.addEventListener('pointerdown', (e) => {
    if (openPanelName() && !e.target.closest('.panel, .dock, #today, #task-chip')) closePanels();
  });

  // Klik mouse jangan meninggalkan fokus di tombol, supaya Space tidak menekan tombol itu lagi.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });

  // Mode fokus: tombol "keluar" muncul sebentar saat mouse bergerak.
  let exitTimer = null;
  document.addEventListener('mousemove', () => {
    if (!document.body.classList.contains('focus-mode')) return;
    document.body.classList.add('show-exit');
    clearTimeout(exitTimer);
    exitTimer = setTimeout(() => document.body.classList.remove('show-exit'), 2000);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    switch (e.key) {
      case ' ':
        if (e.target.closest('button')) return; // biarkan tombol yang difokus keyboard bekerja
        e.preventDefault();
        toggleTimer();
        break;
      case 'r': case 'R': resetTimer(); break;
      case 's': case 'S': skipPhase(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'h': case 'H': toggleFocusMode(); break;
      case 'p': case 'P': MiniTimer.toggle(); break;
      case 'Escape':
        if (openPanelName()) closePanels();
        else if (document.body.classList.contains('focus-mode')) toggleFocusMode(false);
        break;
      default: break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && T.running) { WakeLock.acquire(); tick(); }
  });
}

// ---------------------------------------------------------------- Install sebagai aplikasi (PWA)

let installPrompt = null; // dikirim Chrome/Edge saat aplikasi memenuhi syarat untuk di-install

function renderInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  let note;
  if (standalone) note = 'Kamu sedang memakai versi aplikasi. Tetap bisa dibuka walau offline atau start.bat tidak jalan.';
  else if (installPrompt) note = 'Pasang Study Timer seperti aplikasi biasa: muncul di Start Menu, terbuka di jendela sendiri, dan tetap jalan offline.';
  else if (location.protocol === 'file:') note = 'Untuk install, buka lewat <b>start.bat</b> (http://localhost:5500), bukan dengan membuka file langsung.';
  else note = 'Sudah ter-install, atau browser ini belum mendukung install. Di Chrome/Edge bisa juga lewat ikon install di address bar.';
  $('#install-note').innerHTML = note;
  $('#btn-install').hidden = !installPrompt || standalone;
}

function setupPwa() {
  // Service worker hanya jalan lewat http(s), bukan file://.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* tanpa SW aplikasi tetap jalan, hanya tidak offline */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderInstall();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    renderInstall();
    toast('Study Timer ter-install. Cari di Start Menu atau taskbar.');
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderInstall();
  });
  renderInstall();
}

// ---------------------------------------------------------------- Mulai

function restoreTimer() {
  const saved = Store.get('timer', null);
  if (saved) Object.assign(T, saved);
  if (!T.duration && T.mode !== 'stopwatch') { T.duration = durationFor(); T.remaining = T.duration; }

  // Timer selesai saat halaman tertutup: majukan fase tanpa alarm & tanpa auto-start.
  if (T.running && T.mode !== 'stopwatch' && Date.now() >= T.endAt) {
    T.running = false;
    if (T.mode === 'pomodoro') advancePhase();
    else T.remaining = 0;
    saveTimer();
  }
  if (T.running) WakeLock.acquire();
}

function init() {
  mountIcons();
  buildPanels();
  bindSettingControls();
  bindEvents();
  Progress.bind({ onTasksChange: render });
  MiniTimer.init({
    toggle: toggleTimer,
    reset: resetTimer,
    skip: skipPhase,
    tick,
    change() {
      $('#btn-pip').classList.toggle('is-on', MiniTimer.isOpen());
      render();
    },
  });

  Music.init({
    volume: S.musicVol,
    onChange: () => $('#music-dot').classList.toggle('on', Music.isPlaying()),
  });
  Ambient.setMaster(S.ambientMaster);

  Background.apply(S);
  Particles.set(S.particles);
  Clock.setStyle(S.clockStyle);
  applyClockLook();

  restoreTimer();
  syncControls();
  renderAmbient();
  renderBgActive();
  Progress.renderTopbar();
  Progress.renderTasks();
  render();
  resumeAmbientOnGesture();
  setupPwa();

  setInterval(tick, 200);
  setInterval(() => Progress.renderTopbar(), 60000); // ganti hari tengah malam
}

init();
