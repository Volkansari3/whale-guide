/* Builds the page from the data: depth zones, species cards, filters, status bars, depth gauge.
   Agents never touch the page directly. They go through the site actions in js/actions.js. */
(function () {
  const D = window.WHALES;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const regionById = Object.fromEntries(D.regions.map((r) => [r.id, r]));
  const speciesById = Object.fromEntries(D.species.map((s) => [s.id, s]));
  const num = (n) => n.toLocaleString('en-US');

  function speciesMonths(s) {
    const set = new Set();
    s.sightings.forEach((g) => g.months.forEach((m) => set.add(m)));
    return set;
  }

  function cardHTML(s) {
    const months = speciesMonths(s);
    const places = s.sightings.slice(0, 2).map((g) => regionById[g.region].country.split(' (')[0]).join(', ');
    return `
      <article class="card" id="species-${s.id}" data-species="${s.id}" tabindex="-1" aria-labelledby="name-${s.id}">
        <div class="card-top">
          <div>
            <h3 id="name-${s.id}">${s.name}</h3>
            <p class="latin">${s.scientificName}</p>
          </div>
          <span class="iucn" data-code="${s.status}" title="IUCN: ${D.conservationCodes[s.status]}"><b>${s.status}</b>${D.conservationCodes[s.status]}</span>
        </div>
        <figure class="card-image">
          <img src="${s.image}" alt="${s.name}" loading="lazy" onerror="this.classList.add('img-missing')">
          ${s.sound ? `<button type="button" class="listen" data-sound="${s.id}" aria-pressed="false" title="${s.sound.note}">
            <span class="listen-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="listen-text">Listen: ${s.sound.label.toLowerCase()}</span>
          </button>` : ''}
        </figure>
        <p class="card-summary">${s.summary}</p>
        <dl class="facts">
          <div><dt>Length</dt><dd>${num(s.length.min)}–${num(s.length.max)} m</dd></div>
          <div><dt>Weight</dt><dd>${num(s.weight.min)}–${num(s.weight.max)} t</dd></div>
          <div><dt>Max dive</dt><dd>${num(s.dive.recordMeters)} m</dd></div>
        </dl>
        <div>
          <p class="months-label">Best months</p>
          <div class="months">${MONTHS.map((m, i) => `<span class="${months.has(i + 1) ? 'good' : ''}" data-month="${i + 1}" title="${m}">${m[0]}</span>`).join('')}</div>
        </div>
        <p class="card-sources">Sources: ${(s.sources || []).map((x) => `<a href="${x.url}" target="_blank" rel="noopener">${x.name.split(',')[0].replace(' species page', '')}</a>`).join(', ')}${s.sound ? `. Sound: <a href="${s.sound.source}" target="_blank" rel="noopener">${s.sound.credit}</a>` : ''}</p>
        <div class="card-foot">
          <span class="places">${places}${s.sightings.length > 2 ? ` and ${s.sightings.length - 2} more` : ''}</span>
          <span class="card-links">
            <button type="button" class="link-btn" data-compare="${s.id}">Compare size</button>
            <button type="button" class="link-btn" data-map="${s.id}">Show on map</button>
          </span>
        </div>
      </article>`;
  }

  function buildZones() {
    document.getElementById('zones').innerHTML = D.depthZones.map((z) => {
      const list = D.species.filter((s) => s.depthZone === z.id).sort((a, b) => b.length.max - a.length.max);
      const [first, ...rest] = z.name.split(' ');
      return `
        <section class="zone" id="zone-${z.id}" data-zone="${z.id}" data-top="${z.top}" data-bottom="${z.bottom}" aria-labelledby="zh-${z.id}">
          <div class="inner">
            <header class="zone-head">
              <div class="zone-depth">${num(z.top)}–${num(z.bottom)}<small> m</small></div>
              <div>
                <h2 class="zone-name" id="zh-${z.id}">${first} <em>${rest.join(' ')}</em></h2>
                <p class="zone-text">${z.description}</p>
              </div>
            </header>
            <div class="cards">${list.map(cardHTML).join('')}</div>
          </div>
        </section>`;
    }).join('');
  }

  /* ---------- Size line-up: one whale at a time, next to a person and a bus that never move ----------
     The person and the bus stand on the same ground line, at the same scale, while you switch whales.
     The scale is set from the stage width so the largest whale always fits. */
  function buildLineup() {
    const stage = document.getElementById('lineup-stage');
    if (!stage) return;
    const sorted = [...D.species].sort((a, b) => b.length.max - a.length.max);
    const RULER = 36;                     // metres shown on the ruler; the blue whale (33 m) fits with room for its tail
    const picker = document.getElementById('lineup-picker');
    const readout = document.getElementById('lineup-readout');
    const whales = stage.querySelector('.lu-whales');

    picker.innerHTML = sorted.map((s) => `<button type="button" class="lu-pick" role="tab" id="lu-tab-${s.id}" data-pick="${s.id}" aria-selected="false" aria-controls="lineup-stage" tabindex="-1">${s.name}<small>${num(s.length.max)} m</small></button>`).join('');
    whales.innerHTML = sorted.map((s) => `
      <figure class="lu-whale" data-whale="${s.id}" style="--m:${s.length.max}" hidden>
        <button type="button" class="lu-go" data-go="${s.id}" aria-label="${s.name}, up to ${num(s.length.max)} metres. Go to card">
          <img src="${s.image}" alt="" loading="lazy" onerror="this.classList.add('img-missing')">
        </button>
      </figure>`).join('');
    stage.querySelector('.lu-ruler').innerHTML = Array.from({ length: RULER / 5 + 1 }, (_, i) => `<span style="--at:${i * 5}">${i * 5}${i === RULER / 5 ? ' m' : ''}</span>`).join('');

    // one metre in pixels, from the width of the stage
    const setScale = () => stage.style.setProperty('--pxm', (stage.clientWidth / RULER).toFixed(2) + 'px');
    setScale();
    window.addEventListener('resize', setScale);

    function pick(id, focus) {
      const s = speciesById[id];
      if (!s) return;
      picker.querySelectorAll('.lu-pick').forEach((b) => {
        const on = b.dataset.pick === id;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) { b.focus(); }
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      whales.querySelectorAll('.lu-whale').forEach((f) => { f.hidden = f.dataset.whale !== id; });
      stage.style.setProperty('--m', s.length.max);
      stage.setAttribute('aria-labelledby', 'lu-tab-' + id);
      const buses = s.length.max / 12;
      const people = Math.round(s.length.max / 1.8);
      const busText = buses >= 0.95 ? `${num(Math.round(buses * 10) / 10)} city buses` : `${Math.round(buses * 100)}% of a city bus`;
      readout.innerHTML = `<strong>${s.name}</strong> grows up to <b>${num(s.length.max)} m</b>: about ${busText}, or ${people} people lying head to toe.
        <button type="button" class="link-btn" data-go="${s.id}">Go to its card</button>`;
    }

    picker.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) pick(b.dataset.pick); });
    picker.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const ids = sorted.map((s) => s.id);
      const cur = ids.indexOf(picker.querySelector('[aria-selected="true"]').dataset.pick);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : (cur + keys[e.key] + ids.length) % ids.length;
      pick(ids[next], true);
    });
    document.getElementById('lineup').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      const card = document.getElementById('species-' + b.dataset.go);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.focus({ preventScroll: true }); }
    });

    // "Compare size" on a card: go up to the line-up with that whale picked
    document.getElementById('zones').addEventListener('click', (e) => {
      const b = e.target.closest('[data-compare]');
      if (!b) return;
      pick(b.dataset.compare);
      document.getElementById('lineup').scrollIntoView({ behavior: 'smooth', block: 'start' });
      const tab = document.getElementById('lu-tab-' + b.dataset.compare);
      if (tab) tab.focus({ preventScroll: true });
    });

    pick(sorted[0].id);
    window.Lineup = { pick };
  }

  /* ---------- Filtering ---------- */
  const filter = { teeth: '', status: [], month: null };

  function applyFilter(next) {
    Object.assign(filter, next);
    if (typeof filter.status === 'string') filter.status = filter.status ? filter.status.split(',') : [];
    const visible = [];
    D.species.forEach((s) => {
      const match =
        (!filter.teeth || s.teeth === filter.teeth) &&
        (!filter.status.length || filter.status.includes(s.status)) &&
        (!filter.month || speciesMonths(s).has(filter.month));
      const card = document.getElementById('species-' + s.id);
      card.classList.toggle('dim', !match);
      card.querySelectorAll('.months span').forEach((el) => el.classList.toggle('selected', Number(el.dataset.month) === filter.month));
      if (match) visible.push(s.id);
    });
    // keep the controls in sync, even when an agent changed the filter
    document.querySelectorAll('.chip[data-filter="teeth"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === filter.teeth)));
    const sel = document.getElementById('filter-status');
    const val = filter.status.join(',');
    if (![...sel.options].some((o) => o.value === val)) sel.add(new Option(filter.status.map((c) => D.conservationCodes[c]).join(' + '), val));
    sel.value = val;
    document.getElementById('filter-month').value = filter.month || '';
    document.getElementById('filter-count').textContent = visible.length === D.species.length ? `${visible.length} species` : `${visible.length} of ${D.species.length} species`;
    return visible;
  }

  function bindFilters() {
    const monthSel = document.getElementById('filter-month');
    MONTHS.forEach((m, i) => monthSel.add(new Option(m, i + 1)));
    document.querySelectorAll('.chip[data-filter="teeth"]').forEach((b) =>
      b.addEventListener('click', () => applyFilter({ teeth: b.dataset.value })));
    document.getElementById('filter-status').addEventListener('change', (e) => applyFilter({ status: e.target.value }));
    monthSel.addEventListener('change', (e) => applyFilter({ month: e.target.value ? Number(e.target.value) : null }));
  }

  /* ---------- Conservation status bars ---------- */
  function buildStatusBars() {
    const order = ['EN', 'VU', 'LC', 'DD'];
    const color = { EN: 'var(--iucn-en)', VU: 'var(--iucn-vu)', LC: 'var(--iucn-lc)', DD: 'var(--iucn-dd)' };
    document.getElementById('status-bars').innerHTML = order.map((c) => {
      const list = D.species.filter((s) => s.status === c);
      return `<div class="sb-row"><span>${D.conservationCodes[c]}</span>
        <span class="sb-track"><i style="width:${(list.length / D.species.length) * 100}%;background:${color[c]}"></i></span>
        <b>${list.length}</b><span class="sb-species">${list.map((s) => s.name).join(', ')}</span></div>`;
    }).join('');
  }

  /* ---------- Depth gauge and dark header ---------- */
  function trackDepth() {
    const value = document.getElementById('dg-value');
    const cursor = document.getElementById('dg-cursor');
    const gauge = document.querySelector('.depth-gauge');
    const header = document.querySelector('.site-header');
    const filters = document.querySelector('.filters');
    const hero = document.getElementById('surface');
    const zones = [...document.querySelectorAll('.zone')];
    const map = document.getElementById('map');
    // positions on the gauge for 0, 200, 1,000 and 3,000 m
    const place = (m) => (m <= 200 ? (m / 200) * 33 : m <= 1000 ? 33 + ((m - 200) / 800) * 33 : 66 + ((m - 1000) / 2000) * 34);

    let queued = false;
    function update() {
      queued = false;
      const mid = window.scrollY + window.innerHeight * 0.5;
      let m = 0;
      for (const z of zones) {
        const start = z.offsetTop, end = start + z.offsetHeight;
        if (mid >= start) m = Number(z.dataset.top) + (Math.min(mid, end) - start) / (end - start) * (Number(z.dataset.bottom) - Number(z.dataset.top));
      }
      const surfaced = mid > map.offsetTop;
      value.textContent = surfaced ? 'Surface' : `−${num(Math.round(m))} m`;
      cursor.style.top = place(surfaced ? 0 : m) + '%';
      gauge.classList.toggle('visible', mid > zones[0].offsetTop && !surfaced);
      header.classList.toggle('dark', window.scrollY > 40);
      filters.classList.toggle('dark', m > 120);
      window.depthRatio = surfaced ? 0.6 : Math.min(m / 3000, 1);
    }
    window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  buildZones();
  buildLineup();
  bindFilters();
  buildStatusBars();
  trackDepth();

  window.Page = { applyFilter, speciesById, regionById, MONTHS, speciesMonths, filter };
})();
