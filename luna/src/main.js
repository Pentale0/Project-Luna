import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// ---------------------------------------------------------------------------
// Luna — Milestone 1: empty universe.
// A black 3D scene with a camera you can orbit / zoom / pan with the mouse.
// ---------------------------------------------------------------------------

// 1. The scene: think of it as an empty 3D room. Objects (stars, later) get
//    added to it with scene.add(...). The background color is deep space black.
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)

// 2. The camera: your "ship". It looks out of a window (the screen).
//    - fov: field of view in degrees (how wide the window is)
//    - near/far: clipping planes — anything closer than `near` or farther
//      than `far` parsecs (our world units) is not drawn.
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  50000,
)
camera.position.set(0, 5, 20) // start a bit above and away from the origin

// 3. The renderer: the engine that draws the 3D scene into pixels on screen.
//    It creates a <canvas> element; we append it to the page ourselves.
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
// Cap pixel density: phones have very dense screens; drawing every device
// pixel would waste GPU time for almost no visible gain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.querySelector('#app').appendChild(renderer.domElement)

// 4. OrbitControls: turns mouse input into camera movement.
//    - left drag: orbit around a focal point
//    - wheel: zoom in/out
//    - right drag: pan (move sideways)
//    `damping` adds slight inertia so motion feels smooth, not mechanical.
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 1 // don't let the camera go inside the focal point
controls.maxDistance = 10000

// 5. Temporary helper (we delete it in M2): three colored lines showing where
//    +x (red), +y (green), +z (blue) point. Useful to confirm the scene works.
const axes = new THREE.AxesHelper(5)
scene.add(axes)

// 6. Resize handler: if the browser window changes size, update the camera's
//    aspect ratio and the renderer size, or the picture will stretch.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix() // recompute the projection with the new ratio
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// 7. The render loop: runs ~60 times per second (every animation frame).
//    Each frame: update control physics (damping), then draw the scene.
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
