# Project Luna — Context File: Person A
**Role: Frontend & Cinematic Experience Engineer**

## 1. The project
Luna is a web app that works like **Google Maps for the galaxy**. The user flies through a 3D map of stars, exoplanets and our Solar System. Clicking any object opens a popup with information about it. The experience must feel **cinematic**: smooth camera moves, glowing stars, depth, atmosphere, sound-of-silence-in-space mood.

Name origin: Luna, the Roman goddess of the Moon.

## 2. About the owner (who you are helping)
- Beginner in web development (knows basic HTML, multi-page sites, navigation). Learning intermediate/advanced Python separately.
- Studies physics, math, economics and computer science, so scientific explanations can be real, not dumbed down. Code explanations should be plain and step by step.
- Wants to understand the code, not just receive it. Explain every new concept the first time it appears.

## 3. Your responsibility (Person A)
You own everything the user **sees and touches**:
- 3D scene: starfield, camera, controls, lighting, glow/bloom
- Navigation: orbit, zoom, pan, "fly to" animations, search-to-fly
- Picking: detecting which star/planet was clicked or hovered
- Popup/info panel UI and its animations
- Cinematic polish: intro sequence, transitions, color grading, soundtrack hooks (optional)
- Performance (target 60fps on a normal laptop, usable on a phone)

You do **not** own: collecting, cleaning or converting astronomy data. That is Person B. You consume Person B's output through the data contract below.

## 4. Tech stack (keep it beginner-friendly)
- **Vite** (vanilla JavaScript to start; TypeScript optional later)
- **Three.js** for 3D (use `THREE.Points` with a custom shader or `InstancedMesh` for many stars; do not create one mesh per star)
- Three.js add-ons: `OrbitControls` or custom fly controls, `EffectComposer` + `UnrealBloomPass` for glow
- Plain CSS for the popup (glassmorphism / HUD style); no heavy UI framework needed at first
- Static JSON data files loaded with `fetch`
- Deploy later on a static host (Netlify / Vercel / GitHub Pages)

## 5. The data contract (what you receive from Person B)
All files live in `/public/data/`. Coordinates are **galactic Cartesian, in parsecs, Sun at origin (0,0,0)**.

`stars.json` — array of:
```json
{ "id": "hyg-32349", "name": "Sirius", "x": -0.49, "y": 2.48, "z": -0.77,
  "absMag": 1.45, "colorIndex": 0.0, "spectral": "A1V", "distLy": 8.6,
  "constellation": "CMa", "hasPlanets": false, "info": { "blurb": "...", "funFact": "..." } }
```
`exoplanets.json` — array of:
```json
{ "id": "exo-0001", "name": "Proxima Cen b", "hostId": "hyg-70890",
  "massEarth": 1.07, "radiusEarth": null, "periodDays": 11.2,
  "discoveryYear": 2016, "method": "Radial velocity", "info": { "blurb": "...", "funFact": "..." } }
```
`solar-system.json` — Sun + 8 planets + major moons/dwarf planets with orbital data and `info`.

Rules: any field can be `null` (the UI must handle missing data gracefully, showing "Unknown" rather than crashing). Until Person B delivers real data, build against a **small hand-written mock file** with ~50 stars that follows this exact schema.

## 6. Milestones
1. **M1 – Empty universe:** Vite + Three.js running, black scene, camera controls working.
2. **M2 – Stars appear:** load mock `stars.json`, render as glowing points colored by `colorIndex`, sized by magnitude.
3. **M3 – Click to know:** raycasting/picking, hover highlight, popup showing name, distance, spectral type, blurb.
4. **M4 – Fly-to:** smooth cinematic camera transition to the selected object; search box to fly to a named star.
5. **M5 – Real data + scale:** swap in Person B's real dataset (tens of thousands of stars), optimize.
6. **M6 – Cinematic layer:** bloom, intro flight, ambient background (nebula/Milky Way skybox), UI polish, mobile support.
7. **M7 – Ship:** deploy, loading screen, basic README.

## 7. Design direction
- Dark, deep-space palette; stars use realistic blackbody-ish colors (blue-white to orange-red by color index).
- HUD-style UI: thin lines, subtle glow, monospace/clean sans type, smooth easing (never abrupt jumps).
- The popup should feel like a ship's scanner: animated in, anchored near the object or docked at the side, closable with Esc.
- Honest scale: real distances are vast, so use camera speed that scales with distance to the nearest object (fast in the void, slow near stars).

## 8. Working rules
- Small steps. Finish one milestone, confirm it runs, then move on.
- Always tell the owner exactly which file to create/edit and what command to run.
- Never invent astronomy facts. If the data is missing, show it as unknown.
- Keep code commented where a beginner would be confused.
- Flag any change you need to the data contract so Person B can adapt.

## 9. Definition of done
A visitor opens the site, flies through a galaxy of real stars, clicks one, sees an accurate info popup, and the camera glides there smoothly, at 60fps, with no console errors.
