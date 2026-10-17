// ---------------------------------------------------------------------------
// Luna — deep-sky layer.
//
// Renders the 12k deep-sky catalogue in two parts:
//   * a single GPU particle cloud (an atlas shader picks a per-type portrait,
//     so galaxies/clusters/nebulae each read differently), and
//   * per-object billboards for the ~240 "notable" objects, textured with a
//     unique procedural portrait so the famous ones look like themselves.
//
// Objects with a trustworthy distance are placed at their true galactic
// position. Objects whose distance is unknown (or is far beyond the Milky Way,
// e.g. distant galaxies) are placed on a large line-of-sight "sky shell" and
// flagged as not-to-scale — we never invent a 3D distance.

import * as THREE from 'three'
import {
  deepSkyTypeCanvas,
  deepSkyTexture,
  deepSkyCanvas,
  loadImage,
  maskedPhotoCanvas,
} from './textures.js'

export const DEEP_SKY_TYPES = [
  'galaxy',
  'open cluster',
  'globular cluster',
  'planetary nebula',
  'nebula',
  'supernova remnant',
  'stellar association',
  'black hole',
  'pulsar',
]

const TYPE_INDEX = Object.fromEntries(DEEP_SKY_TYPES.map((t, i) => [t, i]))

// Type colours, reused by the legend + particle tint.
export const TYPE_COLOR = {
  galaxy: 0xf2c98a,
  'open cluster': 0x9fc6ff,
  'globular cluster': 0xffdca8,
  'planetary nebula': 0x7fe6d0,
  nebula: 0xff8fd0,
  'supernova remnant': 0xd0a0ff,
  'stellar association': 0x8fd0ff,
  'black hole': 0xffb060,
  pulsar: 0x80d0ff,
}

const NEAR_LIMIT = 18000 // pc — beyond this we use the sky shell
const SHELL_RADIUS = 16000 // pc — the not-to-scale "celestial sphere"

const VERT = `
  uniform float uScale;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aType;
  varying vec3 vColor;
  varying float vType;
  void main() {
    vColor = aColor;
    vType = aType;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, 72.0);
    gl_Position = projectionMatrix * mv;
  }
`
const FRAG = `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vType;
  void main() {
    float col = mod(vType, 3.0);
    float row = floor(vType / 3.0);
    vec2 uv = vec2((col + gl_PointCoord.x) / 3.0, (row + gl_PointCoord.y) / 3.0);
    vec4 tex = texture2D(uAtlas, uv);
    if (tex.a < 0.02) discard;
    vec3 rgb = tex.rgb * (0.55 + 0.45 * vColor);
    gl_FragColor = vec4(rgb, tex.a * uOpacity);
  }
`

function buildAtlas() {
  const cell = 128
  const c = document.createElement('canvas')
  c.width = cell * 3
  c.height = cell * 3
  const ctx = c.getContext('2d')
  DEEP_SKY_TYPES.forEach((type, i) => {
    const portrait = deepSkyTypeCanvas(type, cell)
    const col = i % 3
    const row = Math.floor(i / 3)
    ctx.drawImage(portrait, col * cell, row * cell)
  })
  const tex = new THREE.CanvasTexture(c)
  tex.flipY = false
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  return tex
}

function sizeFor(obj) {
  if (obj.notable) return 26
  switch (obj.type) {
    case 'black hole':
      return 26
    case 'pulsar':
      return 22
    case 'nebula':
    case 'supernova remnant':
    case 'planetary nebula':
      return 18
    case 'globular cluster':
      return 13
    case 'open cluster':
      return 12
    case 'stellar association':
      return 11
    default:
      return 8
  }
}

export function createDeepSky(scene, { imageUrl = null } = {}) {
  const group = new THREE.Group()
  scene.add(group)

  const atlas = buildAtlas()
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 1 },
      uAtlas: { value: atlas },
      uOpacity: { value: 0.9 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  let points = null
  let objects = []
  const sprites = new Map() // id -> Sprite
  const portraitCache = new Map() // id -> dataUrl

  function positionOf(o) {
    if (o.distancePc && o.distancePc <= NEAR_LIMIT && o.x !== null) {
      return [o.x, o.y, o.z, true]
    }
    const d = o.dir
    return [d[0] * SHELL_RADIUS, d[1] * SHELL_RADIUS, d[2] * SHELL_RADIUS, false]
  }

  function load(list) {
    objects = list
    const n = list.length
    const positions = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)
    const sizes = new Float32Array(n)
    const types = new Float32Array(n)

    list.forEach((o, i) => {
      const [x, y, z] = positionOf(o)
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      const c = new THREE.Color(TYPE_COLOR[o.type] || 0xffffff)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      sizes[i] = sizeFor(o)
      types[i] = TYPE_INDEX[o.type] ?? 0
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    g.setAttribute('aType', new THREE.BufferAttribute(types, 1))
    points = new THREE.Points(g, material)
    points.frustumCulled = false
    points.renderOrder = -0.5
    points.userData = { type: 'deepsky' }
    group.add(points)

    // billboards for the notable objects
    for (const o of list) {
      if (!o.notable) continue
      const [x, y, z] = positionOf(o)
      const tex = new THREE.CanvasTexture(deepSkyCanvas(o, 160))
      tex.colorSpace = THREE.SRGBColorSpace
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
      })
      const spr = new THREE.Sprite(mat)
      spr.position.set(x, y, z)
      const scale = THREE.MathUtils.clamp((o.distancePc || SHELL_RADIUS) * 0.03, 12, 520)
      spr.scale.setScalar(scale)
      spr.userData = { id: o.id, type: 'deepsky' }
      group.add(spr)
      sprites.set(o.id, spr)

      // Queue the real photograph; it is fetched lazily as the camera nears the
      // object, so we never pull ~13 MB of images up front.
      const url = imageUrl ? imageUrl(o.id) : null
      if (url) pending.set(o.id, { spr, url, pos: new THREE.Vector3(x, y, z) })
    }
  }

  // Fetch and apply real photographs for notable objects near the camera.
  const pending = new Map()
  let lastUpgrade = 0
  function upgradeNearby(cameraPos, { radius = 600, budget = 3 } = {}) {
    if (!pending.size) return
    const now = performance.now()
    if (now - lastUpgrade < 250) return
    lastUpgrade = now
    let done = 0
    for (const [id, item] of pending) {
      if (item.pos.distanceTo(cameraPos) > radius) continue
      pending.delete(id)
      loadImage(item.url).then((img) => {
        if (!img) return
        const tex = new THREE.CanvasTexture(maskedPhotoCanvas(img, 192))
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        const old = item.spr.material.map
        item.spr.material.map = tex
        item.spr.material.opacity = 0.92
        item.spr.material.needsUpdate = true
        if (old) old.dispose()
      })
      if (++done >= budget) break
    }
  }

  function updateScale(uScale) {
    material.uniforms.uScale.value = uScale
  }

  function setVisible(on) {
    group.visible = on
  }

  function portrait(o) {
    if (portraitCache.has(o.id)) return portraitCache.get(o.id)
    const url = deepSkyCanvas(o, 220).toDataURL('image/png')
    portraitCache.set(o.id, url)
    return url
  }

  function indexOfObject(obj) {
    return objects.indexOf(obj)
  }

  return {
    group,
    load,
    updateScale,
    setVisible,
    upgradeNearby,
    portrait,
    worldPosition: (o) => {
      const [x, y, z] = positionOf(o)
      return new THREE.Vector3(x, y, z)
    },
    points: () => points,
    objects: () => objects,
    pointAtIndex: (i) => objects[i],
    sprite: (id) => sprites.get(id),
    sprites: () => [...sprites.values()],
    indexOfObject,
    material,
  }
}
