// ---------------------------------------------------------------------------
// Luna — UI layer.
// Builds nothing itself; it just drives the DOM skeleton in index.html and
// calls back into main.js when the user searches, picks a result or closes a
// panel. Kept separate so the 3D code stays about stars.
// ---------------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

export function createUI({ onQuery, onSelect }) {
  const searchInput = document.getElementById('search-input')
  const searchResults = document.getElementById('search-results')
  const info = document.getElementById('info')
  const infoBody = document.getElementById('info-body')
  const infoClose = document.getElementById('info-close')
  const loading = document.getElementById('loading')

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
  }
  infoClose.addEventListener('click', hideInfo)

  // Let clicks on "planet pills" inside the panel select that object.
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

  // --- loading ------------------------------------------------------------
  function setLoading(on) {
    if (on) {
      loading.classList.remove('done')
    } else {
      loading.classList.add('done')
      setTimeout(() => loading.classList.add('hidden'), 600)
    }
  }

  return { setLoading, showInfo, hideInfo }
}
