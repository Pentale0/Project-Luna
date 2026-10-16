import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createUI } from './ui.js'

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

function buildStars(list) {
  const positions = new Float32Array(list.length * 3)
  const colors = new Float32Array(list.length * 3)
  const sizes = new Float32Array(list.length)

  list.forEach((s, i) => {
    positions[i * 3] = s.x
    positions[i * 3 + 1] = s.y
    positions[i * 3 + 2] = s.z
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

  // teal halo on the 890 stars known to host planets
  const hosts = list.filter((s) => s.hasPlanets)
  const hp = new Float32Array(hosts.length * 3)
  const hc = new Float32Array(hosts.length * 3)
  const hs = new Float32Array(hosts.length)
  hosts.forEach((s, i) => {
    hp[i * 3] = s.x
    hp[i * 3 + 1] = s.y
    hp[i * 3 + 2] = s.z
    hc[i * 3] = 0.15
    hc[i * 3 + 1] = 1.0
    hc[i * 3 + 2] = 0.85
    hs[i] = absMagToSize(s.absMag) * 6
  })
  hostPoints = makePoints(hp, hc, hs, makeStarMaterial({ maxSize: 30, opacity: 0.5 }))
  hostPoints.frustumCulled = false
  scene.add(hostPoints)
}

// --- Solar System (exaggerated; NOT to scale) -------------------------------
const solarGroup = new THREE.Group()
scene.add(solarGroup)
const solarById = new Map()
const solarPosition = new Map()
const solarMeshes = []

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

function buildSolarSystem(list) {
  const GOLDEN = 2.399963229728653
  list.forEach((b, i) => {
    let pos
    if (b.type === 'star') {
      pos = new THREE.Vector3(0, 0, 0)
    } else if (b.semiMajorAxisAu !== null && b.semiMajorAxisAu !== undefined) {
      const r = orbitR(b.semiMajorAxisAu)
      const a = i * GOLDEN
      pos = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)
    } else {
      // a moon: sit just outside its parent, on its own little ring
      const parent = solarPosition.get(b.parentId) || new THREE.Vector3()
      const pr = solarById.get(b.parentId)?.userData?.displayR || 0.0006
      const mr = pr + 0.0009 + (i % 3) * 0.0007
      const a = i * GOLDEN
      pos = parent.clone().add(new THREE.Vector3(Math.cos(a) * mr, Math.sin(a) * mr, 0))
    }

    const isSun = b.type === 'star'
    const r = isSun ? 0.0011 : bodyR(b.radiusKm || 1000)
    const mat = new THREE.MeshBasicMaterial({
      color: BODY_COLOR[b.id] || 0xcccccc,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), mat)
    mesh.position.copy(pos)
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
    solarPosition.set(b.id, pos)

    // a soft glow so tiny worlds are still findable / clickable
    const glowMat = new THREE.SpriteMaterial({
      color: BODY_COLOR[b.id] || 0xcccccc,
      transparent: true,
      opacity: isSun ? 0.5 : 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.setScalar(r * (isSun ? 14 : 9))
    glow.position.copy(pos)
    solarGroup.add(glow)
  })
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

// --- Info panel HTML --------------------------------------------------------
const UNK = 'Unknown'
const fmt = (v, unit = '', digits = 2) =>
  v === null || v === undefined ? UNK : `${Number(v).toFixed(digits)}${unit}`

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

// --- Picking ----------------------------------------------------------------
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const pickTargets = [] // filled after data loads

function pickAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1
  pointer.y = -(clientY / window.innerHeight) * 2 + 1
  // Let the point-pick tolerance grow when zoomed out.
  const dist = camera.position.distanceTo(controls.target)
  raycaster.params.Points.threshold = THREE.MathUtils.clamp(dist * 0.012, 0.15, 4.0)
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(pickTargets, false)
  if (!hits.length) return null
  const h = hits[0]
  if (h.object.userData.type === 'stars') {
    const s = stars[h.index]
    return { type: 'star', id: s.id }
  }
  return { type: 'solar', id: h.object.userData.id }
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

// --- Selection / search -----------------------------------------------------
const ui = createUI({
  onQuery: (q) => searchIndex(q),
  onSelect: (item) => selectById(item.type, item.id),
})

function selectById(type, id) {
  if (type === 'star') {
    const s = starById.get(id)
    if (!s) return
    ui.showInfo(renderStarInfo(s))
    flyTo(new THREE.Vector3(s.x, s.y, s.z), 4)
  } else if (type === 'exoplanet') {
    const p = planetById.get(id)
    if (!p) return
    ui.showInfo(renderPlanetInfo(p))
    const host = starById.get(p.hostId)
    if (host) flyTo(new THREE.Vector3(host.x, host.y, host.z), 4)
  } else if (type === 'solar') {
    const b = solarById.get(id)
    if (!b) return
    ui.showInfo(renderSolarInfo(b.userData.data))
    const r = b.userData.displayR
    flyTo(b.position.clone(), Math.max(0.004, r * 8))
  }
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
}

function searchIndex(query) {
  const q = query.toLowerCase()
  const hits = []
  for (const it of searchables) {
    const idx = it.q.indexOf(q)
    if (idx === -1) continue
    // exact < startsWith < contains; tie-break by rank
    const score = (idx === 0 ? (it.q === q ? -100 : -50) : 0) + it.rank
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
  updatePointScale()
})

// --- Render loop ------------------------------------------------------------
renderer.setAnimationLoop(() => {
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
  // Fade the decorative galaxy out as we dive into the Solar System.
  if (backdrop) {
    const d = camera.position.length()
    const target = THREE.MathUtils.clamp((d - 3) / 40, 0, 0.6)
    const u = backdrop.material.uniforms.uOpacity
    u.value += (target - u.value) * 0.1
  }
  controls.update()
  renderer.render(scene, camera)
})

// --- Load data --------------------------------------------------------------
async function loadJSON(path) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`)
  return r.json()
}

async function start() {
  const [starList, planetList, solarList] = await Promise.all([
    loadJSON('/data/stars.json'),
    loadJSON('/data/exoplanets.json'),
    loadJSON('/data/solar-system.json'),
  ])

  stars = starList
  for (const s of stars) starById.set(s.id, s)
  planets = planetList

  buildMilkyWay()
  buildStars(stars)
  buildSolarSystem(solarList)
  indexPlanets(planets)
  buildSearchIndex()

  pickTargets.push(starPoints, ...solarMeshes)
  updatePointScale()

  window.__luna = {
    starCount: stars.length,
    planetCount: planets.length,
    solarCount: solarMeshes.length,
    searchCount: searchables.length,
    pick: (x, y) => pickAt(x, y),
  }
  console.log(
    `Luna: ${stars.length} stars, ${planets.length} planets, ${solarMeshes.length} solar bodies.`,
  )
  ui.setLoading(false)
}

start().catch((err) => {
  console.error('Luna: failed to load —', err)
  const el = document.getElementById('loading')
  if (el) el.innerHTML = '<span style="color:#ff6b6b">Could not load data.</span>'
})
