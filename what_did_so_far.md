# Portfolio Project — Development Summary

**Updated:** 2026-11-04 (pond, autopilot, tour, time of day, photo mode, quick view, Nimbo + ManimDesk sculptures, Spotify radio)
**Owner:** Gangul Missaka Hinguralaarachchi (content from `F:\MyPortfolio\Gangul_Missaka_Details.docx`)
**Project path:** `F:\MyPortfolio\portfolio` · **Dev URL:** `http://localhost:3000`

An interactive 3D portfolio structured like bruno-simon.com: visitors drive a 1939 classic car around a meadow
valley enclosed by pine forest. All content is found by driving — the name is built from physical letters you can
knock over, projects live in houses, skills by the statues, and contact links are tiles you drive onto.

---

## Stack

| Part | Tech |
|---|---|
| Framework | Next.js 14 (Pages Router), TypeScript |
| Rendering | Three.js r168 — ACES tone mapping, soft shadows, sky-based image lighting, bloom, and a dark cinematic grade (`FinishShader` in `src/world/environment.ts`) |
| Physics | cannon-es |
| Models | 12 Sketchfab GLBs (CC BY 4.0), optimised with `gltf-transform` (meshopt + WebP). The pond is built in code. |
| Audio | Fully synthesised Web Audio engine (`src/lib/audio.ts`) — no audio files |

## Code layout

```
src/
  components/CyberWorld.tsx   React shell: boot, game loop, camera, input, maps, HUD, all panels
  components/RadioSet.tsx     The valley radio (Spotify iFrame API) + now-playing pill
  data/radioStations.ts       Radio song list (Spotify track ids)
  styles/radio.css            Radio cabinet styles
  data/portfolioData.ts       ALL site content (profile, education, projects, skills, approach, posts)
  world/layout.ts             Where everything is in the world (zones, roads, landmarks, spots)
  world/content.ts            In-world content: 3D name letters, ground decals, About board, notice board,
                              "How I Build" stones, contact tiles
  world/achievements.ts       The 16 achievements (saved in localStorage)
  world/assets.ts             Model manifest, loader, credits, normalise/crop/bake helpers
  world/environment.ts        Renderer, sky, sun, fog, post-processing (+ quality switch)
  world/terrain.ts            Ground shader, roads, grass, forest ring
  world/grass.ts              Interactive GPU grass field (~100k blades) around the car
  world/ambient.ts            Pollen motes, fireflies, wind streaks, butterflies
  world/pond.ts               Hand-built pond: water shader, ripples, reeds, lily pads, rocks, koi, spray
  world/sculptures.ts         Code-built project sculptures for Nimbo (west) and ManimDesk (east)
  world/autopilot.ts          Road-graph route planner + self-driving controller (map + guided tour)
  world/props.ts              Physics, landmarks, playground, project rings, skill plinths, radio mast, relics
  world/car.ts                Classic car: spinning/steering wheels, lights, dust, arcade driving
  styles/world.css            HUD / panels / intro styles
public/models/  public/images/gangul.jpg  public/fonts/helvetiker_bold.typeface.json
```

## Structure (modelled on bruno-simon.com)

| Bruno Simon | This site |
|---|---|
| Name in big 3D letters at the start, knockable | "GANGUL MISSAKA" physical letters + role/university written on the ground. Each letter's collider is traced from the font outline (`glyphBoxes` in content.ts, 3–20 boxes per letter, holes included), with the centre of mass at the glyph's centroid; 60 kg/m³, own contact materials, 120 Hz physics, 16 solver iterations |
| Controls drawn on the ground | Key-cap decal (drive, boost, jump, brake, interact, respawn, map) beside the spawn |
| Welcome panel ("Welcome! My name is…") | Welcome card on start (auto-hides after 16 s) |
| Project areas you drive into | 4 projects, one per house — drive into the ring, press E |
| Info / about | About billboard with photo → full About panel (summary, education, approach, interests) |
| Contact / social links in the world | GET IN TOUCH tiles: Email, GitHub, LinkedIn, Website |
| Icon menu: map, achievements, controls, options | Same icon bar top-right + brand badge (opens About) top-left |
| Options: audio, quality, "I'm stuck!", reset | Sound, High quality, Engine, Camera mode, I'm stuck, Reset objects, Reset achievements, credits |
| Achievements | 16 achievements with toast + fanfare |
| Map (M) | Full labelled map panel + minimap |
| Jump (Space), brake (B/Ctrl), respawn (R), honk (H) | Same keys |
| Physics toys | Crates, bowling pins, oil drums, ramps, hoop, relics |

Not copied: Bruno's own art, models, music, circuit/leaderboard and visitor "whispers" (they need a server).

## World zones

- **Start (centre-south):** spawn, 3D name, subtitle, controls decal, fuel pump + parked motorbike
- **About board:** east of the spawn · **Notice board (LinkedIn posts):** west of the spawn
- **How I Build:** four standing stones (01 Analyze → 04 Optimize) along the west cross road
- **Projects:** Personal Portfolio Website (NW house), APPARITION (NE stilt house), Network Design (SW shack),
  Roll-a-Ball (SE pond), Nimbo (west sculpture, end of the cross road), ManimDesk (east sculpture)
- **Skills — showcased by the 3D models** (`SKILL_SHOWCASES` in layout.ts, effect in `world/showcase.ts`):
  Hunter statue → Software Engineering · Nile → Databases & Data · Chamois → Cybersecurity & IT ·
  old motorbike at the start → Professional Skills. Drive into the ring, press **E**: the car parks, the camera
  sweeps around the model, a coloured spotlight + rising motes appear, one holographic orb per skill (with its %)
  rises and orbits the model, and a side panel counts the bars up. ←/→ switch statue, E/Esc back to driving.
- **APPARITION video:** the project panel embeds the gameplay trailer (youtube-nocookie, id `GJBbG5MLQfE`);
  the world's audio ducks while the panel is open.
- **Contact:** tiles at the south end of the main road, next to the radio mast
- **Playground:** ramps, hoop, crate pyramid, bowling pins, drums in the middle

## Living meadow (Bruno-Simon style)

- **Grass field** (`grass.ts`): ~100k GPU-instanced blades in a 36 m patch that follows the car and fades out
  smoothly at the edge. Wind gusts roll across it, blades bend away from the car, tyres press tracks that spring
  back over a few seconds, wildflowers and dry patches are mixed in. A mask keeps it off roads, decals and rings.
  Tunables at the top of the file: `RADIUS`, `SPACING`; blade width/height/colour are in the shader.
  **Options → High quality** off drops it to 45% of the blades.
- **Ambient life** (`ambient.ts`): drifting pollen/dust motes, blinking fireflies around the pond and forest edge,
  thin white wind streaks that curl with the gusts, and 22 butterflies that scatter when the car gets close.

## Unique features (added 2026-11-04)

- **Guided tour (T, compass button, or "Take the guided tour" on the intro):** the car drives itself to 12 stops
  (About → Professional skills → Posts → How I Build → houses, statues, pond → Contact). Each stop shows a short
  caption with Open / Next / End buttons and moves on by itself after 14 s. Any drive key takes over.
- **Autopilot "Take me there":** in the map panel, click a place on the map or pick one from the list. The route is
  drawn on the map and minimap. Routes follow the roads and avoid the name letters, ramps, crates, stones and houses
  (`obstacles()` in autopilot.ts). The driver does three-point turns when it faces the wrong way.
- **Time of day (N, sun/moon button, Options):** Day / Golden hour / Night. Night has stars, a cool moon, longer and
  brighter headlights, coloured light pools at every stop and brighter fireflies. Presets live in `PRESETS` in
  environment.ts.
- **Photo mode (P, camera button):** HUD hides, drag to orbit, scroll to zoom, switch the time of day, Space saves a
  framed postcard PNG (name, role, date) to the visitor's downloads.
- **Quick view (HUD pill, or "Quick view (no driving)" on the intro):** a one-page résumé (summary, projects, skills,
  education, approach, interests, contact) with Print / PDF that prints as a clean CV.
- **The pond** (replaces the bugged GLB): animated reflective water with shoreline foam and ripple rings, a muddy bed,
  swaying reeds and cattails, lily pads with flowers, mossy rocks (big ones are solid) and koi that leap out. Driving
  in slows the car, sinks it a little, throws spray, leaves a wake and plays splash sounds. Shape: `POND` /
  `pondRadiusAt` in layout.ts.
- 4 new achievements (20 total): Making waves, Night owl, Sit back and enjoy, Postcard.

## Desktop-app sculptures (added 2026-11-04)

Two GitHub apps are now projects, each presented by a sculpture built in code (`world/sculptures.ts`, scaled by
`SCALE`; positions are `nimbo` / `manim` in `LANDMARKS`, rings in `PROJECT_SPOTS`, short spur roads off the loop):

- **Nimbo — Image Organizer** (west, x -70): "The Sorting Cloud". A marble cloud floats over an octagonal plinth;
  30 polaroid photos (one instanced mesh, 4×4 canvas atlas) spiral down out of it and settle flat onto four filed
  stacks labelled 2023–2026. Light beam + glowing inlay ring. Links: Releases (download) + GitHub.
- **ManimDesk** (east, x 70): "The Equation Engine". A brass trefoil knot on a pedestal over a glowing grid,
  inside a render frame that flips between 16:9 and 9:16 (with REC dot, play icon and ratio label). A glowing
  curve "Creates" itself around the knot Manim-style (tube draw range), then uncreates. Formulas (Euler, Gauss,
  Pythagoras, Schrödinger…) fade in and drift up. Links: GitHub + latest release.
- Project labels for these two float beside the sculpture (`label` in `PROJECT_SPOTS`) so they don't cover it.
- Tour now has 14 stops (Nimbo after "How I Build", ManimDesk after the stilt house). "Portfolio tour"
  achievement now needs all six projects. Two relics moved to make room: (-72,-22) and (72,16).

## Valley radio (added 2026-11-04)

HUD radio button (lights up while music plays) opens a 1930s cathedral tabletop radio (`RadioSet.tsx`,
`radio.css`): arched walnut cabinet, speaker cloth behind fretwork that pulses with the music, a backlit amber
dial with a red needle and one mark per station, a green "magic eye" tuning tube, a Spotify strip in a brass
bezel, piano keys (previous / play-pause / stop / next), a TUNING knob (click left/right half or scroll) and a
POWER knob. A paper "Station log" lists all songs; ←/→ tune while it is open, Esc closes.

- Music comes from the official Spotify embed, controlled with Spotify's iFrame API (script loads only the first
  time the radio opens). Visitors not logged in to Spotify hear 30-second previews; that is Spotify's rule.
- When a song or preview ends the radio tunes to the next station, but only if the song really played
  (`maxPos` > 3 s) and never twice within 8 s. A preview can end without a "paused" event, so a watchdog also
  advances when the position sits at the end.
- If Spotify doesn't start a song (browser autoplay rules for cross-site iframes, Spotify login, …) the radio
  stops, shows "Press ▶ on the Spotify player" and pulses the Spotify strip, instead of skipping stations.
  (Bug fixed 2026-11-04: a "paused at 0:00" update used to count as "song ended", so a browser that blocked
  playback made the radio skip through every station.) Updates for a previous track are ignored via
  `playingURI`.
- Commands sent before the embed's 'ready' event are silently dropped by Spotify, so play/tune requests made
  while it loads are queued (`readyRef`, `pendingPlay`) and run on 'ready'.
- Brave (detected with `navigator.brave`): Shields block Spotify's login cookie inside the embed, so even
  logged-in visitors hear previews; the radio shows a tip (allow cross-site cookies via the lion icon, enable
  Widevine in Settings → Extensions). Verified in headless Brave 1.98: plays previews and auto-advances.
- Closing the radio keeps the music playing (the cabinet stays mounted, just hidden); a "now playing" pill under
  the HUD has pause/play, next, power and reopens the radio.
- While music plays the world's sounds duck to 30% (`sound.duck(level)`); tuning plays synthesised static
  (`sound.radioStatic()`).
- Songs: `RADIO_STATIONS` in `src/data/radioStations.ts` (Spotify track ids, verified against Spotify's embed
  data). Add or remove a song there; the dial and log follow.

## Radio dancers (added 2026-11-04)

Six dancers (`world/dancers.ts`, spots in `DANCER_SPOTS` in layout.ts) dance whenever the radio plays a song:
by the fuel pump, the notice board, the radio mast, the pond shore, and either side of the statue garden.

- Model: Mixamo "Kachujin" with the "Northern Soul Spin Combo" clip. Source `F:/MyPortfolio/Northern Soul Spin
  Combo.fbx` (19 MB) was converted in headless Chrome with three's FBXLoader + GLTFExporter (textures 1024 px,
  the hair alpha map baked into the colour texture's alpha, scale tracks dropped) to `public/models/dancer.glb`
  (5.7 MB). It loads in the background after the world starts, so it doesn't slow the intro.
- One clip, cloned with SkeletonUtils; each dancer starts at a different point of the routine and a slightly
  different tempo. Hips root motion is pinned horizontally (they spin on the spot). Radio off: they blend
  (0.7 s) into a still first-frame pose; radio on: into the dance.
- While dancing: a coloured glow on the ground and a soft additive spotlight beam; after dark their textures
  self-glow a little (no extra lights, so shader/light counts don't change).
- Static cylinder colliders (the car bumps into them); the autopilot steers around them; grass is cleared.
- Loop wiring: `live.current.radioOn` mirrors the radio's playing state; `dancers.update(dt, elapsed, radioOn,
  env.lamps)`. Dev hook `window.__world.live.radioOn = true` makes them dance for headless screenshots.
- Credited in Options credits as Mixamo (Adobe).

## Fixes (2026-11-04)

- **Black flash while driving:** a guard pass (`SanitizeShader`, environment.ts) now cleans invalid / over-bright
  pixels before bloom, which otherwise smeared one bad pixel over the whole frame. Dust, pollen and firefly sprites
  are size-capped and fade near the lens, and the camera is lifted out of houses and statues instead of clipping
  inside them.

- **Car drove through the wooden crates (and could miss other objects):** real cause was a cannon-es broadphase
  pitfall. Static and sleeping bodies keep the AABB computed at creation (at the origin) after being positioned, and
  the SAP list is only sorted when bodies are added, so SAP stopped scanning before reaching the crates. Fixed in
  `createPhysics` (props.ts): every body's AABB is refreshed and the list re-sorted before each step. Also: crates are
  45 kg (were 30), the car keeps its real post-impact speed after hitting movable objects (`pushT` in car.ts), and the
  car/prop contact is stiffer. Verified in the real game: driving into the pyramid at ~49 km/h stops the car and
  shoves and tilts the crates.
- Dev-only debug hook: `window.__world = { car, physics, crates }` (not in production builds).

## Controls

W A S D drive · Shift boost · Space jump · B / Ctrl brake · E / Enter interact · M map · R respawn · H horn ·
F engine · C camera · Q / drag rotate view · L mute · N time of day · P photo mode · T guided tour

## Sound (all synthesised)

Engine with gears, tyres by surface (grass / dirt / wooden ramp), skids, impacts by material, birds, pond,
horn, relic chime, arrival ding, jump spring, achievement fanfare, UI clicks. Silent when the engine is off.

## Notes / to do

- APPARITION's link points to the LinkedIn profile (the post URL wasn't in the document) — swap in the exact
  post or YouTube URL in `portfolioData.ts` when you have it. Network Design and Roll-a-Ball have no public link.
- Unused older files remain: `Desktop`, `TerminalApp`, `Window`, `BootSequence`, `Scene3D`, `Experience`,
  `CameraRig`, `ParticleField`, `CanvasBackground`, `LoadingScreen`, and the `about/contact/projects` pages.

## Running

```powershell
cd F:\MyPortfolio\portfolio; npm run dev
```

Preview flags: `/?autostart` skips the intro, `&cam=chase|overview` picks the camera, `&at=x,z,heading` places the car,
`&time=day|sunset|night`, `&tour` starts the guided tour, `&photo` opens photo mode.

## Mobile controls (2026-11-19)

Phones/tablets (`pointer: coarse` + short side < 900px, or `?mobile` on desktop) get `live.mobile` / `.is-mobile`:
- **Joystick** bottom-centre (`.stick`, handlers `stickProps` in CyberWorld.tsx): analog, up = throttle, down = reverse,
  left/right = steer, diagonals blend; 14% deadzone. Writes `live.touch.throttle/steer`. Touching it cancels autopilot/tour.
- **Jump / Boost** round buttons either side of the stick.
- **Car button** (right edge) opens the **Car controls** drawer: engine, horn, view, reset car, time of day, sound, radio,
  map, tour, photo, quick view, awards, about, help, options. The top-bar icon row is hidden on mobile.
- **Camera:** defaults to `chase`; on mobile it sits lower/closer (8.2 m back, 3.3 m up). FOV is 84° portrait / 72° landscape
  (+8 while boosting); desktop stays 50°.

## Hosting (2026-11-24)

This site now lives at **https://gangulmissaka.github.io/valley/** (`basePath` `/valley` in `next.config.js`; raw asset
URLs go through `asset()` in `src/lib/basePath.ts`). The github.io root and `404.html` (`pages-root/`) forward to the
main portfolio, whose URL is the repository variable `MAIN_SITE_URL` used by the deploy workflow. The main portfolio
links here with plain links, so none of this 3D site loads until a visitor chooses it.
