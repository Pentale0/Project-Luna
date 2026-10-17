// ---------------------------------------------------------------------------
// Luna — procedural textures.
//
// Everything here is drawn with the 2D canvas API, so it works fully offline
// (no broken image links) and is deterministic for a given seed. Used for:
//   * deep-sky "portraits" (galaxies, nebulae, clusters, black holes…)
//   * Solar System body surfaces (bands, craters, continents…)
// The info panel swaps in a real photograph (Wikipedia REST API) on top of
// these when one is available, so these double as the fallback.
// ---------------------------------------------------------------------------

import * as THREE from 'three'

// Small deterministic PRNG so each object always looks the same.
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  return c
}

// Fade the edges of everything drawn so far into transparency, turning a
// fillRect() base into a soft disc instead of a hard square. This is what
// removes the "circle inside a square" look from the procedural portraits.
function applyDiscMask(ctx, size, feather = 0.08) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * (0.5 - feather),
    size / 2,
    size / 2,
    size * 0.5,
  )
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}

// A soft key light from the upper-left + a darkening limb, so a flat painted
// texture reads as a lit sphere.
function applySphereShade(ctx, size) {
  ctx.save()
  const sh = ctx.createRadialGradient(
    size * 0.36, size * 0.33, size * 0.02,
    size * 0.5, size * 0.5, size * 0.54,
  )
  sh.addColorStop(0, 'rgba(255,255,255,0.28)')
  sh.addColorStop(0.55, 'rgba(255,255,255,0.0)')
  sh.addColorStop(0.82, 'rgba(0,0,0,0.32)')
  sh.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = sh
  ctx.fillRect(0, 0, size, size)
  ctx.restore()
}

// A soft round glow used for the Solar System "beacons". A SpriteMaterial with
// no map draws a solid billboard *square*, which leaves a faint box behind every
// world; this supplies a radial, edge-faded texture so the glow reads as light.
// Drawn white with a pure alpha falloff so the sprite's `color` tints it.
export function glowSpriteCanvas(size = 128) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.1, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.26)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.06)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return c
}

function radial(rand, x0, y0, r0, r1, stops) {
  return { rand, x0, y0, r0, r1, stops }
}

function paintRadial(ctx, size, { x0, y0, r0, r1, stops }) {
  const g = ctx.createRadialGradient(
    x0 * size,
    y0 * size,
    r0 * size,
    x0 * size,
    y0 * size,
    r1 * size,
  )
  for (const [off, col] of stops) g.addColorStop(off, col)
  return g
}

// --- individual painters ----------------------------------------------------

function drawGalaxy(ctx, size, rand, hue) {
  const cx = size / 2
  const cy = size / 2
  // rotating disc of stars
  const arms = 2 + Math.floor(rand() * 2)
  const twist = 2.2 + rand() * 1.6
  const stars = 900
  for (let i = 0; i < stars; i++) {
    const t = Math.pow(rand(), 0.6)
    const r = t * size * 0.46
    const arm = i % arms
    const a =
      (t * twist) + (arm * Math.PI * 2) / arms + (rand() - 0.5) * 0.5
    const x = cx + Math.cos(a) * r + (rand() - 0.5) * 6
    const y = cy + Math.sin(a) * r * 0.5 + (rand() - 0.5) * 6 + r * 0.28
    const s = 0.5 + rand() * 1.6
    const warm = 1 - t
    ctx.fillStyle = `hsla(${hue + warm * 18}, ${55 + warm * 25}%, ${62 + warm * 20}%, ${0.5 + rand() * 0.5})`
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }
  // bright core
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = paintRadial(ctx, size, {
    x0: 0.5, y0: 0.5, r0: 0.0, r1: 0.24,
    stops: [[0, 'rgba(255,246,214,0.95)'], [0.4, 'rgba(255,214,150,0.5)'], [1, 'rgba(255,180,120,0)']],
  })
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function drawSpiralNebula(ctx, size, rand, hue, hue2) {
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 26; i++) {
    const x = rand()
    const y = rand()
    const r = 0.05 + rand() * 0.22
    const g = paintRadial(ctx, size, {
      x0: x, y0: y, r0: 0, r1: r,
      stops: [
        [0, `hsla(${hue + rand() * 40}, 90%, 70%, ${0.22 + rand() * 0.28})`],
        [1, 'rgba(0,0,0,0)'],
      ],
    })
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 14; i++) {
    const x = rand()
    const y = rand()
    const r = 0.04 + rand() * 0.16
    const g = paintRadial(ctx, size, {
      x0: x, y0: y, r0: 0, r1: r,
      stops: [[0, `hsla(${hue2}, 70%, 60%, 0.25)`], [1, 'rgba(0,0,0,0)']],
    })
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x * size, y * size, r * size, 0, Math.PI * 2)
    ctx.fill()
  }
  // embedded young stars
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`
    ctx.beginPath()
    ctx.arc(rand() * size, rand() * size, rand() * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawOpenCluster(ctx, size, rand) {
  ctx.globalCompositeOperation = 'lighter'
  const n = 90 + Math.floor(rand() * 90)
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.pow(rand(), 0.7) * size * 0.44
    const x = size / 2 + Math.cos(a) * r
    const y = size / 2 + Math.sin(a) * r
    const s = 0.6 + rand() * 2.4
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3)
    g.addColorStop(0, `hsla(${200 + rand() * 40}, 80%, 90%, 1)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, s * 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawGlobular(ctx, size, rand) {
  ctx.globalCompositeOperation = 'lighter'
  const n = 1400
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.pow(rand(), 2.1) * size * 0.47
    const x = size / 2 + Math.cos(a) * r
    const y = size / 2 + Math.sin(a) * r
    const s = 0.4 + rand() * 1.1
    ctx.fillStyle = `hsla(${40 + rand() * 20}, 60%, ${72 + rand() * 20}%, ${0.5 + rand() * 0.5})`
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }
  const g = paintRadial(ctx, size, {
    x0: 0.5, y0: 0.5, r0: 0, r1: 0.22,
    stops: [[0, 'rgba(255,245,220,0.85)'], [1, 'rgba(255,220,160,0)']],
  })
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.23, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function drawPlanetaryNebula(ctx, size, rand, hue) {
  ctx.globalCompositeOperation = 'lighter'
  const cx = size / 2
  const cy = size / 2
  const outer = size * 0.4
  const inner = outer * (0.35 + rand() * 0.2)
  for (let ring = 0; ring < 3; ring++) {
    const rr = outer * (1 - ring * 0.22)
    const g = ctx.createRadialGradient(cx, cy, inner * 0.6, cx, cy, rr)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.7, `hsla(${hue + ring * 25}, 85%, 65%, 0.55)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, rr, 0, Math.PI * 2)
    ctx.fill()
  }
  // central white dwarf
  const c = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner)
  c.addColorStop(0, 'rgba(255,255,255,1)')
  c.addColorStop(1, 'rgba(160,220,255,0)')
  ctx.fillStyle = c
  ctx.beginPath()
  ctx.arc(cx, cy, inner, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function drawSnr(ctx, size, rand, hue) {
  ctx.globalCompositeOperation = 'lighter'
  const cx = size / 2
  const cy = size / 2
  for (let i = 0; i < 220; i++) {
    const a = rand() * Math.PI * 2
    const r = size * (0.2 + rand() * 0.28)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    const s = 1 + rand() * 3
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4)
    g.addColorStop(0, `hsla(${hue + rand() * 60}, 95%, 68%, ${0.3 + rand() * 0.4})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, s * 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

function drawBlackHole(ctx, size, rand) {
  const cx = size / 2
  const cy = size / 2
  ctx.globalCompositeOperation = 'lighter'
  // accretion disc (squashed ellipse)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, 0.32)
  for (let i = 8; i >= 0; i--) {
    const r = size * (0.16 + i * 0.032)
    ctx.strokeStyle = `hsla(${20 + i * 6}, 95%, ${58 + i * 2}%, ${0.5 - i * 0.05})`
    ctx.lineWidth = size * 0.02
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  // photon ring glow
  const g = ctx.createRadialGradient(cx, cy, size * 0.12, cx, cy, size * 0.2)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.8, 'rgba(255,200,120,0.9)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2)
  ctx.fill()
  // event horizon
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.135, 0, Math.PI * 2)
  ctx.fill()
}

function drawPulsar(ctx, size, rand) {
  ctx.fillStyle = '#02030a'
  ctx.fillRect(0, 0, size, size)
  const cx = size / 2
  const cy = size / 2
  ctx.globalCompositeOperation = 'lighter'
  const tilt = (rand() - 0.5) * 1.2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(tilt)
  for (const dir of [-1, 1]) {
    const g = ctx.createLinearGradient(0, 0, 0, dir * size * 0.5)
    g.addColorStop(0, 'rgba(180,225,255,0.85)')
    g.addColorStop(1, 'rgba(120,180,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(-size * 0.09, 0)
    ctx.lineTo(size * 0.09, 0)
    ctx.lineTo(0, dir * size * 0.5)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(150,210,255,0.6)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function drawGenericNebula(ctx, size, rand, hue) {
  drawSpiralNebula(ctx, size, rand, hue, hue + 140)
}

const DEEP_SKY_HUE = {
  galaxy: 34,
  nebula: 330,
  'planetary nebula': 175,
  'open cluster': 210,
  'globular cluster': 42,
  'supernova remnant': 300,
  'stellar association': 200,
  'black hole': 28,
  pulsar: 190,
}

// Public: returns { canvas, texture, dataUrl } for a deep-sky object.
export function deepSkyTexture(obj, size = 160) {
  const rand = mulberry32(hashSeed(obj.id || obj.name))
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const hue = DEEP_SKY_HUE[obj.type] ?? 210
  switch (obj.type) {
    case 'galaxy':
      drawGalaxy(ctx, size, rand, hue)
      break
    case 'open cluster':
      drawOpenCluster(ctx, size, rand)
      break
    case 'globular cluster':
      drawGlobular(ctx, size, rand)
      break
    case 'planetary nebula':
      drawPlanetaryNebula(ctx, size, rand, hue)
      break
    case 'supernova remnant':
      drawSnr(ctx, size, rand, hue)
      break
    case 'black hole':
      drawBlackHole(ctx, size, rand)
      break
    case 'pulsar':
      drawPulsar(ctx, size, rand)
      break
    default:
      drawGenericNebula(ctx, size, rand, hue)
  }
  applyDiscMask(ctx, size, 0.1)
  return {
    canvas: c,
    texture: new THREE.CanvasTexture(c),
    dataUrl: c.toDataURL('image/png'),
  }
}

export function deepSkyCanvas(obj, size = 160) {
  const rand = mulberry32(hashSeed(obj.id || obj.name))
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const hue = DEEP_SKY_HUE[obj.type] ?? 210
  switch (obj.type) {
    case 'galaxy':
      drawGalaxy(ctx, size, rand, hue)
      break
    case 'open cluster':
      drawOpenCluster(ctx, size, rand)
      break
    case 'globular cluster':
      drawGlobular(ctx, size, rand)
      break
    case 'planetary nebula':
      drawPlanetaryNebula(ctx, size, rand, hue)
      break
    case 'supernova remnant':
      drawSnr(ctx, size, rand, hue)
      break
    case 'black hole':
      drawBlackHole(ctx, size, rand)
      break
    case 'pulsar':
      drawPulsar(ctx, size, rand)
      break
    default:
      drawGenericNebula(ctx, size, rand, hue)
  }
  applyDiscMask(ctx, size, 0.1)
  return c
}

// Shared canonical portrait for a *type* (used for the fast particle cloud).
export function deepSkyTypeCanvas(type, size = 96) {
  return deepSkyCanvas({ id: type, type }, size)
}

// --- Solar System body surfaces --------------------------------------------

function drawBands(ctx, size, rand, palette) {
  let y = 0
  while (y < size) {
    const h = size * (0.03 + rand() * 0.08)
    const col = palette[Math.floor(rand() * palette.length)]
    ctx.fillStyle = col
    ctx.fillRect(0, y, size, h + 1)
    y += h
  }
  // wobble the bands horizontally for a gaseous look
  ctx.globalAlpha = 0.25
  for (let i = 0; i < 40; i++) {
    const yy = rand() * size
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)]
    ctx.beginPath()
    ctx.ellipse(rand() * size, yy, size * (0.1 + rand() * 0.3), size * 0.01, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawRocky(ctx, size, rand, base, crater) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 260; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 1 + rand() * 6
    ctx.fillStyle = crater
    ctx.globalAlpha = 0.15 + rand() * 0.3
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 0.12
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(x + r * 0.3, y + r * 0.3, r * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawEarth(ctx, size, rand) {
  ctx.fillStyle = '#123a7a'
  ctx.fillRect(0, 0, size, size)
  // continents: clusters of green blobs
  for (let i = 0; i < 40; i++) {
    const x = rand() * size
    const y = size * 0.15 + rand() * size * 0.7
    const r = 6 + rand() * 20
    ctx.fillStyle = `hsl(${90 + rand() * 40}, ${35 + rand() * 25}%, ${28 + rand() * 16}%)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // polar ice
  ctx.fillStyle = 'rgba(235,245,255,0.85)'
  ctx.fillRect(0, 0, size, size * 0.08)
  ctx.fillRect(0, size * 0.92, size, size * 0.08)
  // clouds
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.25})`
    ctx.beginPath()
    ctx.ellipse(rand() * size, rand() * size, 4 + rand() * 16, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2)
    ctx.fill()
  }
}

const BODY_PALETTE = {
  'sol-sun': ['#ffdf8a', '#ffc24d', '#ff9d2e', '#fff0c0'],
  'sol-mercury': ['#8c8177'],
  'sol-venus': ['#e6d3a3', '#d9bd84', '#f0e2b8'],
  'sol-mars': ['#b5532f'],
  'sol-jupiter': ['#d8b78a', '#c99f6a', '#efe0c4', '#a87c54', '#e6cfa8'],
  'sol-saturn': ['#e3d3a0', '#d3bd83', '#efe6c6'],
  'sol-uranus': ['#a9e6e6', '#c4f0ef'],
  'sol-neptune': ['#4f6fd6', '#5f7fe0', '#7a97ea'],
  'sol-pluto': ['#c9b79f'],
  'sol-moon': ['#bfbfbf'],
}

// Public: procedural surface texture for a Solar System body.
export function solarBodyCanvas(id, size = 256) {
  const rand = mulberry32(hashSeed(id))
  const c = canvas(size)
  const ctx = c.getContext('2d')
  if (id === 'sol-earth') {
    drawEarth(ctx, size, rand)
  } else if (id === 'sol-sun') {
    ctx.fillStyle = '#ff9d2e'
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `hsla(${20 + rand() * 30}, 100%, ${60 + rand() * 30}%, ${0.1 + rand() * 0.4})`
      ctx.beginPath()
      ctx.arc(rand() * size, rand() * size, 1 + rand() * 4, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (['sol-jupiter', 'sol-saturn', 'sol-uranus', 'sol-neptune'].includes(id)) {
    drawBands(ctx, size, rand, BODY_PALETTE[id] || ['#cccccc'])
  } else {
    const base = (BODY_PALETTE[id] || ['#9a9a9a'])[0]
    drawRocky(ctx, size, rand, base, '#3a3a3a')
  }
  applySphereShade(ctx, size)
  applyDiscMask(ctx, size, 0.03)
  return c
}

export function solarBodyTexture(id, size = 256) {
  const c = solarBodyCanvas(id, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return { canvas: c, texture: tex, dataUrl: c.toDataURL('image/png') }
}

// --- star & exoplanet portraits --------------------------------------------

// A glowing disc in the star's own B-V colour.
export function starCanvas(rgb, size = 220, seed = 1) {
  const rand = mulberry32(seed)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = Math.round(rgb[0] * 255)
  const g = Math.round(rgb[1] * 255)
  const b = Math.round(rgb[2] * 255)
  const col = (a) => `rgba(${r},${g},${b},${a})`
  const disc = size * 0.3

  // wide, soft corona
  ctx.globalCompositeOperation = 'lighter'
  let grad = ctx.createRadialGradient(cx, cy, disc * 0.7, cx, cy, size * 0.5)
  grad.addColorStop(0, col(0.3))
  grad.addColorStop(0.5, col(0.1))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2)
  ctx.fill()

  // photosphere with limb darkening
  grad = ctx.createRadialGradient(
    cx - disc * 0.16, cy - disc * 0.16, disc * 0.05,
    cx, cy, disc,
  )
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.35, `rgb(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)})`)
  grad.addColorStop(0.78, `rgb(${r},${g},${b})`)
  grad.addColorStop(1, `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.42)},${Math.round(b * 0.4)})`)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, disc, 0, Math.PI * 2)
  ctx.fill()

  // granulation + dark filaments, clipped to the disc
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, disc, 0, Math.PI * 2)
  ctx.clip()
  for (let i = 0; i < 160; i++) {
    const a = rand() * Math.PI * 2
    const rr = Math.sqrt(rand()) * disc * 0.96
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    const s = disc * (0.03 + rand() * 0.08)
    ctx.fillStyle =
      rand() > 0.5
        ? `rgba(255,255,255,${0.05 + rand() * 0.12})`
        : `rgba(${Math.round(r * 0.35)},${Math.round(g * 0.25)},${Math.round(b * 0.22)},${0.06 + rand() * 0.14})`
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // prominences just outside the limb
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2
    const rr = disc * (0.94 + rand() * 0.14)
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    const s = disc * (0.06 + rand() * 0.16)
    const gg = ctx.createRadialGradient(x, y, 0, x, y, s)
    gg.addColorStop(0, col(0.3 * (0.4 + rand() * 0.6)))
    gg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gg
    ctx.beginPath()
    ctx.arc(x, y, s, 0, Math.PI * 2)
    ctx.fill()
  }

  // subtle diffraction spikes
  ctx.save()
  ctx.translate(cx, cy)
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI / 3 + (rand() - 0.5) * 0.12)
    const len = size * (0.3 + rand() * 0.16)
    const lg = ctx.createLinearGradient(-len, 0, len, 0)
    lg.addColorStop(0, 'rgba(0,0,0,0)')
    lg.addColorStop(0.5, col(0.45))
    lg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = lg
    ctx.fillRect(-len, -size * 0.006, len * 2, size * 0.012)
  }
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'
  return c
}

// A plausible-looking exoplanet: gas giants get bands, small worlds get rock.
export function exoplanetCanvas(p, size = 220) {
  const rand = mulberry32(hashSeed(p.id || p.name))
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const rE = p.radiusEarth || 2
  const big = rE > 4
  const palettes = [
    ['#c9a06a', '#a87c48', '#e0c69a'],
    ['#5f7fe0', '#7a97ea', '#3a55a0'],
    ['#b5532f', '#d0704a', '#8c3d22'],
    ['#9fb8c8', '#c4d4e0', '#7890a0'],
    ['#c9b79f', '#a89078', '#e0d4c0'],
  ]
  const pal = palettes[Math.floor(rand() * palettes.length)]
  if (big) {
    drawBands(ctx, size, rand, pal)
  } else {
    drawRocky(ctx, size, rand, pal[0], '#333')
  }
  // shade into a sphere + terminator
  const shade = ctx.createRadialGradient(
    size * 0.38, size * 0.36, size * 0.05, size * 0.5, size * 0.5, size * 0.5,
  )
  shade.addColorStop(0, 'rgba(255,255,255,0.18)')
  shade.addColorStop(0.7, 'rgba(0,0,0,0.05)')
  shade.addColorStop(1, 'rgba(0,0,0,0.7)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, size, size)
  applyDiscMask(ctx, size, 0.04)
  return c
}

// --- real photographs (Wikipedia REST API, on demand) -----------------------
// We never hard-code image file names; we ask Wikipedia for the page summary
// of the object's name and use the thumbnail it returns. Any failure falls
// back to the procedural portrait.

const PHOTO_TITLE_OVERRIDES = {
  'Rigil Kentaurus': 'Alpha Centauri',
  'Toliman': 'Alpha Centauri',
  Copernicus: '55 Cancri',
  Helvetios: '51 Pegasi',
  'Sagittarius A*': 'Sagittarius A*',
  'Crab Pulsar': 'Crab Pulsar',
  'Andromeda Galaxy': 'Andromeda Galaxy',
  'Large Magellanic Cloud': 'Large Magellanic Cloud',
  'Small Magellanic Cloud': 'Small Magellanic Cloud',
}

export async function fetchPhoto(name) {
  const title = PHOTO_TITLE_OVERRIDES[name] || name
  const url =
    'https://en.wikipedia.org/api/rest_v1/page/summary/' +
    encodeURIComponent(title.replace(/ /g, '_')) +
    '?redirect=true'
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 6000)
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(to)
    if (!r.ok) return null
    const j = await r.json()
    const thumb = j.thumbnail || j.originalimage
    if (!thumb || !thumb.source) return null
    return {
      url: thumb.source,
      page: j.content_urls?.desktop?.page || null,
      extract: j.extract || null,
    }
  } catch {
    return null
  }
}

// --- real surface maps & photorealistic portraits ---------------------------
// We ship a handful of genuine NASA-derived surface maps (Solar System bodies)
// and a photograph for each notable deep-sky object. These helpers turn a flat
// equirectangular map into something that reads as a real lit sphere, and turn
// a rectangular photo into a soft-edged sky billboard.

const imageCache = new Map()

// Load an image once; resolve(null) on failure so callers can fall back.
export function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url)
  const p = new Promise((resolve) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = url
  })
  imageCache.set(url, p)
  return p
}

// Decode an equirectangular image into a small pixel buffer we can sample.
const eqCache = new Map()
function equirectPixels(img, w = 640) {
  const key = img.src || `${img.width}x${img.height}`
  if (eqCache.has(key)) return eqCache.get(key)
  const h = Math.max(1, Math.round((img.height / img.width) * w))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const rec = { w, h, data: ctx.getImageData(0, 0, w, h).data }
  eqCache.set(key, rec)
  return rec
}

// Project an equirectangular surface map onto a lit sphere.
//   light       - direction of the key light (screen space, y up)
//   atmosphere  - [r,g,b] rim colour (e.g. a blue halo for Earth)
//   halo        - 0..1 strength of the outer atmosphere glow
//   limb        - extra limb darkening (0 = none) for gas giants / stars
export function sphereRender(
  img,
  {
    size = 280,
    light = [-0.5, 0.45, 0.74],
    ambient = 0.06,
    limb = 0.0,
    atmosphere = null,
    halo = 0.0,
    rotate = 0.0,
    background = null,
  } = {},
) {
  const src = equirectPixels(img)
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, size, size)
  }

  const R = size / 2 - size * 0.03
  const cx = size / 2
  const cy = size / 2
  const L = Math.hypot(light[0], light[1], light[2])
  const lx = light[0] / L
  const ly = light[1] / L
  const lz = light[2] / L
  const sd = src.data
  const imgData = ctx.getImageData(0, 0, size, size)
  const dd = imgData.data

  for (let y = 0; y < size; y++) {
    const ny = -(y + 0.5 - cy) / R
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - cx) / R
      const r2 = nx * nx + ny * ny
      if (r2 > 1) continue
      const o = (y * size + x) * 4
      const nz = Math.sqrt(Math.max(0, 1 - r2))
      const diff = Math.max(0, nx * lx + ny * ly + nz * lz)
      let shade = ambient + diff
      if (shade > 1.35) shade = 1.35
      const lon = Math.atan2(nx, nz) + rotate
      const lat = Math.asin(ny)
      let u = lon / (2 * Math.PI) + 0.5
      u -= Math.floor(u)
      let v = 0.5 - lat / Math.PI
      if (v < 0) v = 0
      else if (v > 0.9999) v = 0.9999
      const sx = (u * src.w) | 0
      const sy = (v * src.h) | 0
      const s = (sy * src.w + sx) * 4
      let r = sd[s] * shade
      let g = sd[s + 1] * shade
      let b = sd[s + 2] * shade
      if (limb > 0) {
        const k = 1 - limb * (1 - Math.pow(nz, 0.4))
        r *= k
        g *= k
        b *= k
      }
      if (atmosphere && r2 > 0.7) {
        const t = (r2 - 0.7) / 0.3
        const e = Math.pow(t, 1.6) * 0.9
        r = r * (1 - e) + atmosphere[0] * e
        g = g * (1 - e) + atmosphere[1] * e
        b = b * (1 - e) + atmosphere[2] * e
      }
      dd[o] = r > 255 ? 255 : r
      dd[o + 1] = g > 255 ? 255 : g
      dd[o + 2] = b > 255 ? 255 : b
    }
  }
  ctx.putImageData(imgData, 0, 0)

  if (atmosphere && halo > 0) {
    ctx.globalCompositeOperation = 'lighter'
    const rgb = atmosphere.map((c) => Math.round(c)).join(',')
    const g = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.22)
    g.addColorStop(0, `rgba(${rgb},${halo})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }
  return out
}

// Convenience: load a surface map URL and render it as a data URL.
export async function planetPortraitFromUrl(url, opts) {
  const img = await loadImage(url)
  if (!img) return null
  return sphereRender(img, opts).toDataURL('image/png')
}

// Turn a rectangular photograph into a soft-edged square billboard that blends
// into the sky (centre-cropped, brightness lifted, edges faded).
export function maskedPhotoCanvas(img, size = 256) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  // centre-crop to a square
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
  // lift the mid-tones a little so faint nebulosity is visible
  const data = ctx.getImageData(0, 0, size, size)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * 1.08)
    d[i + 1] = Math.min(255, d[i + 1] * 1.08)
    d[i + 2] = Math.min(255, d[i + 2] * 1.08)
  }
  ctx.putImageData(data, 0, 0)
  applyDiscMask(ctx, size, 0.28)
  return c
}

