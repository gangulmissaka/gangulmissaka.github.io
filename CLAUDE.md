# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gangul Missaka's portfolio as a Bruno-Simon-style 3D open world: the visitor drives a 1939 car around a valley and
finds projects, skills, about and contact by driving into glowing rings. Next.js 14 (Pages Router) + TypeScript,
Three.js r168, cannon-es physics, fully synthesised Web Audio. `what_did_so_far.md` is the running feature log/handoff
doc: read it when resuming and update it after adding a feature.

## Commands

```powershell
npm run dev                                      # http://localhost:3000
npx tsc --noEmit -p .                            # type-check (the main correctness gate)
$env:NEXT_DIST_DIR='.next-build'; npx next build # production build without clobbering the dev server's .next
```

There are no tests and no ESLint config; `next build` also type-checks. `next.config.js` reads `NEXT_DIST_DIR`.

Preview URL flags (used for headless screenshots): `?mobile` forces the touch UI on desktop, `?autostart` skips the intro, `&cam=follow|chase|overview`,
`&at=x,z,heading` places the car, `&time=day|sunset|night`, `&tour` starts the guided tour, `&photo` opens photo mode.

## Architecture

**Entry:** `src/pages/index.tsx` dynamically imports `src/components/CyberWorld.tsx` with `ssr: false`. Everything
else under `src/components` (Desktop, TerminalApp, Scene3D, …) and `src/pages/{about,contact,projects}` is legacy and
unused; react-three-fiber/drei/gsap/mdx in package.json are only used by that legacy code.

**CyberWorld.tsx** is the whole app shell. One `useEffect` (runs once) builds the renderer, scene, physics and every
world module, then runs the `tick` loop: input → autopilot → car drive → `physics.world.step` → car sync → pond/grass/
ambient updates → proximity (rings/prompts) → achievements → camera → render. Two patterns matter:
- `live` (a ref) holds mutable state the loop reads every frame; React state only mirrors what the HUD shows. UI
  actions write requests into `live.current` (e.g. `auto`, `capture`, `timeOfDay`, `respawn`) and the loop consumes them.
- `actions` (a ref refreshed every render) is how the long-lived loop calls current React callbacks (`unlock`,
  `flash`, `tourArrived`, …). Add new callbacks to the `allActions` object.
- React → loop state goes through small `useEffect`s that copy into `live.current` (e.g. `radioOn` from the radio's
  playing state, read by the dancers).

**`src/world/*`** are plain factory modules (`createX(scene, physics, …)` returning `{ update(...), ... }`), no React:
- `layout.ts` — single source of truth for positions: roads, landmarks, rings, ramps, pond shape, `CLEAR_ZONES`
  (areas grass/clutter avoid). Units are metres; **-Z is north**, +X east. Car heading `h` means forward =
  `(-sin h, -cos h)`. Move things here, not in the modules.
- `environment.ts` — renderer, sky, sun, fog, time-of-day presets (`PRESETS`), and the post chain: RenderPass →
  `SanitizeShader` (kills NaN/overflow pixels so bloom can't black-flash the frame; keep it first) → bloom → output →
  `FinishShader` (dark cinematic grade).
- `props.ts` — physics world (`createPhysics`), GLB landmarks, playground (ramps, crates, drums, pins), stations.
  `BODY_KIND` maps bodies to impact sounds.
- `car.ts` — arcade driving: horizontal velocity is *imposed* each frame from `state.speed`; `sync()` reconciles speed
  after the physics step (threshold drops while touching dynamic bodies via `pushT`). `liftCap` stops props acting as
  ramps.
- `content.ts` (3D name letters with traced colliders, boards, stones, contact tiles), `showcase.ts` (skill showcase
  effect), `grass.ts` (GPU grass field with mask/trail canvases), `ambient.ts` (motes, fireflies, streaks, butterflies),
  `pond.ts` (code-built pond: water shader, ripples, plants, koi, spray), `sculptures.ts` (Nimbo + ManimDesk
  project sculptures), `dancers.ts` (Mixamo dancers at `DANCER_SPOTS`, dance while the radio plays),
  `autopilot.ts` (Dijkstra over sampled road centre lines + pure-pursuit driver with three-point turns;
  `obstacles()` lists what routes avoid), `achievements.ts`.
- `assets.ts` — GLB manifest (`MODEL_FILES`), loader (meshopt), `MODEL_CREDITS`, normalise/bake helpers.

**Content** lives only in `src/data/portfolioData.ts` (profile, education, projects, skill groups, approach, posts).
`PORTFOLIO_PROJECTS` order matches `PROJECT_SPOTS`; `SKILL_GROUPS` order matches `SKILL_SHOWCASES`.
Adding a project = entry in `PORTFOLIO_PROJECTS` + spot in `PROJECT_SPOTS` (optional `label` position) + its
landmark in `LANDMARKS` (code-built ones also go in `CODE_LANDMARKS` and are skipped by `placeLandmarks`) + its key
(`project-N`) in `TOUR_ORDER` in CyberWorld.tsx. Rings, labels, map markers, night lights and destinations are
derived from those lists automatically.

**Audio** (`src/lib/audio.ts`) is a singleton `sound` built on first user gesture. Car sounds go through `carBus` →
`carMaster` → destination, deliberately bypassing the master compressor (otherwise volume changes get squashed);
everything else goes through `master` → compressor. Levels: `CAR_VOLUME`, `ENGINE_TRIM`. `sound.duck(level | null)`
lowers both (0.06 under a project video, 0.3 under the radio). The graph is built once per page load, so audio
changes need a full page reload, not HMR.

**Radio** (`src/components/RadioSet.tsx`, `src/styles/radio.css`, songs in `src/data/radioStations.ts` as Spotify
track ids) drives a Spotify embed through Spotify's iFrame API (script loaded on first open). It stays mounted after
the first open so music survives closing it. Logged-out visitors get 17–30 s previews; Brave Shields hide the
Spotify login from the embed, so Brave users get previews too (the radio shows a Brave tip). Playback rules learned
the hard way:
- The embed silently drops commands sent before its `ready` event → requests are queued (`readyRef`, `pendingPlay`).
- "Paused at 0:00" is what a blocked/failed start looks like, not a finished song. Only advance when the song really
  played (`maxPos` > 3 s) and reached its end; previews can also end without a paused update (watchdog). Never
  auto-advance twice within 8 s. If nothing starts, show "Press ▶ on the Spotify player" instead of skipping.

**HUD/panels** are React in CyberWorld.tsx, styled by `src/styles/world.css` (glass panels, `.modal`, `.is-photo`
hides the HUD, print rules for the Quick view résumé).

## Models

Source GLBs (Sketchfab, CC-BY-4.0) sit in `F:\MyPortfolio\*.glb`; optimised copies (gltf-transform meshopt + WebP)
are in `public/models`. When adding/removing a model, update `MODEL_FILES`, `SIZE_KB` and `MODEL_CREDITS` in
`assets.ts` (credits are shown in Options). The pond and the two project sculptures (`sculptures.ts`, keys
`nimbo`/`manim`, listed in `CODE_LANDMARKS`) are built in code, not GLBs.
`public/models/dancer.glb` (Mixamo, converted from the FBX in the parent folder) is loaded separately by
`world/dancers.ts`, not through `MODEL_FILES`.

## Gotchas

- **cannon-es broadphase:** static/sleeping bodies keep the AABB computed at creation (the origin) and SAP only
  re-sorts on add/remove, which silently skipped car↔crate pairs. `createPhysics` fixes this in a `preStep` listener
  (refresh every AABB + mark SAP dirty). Don't remove it.
- Physics is verified in the real page, not only in a standalone cannon sim (a small sim hid the bug above). In dev,
  `window.__world = { car, physics, crates, live }` is exposed for headless checks (e.g. `__world.live.radioOn = true`
  makes the dancers dance without Spotify).
- Visual checks run headless Chrome with `--use-angle=swiftshader --enable-unsafe-swiftshader`, driven over CDP
  (wait for `.hud-top`, then `Page.captureScreenshot`); software GL is ~4–5 s/frame, so driving can't be observed
  live — the autopilot was validated by compiling `autopilot.ts` + `layout.ts` with tsc (commonjs) and simulating the
  tour in Node.
- Media/autoplay behaviour must be tested with real CDP mouse clicks (`Input.dispatchMouseEvent`) and **without**
  `--autoplay-policy=no-user-gesture-required`; that flag hid the radio's skipping bug. Clicks into the cross-origin
  Spotify iframe don't register in headless Chrome.
- Point lights for night are always present (intensity 0 by day) so the light count, and thus shaders, never change.
