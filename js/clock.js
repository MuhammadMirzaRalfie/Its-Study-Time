// Tampilan jam. Setiap gaya punya build() (buat DOM sekali) dan render(state).
// state = { text: '24:59', fill: 0..1 (seberapa penuh indikatornya), label: 'Fokus' }

const Clock = (() => {
  const el = $('#clock');
  // `preview` = miniatur yang tampil di panel "Gaya jam".
  const STYLES = [
    { id: 'digital', name: 'Digital', preview: '<span class="pv-digital">25:00</span>' },
    { id: 'ring', name: 'Ring', preview: '<svg class="pv-svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="3"/><circle cx="20" cy="20" r="16" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="30" transform="rotate(-90 20 20)"/></svg>' },
    { id: 'flip', name: 'Flip', preview: '<span class="pv-flip"><b>2</b><b>5</b></span>' },
    { id: 'analog', name: 'Analog', preview: '<svg class="pv-svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/><path d="M20,20 L20,6 A14,14 0 1,1 6.7,24.3 Z" fill="var(--accent)"/></svg>' },
    { id: 'retro', name: 'Retro', preview: '<span class="pv-retro">25:00</span>' },
  ];

  const RING_C = 2 * Math.PI * 92;
  let style = null;
  let flipPattern = '';

  // ---------- Flip clock: setiap digit adalah kartu dengan dua belahan.
  function flipCardHtml(digit) {
    return `<div class="fc-half fc-top"><span>${digit}</span></div><div class="fc-half fc-bottom"><span>${digit}</span></div>`;
  }

  function buildFlipRow(text) {
    const row = $('.flip-row', el);
    row.innerHTML = [...text].map((ch) => (/\d/.test(ch)
      ? `<div class="flip-card" data-d="${ch}">${flipCardHtml(ch)}</div>`
      : `<span class="flip-sep">${ch}</span>`)).join('');
    flipPattern = text.replace(/\d/g, 'd');
  }

  function flipTo(card, next) {
    const prev = card.dataset.d;
    if (prev === next) return;
    card.dataset.d = next;
    // Dua belahan diam (angka baru di atas, angka lama di bawah) + dua daun yang berputar.
    card.innerHTML = `
      <div class="fc-half fc-top fc-reveal"><span>${next}</span></div>
      <div class="fc-half fc-bottom fc-cover"><span>${prev}</span></div>
      <div class="fc-half fc-top fc-leaf-top"><span>${prev}</span></div>
      <div class="fc-half fc-bottom fc-leaf-bottom"><span>${next}</span></div>`;
  }

  // ---------- Analog ala "Time Timer": irisan berwarna yang mengecil.
  function wedgePath(fraction) {
    const r = 78;
    if (fraction >= 0.9999) return `M100,${100 - r} A${r},${r} 0 1,1 99.99,${100 - r} Z`;
    if (fraction <= 0.0001) return '';
    const a = fraction * 2 * Math.PI;
    const x = 100 + r * Math.sin(a);
    const y = 100 - r * Math.cos(a);
    return `M100,100 L100,${100 - r} A${r},${r} 0 ${fraction > 0.5 ? 1 : 0},1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
  }

  function analogTicks() {
    let s = '';
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const a = (i / 60) * 2 * Math.PI;
      const r1 = 90;
      const r2 = major ? 82 : 86;
      s += `<line class="${major ? 'tick tick--major' : 'tick'}" x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + r2 * Math.sin(a)}" y2="${100 - r2 * Math.cos(a)}"/>`;
    }
    return s;
  }

  const builders = {
    digital() {
      el.innerHTML = '<div class="dg-time"></div>';
    },
    ring() {
      el.innerHTML = `
        <div class="ring-wrap">
          <svg viewBox="0 0 200 200" class="ring-svg" aria-hidden="true">
            <circle class="ring-track" cx="100" cy="100" r="92"/>
            <circle class="ring-bar" cx="100" cy="100" r="92" stroke-dasharray="${RING_C}"/>
          </svg>
          <div class="ring-center"><div class="ring-time"></div><div class="ring-label"></div></div>
        </div>`;
    },
    flip() {
      el.innerHTML = '<div class="flip-row"></div>';
      flipPattern = '';
    },
    analog() {
      el.innerHTML = `
        <svg viewBox="0 0 200 200" class="analog-svg" aria-hidden="true">
          <circle class="analog-face" cx="100" cy="100" r="96"/>
          ${analogTicks()}
          <path class="analog-wedge" d=""/>
          <circle class="analog-knob" cx="100" cy="100" r="7"/>
        </svg>
        <div class="analog-time"></div>`;
    },
    retro() {
      el.innerHTML = `
        <div class="retro-box">
          <div class="retro-label"></div>
          <div class="retro-time"></div>
          <div class="retro-bar">${'<i></i>'.repeat(16)}</div>
        </div>`;
    },
  };

  const renderers = {
    digital({ text }) {
      $('.dg-time', el).textContent = text;
    },
    ring({ text, fill, label }) {
      $('.ring-time', el).textContent = text;
      $('.ring-label', el).textContent = label;
      $('.ring-bar', el).style.strokeDashoffset = RING_C * (1 - fill);
    },
    flip({ text }) {
      if (text.replace(/\d/g, 'd') !== flipPattern) buildFlipRow(text);
      const cards = $$('.flip-card', el);
      const digits = text.replace(/\D/g, '');
      cards.forEach((card, i) => flipTo(card, digits[i]));
    },
    analog({ text, fill }) {
      $('.analog-wedge', el).setAttribute('d', wedgePath(fill));
      $('.analog-time', el).textContent = text;
    },
    retro({ text, fill, label }) {
      $('.retro-label', el).textContent = '> ' + label.toUpperCase();
      $('.retro-time', el).textContent = text;
      const on = Math.round(fill * 16);
      $$('.retro-bar i', el).forEach((b, i) => b.classList.toggle('on', i < on));
    },
  };

  let last = null;

  function setStyle(id) {
    if (!builders[id]) id = 'digital';
    style = id;
    el.className = 'clock clock--' + id;
    builders[id]();
    if (last) renderers[id](last);
  }

  function render(state) {
    last = state;
    if (style) renderers[style](state);
  }

  return { STYLES, setStyle, render };
})();
