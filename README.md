# Whale Guide

An interactive guide to twelve whale species, built for the **Open Agentic Web Challenge**.
Dive from the surface to 3,000 metres, meet the whales that live at each depth, compare their sizes,
listen to their real underwater sounds, and find the place and month to see them in the wild.

> Status: draft. The design, data and site actions are in place. The "Ask the Guide" chat runs on scripted
> scenarios for now; the real model and the agent runtime (nsDeploy) come next.

## Quick start

No build step and nothing to install. Pick one:

| Way | How |
|---|---|
| **Double-click** | Open `index.html` in your browser. Everything works except the live GBIF sightings. |
| **Windows** | Double-click `start.bat`. It serves the site on <http://localhost:5500> with Python or Node.js. |
| **Any OS** | `npm start` (needs Node.js), or `python -m http.server 5500`, then open <http://localhost:5500>. |

An internet connection is needed for the map imagery, the fonts, the whale images and the sounds.

## What is on the page

- **Hero**: a blue whale swims across the title.
- **Species**: 12 cards in three depth zones (Sunlight 0–200 m, Twilight 200–1,000 m, Midnight below 1,000 m).
  Each card has length, weight, record dive, IUCN status, best months, sources and, for 10 species, a real NOAA recording.
  The filters at the top narrow them down by feeding type, status or month.
- **Side by side**: pick a whale and see it to scale next to a city bus and a person, who stay in place on a metre ruler.
- **Where and when?**: 25 whale-watching spots on a map. Pick a whale or a month; load real sightings from GBIF.
- **Ocean giants, still fragile**: how many species are threatened and why.
- **Ask the Guide**: the chat panel, with a live drawing of the four agents (Guide, Species Expert, Trip Planner,
  Conservation Expert) and the consent step before talking to the second site (Ocean Conditions).

## Things to try

- In the chat: "Show me the blue whale", "When can I see humpbacks?" (the consent dialog appears: try Deny and Allow),
  "What can I see in August?", "beluga".
- In the browser console (F12), call the site actions directly:
  `filterSpecies({ status: ['EN'] })`, `showOnMap({ month: 1 })`, `goToSpecies({ speciesId: 'cuvier' })`,
  `playSound({ speciesId: 'humpback' })`, and a rejected input: `goToSpecies({ speciesId: 'dolphin' })`.

## Project layout

| Path | What it is |
|---|---|
| `index.html` | Page skeleton |
| `css/style.css` | All styling. Colours and fonts are tokens in `:root` |
| `data/whales.json` | **Source data**: species, watching spots, depth zones, sounds, sources |
| `js/data.js` | Copy of `whales.json` so the site works by double-click. Regenerate it after editing the JSON |
| `js/page.js` | Builds the cards, filters, size line-up and depth gauge |
| `js/map.js` | Leaflet map, month filter, GBIF sightings |
| `js/actions.js` | **Site actions** the agents use: `filterSpecies`, `goToSpecies`, `showOnMap`, `showSightings`, `getSpeciesInfo`, `playSound`. Each has a purpose, a JSON Schema input and an effect type |
| `js/scene.js` | Hero whale animation and marine snow |
| `js/swim.js` | The card and line-up whales swimming in place |
| `js/sound.js` | Whale sound player |
| `js/agentnet.js` | The live agent network drawing in the chat panel |
| `js/chat.js` | Chat panel, consent dialog, model settings (scripted demo for now) |
| `js/ranges.js`, `tools/build_ranges.js` | Approximate species ranges (built from Natural Earth coastlines) |
| `vendor/` | GSAP 3.12.5 and Leaflet 1.9.4, stored locally |
| `img/` | Logo |

## Editing the data

1. Change `data/whales.json`.
2. Run `python tools/copy_data.py` (or `npm run data`) to update `js/data.js`.
3. Reload the page.

## Working together

1. Clone: `git clone https://github.com/Volkansari3/whale-guide.git`
2. Make a branch for your change: `git checkout -b my-change`
3. Commit and push it: `git push -u origin my-change`
4. Open a Pull Request on GitHub. Keep `main` working: merge only after the page has been checked in a browser.

## Credits

- Whale sounds: NOAA Fisheries, "Sounds in the Ocean" (Northeast Fisheries Science Center, Passive Acoustics Branch) and its partners.
- Facts: NOAA Fisheries and the IUCN Red List, plus the papers listed on each card.
- Live sightings: GBIF.org. Map imagery: Esri, Maxar, Earthstar Geographics. Coastlines: Natural Earth.
- Whale images were generated with AI for this site.

## Known gaps

- Whale images and sounds load from external servers; they should be copied into the project before launch.
- `agent-manifest.json`, the agent network file and `links.json` (challenge spec) do not exist yet.
- The second site, Ocean Conditions, is not built yet.
