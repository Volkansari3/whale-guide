/* Chat panel. FOR NOW A DEMO: replies come from scripted scenarios, there is no model.
   The point is to see the interface and the flow: agent handoffs, site action calls, consent for another site, a denial error.
   In weeks 3-5 the scenario engine (findScenario) is removed and the nsDeploy runtime is plugged in;
   the rendering functions (addMessage, addTrace, setAgent, askConsent) stay as they are. */
(function () {
  const D = window.WHALES;
  const P = window.Page;
  const panel = document.getElementById('chat');
  const toggle = document.getElementById('chat-toggle');
  const messages = document.getElementById('messages');
  const input = document.getElementById('composer-input');
  const OCEAN_ORIGIN = 'http://127.0.0.1:5501'; // the real address once the second site exists

  const AGENT_NAME = {
    'guide': 'Guide', 'species-expert': 'Species Expert', 'trip-planner': 'Trip Planner',
    'conservation-expert': 'Conservation Expert', 'sea-advisor': 'Sea Advisor',
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const month = (m) => P.MONTHS[m - 1];

  /* ---------- Panel ---------- */
  function openPanel(open) {
    panel.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('chat-open', open && innerWidth > 1100);
    if (open) setTimeout(() => input.focus({ preventScroll: true }), 300);
  }
  toggle.addEventListener('click', () => openPanel(panel.dataset.open !== 'true'));
  document.getElementById('chat-close').addEventListener('click', () => openPanel(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('consent').hidden && document.getElementById('settings').hidden) openPanel(false); });

  /* ---------- Rendering ---------- */
  function scrollDown() { messages.scrollTop = messages.scrollHeight; }
  function addMessage(who, html, extra = '') {
    const el = document.createElement('div');
    el.className = `msg ${who === 'user' ? 'user' : 'agent'} ${extra}`;
    el.innerHTML = who === 'user' ? `<p>${escape(html)}</p>` : `<span class="who">${AGENT_NAME[who]}</span>${html}`;
    messages.append(el); scrollDown();
    return el;
  }
  function addTrace(html) {
    const el = document.createElement('div');
    el.className = 'trace'; el.innerHTML = html; messages.append(el); scrollDown();
  }
  function addError(title, text) {
    const el = document.createElement('div');
    el.className = 'error'; el.setAttribute('role', 'alert');
    el.innerHTML = `<strong>${title}</strong>${text}`; messages.append(el); scrollDown();
  }
  async function typing(ms = 900) {
    const el = document.createElement('div');
    el.className = 'msg agent typing'; el.innerHTML = '<i></i><i></i><i></i>';
    messages.append(el); scrollDown();
    await wait(ms); el.remove();
  }
  function setAgent(id) {
    document.querySelectorAll('#agents li').forEach((li) => li.classList.toggle('active', li.dataset.agent === id));
    window.AgentNet?.activate(id);
  }
  async function handOff(from, to) {
    addTrace(`${AGENT_NAME[from]} → ${AGENT_NAME[to]}`);
    if (window.AgentNet) await window.AgentNet.pass(from, to);
    setAgent(to); await wait(250);
  }
  async function action(name, args) {
    addTrace(`site action <code>${name}(${escape(JSON.stringify(args))})</code>`);
    await wait(300);
    const r = await window.SiteActions.run(name, args);
    window.AgentNet?.action(name, r.ok);
    if (!r.ok) addError('Action rejected', escape(r.error));
    return r.result;
  }

  /* Consent for another site: waits for the user, resolves to true or false */
  function askConsent({ origin, purpose, shared }) {
    const box = document.getElementById('consent');
    document.getElementById('consent-origin').textContent = origin;
    document.getElementById('consent-purpose').textContent = purpose;
    document.getElementById('consent-shared').innerHTML = shared.map((s) => `<li>${escape(s)}</li>`).join('');
    box.hidden = false;
    window.AgentNet?.consent('ask');
    const allow = document.getElementById('consent-allow');
    const deny = document.getElementById('consent-deny');
    allow.focus();
    return new Promise((resolve) => {
      const done = (answer) => { box.hidden = true; window.AgentNet?.consent(answer ? 'allowed' : 'denied'); allow.onclick = deny.onclick = box.onkeydown = null; resolve(answer); };
      allow.onclick = () => done(true);
      deny.onclick = () => done(false);
      box.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
    });
  }

  /* ---------- Demo scenarios ---------- */
  // Placeholder answers until the Ocean Conditions site exists
  const DEMO_CONDITIONS = {
    iceland: 'water around 8–11 °C, waves mostly 0.5–1.5 m, more than 20 hours of daylight. Boats go out on most days.',
    norway: 'water around 5–7 °C, waves 1–2 m. Because of the polar night, daylight is only a few hours of dusk.',
    azores: 'water around 16–19 °C, waves 1–2 m, 13–14 hours of daylight. Spring winds can cancel some trips.',
    canaries: 'water around 19–23 °C, waves 1–1.5 m. The sheltered south-west coasts are calm all year.',
    dominican: 'water around 26–27 °C, waves 1–2 m, 11 hours of daylight. Trade winds make the sea a bit choppier in the afternoon.',
    baja: 'water around 18–21 °C, waves under 0.5 m inside the lagoon, 11 hours of daylight.',
  };
  const ETHICS_NOTE = { caution: ' <em>(choose your operator carefully)</em>', concern: ' <em>(harassment reported)</em>' };
  const monthList = (ms) => (ms.length === 12 ? 'all year' : ms.map(month).join(', '));

  async function describeSpecies(id) {
    await handOff('guide', 'species-expert');
    await action('goToSpecies', { speciesId: id });
    await typing();
    const s = P.speciesById[id];
    addMessage('species-expert', `<p>${s.summary}</p><p>It grows up to ${s.length.max} metres and can dive to ${s.dive.recordMeters.toLocaleString('en-US')} metres. ${s.funFact}</p><p>I highlighted its card. Shall I show you where to see it?</p>`);
    setAgent('guide');
  }

  async function planTrip(id) {
    const s = P.speciesById[id];
    await handOff('guide', 'trip-planner');
    await action('showOnMap', { speciesId: id });
    await typing(1100);
    const rows = s.sightings.map((g) => `<p><strong>${P.regionById[g.region].name}</strong>, ${P.regionById[g.region].country}: ${monthList(g.months)}${ETHICS_NOTE[P.regionById[g.region].ethics?.rating] || ''}</p>`).join('');
    addMessage('trip-planner', `<p>I marked the ${s.sightings.length} best places for the ${s.name.toLowerCase()} on the map:</p>${rows}`);
    const risky = s.sightings.map((g) => P.regionById[g.region]).filter((r) => r.ethics?.rating === 'concern');
    if (risky.length) {
      await typing(600);
      addMessage('trip-planner', `<p>A word of warning: ${risky.map((r) => `in ${r.name}, ${r.ethics.reason.charAt(0).toLowerCase() + r.ethics.reason.slice(1)} ${r.ethics.tip}`).join(' ')}</p>`);
    }

    // If a spot is covered by Ocean Conditions, ask that site about the sea
    const target = s.sightings.find((g) => P.regionById[g.region].oceanConditionsRegion);
    if (!target) { setAgent('guide'); return; }
    const r = P.regionById[target.region];
    const span = `${month(target.months[0])} to ${month(target.months.at(-1))}`;
    await typing(700);
    addMessage('trip-planner', `<p>I don't know what the sea is like in ${r.name} from ${span}. I can ask the Sea Advisor on the Ocean Conditions site.</p>`);
    addTrace(`waiting for permission: <code>${OCEAN_ORIGIN}</code>`);

    const allowed = await askConsent({
      origin: OCEAN_ORIGIN,
      purpose: `Check sea conditions in ${r.name} (${r.country}) from ${span}`,
      shared: [`The question “Sea conditions in ${r.name}, ${span}”`],
    });

    if (!allowed) {
      addError('Connection denied', `Nothing was sent to ${OCEAN_ORIGIN}. Continuing with this site's information only.`);
      await handOff('trip-planner', 'guide');
      await typing();
      addMessage('guide', `<p>OK, I didn't contact the other site. Based on what I know, your best bet for the ${s.name.toLowerCase()} is ${r.name}, ${span}. Ask me again any time if you want the sea conditions.</p>`);
      return;
    }

    addTrace(`manifest fetched <code>${OCEAN_ORIGIN}/agent-manifest.json</code>`);
    await wait(400);
    addTrace('network validated <code>sea-advisor</code> · 1 agent · no tools');
    document.querySelector('[data-agent="sea-advisor"]').classList.add('loaded');
    await handOff('trip-planner', 'sea-advisor');
    await typing(1300);
    const cond = DEMO_CONDITIONS[r.oceanConditionsRegion] || DEMO_CONDITIONS.iceland;
    addMessage('sea-advisor', `<p>${r.name}, ${span}: ${cond}</p><p><em>Demo data. Real figures will come from the Ocean Conditions site.</em></p>`, 'peer-agent');
    await handOff('sea-advisor', 'guide');
    await typing();
    const best = month(target.months[Math.floor(target.months.length / 2)]);
    addMessage('guide', `<p>Putting both together, I suggest <strong>${r.name} in ${best}</strong>. It is the middle of the ${s.name.toLowerCase()} season and the sea is at its calmest. It can be chilly on deck, so bring an extra layer.</p>`);
  }

  async function explainThreats() {
    await handOff('guide', 'conservation-expert');
    const r = await action('filterSpecies', { status: ['EN', 'VU'] });
    await typing();
    const list = r.visibleSpecies.map((id) => P.speciesById[id]);
    addMessage('conservation-expert', `<p>${list.length} species in this guide are threatened: ${list.map((s) => `<strong>${s.name}</strong> (${D.conservationCodes[s.status].toLowerCase()})`).join(', ')}.</p><p>The biggest dangers are ship strikes, entanglement in fishing gear and underwater noise. I filtered the cards to show these species.</p>`);
    setAgent('guide');
  }

  async function explainEthics() {
    await handOff('guide', 'conservation-expert');
    const all = await action('getSpotEthics', {});
    await action('showOnMap', { ethicsOnly: true });
    await typing();
    const by = (rating) => all.spots.filter((x) => x.rating === rating).map((x) => x.name);
    addMessage('conservation-expert', `<p>Not every whale watching spot treats whales well. ${by('good').length} of the ${all.spots.length} spots in this guide have binding rules that are enforced; I left only those on the map.</p>` +
      `<p>Recent reports of chasing, crowding or harm come from <strong>${by('concern').join(', ')}</strong>. At ${by('caution').join(', ')} the rules are voluntary or weak, so the operator you pick matters.</p>` +
      '<p>Wherever you go: book a licensed tour, stay on the boat, and leave if the skipper chases the whales or crowds them with other boats. Open a spot on the map to see why it got its rating.</p>');
    setAgent('guide');
  }

  async function byMonth(m) {
    await handOff('guide', 'trip-planner');
    const r = await action('filterSpecies', { month: m });
    await typing();
    addMessage('trip-planner', `<p>In ${month(m)} you can see ${r.visibleSpecies.length} species: ${r.visibleSpecies.map((id) => P.speciesById[id].name).join(', ')}. I filtered the cards, and I can show them on the map too.</p>`);
    setAgent('guide');
  }

  function findSpecies(text) {
    const keys = {
      blue: ['blue'], humpback: ['humpback'], orca: ['orca', 'killer'], sperm: ['sperm'],
      gray: ['gray', 'grey'], minke: ['minke'], fin: ['fin whale'], bowhead: ['bowhead'], beluga: ['beluga'], cuvier: ['cuvier', 'beaked'],
    };
    return Object.keys(keys).find((id) => keys[id].some((k) => text.includes(k)));
  }

  function findScenario(raw) {
    const text = raw.toLowerCase();
    const id = findSpecies(text);
    const m = P.MONTHS.findIndex((x) => text.includes(x.toLowerCase())) + 1;
    if (id && /when|where|go|see|trip|plan/.test(text) && !/show me/.test(text)) return () => planTrip(id);
    if (id) return () => describeSpecies(id);
    if (/ethic|responsib|harass|sustainab/.test(text)) return explainEthics;
    if (/threat|endanger|danger|conservation|extinct/.test(text)) return explainThreats;
    if (m) return () => byMonth(m);
    return async () => {
      await typing(600);
      addMessage('guide', '<p>This draft only has a few scripted scenarios. Type a whale name (for example “beluga”), ask about a month (“what can I see in August?”) or pick one of the suggestions below.</p>');
    };
  }

  let busy = false;
  async function send(text) {
    if (!text.trim() || busy) return;
    busy = true;
    openPanel(true);
    addMessage('user', text);
    try { await findScenario(text)(); } finally { busy = false; setAgent('guide'); }
  }

  document.getElementById('composer').addEventListener('submit', (e) => {
    e.preventDefault(); const t = input.value; input.value = ''; send(t);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ask]');
    if (b) send(b.dataset.ask);
  });

  /* ---------- Model settings (bring your own key, interface only for now) ---------- */
  const settings = document.getElementById('settings');
  const byokFields = ['settings-url', 'settings-model', 'settings-key'].map((id) => document.getElementById(id));
  document.getElementById('settings-open').addEventListener('click', () => { settings.hidden = false; });
  document.getElementById('settings-cancel').addEventListener('click', () => { settings.hidden = true; });
  settings.addEventListener('change', (e) => {
    if (e.target.name === 'source') byokFields.forEach((el) => { el.disabled = e.target.value !== 'byok'; });
  });
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault(); settings.hidden = true;
    addTrace('model setting saved (demo: not used yet)');
  });

  /* ---------- Start ---------- */
  addMessage('guide', '<p>Hi, I\'m the Guide. I work with three experts who introduce whales and find the right place and time for you to see them.</p><p>Ask about a species, plan a trip, or find out which whales are endangered.</p>');
  // The panel stays closed when the page opens (Sari, 2026-11-18); the "Ask the Guide" button opens it
})();
