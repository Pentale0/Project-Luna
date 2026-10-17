import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { createUI } from './ui.js'
import { createDeepSky } from './deepsky.js'
import { createMinimap } from './minimap.js'
import { fetchPhoto, starCanvas, exoplanetCanvas, solarBodyCanvas, hashSeed, planetPortraitFromUrl, glowSpriteCanvas } from './textures.js'

// ---------------------------------------------------------------------------
// Luna — a "Google Maps for the stars".
//  M1: scene + camera + controls          M2: real stars as glowing points
//  M3: click any object -> info panel     M4: search + cinematic fly-to
//  (plus) a stylised Milky Way backdrop and the Solar System around the Sun.
//
// Units: world space is in parsecs (1 pc = 3.26 light-years). The real star
// cloud spans ~1000 pc, so the Solar System is drawn *exaggerated* to stay
// visible — it is explicitly NOT to scale (the real Sun–Earth distance is
// 4.8e-6 pc, invisible next to stars). We label it as such in the UI.
// ---------------------------------------------------------------------------

// --- Renderer / scene / camera ---------------------------------------------
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.002, // close enough to fly into the (exaggerated) Solar System
  25000, // far enough to see the whole star cloud
)
// Galactic north (+z) is "up", so the Milky Way disc lies flat like a map.
camera.up.set(0, 0, 1)
camera.position.set(0, 220, 440)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.querySelector('#app').appendChild(renderer.domElement)
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.6, 0.26)
composer.addPass(bloom)

// Bloom sells the galaxy view but wrecks close-up legibility: flying to Earth,
// the Sun's halo washed the planet right out. Ramp strength with zoom instead
// of holding it flat — nearly off inside the Solar System, full out in the
// star cloud. (Reads camera↔target distance, i.e. how far we are *looking*.)
const BLOOM_FAR = 1.0
const BLOOM_NEAR = 0.1
function updateBloom() {
  const d = camera.position.distanceTo(controls.target)
  const k = THREE.MathUtils.smoothstep(d, 0.01, 8)
  bloom.strength = BLOOM_NEAR + (BLOOM_FAR - BLOOM_NEAR) * k
}

// CSS2D label overlay (kept for future labels; nothing attaches a CSS2DObject
// yet). The render loop below only paints it once a label exists, so the extra
// pass costs nothing until then.
const labelRenderer = new CSS2DRenderer()
labelRenderer.setSize(window.innerWidth, window.innerHeight)
labelRenderer.domElement.style.position = 'absolute'
labelRenderer.domElement.style.top = '0'
labelRenderer.domElement.style.left = '0'
labelRenderer.domElement.style.pointerEvents = 'none'
document.body.appendChild(labelRenderer.domElement)

// Mini-map (top-down galactic view) + scale bar (bottom-right HUD).
const minimap = createMinimap(document.getElementById('minimap-canvas'))
const scalebarLine = document.getElementById('scalebar-line')
const scalebarLabel = document.getElementById('scalebar-label')

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 0.0006
controls.maxDistance = 18000

// Every point-cloud material we create, so resize can update their scale.
const pointMaterials = []

// --- Colour / size helpers --------------------------------------------------
function bvToColor(bv) {
  if (bv === null || bv === undefined) return [0.85, 0.9, 1.0]
  const b = Math.max(-0.4, Math.min(2.0, bv))
  const temp = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))
  const t = temp / 100
  let r, g, blue
  if (t <= 66) {
    r = 255
    g = 99.47 * Math.log(t) - 161.12
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332)
    g = 288.12 * Math.pow(t - 60, -0.0755)
  }
  if (t >= 66) blue = 255
  else if (t <= 19) blue = 0
  else blue = 138.52 * Math.log(t - 10) - 305.04
  const clamp = (v) => Math.max(0, Math.min(255, v)) / 255
  return [clamp(r), clamp(g), clamp(blue)]
}

function absMagToSize(absMag) {
  const brightness = Math.pow(10, -0.4 * (absMag - 4.83))
  return Math.min(1.5, Math.max(0.05, 0.25 * Math.pow(brightness, 0.25)))
}

// --- Point shader -----------------------------------------------------------
const VERTEX_SHADER = `
  uniform float uScale;      // world size -> screen pixels
  uniform float uMaxSize;    // clamp so nearby points don't fill the screen
  attribute float aSize;     // per-point radius (parsecs)
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, uMaxSize);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAGMENT_SHADER = `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, alpha * uOpacity);
  }
`

function makeStarMaterial({ maxSize = 60, opacity = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 1 },
      uMaxSize: { value: maxSize },
      uOpacity: { value: opacity },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  pointMaterials.push(m)
  return m
}

function makePoints(positions, colors, sizes, material) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  return new THREE.Points(g, material)
}

function updatePointScale() {
  const bufferSize = renderer.getDrawingBufferSize(new THREE.Vector2())
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
  const scale = bufferSize.y / (2 * Math.tan(halfFov))
  for (const m of pointMaterials) m.uniforms.uScale.value = scale
  deepsky.updateScale(scale)
}

// --- Milky Way backdrop (stylised, decorative — not real data) --------------
// A two-armed logarithmic spiral of faint points plus a dense core, so the
// scene reads as a galaxy when zoomed out. Fades away as you zoom into the
// Solar System (where it would just be clutter).
const GALAXY_RADIUS = 9000 // pc
let backdrop = null

function buildMilkyWay() {
  const N = 12000
  const positions = new Float32Array(N * 3)
  const colors = new Float32Array(N * 3)
  const sizes = new Float32Array(N)
  const arms = 2
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

  for (let i = 0; i < N; i++) {
    const r = GALAXY_RADIUS * Math.pow(Math.random(), 0.55)
    const arm = Math.floor(Math.random() * arms)
    // spiral twist: angle grows with radius
    const theta = (r / GALAXY_RADIUS) * 5.2 + (arm * Math.PI * 2) / arms
    const a = theta + gauss() * 0.28
    const rad = r + gauss() * 260
    positions[i * 3] = Math.cos(a) * rad
    positions[i * 3 + 1] = Math.sin(a) * rad
    positions[i * 3 + 2] = gauss() * (70 + r * 0.05) // thin disc, thicker outside

    // warmer + brighter near the core, cooler blue-white in the arms
    const centr = Math.max(0, 1 - r / (GALAXY_RADIUS * 0.5))
    const base = 0.16 + centr * 0.28
    colors[i * 3] = base + centr * 0.28
    colors[i * 3 + 1] = base + centr * 0.12
    colors[i * 3 + 2] = base + 0.14
    sizes[i] = 12 + Math.random() * 26
  }

  const material = makeStarMaterial({ maxSize: 9, opacity: 0.6 })
  backdrop = makePoints(positions, colors, sizes, material)
  backdrop.renderOrder = -1
  backdrop.frustumCulled = false
  scene.add(backdrop)
}

// --- Real stars -------------------------------------------------------------
let stars = []
let starPoints = null
let hostPoints = null
const starById = new Map()
// Proper motion: the catalogue position and the galactic velocity (parsecs per
// year). Kept so the time machine can slide the real stars without re-reading
// the file. See data-pipeline (HYG pmra/pmdec -> vx, vy, vz).
let starBase = null
let starVel = null
let hostIndex = [] // indices into `stars` that host planets (for the halo)

function buildStars(list) {
  const positions = new Float32Array(list.length * 3)
  const colors = new Float32Array(list.length * 3)
  const sizes = new Float32Array(list.length)
  const vel = new Float32Array(list.length * 3)

  list.forEach((s, i) => {
    positions[i * 3] = s.x
    positions[i * 3 + 1] = s.y
    positions[i * 3 + 2] = s.z
    vel[i * 3] = s.vx || 0
    vel[i * 3 + 1] = s.vy || 0
    vel[i * 3 + 2] = s.vz || 0
    const c = bvToColor(s.colorIndex)
    colors[i * 3] = c[0]
    colors[i * 3 + 1] = c[1]
    colors[i * 3 + 2] = c[2]
    sizes[i] = absMagToSize(s.absMag)
  })

  starPoints = makePoints(positions, colors, sizes, makeStarMaterial({ maxSize: 60 }))
  starPoints.userData.type = 'stars'
  starPoints.frustumCulled = false
  scene.add(starPoints)

  starBase = positions.slice()
  starVel = vel

  // teal halo on the 890 stars known to host planets
  hostIndex = []
  list.forEach((s, i) => {
    if (s.hasPlanets) hostIndex.push(i)
  })
  const hp = new Float32Array(hostIndex.length * 3)
  const hc = new Float32Array(hostIndex.length * 3)
  const hs = new Float32Array(hostIndex.length)
  hostIndex.forEach((src, k) => {
    const s = list[src]
    hp[k * 3] = s.x
    hp[k * 3 + 1] = s.y
    hp[k * 3 + 2] = s.z
    hc[k * 3] = 0.15
    hc[k * 3 + 1] = 1.0
    hc[k * 3 + 2] = 0.85
    hs[k] = absMagToSize(s.absMag) * 6
  })
  hostPoints = makePoints(hp, hc, hs, makeStarMaterial({ maxSize: 30, opacity: 0.5 }))
  hostPoints.frustumCulled = false
  scene.add(hostPoints)
}

// Move the real stars to their positions `years` from now (proper motion). The
// point-cloud attribute, the picking positions and the planet-host halo are all
// kept in sync, so clicking and fly-to still land on the star.
function applyStarTime(years) {
  if (!starPoints || !starBase) return
  const attr = starPoints.geometry.getAttribute('position')
  const arr = attr.array
  const hAttr = hostPoints ? hostPoints.geometry.getAttribute('position') : null
  const hArr = hAttr ? hAttr.array : null
  for (let i = 0; i < stars.length; i++) {
    const x = starBase[i * 3] + starVel[i * 3] * years
    const y = starBase[i * 3 + 1] + starVel[i * 3 + 1] * years
    const z = starBase[i * 3 + 2] + starVel[i * 3 + 2] * years
    arr[i * 3] = x
    arr[i * 3 + 1] = y
    arr[i * 3 + 2] = z
    stars[i].x = x
    stars[i].y = y
    stars[i].z = z
  }
  attr.needsUpdate = true
  if (hArr) {
    for (let k = 0; k < hostIndex.length; k++) {
      const i = hostIndex[k]
      hArr[k * 3] = arr[i * 3]
      hArr[k * 3 + 1] = arr[i * 3 + 1]
      hArr[k * 3 + 2] = arr[i * 3 + 2]
    }
    hAttr.needsUpdate = true
  }
}

// --- Solar System (exaggerated; NOT to scale) -------------------------------
const solarGroup = new THREE.Group()
scene.add(solarGroup)
const solarById = new Map()
const solarPosition = new Map()
const solarMeshes = []
const solarBodies = [] // one record per body, used by the time machine
let backdropOn = true

// Body colours by id (cosmetic).
const BODY_COLOR = {
  'sol-sun': 0xffd27a,
  'sol-mercury': 0x9c8f86,
  'sol-venus': 0xe8cfa0,
  'sol-earth': 0x4a90e2,
  'sol-mars': 0xd0593b,
  'sol-jupiter': 0xd8b48a,
  'sol-saturn': 0xe3d3a0,
  'sol-uranus': 0x9fe3e3,
  'sol-neptune': 0x5f7fe0,
  'sol-pluto': 0xcbb8a0,
  'sol-moon': 0xbfbfbf,
}

// Exaggerated display sizing.
const orbitR = (au) => 0.006 * Math.log(1 + au / 0.4)
const bodyR = (km) =>
  Math.min(0.0025, Math.max(0.00028, 0.0006 * Math.pow(km / 6371, 0.4)))

// Real, NASA-derived surface maps we ship (Solar System Scope, CC BY 4.0).
const SOLAR_TEX = {
  'sol-sun': 'sun.jpg',
  'sol-mercury': 'mercury.jpg',
  'sol-venus': 'venus.jpg',
  'sol-earth': 'earth.jpg',
  'sol-mars': 'mars.jpg',
  'sol-jupiter': 'jupiter.jpg',
  'sol-saturn': 'saturn.jpg',
  'sol-uranus': 'uranus.jpg',
  'sol-neptune': 'neptune.jpg',
  'sol-moon': 'moon.jpg',
}

// Per-body look for the info-panel sphere render (atmosphere rim + lighting).
const PORTRAIT_OPTS = {
  'sol-sun': { limb: 0.4, ambient: 0.55 },
  'sol-earth': { atmosphere: [110, 170, 255], halo: 0.5 },
  'sol-venus': { atmosphere: [235, 214, 160], halo: 0.4 },
  'sol-mars': { atmosphere: [210, 130, 100], halo: 0.22 },
  'sol-jupiter': { atmosphere: [232, 202, 160], halo: 0.2, limb: 0.18 },
  'sol-saturn': { atmosphere: [236, 220, 176], halo: 0.2, limb: 0.16 },
  'sol-uranus': { atmosphere: [150, 236, 236], halo: 0.35 },
  'sol-neptune': { atmosphere: [110, 150, 255], halo: 0.35 },
}

// A light from the Sun so the textured spheres show a real day/night terminator.
const texLoader = new THREE.TextureLoader()
const sunLight = new THREE.PointLight(0xfff2d8, 1.9)
sunLight.decay = 0 // the Solar System here is exaggerated; keep the Sun evenly bright
sunLight.position.set(0, 0, 0)
scene.add(sunLight)
scene.add(new THREE.AmbientLight(0x36425f, 0.65))

// A faint ring marking a planet's orbit, in the (exaggerated) ecliptic plane.
function orbitLineGeometry(radius) {
  const seg = 128
  const pts = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0))
  }
  return new THREE.BufferGeometry().setFromPoints(pts)
}

// One shared, round glow map for every Solar System beacon. Without a `map` a
// SpriteMaterial renders as a solid billboard *square* — the faint boxes that
// used to ring each world. This is radial and fully transparent at the corners.
const GLOW_TEXTURE = new THREE.CanvasTexture(glowSpriteCanvas(128))
GLOW_TEXTURE.colorSpace = THREE.SRGBColorSpace

function buildSolarSystem(list) {
  const GOLDEN = 2.399963229728653
  list.forEach((b, i) => {
    const isSun = b.type === 'star'
    const isMoon = b.type === 'moon'
    const r = isSun ? 0.0011 : bodyR(b.radiusKm || 1000)
    // Start from the procedural surface, then swap in the real map when loaded.
    const base = new THREE.CanvasTexture(solarBodyCanvas(b.id, 512))
    base.colorSpace = THREE.SRGBColorSpace
    const mat = isSun
      ? new THREE.MeshBasicMaterial({ map: base })
      : new THREE.MeshStandardMaterial({
          map: base,
          roughness: 1,
          metalness: 0,
          emissive: new THREE.Color(BODY_COLOR[b.id] || 0x111111),
          emissiveIntensity: 0.12,
        })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 32), mat)
    mesh.userData = {
      type: 'solar',
      id: b.id,
      name: b.name,
      data: b,
      displayR: r,
    }
    solarGroup.add(mesh)
    solarMeshes.push(mesh)
    solarById.set(b.id, mesh)

    const rec = {
      id: b.id,
      data: b,
      mesh,
      glow: null,
      ring: null, // Saturn's rings (follows the body)
      isSun,
      isMoon,
      parentId: b.parentId || null,
      phase: i * GOLDEN,
      orbitA: b.semiMajorAxisAu !== null && b.semiMajorAxisAu !== undefined
        ? orbitR(b.semiMajorAxisAu)
        : null,
      periodDays: b.orbitalPeriodDays || null,
      moonOffset: 0.0009 + (i % 3) * 0.0007,
    }
    solarBodies.push(rec)

    // Orbit ring for planets and dwarf planets.
    if (!isSun && !isMoon && rec.orbitA) {
      const line = new THREE.Line(
        orbitLineGeometry(rec.orbitA),
        new THREE.LineBasicMaterial({
          color: 0x36527d,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        }),
      )
      line.renderOrder = -0.4
      solarGroup.add(line)
    }

    const file = SOLAR_TEX[b.id]
    if (file) {
      texLoader.load(`/textures/${file}`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 4
        mat.map = t
        mat.needsUpdate = true
      })
    }

    // Saturn's rings, mapped radially from the ring alpha strip.
    if (b.id === 'sol-saturn') {
      const inner = r * 1.35
      const outer = r * 2.35
      const geo = new THREE.RingGeometry(inner, outer, 96)
      const p = geo.attributes.position
      const uv = geo.attributes.uv
      const v3 = new THREE.Vector3()
      for (let i = 0; i < p.count; i++) {
        v3.fromBufferAttribute(p, i)
        uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5)
      }
      texLoader.load('/textures/saturn-ring.png', (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        const ring = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            map: t,
            transparent: true,
            side: THREE.DoubleSide,
            opacity: 0.92,
            depthWrite: false,
          }),
        )
        ring.rotation.x = Math.PI / 2
        ring.position.copy(rec.mesh.position)
        solarGroup.add(ring)
        rec.ring = ring
      })
    }

    // a soft glow so tiny worlds are still findable / clickable.
    // `map` is essential: without one the sprite draws a hard-edged square.
    // The Sun's halo is kept well inside Earth's orbit (r*10 ≈ 0.0055 pc vs
    // Earth at 0.0075 pc) so it never swallows the planet you're flying to.
    const glowMat = new THREE.SpriteMaterial({
      map: GLOW_TEXTURE,
      color: BODY_COLOR[b.id] || 0xcccccc,
      transparent: true,
      opacity: isSun ? 0.42 : 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.setScalar(r * (isSun ? 10 : 9))
    solarGroup.add(glow)
    rec.glow = glow
  })
  layoutSolar(0)
}

// Lay the Solar System out for a given time offset. Bodies circle on their real
// (exaggerated) orbits; the phase advances with the body's real period, so the
// relative motion is physically right even though the sizes are not.
function layoutSolar(years) {
  const days = years * 365.25
  for (const rec of solarBodies) {
    let pos
    if (rec.isSun) {
      pos = new THREE.Vector3(0, 0, 0)
    } else if (rec.orbitA !== null) {
      const th = rec.periodDays
        ? rec.phase + (2 * Math.PI * days) / rec.periodDays
        : rec.phase
      pos = new THREE.Vector3(Math.cos(th) * rec.orbitA, Math.sin(th) * rec.orbitA, 0)
    } else {
      const parent = solarPosition.get(rec.parentId) || new THREE.Vector3()
      const pr = solarById.get(rec.parentId)?.userData?.displayR || 0.0006
      const mr = pr + rec.moonOffset
      const th = rec.periodDays
        ? rec.phase + (2 * Math.PI * days) / rec.periodDays
        : rec.phase
      pos = parent.clone().add(new THREE.Vector3(Math.cos(th) * mr, Math.sin(th) * mr, 0))
    }
    rec.mesh.position.copy(pos)
    if (rec.glow) rec.glow.position.copy(pos)
    if (rec.ring) rec.ring.position.copy(pos)
    solarPosition.set(rec.id, pos)
  }
}

// --- Exoplanets -------------------------------------------------------------
let planets = []
const planetById = new Map()
const planetsByHost = new Map()

function indexPlanets(list) {
  for (const p of list) {
    planetById.set(p.id, p)
    if (!planetsByHost.has(p.hostId)) planetsByHost.set(p.hostId, [])
    planetsByHost.get(p.hostId).push(p)
  }
}

// --- Deep-sky objects (nebulae, clusters, galaxies, black holes, pulsars) ---
// A manifest maps the famous objects to a real photograph we ship locally.
let deepSkyImageManifest = {}
const deepsky = createDeepSky(scene, {
  imageUrl: (id) => deepSkyImageManifest[id]?.file || null,
})
let deepSkyObjects = []
const deepSkyById = new Map()

function buildDeepSky(list) {
  deepSkyObjects = list
  for (const o of list) deepSkyById.set(o.id, o)
  deepsky.load(list)
}

// --- Info panel HTML --------------------------------------------------------
const UNK = 'Unknown'
const fmt = (v, unit = '', digits = 2) =>
  v === null || v === undefined ? UNK : `${Number(v).toFixed(digits)}${unit}`

// Cached procedural portraits so re-opening a panel is instant.
const portraitCache = new Map()
function cachedPortrait(key, make) {
  if (portraitCache.has(key)) return portraitCache.get(key)
  const url = make().toDataURL('image/png')
  portraitCache.set(key, url)
  return url
}
const starPortrait = (s) =>
  cachedPortrait(`star-${s.id}`, () =>
    starCanvas(bvToColor(s.colorIndex), 220, hashSeed(s.id)),
  )
const planetPortrait = (p) =>
  cachedPortrait(`exo-${p.id}`, () => exoplanetCanvas(p, 220))
const solarPortrait = (b) =>
  cachedPortrait(`sol-${b.id}`, () => solarBodyCanvas(b.id, 240))

function renderStarInfo(s) {
  const pc = s.distLy ? s.distLy / 3.261563 : null
  const hostPlanets = planetsByHost.get(s.id) || []
  const planetPills = hostPlanets
    .map(
      (p) =>
        `<span class="pill" data-type="exoplanet" data-select="${p.id}">${p.name}</span>`,
    )
    .join('')
  return `
    <h2>${s.name}</h2>
    <p class="subtitle">Star · ${s.constellation || UNK}</p>
    ${imageBlock(starPortrait(s), s.name)}
    <dl class="facts">
      <dt>Distance</dt><dd>${fmt(s.distLy, ' ly', 1)}${pc ? ` (${pc.toFixed(1)} pc)` : ''}</dd>
      <dt>Type</dt><dd>${s.spectral || UNK}</dd>
      <dt>Abs. mag</dt><dd>${fmt(s.absMag, '', 2)}</dd>
      <dt>Colour (B−V)</dt><dd>${fmt(s.colorIndex, '', 2)}</dd>
    </dl>
    <p class="blurb">${s.info.blurb}</p>
    ${s.info.funFact ? `<p class="funfact">${s.info.funFact}</p>` : ''}
    ${planetPills ? `<div class="planets"><div class="subtitle">Known planets</div>${planetPills}</div>` : ''}
  `
}

function renderPlanetInfo(p) {
  const host = starById.get(p.hostId)
  return `
    <h2>${p.name}</h2>
    <p class="subtitle">Exoplanet · orbits ${host ? host.name : UNK}</p>
    ${imageBlock(planetPortrait(p), p.name)}
    <dl class="facts">
      <dt>Mass</dt><dd>${fmt(p.massEarth, ' M⊕', 2)}</dd>
      <dt>Radius</dt><dd>${fmt(p.radiusEarth, ' R⊕', 2)}</dd>
      <dt>Period</dt><dd>${fmt(p.periodDays, ' days', 2)}</dd>
      <dt>Discovered</dt><dd>${p.discoveryYear ?? UNK}</dd>
      <dt>Method</dt><dd>${p.method || UNK}</dd>
    </dl>
    <p class="blurb">${p.info.blurb}</p>
    ${p.info.funFact ? `<p class="funfact">${p.info.funFact}</p>` : ''}
    ${
      host
        ? `<div class="planets"><span class="pill" data-type="star" data-select="${host.id}">View host star →</span></div>`
        : ''
    }
  `
}

function renderSolarInfo(b) {
  const parent = b.parentId ? solarById.get(b.parentId) : null
  const isMoon = b.type === 'moon'
  return `
    <h2>${b.name}</h2>
    <p class="subtitle">${b.type} · Solar System (not to scale)</p>
    ${imageBlock(solarPortrait(b), b.name)}
    <dl class="facts">
      ${
        isMoon
          ? `<dt>Orbits</dt><dd>${parent ? parent.userData.name : UNK}</dd>
             <dt>Distance</dt><dd>${fmt(b.distanceFromParentKm, ' km', 0)}</dd>`
          : `<dt>Distance from Sun</dt><dd>${fmt(b.semiMajorAxisAu, ' AU', 3)}</dd>
             <dt>Orbital period</dt><dd>${fmt(b.orbitalPeriodDays, ' days', 1)}</dd>`
      }
      <dt>Radius</dt><dd>${fmt(b.radiusKm, ' km', 1)}</dd>
      <dt>Mass</dt><dd>${fmt(b.massEarth, ' M⊕', 3)}</dd>
      ${b.eccentricity !== null && b.eccentricity !== undefined ? `<dt>Eccentricity</dt><dd>${b.eccentricity}</dd>` : ''}
    </dl>
    <p class="blurb">${b.info.blurb}</p>
    ${b.info.funFact ? `<p class="funfact">${b.info.funFact}</p>` : ''}
  `
}

const DIST_METHOD_LABEL = {
  literature: 'known distance',
  parallax: 'from parallax',
  redshift: 'from redshift',
}

// Everything the catalogue knows about our own galaxy is within ~30 kpc; the
// only objects type-tagged "galaxy" are, by definition, other galaxies. So an
// object is "beyond the Milky Way" if it is a galaxy or sits further out than
// the galactic disc.
const MILKY_WAY_RADIUS_PC = 30000
const isExtragalactic = (o) =>
  o.type === 'galaxy' || (o.distancePc != null && o.distancePc > MILKY_WAY_RADIUS_PC)

function renderDeepSkyInfo(o) {
  const portrait = deepsky.portrait(o)
  const outside = isExtragalactic(o)
  const dist = o.distancePc
    ? `${fmt(o.distanceLy, ' ly', o.distanceLy > 100000 ? 0 : 1)} (${o.distancePc > 1000 ? (o.distancePc / 1000).toFixed(1) + ' kpc' : o.distancePc.toFixed(0) + ' pc'})`
    : 'Unknown — direction only'
  return `
    <h2>${o.name}</h2>
    <p class="subtitle">${o.type} · ${o.constellation || 'deep sky'}</p>
    ${outside ? '<div class="extragalactic">◎ Beyond the Milky Way</div>' : ''}
    ${imageBlock(portrait, o.name)}
    <dl class="facts">
      <dt>Type</dt><dd>${o.subtype || o.type}</dd>
      <dt>Distance</dt><dd>${dist}${o.distanceMethod ? ` <span class="prov">${DIST_METHOD_LABEL[o.distanceMethod] || o.distanceMethod}</span>` : ''}</dd>
      ${o.messier ? `<dt>Also</dt><dd>${o.messier}</dd>` : ''}
      <dt>B magnitude</dt><dd>${fmt(o.magnitude, '', 2)}</dd>
      <dt>Apparent size</dt><dd>${o.sizeArcmin ? `${o.sizeArcmin}′` : UNK}</dd>
    </dl>
    <p class="blurb">${o.info.blurb}</p>
    ${o.info.funFact ? `<p class="funfact">${o.info.funFact}</p>` : ''}
    ${
      o.distancePc === null
        ? '<p class="note">Placed on the sky shell by its measured direction; its true depth is not known.</p>'
        : ''
    }
  `
}

// Swap the rendered portrait for a real photograph once it has loaded. A token
// guards against a slow image landing on a panel the user has already changed.
let portraitToken = 0

function setPortrait(url, credit, token) {
  const probe = new Image()
  probe.referrerPolicy = 'no-referrer'
  probe.onload = () => {
    if (token !== portraitToken) return
    const cur = document.getElementById('obj-photo')
    if (!cur) return
    cur.src = url
    const c = document.getElementById('obj-credit')
    if (c) c.textContent = credit
  }
  probe.src = url
}

// Upgrade the instantly-shown procedural portrait to a real one when available:
//   * Solar System -> our shipped NASA-derived surface map, rendered as a sphere
//   * deep-sky     -> a real photograph (local manifest, else Wikipedia)
function upgradePortrait(kind, obj, token) {
  if (kind === 'solar') {
    const file = SOLAR_TEX[obj.id]
    if (!file) return
    planetPortraitFromUrl(`/textures/${file}`, {
      size: 320,
      background: '#05060d',
      ...(PORTRAIT_OPTS[obj.id] || {}),
    }).then((url) => {
      if (url) setPortrait(url, 'Surface: NASA / Solar System Scope (CC BY 4.0)', token)
    })
    return
  }
  if (kind === 'deepsky') {
    const entry = deepSkyImageManifest[obj.id]
    if (entry) {
      setPortrait(entry.file, 'Photo: Wikimedia Commons', token)
      return
    }
    fetchPhoto(obj.name).then((photo) => {
      if (photo?.url) setPortrait(photo.url, 'Photo: Wikipedia', token)
    })
  }
}

function imageBlock(dataUrl, alt, credit = 'Rendered portrait') {
  return `<div class="portrait"><img id="obj-photo" alt="${alt}" src="${dataUrl}" /><span class="credit" id="obj-credit">${credit}</span></div>`
}

// --- Picking ----------------------------------------------------------------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const pickTargets = [] // filled after data loads
const _proj = new THREE.Vector3()

// Screen-space pick for the deep-sky particle cloud (its points scale with the
// zoom, so a world-space threshold would be unreliable).
function pickDeepSkyScreen(clientX, clientY, threshPx) {
  const pts = deepsky.points()
  if (!pts || !deepsky.group.visible) return null
  const pos = pts.geometry.getAttribute('position')
  const w = window.innerWidth
  const h = window.innerHeight
  let best = -1
  let bestPx = threshPx
  for (let i = 0; i < pos.count; i++) {
    if (!deepsky.isVisibleAt(i)) continue
    _proj.set(pos.getX(i), pos.getY(i), pos.getZ(i)).project(camera)
    if (_proj.z > 1) continue
    const sx = (_proj.x * 0.5 + 0.5) * w
    const sy = (-_proj.y * 0.5 + 0.5) * h
    const d = Math.hypot(sx - clientX, sy - clientY)
    if (d < bestPx) {
      bestPx = d
      best = i
    }
  }
  return best >= 0 ? { obj: deepsky.pointAtIndex(best), px: bestPx } : null
}

// Returns the closest pick in screen space, or null.
function pickAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1
  pointer.y = -(clientY / window.innerHeight) * 2 + 1
  const dist = camera.position.distanceTo(controls.target)
  raycaster.params.Points.threshold = THREE.MathUtils.clamp(dist * 0.012, 0.15, 4.0)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(pickTargets, false)

  let best = null
  if (hits.length) {
    const h = hits[0]
    if (h.object.userData.type === 'stars') {
      const s = stars[h.index]
      if (s) best = { type: 'star', id: s.id }
    } else if (h.object.userData.type === 'deepsky') {
      if (deepsky.isVisibleAt(h.index)) best = { type: 'deepsky', id: deepsky.pointAtIndex(h.index)?.id }
    } else {
      best = { type: 'solar', id: h.object.userData.id }
    }
    if (best) {
      _proj.copy(h.point).project(camera)
      best.px = Math.hypot(
        (_proj.x * 0.5 + 0.5) * window.innerWidth - clientX,
        (-_proj.y * 0.5 + 0.5) * window.innerHeight - clientY,
      )
    }
  }

  const ds = pickDeepSkyScreen(clientX, clientY, best ? best.px : 13)
  if (ds) return { type: 'deepsky', id: ds.obj.id, px: ds.px }
  return best
}

// --- Fly-to animation -------------------------------------------------------
let fly = null
function flyTo(worldPos, distance) {
  const fromTarget = controls.target.clone()
  const fromCam = camera.position.clone()
  const dir = fromCam.clone().sub(fromTarget)
  if (dir.lengthSq() < 1e-9) dir.set(0, 0.5, 1)
  dir.normalize()
  const toTarget = worldPos.clone()
  const toCam = toTarget.clone().add(dir.multiplyScalar(distance))
  fly = { fromCam, fromTarget, toCam, toTarget, t: 0, dur: 1.15 }
  controls.enabled = false
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// --- Layers -----------------------------------------------------------------
// Each layer can be switched on/off; the state also lives in the URL hash so a
// view can be shared.
const LAYERS = [
  { id: 'stars', label: 'Stars', hint: '12,577', on: true,
    apply: (on) => { if (starPoints) starPoints.visible = on } },
  { id: 'hosts', label: 'Exoplanet hosts', hint: '890', on: true,
    apply: (on) => { if (hostPoints) hostPoints.visible = on } },
  { id: 'solar', label: 'Solar System', on: true,
    apply: (on) => { solarGroup.visible = on } },
  { id: 'deepsky', label: 'Deep sky', hint: '12,171', on: true,
    apply: (on) => deepsky.setPointsVisible(on) },
  { id: 'famous', label: 'Famous-object photos', hint: '238', on: true,
    apply: (on) => deepsky.setSpritesVisible(on) },
  { id: 'outside', label: 'Outside the Milky Way', hint: 'galaxies', on: true,
    apply: (on) => deepsky.setFilter(on ? null : (o) => !isExtragalactic(o)) },
  { id: 'backdrop', label: 'Milky Way glow', on: true,
    apply: (on) => { backdropOn = on } },
]
const layerState = Object.fromEntries(LAYERS.map((l) => [l.id, l.on]))

function setLayer(id, on, { silent = false } = {}) {
  const layer = LAYERS.find((l) => l.id === id)
  if (!layer) return
  layerState[id] = on
  if (layer.apply) layer.apply(on)
  if (!silent) syncHash()
}
function enableAllLayers() {
  for (const l of LAYERS) {
    layerState[l.id] = true
    if (l.apply) l.apply(true)
  }
}
function renderLayers() {
  ui.setLayers(
    LAYERS.map((l) => ({ id: l.id, label: l.label, hint: l.hint, on: layerState[l.id] })),
  )
}

// --- Guided tours -----------------------------------------------------------
const TOURS = [
  {
    id: 'solar',
    title: 'Tour the Solar System',
    description: 'From the Sun out to Pluto, with real orbits.',
    stops: [
      { type: 'solar', id: 'sol-sun', text: 'The Sun — 99.86% of the mass of the Solar System, a ball of plasma 109 Earths across.' },
      { type: 'solar', id: 'sol-earth', text: 'Earth — our pale blue dot, the only world known to host life.' },
      { type: 'solar', id: 'sol-mars', text: 'Mars — the rusty desert world, home to the tallest volcano in the Solar System.' },
      { type: 'solar', id: 'sol-jupiter', text: 'Jupiter — a gas giant so massive it could swallow 1,300 Earths.' },
      { type: 'solar', id: 'sol-saturn', text: 'Saturn — the ringed jewel; its rings are mostly water ice.' },
      { type: 'solar', id: 'sol-neptune', text: 'Neptune — the windiest planet, with supersonic storms.' },
      { type: 'solar', id: 'sol-pluto', text: 'Pluto — a dwarf planet with a heart-shaped glacier of nitrogen ice.' },
    ],
  },
  {
    id: 'neighbourhood',
    title: 'The Solar Neighbourhood',
    description: 'The nearest stars to the Sun.',
    stops: [
      { q: 'Proxima Centauri', text: 'Proxima Centauri — the closest star to the Sun, 4.24 light-years away: a tiny red dwarf.' },
      { q: 'Rigil Kentaurus', text: 'Rigil Kentaurus (Alpha Centauri A) — the Sun\u2019s near-twin, 4.3 light-years away.' },
      { q: "Barnard's Star", text: 'Barnard\u2019s Star — the fastest-moving star in our sky, racing across the constellations.' },
      { q: 'Sirius', text: 'Sirius — the brightest star in the night sky, about twice the mass of the Sun.' },
      { q: 'Vega', text: 'Vega — a brilliant young star that was, and will again be, the pole star.' },
    ],
  },
  {
    id: 'deepsky',
    title: 'Famous Deep-Sky Objects',
    description: 'Nebulae, clusters and a supermassive black hole.',
    stops: [
      { q: 'Orion Nebula', text: 'The Orion Nebula — a stellar nursery 1,344 light-years away.' },
      { q: 'Pleiades', text: 'The Pleiades — a young open cluster of hot, blue stars.' },
      { q: 'Crab Nebula', text: 'The Crab Nebula — the wreckage of a supernova recorded in 1054 AD.' },
      { q: 'Ring Nebula', text: 'The Ring Nebula — a dying star shedding its outer layers into space.' },
      { q: 'Hercules Cluster', text: 'The Hercules Cluster — a swarm of hundreds of thousands of ancient stars.' },
      { q: 'Sagittarius A*', text: 'Sagittarius A* — the supermassive black hole at the centre of the Milky Way.' },
    ],
  },
  {
    id: 'outside',
    title: 'Beyond the Milky Way',
    description: 'Other galaxies, millions of light-years away.',
    stops: [
      { q: 'Andromeda Galaxy', text: 'The Andromeda Galaxy — the nearest large galaxy, 2.5 million light-years away.' },
      { q: 'Triangulum Galaxy', text: 'The Triangulum Galaxy — the third-largest member of our Local Group.' },
      { q: 'Whirlpool Galaxy', text: 'The Whirlpool Galaxy — a classic spiral caught interacting with a companion.' },
      { q: 'Centaurus A', text: 'Centaurus A — a galaxy with a striking dust lane and a bright radio core.' },
      { q: 'Sombrero Galaxy', text: 'The Sombrero Galaxy — a galaxy seen edge-on, 31 million light-years away.' },
    ],
  },
]

let tour = null
function resolveStop(stop) {
  if (stop.type && stop.id) return { type: stop.type, id: stop.id }
  const hits = searchIndex(stop.q || stop.label || '')
  return hits.length ? { type: hits[0].type, id: hits[0].id } : null
}
function playTour(t) {
  tour = { ...t, i: 0 }
  ui.closePanels()
  showTourStop()
}
function showTourStop() {
  const stop = tour.stops[tour.i]
  const target = resolveStop(stop)
  const last = tour.i === tour.stops.length - 1
  if (target) selectById(target.type, target.id)
  ui.showCaption({
    title: tour.title,
    text: stop.text || '',
    index: tour.i,
    total: tour.stops.length,
    last,
    onNext: () => {
      if (last) exitTour()
      else {
        tour.i++
        showTourStop()
      }
    },
    onPrev: () => {
      if (tour.i > 0) {
        tour.i--
        showTourStop()
      }
    },
    onStop: exitTour,
  })
}
function exitTour() {
  tour = null
  ui.hideCaption()
}

// --- Bookmarks (localStorage) ----------------------------------------------
const BOOKMARK_KEY = 'luna.bookmarks'
let bookmarks = []
function loadBookmarks() {
  try {
    bookmarks = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]')
    if (!Array.isArray(bookmarks)) bookmarks = []
  } catch {
    bookmarks = []
  }
  ui.setBookmarks(bookmarks)
}
function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks))
  } catch {
    /* storage may be unavailable (private mode) — the session still works */
  }
  ui.setBookmarks(bookmarks)
}
const isBookmarked = (it) =>
  !!it && bookmarks.some((b) => b.type === it.type && b.id === it.id)
function toggleBookmark() {
  if (!current) return
  if (isBookmarked(current)) {
    bookmarks = bookmarks.filter((b) => !(b.type === current.type && b.id === current.id))
    ui.toast('Removed from saved places')
  } else {
    bookmarks.push({ type: current.type, id: current.id, label: current.label, kind: current.kind })
    ui.toast('Saved place')
  }
  saveBookmarks()
  refreshActions()
}
function removeBookmark(b) {
  bookmarks = bookmarks.filter((x) => !(x.type === b.type && x.id === b.id))
  saveBookmarks()
  refreshActions()
}

// --- Share ------------------------------------------------------------------
async function shareView() {
  syncHash()
  const url = location.href
  try {
    await navigator.clipboard.writeText(url)
    ui.toast('Link copied to clipboard')
  } catch {
    ui.toast(url)
  }
}

// --- Time machine -----------------------------------------------------------
const TIME_LIMIT = 100000 // years either side of now
const TIME_SPEED = 4000 // years per second while playing
let simYears = 0
let timePlaying = false

function setSimYears(y) {
  simYears = Math.max(-TIME_LIMIT, Math.min(TIME_LIMIT, y))
  applyStarTime(simYears)
  layoutSolar(simYears)
  ui.setTime(simYears, timePlaying)
  syncHash()
}
function toggleTimePlay() {
  timePlaying = !timePlaying
  ui.setTime(simYears, timePlaying)
  if (!timePlaying) syncHash()
}
function resetTime() {
  timePlaying = false
  setSimYears(0)
}

// --- Deep links (URL hash) --------------------------------------------------
function syncHash() {
  const parts = []
  if (current) parts.push(`sel=${current.type}:${current.id}`)
  if (Math.round(simYears) !== 0) parts.push(`t=${Math.round(simYears)}`)
  const off = LAYERS.filter((l) => !layerState[l.id]).map((l) => l.id)
  if (off.length) parts.push(`off=${off.join(',')}`)
  const hash = parts.length ? `#${parts.join('&')}` : ''
  const want = location.pathname + location.search + hash
  if (location.pathname + location.search + location.hash !== want) {
    history.replaceState(null, '', want)
  }
}
function applyHash() {
  const raw = location.hash.replace(/^#/, '')
  if (!raw) return
  const params = new URLSearchParams(raw)
  const off = params.get('off')
  if (off) for (const id of off.split(',')) setLayer(id, false, { silent: true })
  const t = params.get('t')
  if (t !== null && !Number.isNaN(Number(t))) setSimYears(Number(t))
  const sel = params.get('sel')
  if (sel) {
    const i = sel.indexOf(':')
    if (i > 0) selectById(sel.slice(0, i), sel.slice(i + 1))
  }
}

// --- Scale bar + mini-map ---------------------------------------------------
const LY_PER_PC = 3.261563
function niceNumber(v) {
  if (!isFinite(v) || v <= 0) return 1
  const e = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / e
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10
  return m * e
}
function formatDistance(pc) {
  const ly = pc * LY_PER_PC
  if (ly >= 1e6) return `${(ly / 1e6).toFixed(ly >= 1e7 ? 0 : 1)} Mly`
  if (ly >= 1000) return `${(ly / 1000).toFixed(ly >= 10000 ? 0 : 1)} kly`
  return `${Math.round(ly)} ly`
}
function updateScalebar() {
  const dist = camera.position.distanceTo(controls.target)
  const perPixel =
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist) / window.innerHeight
  const nicePc = niceNumber(perPixel * 120)
  const width = Math.max(12, Math.round(nicePc / perPixel))
  scalebarLine.style.width = `${width}px`
  scalebarLabel.textContent = formatDistance(nicePc)
}
let lastMinimap = 0
function updateMinimap() {
  const now = performance.now()
  if (now - lastMinimap < 80) return
  lastMinimap = now
  minimap.update({ cameraPos: camera.position, target: controls.target, selected: selectedWorld })
}

// --- Selection / search -----------------------------------------------------
const ui = createUI({
  onQuery: (q) => searchIndex(q),
  onSelect: (item) => selectById(item.type, item.id),
  onToggleLayer: (id, on) => setLayer(id, on),
  onTour: (t) => playTour(t),
  onToggleBookmark: () => toggleBookmark(),
  onRemoveBookmark: (b) => removeBookmark(b),
  onShare: () => shareView(),
  onTimeChange: (y) => {
    timePlaying = false
    setSimYears(y)
  },
  onTimePlay: () => toggleTimePlay(),
  onTimeReset: () => resetTime(),
})

// The currently-open object, remembered so it can be saved / shared / linked.
let current = null
let selectedWorld = null

function refreshActions() {
  if (!current) return ui.setActions([])
  const saved = isBookmarked(current)
  ui.setActions([
    {
      label: saved ? '★ Saved' : '☆ Save',
      active: saved,
      onClick: toggleBookmark,
    },
    { label: 'Share', onClick: shareView },
  ])
}

function selectById(type, id) {
  portraitToken++
  const token = portraitToken
  let label = null
  let kind = null
  if (type === 'star') {
    const s = starById.get(id)
    if (!s) return
    label = s.name
    kind = 'Star'
    ui.showInfo(renderStarInfo(s))
    selectedWorld = new THREE.Vector3(s.x, s.y, s.z)
    flyTo(selectedWorld, 4)
    upgradePortrait('star', s, token)
  } else if (type === 'exoplanet') {
    const p = planetById.get(id)
    if (!p) return
    label = p.name
    kind = 'Exoplanet'
    ui.showInfo(renderPlanetInfo(p))
    const host = starById.get(p.hostId)
    if (host) {
      selectedWorld = new THREE.Vector3(host.x, host.y, host.z)
      flyTo(selectedWorld, 4)
    }
    upgradePortrait('exoplanet', p, token)
  } else if (type === 'solar') {
    const b = solarById.get(id)
    if (!b) return
    label = b.userData.name
    kind = 'Solar System'
    ui.showInfo(renderSolarInfo(b.userData.data))
    const r = b.userData.displayR
    selectedWorld = b.position.clone()
    flyTo(selectedWorld, Math.max(0.004, r * 8))
    upgradePortrait('solar', b.userData.data, token)
  } else if (type === 'deepsky') {
    const o = deepSkyById.get(id)
    if (!o) return
    label = o.name
    kind = 'Deep sky'
    ui.showInfo(renderDeepSkyInfo(o))
    const spr = deepsky.sprite(id)
    const target = spr ? spr.position.clone() : deepsky.worldPosition(o)
    selectedWorld = target.clone()
    const r = spr ? spr.scale.x : 40
    flyTo(target, Math.max(30, r * 3))
    upgradePortrait('deepsky', o, token)
  } else {
    return
  }
  current = { type, id, label, kind }
  refreshActions()
  syncHash()
}

// searchable things: solar bodies, planets, then stars
let searchables = []
function buildSearchIndex() {
  searchables = []
  for (const b of solarById.values())
    searchables.push({
      label: b.userData.name,
      kind: 'Solar System',
      q: b.userData.name.toLowerCase(),
      type: 'solar',
      id: b.userData.id,
      rank: -3,
    })
  for (const p of planets)
    searchables.push({
      label: p.name,
      kind: 'Exoplanet',
      q: p.name.toLowerCase(),
      type: 'exoplanet',
      id: p.id,
      rank: -2,
    })
  for (const s of stars)
    searchables.push({
      label: s.name,
      kind: 'Star',
      q: s.name.toLowerCase(),
      type: 'star',
      id: s.id,
      rank: (s.absMag ?? 20) * 0.01, // brighter stars rank first
    })
  for (const o of deepSkyObjects)
    searchables.push({
      label: o.name,
      kind: 'Deep sky',
      q: `${o.name} ${o.messier || ''}`.toLowerCase(),
      type: 'deepsky',
      id: o.id,
      rank: (o.magnitude ?? 20) * 0.02 - (o.notable ? 1 : 0),
    })
}

function searchIndex(query) {
  const q = query.toLowerCase().trim()
  // "m31" and "M 31" should find the Messier object stored as "M031".
  const qMessier = q.replace(/^m\s*(\d{1,3})$/, (_, d) => `m${d.padStart(3, '0')}`)
  const hits = []
  for (const it of searchables) {
    let idx = it.q.indexOf(q)
    if (idx === -1 && qMessier !== q) idx = it.q.indexOf(qMessier)
    if (idx === -1) continue
    // exact < startsWith < contains; tie-break by rank
    const exact = it.q === q || it.q === qMessier
    const score = (idx === 0 ? (exact ? -100 : -50) : 0) + it.rank
    hits.push({ it, score })
  }
  hits.sort((a, b) => a.score - b.score)
  return hits.slice(0, 8).map((h) => ({
    label: h.it.label,
    kind: h.it.kind,
    type: h.it.type,
    id: h.it.id,
  }))
}

// --- Tooltip / hover --------------------------------------------------------
let tooltip = null
let lastHover = 0
function nameFor(type, id) {
  if (type === 'star') return starById.get(id)?.name
  if (type === 'solar') return solarById.get(id)?.userData.name
  if (type === 'deepsky') return deepSkyById.get(id)?.name
  return null
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now()
  if (now - lastHover < 70) return
  lastHover = now
  const hit = pickAt(e.clientX, e.clientY)
  if (hit) {
    if (!tooltip) {
      tooltip = document.createElement('div')
      tooltip.id = 'tooltip'
      document.body.appendChild(tooltip)
    }
    tooltip.textContent = nameFor(hit.type, hit.id) || ''
    tooltip.style.left = e.clientX + 'px'
    tooltip.style.top = e.clientY + 'px'
    renderer.domElement.style.cursor = 'pointer'
  } else {
    if (tooltip) tooltip.remove()
    tooltip = null
    renderer.domElement.style.cursor = 'grab'
  }
})

// --- Click (only when it wasn't a drag) -------------------------------------
let downX = 0,
  downY = 0
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX
  downY = e.clientY
})
renderer.domElement.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return // was a drag
  const hit = pickAt(e.clientX, e.clientY)
  if (hit) selectById(hit.type, hit.id)
})

// --- Resize -----------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
  labelRenderer.setSize(window.innerWidth, window.innerHeight)
  updatePointScale()
})

// --- Render loop ------------------------------------------------------------
const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.1, clock.getDelta())

  if (fly) {
    fly.t += 1 / 60
    const k = easeInOut(Math.min(1, fly.t / fly.dur))
    camera.position.lerpVectors(fly.fromCam, fly.toCam, k)
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k)
    if (fly.t >= fly.dur) {
      fly = null
      controls.enabled = true
    }
  }

  // Time machine: slide the real stars (proper motion) and the planets along
  // their orbits.
  if (timePlaying) {
    simYears = Math.max(-TIME_LIMIT, Math.min(TIME_LIMIT, simYears + TIME_SPEED * dt))
    applyStarTime(simYears)
    layoutSolar(simYears)
    ui.setTime(simYears, timePlaying)
    if (Math.abs(simYears) >= TIME_LIMIT) {
      timePlaying = false
      ui.setTime(simYears, false)
      syncHash()
    }
  }

  // Fade the decorative galaxy out as we dive into the Solar System.
  if (backdrop) {
    backdrop.visible = backdropOn
    if (backdropOn) {
      const d = camera.position.length()
      const target = THREE.MathUtils.clamp((d - 3) / 40, 0, 0.6)
      const u = backdrop.material.uniforms.uOpacity
      u.value += (target - u.value) * 0.1
    }
  }
  controls.update()
  updateBloom()
  deepsky.upgradeNearby(camera.position, { radius: 700, budget: 2 })
  composer.render()
  updateScalebar()
  updateMinimap()
  // Only paint the label overlay when labels actually exist (none yet).
  if (labelRenderer.domElement.childElementCount > 0) labelRenderer.render(scene, camera)
})

// --- Load data --------------------------------------------------------------
async function loadJSON(path) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`)
  return r.json()
}

async function start() {
  const [starList, planetList, solarList, deepSkyList, imageManifest] = await Promise.all([
    loadJSON('/data/stars.json'),
    loadJSON('/data/exoplanets.json'),
    loadJSON('/data/solar-system.json'),
    loadJSON('/data/deep-sky.json'),
    loadJSON('/data/deepsky-images.json').catch(() => ({})),
  ])
  deepSkyImageManifest = imageManifest || {}

  stars = starList
  for (const s of stars) starById.set(s.id, s)
  planets = planetList

  buildMilkyWay()
  buildStars(stars)
  buildSolarSystem(solarList)
  buildDeepSky(deepSkyList)
  indexPlanets(planets)
  buildSearchIndex()

  pickTargets.push(starPoints, ...solarMeshes)
  updatePointScale()

  // HUD: restore any deep link first (so the layer checkboxes reflect it),
  // then wire the panels.
  applyHash()
  renderLayers()
  document.getElementById('layers-reset')?.addEventListener('click', () => {
    enableAllLayers()
    renderLayers()
    syncHash()
    ui.toast('All layers shown')
  })
  ui.setTours(TOURS)
  loadBookmarks()
  ui.setTime(simYears, timePlaying)

  window.__luna = {
    starCount: stars.length,
    planetCount: planets.length,
    solarCount: solarMeshes.length,
    deepSkyCount: deepSkyObjects.length,
    searchCount: searchables.length,
    deepSkyTypes: deepSkyObjects.reduce((a, o) => ((a[o.type] = (a[o.type] || 0) + 1), a), {}),
    deepSkyImages: Object.keys(deepSkyImageManifest).length,
    pick: (x, y) => pickAt(x, y),
    search: (q) => searchIndex(q),
    select: (type, id) => selectById(type, id),
    infoHtml: () => document.getElementById('info-body')?.innerHTML || '',
    // --- new API surface for the feature set / tests ---
    layers: () => ({ ...layerState }),
    setLayer: (id, on) => setLayer(id, on),
    enableAllLayers,
    tours: () => TOURS.map((t) => ({ id: t.id, title: t.title, stops: t.stops.length })),
    playTour: (id) => {
      const t = TOURS.find((x) => x.id === id)
      if (t) playTour(t)
    },
    captionHtml: () => document.getElementById('caption')?.innerHTML || '',
    bookmarks: () => bookmarks.slice(),
    save: () => toggleBookmark(),
    time: (y) => {
      timePlaying = false
      setSimYears(y)
    },
    timeYears: () => simYears,
    isExtragalactic: (id) => isExtragalactic(deepSkyById.get(id)),
    selected: () => current,
    solarXYZ: () =>
      Object.fromEntries([...solarPosition].map(([k, v]) => [k, [+v.x.toFixed(6), +v.y.toFixed(6), +v.z.toFixed(6)]])),
    starXYZ: (id) => {
      const s = starById.get(id)
      return s ? [+s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4)] : null
    },
    hash: () => location.hash,
    // Current bloom strength — ramps down as the camera dives in so close-ups
    // (e.g. Earth next to the Sun) stay readable.
    bloomStrength: () => +bloom.strength.toFixed(4),
    // Alpha of a body's glow map at the corner / edge / centre. A square
    // billboard would show a high corner; the round map must be 0 there.
    glowAlpha: (id) => {
      const rec = solarBodies.find((b) => b.id === id)
      const img = rec && rec.glow ? rec.glow.material.map && rec.glow.material.map.image : null
      if (!img || !img.width) return null
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const px = g.getImageData(0, 0, img.width, img.height).data
      const a = (x, y) => px[(y * img.width + x) * 4 + 3]
      const m = img.width >> 1
      return { corner: a(1, 1), edge: a(img.width - 3, m), center: a(m, m) }
    },
  }
  console.log(
    `Luna: ${stars.length} stars, ${planets.length} planets, ${solarMeshes.length} solar bodies, ${deepSkyObjects.length} deep-sky objects.`,
  )
  ui.setLoading(false)
}

start().catch((err) => {
  console.error('Luna: failed to load —', err)
  const el = document.getElementById('loading')
  if (el) el.innerHTML = '<span style="color:#ff6b6b">Could not load data.</span>'
})
