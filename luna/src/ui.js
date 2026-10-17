// ---------------------------------------------------------------------------
// Luna — UI layer.
// Drives the DOM skeleton in index.html and calls back into main.js when the
// user searches, picks a result, toggles a layer, starts a tour, saves a place
// or shares a link. Kept separate so the 3D code stays about stars.
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

export function createUI({
  onQuery,
  onSelect,
  onToggleLayer,
  onTour,
  onRemoveBookmark,
  onToggleBookmark,
  onShare,
  onTimeChange,
  onTimePlay,
  onTimeReset,
}) {
  const $ = (id) => document.getElementById(id)
  const searchInput = $('search-input')
  const searchResults = $('search-results')
  const info = $('info')
  const infoBody = $('info-body')
  const infoActions = $('info-actions')
  const infoClose = $('info-close')
  const loading = $('loading')

  let results = []
  let activeIndex = -1

  // --- search -------------------------------------------------------------
  function renderResults(items) {
    results = items
    activeIndex = items.length ? 0 : -1
    if (!items.length) {
      searchResults.classList.add('hidden')
      searchResults.innerHTML = ''
      return
    }
    searchResults.innerHTML = items
      .map(
        (it, i) =>
          `<div class="result${i === activeIndex ? ' active' : ''}" data-i="${i}">` +
          `<span>${escapeHtml(it.label)}</span>` +
          `<span class="kind">${escapeHtml(it.kind)}</span></div>`,
      )
      .join('')
    searchResults.classList.remove('hidden')
  }

  function clearResults() {
    results = []
    activeIndex = -1
    searchResults.classList.add('hidden')
    searchResults.innerHTML = ''
  }

  function choose(i) {
    const item = results[i]
    if (!item) return
    clearResults()
    searchInput.value = item.label
    searchInput.blur()
    onSelect(item)
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim()
    if (q.length < 1) return clearResults()
    renderResults(onQuery(q))
  })

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex = Math.min(activeIndex + 1, results.length - 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex = Math.max(activeIndex - 1, 0)
      highlight()
    } else if (e.key === 'Enter') {
      choose(activeIndex >= 0 ? activeIndex : 0)
    } else if (e.key === 'Escape') {
      searchInput.value = ''
      clearResults()
      searchInput.blur()
    }
  })

  function highlight() {
    ;[...searchResults.children].forEach((el, i) =>
      el.classList.toggle('active', i === activeIndex),
    )
  }

  searchResults.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.result')
    if (row) choose(Number(row.dataset.i))
  })

  // --- info panel ---------------------------------------------------------
  function showInfo(html) {
    infoBody.innerHTML = html
    info.classList.remove('hidden')
  }
  function hideInfo() {
    info.classList.add('hidden')
    infoBody.innerHTML = ''
    infoActions.innerHTML = ''
  }
  infoClose.addEventListener('click', hideInfo)

  // Buttons above the panel body: save / share (labels passed by main.js).
  function setActions(actions) {
    infoActions.innerHTML = ''
    for (const a of actions) {
      const b = document.createElement('button')
      b.textContent = a.label
      if (a.active) b.classList.add('on')
      b.addEventListener('click', a.onClick)
      infoActions.appendChild(b)
    }
  }

  // Let clicks on "pills" inside the panel select that object.
  infoBody.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-select]')
    if (pill)
      onSelect({
        type: pill.dataset.type,
        id: pill.dataset.select,
        label: pill.textContent,
      })
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideInfo()
  })

  // --- toolbar + floating panels -----------------------------------------
  const panels = {
    layers: $('layers'),
    tours: $('tours'),
    bookmarks: $('bookmarks'),
  }
  const buttons = {
    layers: $('btn-layers'),
    tours: $('btn-tours'),
    bookmarks: $('btn-bookmarks'),
    time: $('btn-time'),
  }
  const timebar = $('timebar')

  function closePanels() {
    for (const k of Object.keys(panels)) {
      panels[k].classList.add('hidden')
      buttons[k].classList.remove('active')
    }
  }
  function togglePanel(name) {
    const open = panels[name].classList.contains('hidden')
    closePanels()
    if (open) {
      panels[name].classList.remove('hidden')
      buttons[name].classList.add('active')
    }
  }
  buttons.layers.addEventListener('click', () => togglePanel('layers'))
  buttons.tours.addEventListener('click', () => togglePanel('tours'))
  buttons.bookmarks.addEventListener('click', () => togglePanel('bookmarks'))
  buttons.time.addEventListener('click', () => {
    const on = timebar.classList.contains('hidden')
    timebar.classList.toggle('hidden', !on)
    buttons.time.classList.toggle('active', on)
  })
  for (const el of document.querySelectorAll('[data-close]')) {
    el.addEventListener('click', () => togglePanel(el.dataset.close))
  }

  // --- layers -------------------------------------------------------------
  function setLayers(layers) {
    const wrap = $('layers-list')
    wrap.innerHTML = layers
      .map(
        (l) =>
          `<label class="row clickable">` +
          (l.color ? `<i class="swatch" style="background:${l.color}"></i>` : '') +
          `<input type="checkbox" data-layer="${l.id}"${l.on ? ' checked' : ''} />` +
          `<span class="grow">${escapeHtml(l.label)}</span>` +
          (l.hint ? `<span class="kind">${escapeHtml(l.hint)}</span>` : '') +
          `</label>`,
      )
      .join('')
    wrap.querySelectorAll('input[data-layer]').forEach((cb) =>
      cb.addEventListener('change', () => onToggleLayer(cb.dataset.layer, cb.checked)),
    )
  }

  // --- tours --------------------------------------------------------------
  function setTours(tours) {
    const wrap = $('tours-list')
    wrap.innerHTML = tours
      .map(
        (t) =>
          `<div class="row clickable" data-tour="${t.id}">` +
          `<span class="grow">${escapeHtml(t.title)}</span>` +
          `<span class="kind">${t.stops.length} stops</span></div>` +
          `<div class="kind" style="padding:0 4px 8px;text-transform:none;letter-spacing:0">${escapeHtml(t.description || '')}</div>`,
      )
      .join('')
    wrap.querySelectorAll('[data-tour]').forEach((el) =>
      el.addEventListener('click', () => {
        const tour = tours.find((t) => t.id === el.dataset.tour)
        if (tour) onTour(tour)
      }),
    )
  }

  // --- bookmarks ----------------------------------------------------------
  function setBookmarks(list) {
    const wrap = $('bookmarks-list')
    if (!list.length) {
      wrap.innerHTML = '<div class="empty">No saved places yet. Open an object and press Save.</div>'
      return
    }
    wrap.innerHTML = list
      .map(
        (b, i) =>
          `<div class="row clickable">` +
          `<span class="grow" data-goto="${i}">${escapeHtml(b.label)}</span>` +
          `<span class="kind">${escapeHtml(b.kind || b.type)}</span>` +
          `<button class="del" data-del="${i}" title="Remove">×</button></div>`,
      )
      .join('')
    wrap.querySelectorAll('[data-goto]').forEach((el) =>
      el.addEventListener('click', () => onSelect(list[Number(el.dataset.goto)])),
    )
    wrap.querySelectorAll('[data-del]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onRemoveBookmark(list[Number(el.dataset.del)])
      }),
    )
  }

  // --- tour caption -------------------------------------------------------
  const caption = $('caption')
  function showCaption({ title, text, index, total, onNext, onPrev, onStop, last }) {
    caption.innerHTML =
      (title ? `<span class="cap-title">${escapeHtml(title)}${total ? ` · ${index + 1}/${total}` : ''}</span>` : '') +
      escapeHtml(text) +
      `<div class="cap-ctrl">` +
      (index > 0 ? `<button data-cap="prev">‹ Back</button>` : '') +
      `<button data-cap="next">${last ? 'Finish' : 'Next ›'}</button>` +
      `<button data-cap="stop">Exit tour</button>` +
      `</div>`
    caption.classList.remove('hidden')
    caption.querySelector('[data-cap="prev"]')?.addEventListener('click', onPrev)
    caption.querySelector('[data-cap="next"]')?.addEventListener('click', onNext)
    caption.querySelector('[data-cap="stop"]')?.addEventListener('click', onStop)
  }
  function hideCaption() {
    caption.classList.add('hidden')
    caption.innerHTML = ''
  }

  // --- time machine -------------------------------------------------------
  const timeSlider = $('time-slider')
  const timeLabel = $('time-label')
  const timePlay = $('time-play')
  timeSlider.addEventListener('input', () => onTimeChange(Number(timeSlider.value)))
  timePlay.addEventListener('click', () => onTimePlay())
  $('time-reset').addEventListener('click', () => onTimeReset())
  function setTime(years, playing) {
    timeSlider.value = String(years)
    timeLabel.textContent =
      Math.abs(years) < 1 ? 'now' : `${Math.abs(years).toLocaleString()} yr ${years < 0 ? 'ago' : 'ahead'}`
    timePlay.textContent = playing ? '❚❚' : '▶'
  }
  function setTimeVisible(on) {
    timebar.classList.toggle('hidden', !on)
    buttons.time.classList.toggle('active', on)
  }

  // --- loading ------------------------------------------------------------
  function setLoading(on) {
    if (on) {
      loading.classList.remove('done')
    } else {
      loading.classList.add('done')
      setTimeout(() => loading.classList.add('hidden'), 600)
    }
  }

  // --- feedback toast -----------------------------------------------------
  function toast(text) {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText =
      'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:40;' +
      'font-size:12px;color:#eaf1ff;background:rgba(10,15,30,.9);border:1px solid rgba(120,170,255,.35);' +
      'border-radius:999px;padding:7px 16px;pointer-events:none;transition:opacity .4s'
    document.body.appendChild(el)
    setTimeout(() => {
      el.style.opacity = '0'
    }, 1400)
    setTimeout(() => el.remove(), 1900)
  }

  return {
    setLoading,
    showInfo,
    hideInfo,
    setActions,
    closePanels,
    setLayers,
    setTours,
    setBookmarks,
    showCaption,
    hideCaption,
    setTime,
    setTimeVisible,
    toast,
    onToggleBookmark,
    onShare,
  }
}
