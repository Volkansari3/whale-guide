/* Site actions.
   The only way agents interact with the page. Each action has a name, a purpose, a JSON Schema for its input,
   an effect type and a handler. In weeks 3-5 this list is registered with the runtime as it is.
   Effect types: "read" (only returns data), "ui" (changes what the page shows). */
(function () {
  const D = window.WHALES;
  const speciesIds = D.species.map((s) => s.id);
  const regionIds = D.regions.map((r) => r.id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function scrollTo(el) {
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  }

  const ACTIONS = [
    {
      name: 'filterSpecies',
      purpose: 'Filters the species cards by feeding type, conservation status or watching month. Returns the ids of the matching species.',
      effect: 'ui',
      inputSchema: {
        type: 'object', additionalProperties: false,
        properties: {
          teeth: { type: 'string', enum: ['', 'baleen', 'toothed'], description: 'Empty means all' },
          status: { type: 'array', items: { type: 'string', enum: ['EN', 'VU', 'LC', 'DD'] }, description: 'IUCN codes' },
          month: { type: ['integer', 'null'], minimum: 1, maximum: 12, description: '1 = January' },
        },
      },
      handler(input) {
        const visible = window.Page.applyFilter(input);
        scrollTo(document.getElementById('species'));
        return { visibleSpecies: visible };
      },
    },
    {
      name: 'goToSpecies',
      purpose: 'Scrolls to a species card, highlights it and sends that whale swimming across the screen.',
      effect: 'ui',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['speciesId'],
        properties: { speciesId: { type: 'string', enum: speciesIds } },
      },
      handler({ speciesId }) {
        const card = document.getElementById('species-' + speciesId);
        if (card.classList.contains('dim')) window.Page.applyFilter({ teeth: '', status: [], month: null });
        document.querySelectorAll('.card.highlight').forEach((c) => c.classList.remove('highlight'));
        scrollTo(card);
        card.classList.add('highlight');
        card.focus({ preventScroll: true });
        setTimeout(() => card.classList.remove('highlight'), 6000);
        const s = window.Page.speciesById[speciesId];
        window.Scene?.swim(s.image);
        return { species: s.id, name: s.name, depthZone: s.depthZone };
      },
    },
    {
      name: 'playSound',
      purpose: 'Plays a real underwater recording of a species (NOAA). Only some species have one. Returns what is playing and how it was recorded (some are sped up or slowed down so people can hear them).',
      effect: 'ui',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['speciesId'],
        properties: { speciesId: { type: 'string', enum: D.species.filter((s) => s.sound).map((s) => s.id) } },
      },
      handler({ speciesId }) {
        scrollTo(document.getElementById('species-' + speciesId));
        return window.WhaleSound.play(speciesId);
      },
    },
    {
      name: 'showOnMap',
      purpose: 'Shows on the map where a species can be seen, a single spot, or the spots that are active in a month. With ethicsOnly, keeps only spots rated "good" for ethical whale watching. Returns the matching spots with their ethics rating.',
      effect: 'ui',
      inputSchema: {
        type: 'object', additionalProperties: false,
        properties: {
          speciesId: { type: 'string', enum: speciesIds },
          regionId: { type: 'string', enum: regionIds },
          month: { type: ['integer', 'null'], minimum: 1, maximum: 12 },
          ethicsOnly: { type: 'boolean', description: 'true keeps only spots with good whale watching rules' },
        },
      },
      handler(input) {
        scrollTo(document.getElementById('world'));
        const spots = window.WorldMap.show(input);
        return { spots: spots.map((r) => ({ id: r.id, name: r.name, country: r.country, ethics: r.ethics })) };
      },
    },
    {
      name: 'showSightings',
      purpose: 'Loads real, recent sightings of a species from GBIF (Global Biodiversity Information Facility) and draws them on the map. Returns how many records were shown, the total on GBIF and a small sample.',
      effect: 'ui',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['speciesId'],
        properties: {
          speciesId: { type: 'string', enum: speciesIds },
          limit: { type: 'integer', minimum: 1, maximum: 300, description: 'How many records to draw, at most 300' },
        },
      },
      handler(input) {
        scrollTo(document.getElementById('world'));
        return window.WorldMap.showSightings(input);
      },
    },
    {
      name: 'getSpeciesInfo',
      purpose: 'Returns length, diet, conservation status, dive depth and watching spots for a species. Does not change the page.',
      effect: 'read',
      inputSchema: {
        type: 'object', additionalProperties: false, required: ['speciesId'],
        properties: { speciesId: { type: 'string', enum: speciesIds } },
      },
      handler({ speciesId }) {
        const s = window.Page.speciesById[speciesId];
        return { ...s, sightings: s.sightings.map((g) => ({ ...g, region: window.Page.regionById[g.region] })) };
      },
    },
    {
      name: 'getSpotEthics',
      purpose: 'Returns how ethical whale watching is at a spot: a rating (good, caution or concern), the reason, a tip for choosing a tour and the sources. Without regionId, returns the rating of every spot. Does not change the page.',
      effect: 'read',
      inputSchema: {
        type: 'object', additionalProperties: false,
        properties: { regionId: { type: 'string', enum: regionIds } },
      },
      handler({ regionId } = {}) {
        if (regionId) {
          const r = window.Page.regionById[regionId];
          return { id: r.id, name: r.name, country: r.country, ...r.ethics, meaning: D.ethicsRatings[r.ethics.rating] };
        }
        return { ratings: D.ethicsRatings, spots: D.regions.map((r) => ({ id: r.id, name: r.name, rating: r.ethics.rating })) };
      },
    },
  ];

  /* Minimal schema check until the runtime is in place. Rejects bad input before running anything. */
  function validate(schema, input) {
    const errors = [];
    if (typeof input !== 'object' || input === null) return ['Input must be an object'];
    (schema.required || []).forEach((k) => { if (!(k in input)) errors.push(`"${k}" is required`); });
    Object.entries(input).forEach(([k, v]) => {
      const p = schema.properties[k];
      if (!p) { errors.push(`"${k}" is not a known field`); return; }
      if (p.enum && !p.enum.includes(v)) errors.push(`"${v}" is not a valid ${k}`);
      if (p.type === 'array' && p.items?.enum && (!Array.isArray(v) || v.some((x) => !p.items.enum.includes(x)))) errors.push(`"${k}" is invalid`);
      if (p.type === 'boolean' && typeof v !== 'boolean') errors.push(`"${k}" must be true or false`);
      if (p.type === 'integer' && v != null && !Number.isInteger(v)) errors.push(`"${k}" must be a whole number`);
      if (p.minimum != null && v != null && (v < p.minimum || v > p.maximum)) errors.push(`"${k}" must be between ${p.minimum} and ${p.maximum}`);
    });
    return errors;
  }

  function run(name, input = {}) {
    const a = ACTIONS.find((x) => x.name === name);
    if (!a) return { ok: false, error: `Unknown action: ${name}` };
    const errors = validate(a.inputSchema, input);
    if (errors.length) return { ok: false, error: errors.join(', ') };
    // Handlers may be async (showSightings calls GBIF); then run() returns a promise of the same shape.
    try {
      const result = a.handler(input);
      if (result && typeof result.then === 'function') {
        return result.then((r) => ({ ok: true, result: r }), (e) => ({ ok: false, error: e.message }));
      }
      return { ok: true, result };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  window.SiteActions = {
    list: ACTIONS.map(({ handler, ...definition }) => definition), // definitions handed to the runtime
    run,
  };
  // For trying in the console: filterSpecies({ status: ['EN'] })
  ACTIONS.forEach((a) => { window[a.name] = (input) => run(a.name, input); });

  // The "Show on map" buttons on the cards use the same action
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-map]');
    if (b) run('showOnMap', { speciesId: b.dataset.map });
  });
})();
