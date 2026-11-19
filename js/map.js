/* World map: satellite imagery, each species' approximate range, and the best watching spots (Leaflet). */
(function () {
  const D = window.WHALES;
  const { speciesById, MONTHS } = window.Page;
  const SHORT = ['All', ...MONTHS.map((m) => m.slice(0, 3))];

  // Which species can be seen at each spot, and in which months
  const speciesAt = {};
  D.species.forEach((s) => s.sightings.forEach((g) => {
    (speciesAt[g.region] ||= []).push({ species: s.id, months: g.months });
  }));

  const monthRange = (months) => (months.length === 12 ? 'all year' : months.map((m) => MONTHS[m - 1].slice(0, 3)).join(', '));

  const state = { speciesId: null, regionId: null, month: null, ethicsOnly: false };
  const markers = {};
  const RANGES = (window.WHALE_RANGES || {}).ranges || {};
  let map = null;
  let rangeLayer = null;
  let sightingsLayer = null;
  let sightingsInfo = null; // { speciesId, shown, total } after a GBIF load

  /* Ethics badge: how well whale watching is regulated at a spot (researched 2026-11, see data/whales.json).
     Colours come from --ethics-* in css, so they follow the site palette. */
  const ETHICS_LABEL = { good: 'Good rules', caution: 'Choose carefully', concern: 'Harassment reported' };
  function ethicsBadge(r) {
    const e = r.ethics;
    if (!e) return '';
    return `<span class="ethics-badge" data-ethics="${e.rating}" title="${(D.ethicsRatings || {})[e.rating] || ''}"><i aria-hidden="true"></i>${ETHICS_LABEL[e.rating]}</span>`;
  }
  function ethicsDetails(r) {
    const e = r.ethics;
    if (!e) return '';
    const src = e.sources.length
      ? `<ul class="ethics-src">${e.sources.map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${x.label}</a></li>`).join('')}</ul>`
      : '<p class="ethics-note">Based on the rules in force there; no independent check found.</p>';
    return `<details class="ethics"><summary>${ethicsBadge(r)}<span class="ethics-why">Why?</span></summary>` +
      `<p>${e.reason}</p><p><b>Tip:</b> ${e.tip}</p>${src}</details>`;
  }

  function popupHTML(r) {
    const rows = (speciesAt[r.id] || []).map((x) => `<div>${speciesById[x.species].name} · <span style="opacity:.7">${monthRange(x.months)}</span></div>`).join('');
    return `<strong>${r.name}</strong><div style="opacity:.7;margin-bottom:6px">${r.country}</div>${rows}${ethicsDetails(r)}`;
  }

  function build() {
    const el = document.getElementById('world');
    if (!window.L) {
      el.innerHTML = '<p style="padding:24px;color:var(--foam-dim)">The map could not load. Check your internet connection and reload the page.</p>';
      return;
    }
    // The map can't be dragged past the poles (the empty band above the Arctic), and never zooms out further than
    // the height of the map allows, so the world always fills it from top to bottom.
    // between latitudes -78 and 84 the world is about 84% of a square Web Mercator tile
    const fitZoom = () => Math.max(2, Math.ceil(Math.log2(el.clientHeight / (256 * 0.84))));
    map = L.map(el, { center: [25, -20], zoom: 2, minZoom: 2, maxZoom: 9, worldCopyJump: true, scrollWheelZoom: false,
      maxBounds: [[-78, -540], [84, 540]], maxBoundsViscosity: 1 });
    map.attributionControl.setPrefix(false);   // drop the Leaflet flag; the Esri credit must stay on the map
    const keepFilled = () => { const z = fitZoom(); map.setMinZoom(z); if (map.getZoom() < z) map.setZoom(z); };
    keepFilled();
    addEventListener('resize', keepFilled);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 18, className: 'tiles-ocean',   // tinted to the page's ocean colours in css
    }).addTo(map);
    // Country borders and place names on top of the imagery, kept faint
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, opacity: 0.55, className: 'tiles-labels',
    }).addTo(map);

    // Species picker above the map
    const picker = document.getElementById('map-species');
    picker.innerHTML = `<button type="button" class="chip" data-pick="" aria-pressed="true">All spots</button>` +
      D.species.map((s) => `<button type="button" class="chip" data-pick="${s.id}" aria-pressed="false">${s.name.split(' (')[0]}</button>`).join('');
    picker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) show({ speciesId: b.dataset.pick || null, month: state.month, ethicsOnly: state.ethicsOnly });
    });
    document.getElementById('ethics-only').addEventListener('change', (e) => {
      show({ speciesId: state.speciesId, month: state.month, ethicsOnly: e.target.checked });
    });

    const count = document.getElementById('spot-count');
    if (count) count.textContent = D.regions.filter((r) => speciesAt[r.id]).length;

    D.regions.forEach((r) => {
      if (!speciesAt[r.id]) return;
      const m = L.marker([r.location.lat, r.location.lng], {
        icon: L.divIcon({ className: '', html: `<span class="marker-dot" data-region="${r.id}" data-zone="${deepestZone(speciesAt[r.id].map((x) => x.species))}"></span>`, iconSize: [14, 14] }),
        title: r.name, keyboard: true,
      }).addTo(map).bindPopup(popupHTML(r));
      m.on('click', () => markInList(r.id));
      markers[r.id] = m;
    });

    const strip = document.getElementById('month-strip');
    strip.innerHTML = SHORT.map((m, i) => `<button type="button" data-month="${i}" aria-pressed="${i === 0}">${m}</button>`).join('');
    strip.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) show({ speciesId: state.speciesId, month: Number(b.dataset.month) || null, ethicsOnly: state.ethicsOnly });
    });
    show({});
  }

  /* Dots and ranges take the colour of the depth zone, as the species cards do */
  const ZONE_ORDER = ['sunlight', 'twilight', 'midnight'];
  // on the navy map yellow turns muddy, so the sunlight zone is shown in sea-foam white here
  const ZONE_COLOR = { sunlight: '#eaf7ff', twilight: '#c3a6ff', midnight: '#4ff0ff' };
  function deepestZone(ids) {
    return ids.map((id) => speciesById[id].depthZone).sort((a, b) => ZONE_ORDER.indexOf(b) - ZONE_ORDER.indexOf(a))[0] || 'sunlight';
  }

  function markInList(regionId) {
    document.querySelectorAll('#region-ul button').forEach((b) => b.classList.toggle('selected', b.dataset.region === regionId));
  }

  /* Called by the "showOnMap" site action.
     speciesId, regionId and month are all optional; spots that do not match fade out.
     ethicsOnly keeps only the spots rated "good" for ethical whale watching. Returns the matching spots. */
  function show({ speciesId = null, regionId = null, month = null, ethicsOnly = false } = {}) {
    Object.assign(state, { speciesId, regionId, month, ethicsOnly });
    const box = document.getElementById('ethics-only');
    if (box) box.checked = ethicsOnly;
    const matches = D.regions.filter((r) => {
      const list = speciesAt[r.id];
      if (!list) return false;
      if (regionId) return r.id === regionId;
      if (ethicsOnly && r.ethics?.rating !== 'good') return false;
      return list.some((x) => (!speciesId || x.species === speciesId) && (!month || x.months.includes(month)));
    });
    const ids = new Set(matches.map((r) => r.id));
    const filtered = speciesId || regionId || month || ethicsOnly;

    document.querySelectorAll('.marker-dot').forEach((el) => {
      // with one whale picked, every dot takes that whale's zone colour; otherwise the deepest whale seen there
      el.dataset.zone = speciesId ? speciesById[speciesId].depthZone : deepestZone(speciesAt[el.dataset.region].map((x) => x.species));
      el.classList.toggle('dim', !ids.has(el.dataset.region));
      el.classList.toggle('highlight', Boolean(filtered) && ids.has(el.dataset.region));
    });
    if (sightingsInfo && sightingsInfo.speciesId !== speciesId) clearSightings();
    drawRange(speciesId);
    document.querySelectorAll('#map-species [data-pick]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.pick || null) === speciesId)));
    document.querySelectorAll('#month-strip button').forEach((b) => b.setAttribute('aria-pressed', String((Number(b.dataset.month) || null) === month)));

    const title = [speciesId && speciesById[speciesId].name, month && MONTHS[month - 1], ethicsOnly && 'Good rules'].filter(Boolean).join(' · ');
    document.getElementById('region-title').textContent = title || 'All spots';
    document.getElementById('region-ul').innerHTML = matches.map((r) => {
      const here = speciesAt[r.id].filter((x) => (!speciesId || x.species === speciesId) && (!month || x.months.includes(month)));
      const names = (here.length ? here : speciesAt[r.id]).map((x) => speciesById[x.species].name.split(' (')[0]).join(', ');
      return `<li><button type="button" data-region="${r.id}"><strong>${r.name}</strong><span>${r.country} · ${names}</span>${ethicsBadge(r)}</button></li>`;
    }).join('') || '<li style="color:var(--foam-dim);font-size:14px">No spots match this choice.</li>';

    if (map && matches.length) {
      if (regionId && markers[regionId]) {
        map.flyTo(markers[regionId].getLatLng(), 5, { duration: 1.2 });
        markers[regionId].openPopup();
      } else if (rangeLayer) {
        // show the whole range, not just the watching spots
        map.flyToBounds(rangeLayer.getBounds(), { duration: 1.2, maxZoom: 3, padding: [20, 20] });
      } else if (filtered) {
        map.flyToBounds(L.latLngBounds(matches.map((r) => [r.location.lat, r.location.lng])).pad(0.4), { duration: 1.2, maxZoom: 4 });
      }
    }
    return matches.map((r) => ({ id: r.id, name: r.name, country: r.country, species: speciesAt[r.id], ethics: r.ethics?.rating || null }));
  }

  /* The legend for the picked whale (its range is described in words) */
  function drawRange(speciesId) {
    if (rangeLayer) { rangeLayer.remove(); rangeLayer = null; }
    const legend = document.getElementById('map-legend');
    const r = speciesId && RANGES[speciesId];
    // The shaded range was dropped (Sari, 2026-11-18): the map shows only the watching spots; the range stays as a sentence
    legend.innerHTML = r
      ? `<strong>${speciesById[speciesId].name}</strong><p>${r.note}</p>${sightingsLegend(speciesId)}`
      : `<span class="lg-zones" title="Each spot takes the colour of the deepest whale you can meet there">${ZONE_ORDER.map((z) => `<span style="--lg:${ZONE_COLOR[z]}"><i class="lg-dot"></i>${z[0].toUpperCase() + z.slice(1)}</span>`).join('')}</span>`;
  }

  function sightingsLegend(speciesId) {
    if (sightingsInfo && sightingsInfo.speciesId === speciesId) {
      return `<span class="lg-row"><i class="lg-obs"></i>${sightingsInfo.shown.toLocaleString('en')} real sightings since ${GBIF_FROM}</span>` +
        `<p>${sightingsInfo.total.toLocaleString('en')} records with coordinates in total. Data: <a href="https://www.gbif.org/occurrence/search?taxon_key=${sightingsInfo.taxonKey}&has_coordinate=true" target="_blank" rel="noopener">GBIF.org</a>, shared by research groups and citizen scientists.</p>`;
    }
    return `<button type="button" class="link-btn" data-sightings="${speciesId}">Show real sightings (GBIF)</button>`;
  }

  /* Live sightings from GBIF, the Global Biodiversity Information Facility (free, open, CORS-enabled API).
     Loads recent records with coordinates for one species and draws them as small dots. */
  const GBIF = 'https://api.gbif.org/v1';
  const GBIF_FROM = 2015;
  const taxonKeys = {};

  async function gbifJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GBIF answered ${res.status}`);
    return res.json();
  }

  async function showSightings({ speciesId, limit = 300 }) {
    const s = speciesById[speciesId];
    if (state.speciesId !== speciesId) show({ speciesId, month: state.month, ethicsOnly: state.ethicsOnly });
    if (!taxonKeys[speciesId]) {
      const m = await gbifJSON(`${GBIF}/species/match?name=${encodeURIComponent(s.scientificName)}&rank=SPECIES&strict=true`);
      if (!m.usageKey) throw new Error(`GBIF does not know ${s.scientificName}`);
      taxonKeys[speciesId] = m.usageKey;
    }
    const taxonKey = taxonKeys[speciesId];
    const q = new URLSearchParams({
      taxonKey, hasCoordinate: 'true', hasGeospatialIssue: 'false', occurrenceStatus: 'PRESENT',
      year: `${GBIF_FROM},${new Date().getFullYear()}`, limit: String(Math.min(limit, 300)),
    });
    const data = await gbifJSON(`${GBIF}/occurrence/search?${q}`);
    const points = data.results.filter((o) => Number.isFinite(o.decimalLatitude) && Number.isFinite(o.decimalLongitude));

    clearSightings();
    if (map) {
      sightingsLayer = L.layerGroup(points.map((o) => L.circleMarker([o.decimalLatitude, o.decimalLongitude], {
        radius: 3, stroke: false, fillColor: '#ff7a59', fillOpacity: 0.85,
      }).bindPopup(`<strong>${s.name}</strong><div style="opacity:.7">${o.eventDate ? o.eventDate.slice(0, 10) : 'Date unknown'}${o.country ? ' · ' + o.country : ''}</div><div style="opacity:.7">${o.datasetName || o.institutionCode || 'GBIF record'}</div><a href="https://www.gbif.org/occurrence/${o.key}" target="_blank" rel="noopener">See record</a>`))).addTo(map);
    }
    sightingsInfo = { speciesId, taxonKey, shown: points.length, total: data.count };
    drawRange(speciesId);
    return {
      species: s.id, shown: points.length, totalRecords: data.count, since: GBIF_FROM,
      source: 'GBIF.org occurrence data',
      sample: points.slice(0, 5).map((o) => ({ lat: o.decimalLatitude, lng: o.decimalLongitude, date: o.eventDate || null, country: o.country || null })),
    };
  }

  function clearSightings() {
    if (sightingsLayer) { sightingsLayer.remove(); sightingsLayer = null; }
    sightingsInfo = null;
  }

  document.getElementById('map-legend').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sightings]');
    if (!b) return;
    b.disabled = true; b.textContent = 'Loading sightings…';
    Promise.resolve(window.SiteActions.run('showSightings', { speciesId: b.dataset.sightings })).then((r) => {
      if (!r.ok) { b.disabled = false; b.textContent = 'Could not load sightings. Try again'; b.title = r.error; }
    });
  });

  document.getElementById('region-ul').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-region]');
    if (!b || !markers[b.dataset.region]) return;
    markInList(b.dataset.region);
    map.flyTo(markers[b.dataset.region].getLatLng(), 5, { duration: 1 });
    markers[b.dataset.region].openPopup();
  });

  build();
  window.WorldMap = { show, showSightings, speciesAt };
})();
