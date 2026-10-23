// Jendela mini mengambang (Document Picture-in-Picture): timer kecil yang selalu
// tampil di atas aplikasi lain. Hanya ada di Chrome/Edge versi baru.

const MiniTimer = (() => {
  let win = null;
  let handlers = {};

  const supported = () => 'documentPictureInPicture' in window;

  const CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3.5vh;
      padding: 10px 14px; overflow: hidden; user-select: none;
      background: radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--accent) 16%, #1d1a29), #121019);
      color: #f3f0fa; font-family: 'Inter', system-ui, sans-serif;
    }
    button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; }
    .label { font-size: clamp(10px, 6vh, 13px); font-weight: 500; letter-spacing: .12em; text-transform: uppercase; opacity: .65; }
    .time {
      font-family: var(--clock-font); font-weight: var(--clock-weight); font-variant-numeric: tabular-nums;
      font-size: min(24vw, 30vh); line-height: 1; letter-spacing: -.02em;
    }
    .task { max-width: 100%; line-height: 1.3; font-size: clamp(10px, 6vh, 13px); opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .task:empty { display: none; }
    .bar { width: min(100%, 360px); height: 4px; border-radius: 4px; background: rgba(255,255,255,.14); overflow: hidden; }
    .bar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); transition: width .25s linear; }
    .ctl { display: flex; gap: 8px; }
    .ctl button {
      display: grid; place-items: center; height: 34px; min-width: 34px; padding: 0 10px; border-radius: 999px;
      background: rgba(255,255,255,.12);
    }
    .ctl button:hover { background: rgba(255,255,255,.22); }
    .ctl .main { padding: 0 16px; gap: 6px; display: inline-flex; align-items: center; background: #f3f0fa; color: #16141f; font-weight: 600; font-size: 13px; }
    .ctl .main:hover { background: #fff; }
    .ic { width: 16px; height: 16px; }
    /* Jendela pendek: sembunyikan detail supaya angka tetap besar. */
    @media (max-height: 150px) { .label, .task, .bar { display: none; } }
  `;

  async function open() {
    if (win) return;
    if (!supported()) {
      toast('Jendela mini belum didukung browser ini. Pakai Chrome atau Edge versi terbaru.', 4000);
      return;
    }
    try {
      win = await documentPictureInPicture.requestWindow({ width: 320, height: 210 });
    } catch {
      toast('Gagal membuka jendela mini.');
      return;
    }
    const doc = win.document;
    const fonts = $('link[href*="fonts.googleapis.com/css2"]');
    doc.head.innerHTML = `<title>Study Timer</title>${fonts ? fonts.outerHTML : ''}<style>${CSS}</style>`;
    doc.body.innerHTML = `
      <div class="label" id="m-label"></div>
      <div class="time" id="m-time"></div>
      <div class="task" id="m-task"></div>
      <div class="bar"><i id="m-fill"></i></div>
      <div class="ctl">
        <button id="m-reset" title="Reset">${icon('reset')}</button>
        <button class="main" id="m-toggle"></button>
        <button id="m-skip" title="Lewati sesi">${icon('skip')}</button>
      </div>`;
    doc.getElementById('m-toggle').addEventListener('click', handlers.toggle);
    doc.getElementById('m-reset').addEventListener('click', handlers.reset);
    doc.getElementById('m-skip').addEventListener('click', handlers.skip);
    doc.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); handlers.toggle(); }
    });
    win.addEventListener('pagehide', () => {
      win = null;
      handlers.change();
    });
    // Saat tab utama tersembunyi, browser memperlambat timernya (bisa sampai 1x per menit).
    // Jendela mini selalu terlihat, jadi detak dari sini supaya angkanya tetap jalan.
    win.setInterval(handlers.tick, 250);
    handlers.change();
  }

  function close() {
    if (win) win.close();
  }

  // state = { text, fill, label, task, running, startText, canSkip }
  function update(state) {
    if (!win) return;
    const doc = win.document;
    // Ikut font & warna aksen pilihan user.
    doc.documentElement.style.cssText = document.documentElement.style.cssText;
    doc.getElementById('m-label').textContent = state.label;
    doc.getElementById('m-time').textContent = state.text;
    doc.getElementById('m-task').textContent = state.task;
    doc.getElementById('m-fill').style.width = `${state.fill * 100}%`;
    doc.getElementById('m-toggle').innerHTML = `${icon(state.running ? 'pause' : 'play')}<span>${state.startText}</span>`;
    doc.getElementById('m-skip').hidden = !state.canSkip;
    doc.querySelector('.ctl').style.display = state.canControl === false ? 'none' : ''; // mode Jam
  }

  return {
    init(h) { handlers = h; },
    toggle: () => (win ? close() : open()),
    update,
    isOpen: () => Boolean(win),
  };
})();
