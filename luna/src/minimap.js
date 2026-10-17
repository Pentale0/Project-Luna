// ---------------------------------------------------------------------------
// Luna — mini-map.
// A small top-down view of the galactic plane (x = toward the Galactic Centre,
// y = direction of rotation) showing where the camera is looking. It is a
// schematic overview, not a second render of the scene.
// ---------------------------------------------------------------------------

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const R = W / 2 - 6
  const RANGE = 16000 // parsecs mapped to the rim

  // Pre-render the stylised galaxy so update() only stamps it down.
  const bg = document.createElement('canvas')
  bg.width = W
  bg.height = H
  {
    const g = bg.getContext('2d')
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R)
    grad.addColorStop(0, 'rgba(255,232,180,0.30)')
    grad.addColorStop(0.32, 'rgba(150,170,255,0.14)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(cx, cy, R, 0, Math.PI * 2)
    g.fill()

    g.globalCompositeOperation = 'lighter'
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 1100; i++) {
        const t = Math.pow(Math.random(), 0.6)
        const r = t * R * 0.96
        const a = (r / R) * 5.2 + arm * Math.PI + (Math.random() - 0.5) * 0.36
        const x = cx + Math.cos(a) * r
        const y = cy - Math.sin(a) * r
        g.fillStyle = `rgba(185,205,255,${0.05 + Math.random() * 0.13})`
        g.fillRect(x, y, 1, 1)
      }
    }
    g.globalCompositeOperation = 'source-over'
  }

  const _tmp = { x: 0, y: 0 }
  function project(x, y) {
    const dx = (x / RANGE) * R
    const dy = (-y / RANGE) * R
    const d = Math.hypot(dx, dy)
    if (d > R - 2) {
      const k = (R - 2) / d
      _tmp.x = cx + dx * k
      _tmp.y = cy + dy * k
    } else {
      _tmp.x = cx + dx
      _tmp.y = cy + dy
    }
    return _tmp
  }

  function update({ cameraPos, target, selected }) {
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(bg, 0, 0)

    // Galactic Centre.
    const gc = project(0, 0)
    ctx.fillStyle = 'rgba(255,232,170,0.85)'
    ctx.beginPath()
    ctx.arc(gc.x, gc.y, 1.8, 0, Math.PI * 2)
    ctx.fill()

    const cam = { x: 0, y: 0 }
    {
      const p = project(cameraPos.x, cameraPos.y)
      cam.x = p.x
      cam.y = p.y
    }
    const tgt = project(target.x, target.y)

    // Look direction.
    const ang = Math.atan2(tgt.y - cam.y, tgt.x - cam.x)
    ctx.strokeStyle = 'rgba(120,180,255,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cam.x, cam.y)
    ctx.lineTo(cam.x + Math.cos(ang) * 24, cam.y + Math.sin(ang) * 24)
    ctx.stroke()

    // Selected object.
    if (selected && typeof selected.x === 'number') {
      const s = project(selected.x, selected.y)
      ctx.fillStyle = 'rgba(140,230,190,0.95)'
      ctx.beginPath()
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Camera.
    ctx.fillStyle = '#eaf1ff'
    ctx.beginPath()
    ctx.arc(cam.x, cam.y, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(234,241,255,0.45)'
    ctx.beginPath()
    ctx.arc(cam.x, cam.y, 6, 0, Math.PI * 2)
    ctx.stroke()
  }

  return { update, RANGE }
}
