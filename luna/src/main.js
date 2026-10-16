import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ---------------------------------------------------------------------------
// Luna — Milestone 1: scene / camera / controls.
// Luna — Milestone 2: load stars.json and draw every star as a glowing point.
// ---------------------------------------------------------------------------

// 1. The scene: an empty 3D room. Stars get added to it later.
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

// 2. The camera: your "ship". It looks out of a window (the screen).
//    World units are parsecs, so these numbers are real distances.
//    Galactic data puts the Sun at (0,0,0) and the north galactic pole on +z,
//    so we tilt the camera's "up" to +z: the flat Milky Way disc then lies
//    in the x–y plane and reads like a map instead of a wall.
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  50000,
)
camera.up.set(0, 0, 1)
camera.position.set(0, 120, 220) // above and back from the galactic centre

// 3. The renderer: the engine that draws the 3D scene into pixels.
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
// Cap pixel density: phones have very dense screens; drawing every device
// pixel would waste GPU time for almost no visible gain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.querySelector('#app').appendChild(renderer.domElement)

// 4. OrbitControls: turns mouse input into camera movement.
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 0.5
controls.maxDistance = 20000

// ---------------------------------------------------------------------------
// 5. Colour and size helpers.
// ---------------------------------------------------------------------------

// A star's B−V colour index says how blue or red it looks. We convert it to a
// temperature (Ballesteros' formula) and then to an RGB colour (an
// approximation of the blackbody spectrum), so blue-white hot stars and
// orange-red cool stars come out looking right.
function bvToColor(bv) {
  if (bv === null || bv === undefined) return [0.85, 0.9, 1.0] // unknown -> warm white
  const b = Math.max(-0.4, Math.min(2.0, bv))
  const temp = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))

  // Temperature (kelvin) -> RGB.
  const t = temp / 100
  let r, g, blue
  if (t <= 66) {
    r = 255
    g = 99.47 * Math.log(t) - 161.12
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332)
    g = 288.12 * Math.pow(t - 60, -0.0755)
  }
  if (t >= 66) {
    blue = 255
  } else if (t <= 19) {
    blue = 0
  } else {
    blue = 138.52 * Math.log(t - 10) - 305.04
  }
  const clamp = (v) => Math.max(0, Math.min(255, v)) / 255
  return [clamp(r), clamp(g), clamp(blue)]
}

// Brighter stars (lower absolute magnitude) should look bigger. Flux scales
// like 10^(-0.4·mag); we take a gentle root of that so the range stays usable,
// and clamp so nothing becomes invisible or absurdly huge.
function absMagToSize(absMag) {
  const sunMag = 4.83
  const brightness = Math.pow(10, -0.4 * (absMag - sunMag))
  const radius = 0.25 * Math.pow(brightness, 0.25)
  return Math.min(1.5, Math.max(0.05, radius))
}

// ---------------------------------------------------------------------------
// 6. The point shader.
// Three's built-in PointsMaterial can't give each star its own size, so we
// write a tiny shader. Each vertex carries its colour and size; the shader
// turns the square point into a soft glowing disc.
// ---------------------------------------------------------------------------
const VERTEX_SHADER = `
  uniform float uScale;      // converts world size -> screen pixels
  attribute float aSize;     // per-star radius in parsecs
  attribute vec3 aColor;     // per-star RGB
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Far stars shrink (perspective); clamp so faint stars stay visible.
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 60.0);
    gl_Position = projectionMatrix * mv;
  }
`

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  void main() {
    // gl_PointCoord runs 0..1 across the square point; make a soft disc.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, alpha);
  }
`

function makeStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending, // overlapping stars brighten, like light
    depthWrite: false,
  })
}

// Convert a list of stars into a THREE.Points cloud. `overrideColor` (optional)
// paints every point one RGB; otherwise each star uses its own colour.
function starsToPoints(stars, sizeScale = 1, overrideColor = null) {
  const n = stars.length
  const positions = new Float32Array(n * 3)
  const colors = new Float32Array(n * 3)
  const sizes = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const s = stars[i]
    // Data is already galactic Cartesian parsecs: use x, y, z directly.
    positions[i * 3] = s.x
    positions[i * 3 + 1] = s.y
    positions[i * 3 + 2] = s.z

    const rgb = overrideColor || bvToColor(s.colorIndex)
    colors[i * 3] = rgb[0]
    colors[i * 3 + 1] = rgb[1]
    colors[i * 3 + 2] = rgb[2]

    sizes[i] = absMagToSize(s.absMag) * sizeScale
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  return new THREE.Points(geometry, makeStarMaterial())
}

// ---------------------------------------------------------------------------
// 7. Load the data and build the scene.
// ---------------------------------------------------------------------------
const materials = [] // so the resize handler can update every shader's scale

function updatePointScale() {
  const bufferSize = renderer.getDrawingBufferSize(new THREE.Vector2())
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
  const scale = bufferSize.y / (2 * Math.tan(halfFov))
  for (const m of materials) m.uniforms.uScale.value = scale
}

async function loadStars() {
  const response = await fetch('/data/stars.json')
  if (!response.ok) throw new Error(`stars.json -> HTTP ${response.status}`)
  const stars = await response.json()

  // Every star, coloured by its real B−V value.
  const allStars = starsToPoints(stars, 1.0)
  scene.add(allStars)
  materials.push(allStars.material)

  // Exoplanet host stars: a soft teal halo so you can see where known planets
  // are. (Exoplanet data lists the planet's host, not its own x/y/z, so a
  // planet marker sits on its star.)
  const hosts = stars.filter((s) => s.hasPlanets)
  if (hosts.length) {
    const hostPoints = starsToPoints(hosts, 6.0, [0.15, 1.0, 0.85])
    scene.add(hostPoints)
    materials.push(hostPoints.material)
  }

  updatePointScale()

  // Handy for debugging in the browser console (and for our tests).
  window.__luna = { starCount: stars.length, hostCount: hosts.length }
  console.log(`Luna: drew ${stars.length} stars (${hosts.length} host planet stars).`)
}

loadStars().catch((err) => {
  console.error('Luna: failed to load star data —', err)
  const msg = document.createElement('div')
  msg.textContent = 'Could not load star data.'
  msg.style.cssText =
    'position:absolute;top:1rem;left:1rem;color:#ff6b6b;font:14px monospace'
  document.body.appendChild(msg)
})

// 8. Resize handler: keep the camera aspect and the point sizes correct.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  updatePointScale()
})

// 9. The render loop: update control physics, then draw.
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
