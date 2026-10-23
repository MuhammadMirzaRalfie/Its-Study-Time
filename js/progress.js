// Progres belajar: riwayat per hari (+ streak), daftar tugas, dan panel statistik.

const dayKey = (d = new Date()) => d.toLocaleDateString('sv'); // YYYY-MM-DD waktu lokal

function fmtDur(ms) {
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)}j ${min % 60}m` : `${min}m`;
}

// ---------------------------------------------------------------- Riwayat

const History = (() => {
  // { 'YYYY-MM-DD': { sessions, ms } }
  const days = Store.get('history', {});

  // Versi lama hanya menyimpan statistik hari ini di key 'today'.
  const old = Store.get('today', null);
  if (old) {
    if (old.date && !days[old.date]) days[old.date] = { sessions: old.sessions, ms: old.ms };
    Store.set('history', days);
    Store.remove('today');
  }

  const day = (key = dayKey()) => days[key] || { sessions: 0, ms: 0 };

  function add(ms) {
    const d = day();
    days[dayKey()] = { sessions: d.sessions + 1, ms: d.ms + ms };
    Store.set('history', days);
  }

  // Hari ini belum ada sesi tidak memutus streak: hitung mundur mulai kemarin.
  function streak() {
    const d = new Date();
    if (!day(dayKey(d)).sessions) d.setDate(d.getDate() - 1);
    let n = 0;
    while (day(dayKey(d)).sessions) { n += 1; d.setDate(d.getDate() - 1); }
    return n;
  }

  function bestStreak() {
    let best = 0;
    let run = 0;
    let nextKey = null; // hari yang harus muncul berikutnya supaya streak tidak putus
    Object.keys(days).filter((k) => days[k].sessions).sort().forEach((k) => {
      run = k === nextKey ? run + 1 : 1;
      best = Math.max(best, run);
      const d = new Date(k + 'T00:00');
      d.setDate(d.getDate() + 1);
      nextKey = dayKey(d);
    });
    return best;
  }

  return { day, add, streak, bestStreak };
})();

// ---------------------------------------------------------------- Tugas

const Tasks = (() => {
  let list = Store.get('tasks', []); // [{ id, title, sessions, ms, done }]
  let activeId = Store.get('activeTask', null);
  if (!list.some((t) => t.id === activeId)) activeId = null;

  function save() {
    Store.set('tasks', list);
    Store.set('activeTask', activeId);
  }

  const find = (id) => list.find((t) => t.id === id);

  return {
    all: () => list,
    active: () => find(activeId) || null,
    add(title) {
      const t = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, sessions: 0, ms: 0, done: false };
      list.push(t);
      if (!activeId) activeId = t.id; // tugas pertama langsung dipilih
      save();
    },
    remove(id) {
      list = list.filter((t) => t.id !== id);
      if (activeId === id) activeId = null;
      save();
    },
    toggleDone(id) {
      const t = find(id);
      t.done = !t.done;
      if (t.done && activeId === id) activeId = null;
      save();
    },
    // Klik tugas yang sudah aktif = batal pilih.
    select(id) {
      const t = find(id);
      activeId = activeId === id || t.done ? null : id;
      save();
    },
    clearDone() {
      list = list.filter((t) => !t.done);
      save();
    },
    // Satu sesi fokus selesai: catat ke tugas yang sedang aktif.
    credit(ms) {
      const t = find(activeId);
      if (!t) return;
      t.sessions += 1;
      t.ms += ms;
      save();
    },
  };
})();

// ---------------------------------------------------------------- Tampilan

const Progress = (() => {
  function renderTopbar() {
    const { sessions, ms } = History.day();
    const s = History.streak();
    $('#today-text').textContent = sessions ? `${sessions} sesi · ${fmtDur(ms)} hari ini` : 'Belum ada sesi hari ini';
    $('#streak').hidden = !s;
    $('#streak-n').textContent = s;
  }

  function renderTaskChip() {
    const t = Tasks.active();
    $('#task-chip-text').textContent = t ? t.title : 'Pilih tugas';
    $('#task-chip').classList.toggle('is-empty', !t);
  }

  function renderTasks() {
    const list = Tasks.all();
    const active = Tasks.active();
    $('#task-list').innerHTML = list.length ? list.map((t) => `
      <li class="task${t === active ? ' active' : ''}${t.done ? ' done' : ''}" data-id="${t.id}">
        <button class="task-check" aria-pressed="${t.done}" aria-label="Tandai selesai">${icon('check')}</button>
        <button class="task-main" aria-pressed="${t === active}">
          <span class="task-title">${escapeHtml(t.title)}</span>
          <small>${t.sessions ? `${t.sessions} sesi · ${fmtDur(t.ms)}` : 'Belum ada sesi'}${t === active ? ' · <b>sedang dikerjakan</b>' : ''}</small>
        </button>
        <button class="icon-btn task-del" aria-label="Hapus tugas">${icon('trash')}</button>
      </li>`).join('') : '<li class="task-empty">Belum ada tugas. Tulis yang mau kamu kerjakan di atas.</li>';
    $('#task-clear-done').hidden = !list.some((t) => t.done);
    renderTaskChip();
  }

  // Grafik 7 hari: satu seri (menit fokus), jadi cukup satu warna aksen tanpa legenda.
  function renderWeek() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ d, ...History.day(dayKey(d)) });
    }
    const max = Math.max(...days.map((x) => x.ms), 1);
    $('#week-chart').innerHTML = days.map((x, i) => {
      const name = x.d.toLocaleDateString('id-ID', { weekday: 'short' });
      const full = x.d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
      const tip = `${full}: ${x.sessions ? `${x.sessions} sesi · ${fmtDur(x.ms)}` : 'tidak ada sesi'}`;
      return `
        <div class="wk-col${i === 6 ? ' is-today' : ''}" title="${tip}">
          <span class="wk-val">${x.ms ? fmtDur(x.ms) : ''}</span>
          <div class="wk-track"><i style="height:${(x.ms / max) * 100}%"></i></div>
          <span class="wk-day">${i === 6 ? 'Hari ini' : name}</span>
        </div>`;
    }).join('');
  }

  // Heatmap ala GitHub: kolom = minggu (Senin di atas), warna makin pekat = makin lama fokus.
  const WEEKS = 20;
  const level = (ms) => {
    const m = ms / 60000;
    if (!m) return 0;
    if (m < 30) return 1;
    if (m < 60) return 2;
    if (m < 120) return 3;
    return 4;
  };

  function renderHeatmap() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7); // Senin, WEEKS minggu lalu
    let cells = '';
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d > today) { cells += '<i class="hm-future"></i>'; continue; }
      const x = History.day(dayKey(d));
      const label = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      cells += `<i class="hm-l${level(x.ms)}" title="${label}: ${x.sessions ? `${x.sessions} sesi · ${fmtDur(x.ms)}` : 'tidak ada sesi'}"></i>`;
    }
    $('#heatmap').innerHTML = cells;
  }

  function renderStats() {
    const s = History.streak();
    const best = Math.max(History.bestStreak(), s);
    const today = History.day();
    let weekMs = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weekMs += History.day(dayKey(d)).ms;
    }
    const tile = (label, value, sub) => `<div class="stat-tile"><small>${label}</small><b>${value}</b><span>${sub}</span></div>`;
    $('#stat-tiles').innerHTML = [
      tile('Streak', `${icon('flame')} ${s}`, s ? 'hari berturut-turut' : 'mulai hari ini!'),
      tile('Rekor streak', best, 'hari'),
      tile('Hari ini', fmtDur(today.ms), `${today.sessions} sesi`),
      tile('7 hari terakhir', fmtDur(weekMs), `rata-rata ${fmtDur(weekMs / 7)}/hari`),
    ].join('');
    renderWeek();
    renderHeatmap();
  }

  function bind({ onTasksChange }) {
    $('#task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#task-input');
      const title = input.value.trim();
      if (!title) return;
      Tasks.add(title);
      input.value = '';
      renderTasks();
      onTasksChange();
    });
    $('#task-list').addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      const { id } = li.dataset;
      if (e.target.closest('.task-check')) Tasks.toggleDone(id);
      else if (e.target.closest('.task-del')) Tasks.remove(id);
      else if (e.target.closest('.task-main')) Tasks.select(id);
      else return;
      renderTasks();
      onTasksChange();
    });
    $('#task-clear-done').addEventListener('click', () => {
      Tasks.clearDone();
      renderTasks();
      onTasksChange();
    });
  }

  return { bind, renderTopbar, renderTasks, renderStats };
})();
