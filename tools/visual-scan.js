// Geometry defect scan — run via the driver's evaluate (chrome-devtools evaluate_script,
// playwright browser_evaluate / page.evaluate, or pasted into a WebView CDP session).
// Returns JSON: numeric evidence only — the model must never eyeball these numbers from a screenshot.
// Optional arg: {safeTop, safeBottom} in px — the unsafe bands (e.g. Mini App: safe+content sums);
// omit for plain web pages.
(function scan(opts) {
  opts = opts || {}
  const de = document.documentElement
  const vw = window.innerWidth || de.clientWidth, vh = window.innerHeight || de.clientHeight
  if (!vw || !vh) return { error: 'viewport 0x0 — page not laid out yet; re-run after render (bring the tab to front / set a real viewport first)' }
  const out = {
    viewport: vw + 'x' + vh,
    pageOverflowPx: Math.max(0, (document.scrollingElement || document.documentElement).scrollWidth - vw),
    offscreen: [], truncated: [], covered: [], smallTargets: [], unsafeBand: [],
    styleDrift: null,
  }
  const desc = el => {
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    else if (typeof el.className === 'string' && el.className.trim())
      s += '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
    const t = (el.innerText || '').trim().slice(0, 40)
    return t ? s + ' "' + t + '"' : s
  }
  const visible = el => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05
  }

  const fontSizes = new Set(), fontFamilies = new Set(), textColors = new Set(), radii = new Set()

  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    if (!visible(el)) continue
    const cs = getComputedStyle(el)

    // horizontal escape from the viewport (px-precise)
    if (r.right > vw + 1 || r.left < -1)
      out.offscreen.push({ el: desc(el), left: Math.round(r.left), right: Math.round(r.right), vw })

    // clipped text
    if (cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1 && (el.innerText || '').trim())
      out.truncated.push({ el: desc(el), byPx: el.scrollWidth - el.clientWidth })

    // fixed/sticky elements intruding into declared unsafe bands (Mini App overlap class)
    if ((opts.safeTop || opts.safeBottom) && (cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute')) {
      if (opts.safeTop && r.top < opts.safeTop && r.bottom > 0)
        out.unsafeBand.push({ el: desc(el), zone: 'top', top: Math.round(r.top), band: opts.safeTop })
      if (opts.safeBottom && r.bottom > vh - opts.safeBottom && r.top < vh)
        out.unsafeBand.push({ el: desc(el), zone: 'bottom', bottom: Math.round(r.bottom), band: vh - opts.safeBottom })
    }

    // style drift counters (visible text elements only)
    if ((el.innerText || '').trim() && el.children.length === 0) {
      fontSizes.add(cs.fontSize); fontFamilies.add(cs.fontFamily.split(',')[0].trim()); textColors.add(cs.color)
    }
    if (cs.borderRadius !== '0px') radii.add(cs.borderRadius)
  }

  // Interactive targets: size + hit-test (is something covering it?). elementFromPoint only sees
  // the current viewport, so sweep the page in viewport-height steps — otherwise everything below
  // the first screen is silently unchecked. Layout & hit-testing are synchronous after scrollTo.
  const targets = document.querySelectorAll('a,button,input,select,textarea,[role="button"],[onclick],[tabindex]')
  const scroller = document.scrollingElement || de
  const origScroll = scroller.scrollTop
  const pageH = scroller.scrollHeight
  const maxSteps = 30                      // runaway guard for infinite-scroll pages
  const seenSmall = new Set(), seenCovered = new Set()
  for (let step = 0, y = 0; y < pageH && step < maxSteps; step++, y += vh) {
    scroller.scrollTop = y
    for (const el of targets) {
      const r = el.getBoundingClientRect()
      if (!r.width || r.bottom < 0 || r.top > vh) continue
      if (!visible(el)) continue
      if ((r.width < 24 || r.height < 24) && !seenSmall.has(el)) {  // WCAG 2.5.8 floor; mobile rubric raises to 44
        seenSmall.add(el)
        out.smallTargets.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height) })
      }
      if (seenCovered.has(el)) continue
      // hit-test only when the element is FULLY in view at this step — an element straddling the
      // viewport edge sits "under" a sticky header by normal scrolling, not by a layout bug
      if (r.top < 0 || r.bottom > vh) continue
      const pts = [[r.left + r.width / 2, r.top + r.height / 2],
                   [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]]
      for (const [x, py] of pts) {
        if (x < 0 || py < 0 || x > vw || py > vh) continue
        const hit = document.elementFromPoint(x, py)
        if (hit && !el.contains(hit) && !hit.contains(el)) {
          seenCovered.add(el)
          out.covered.push({ el: desc(el), coveredBy: desc(hit) })
          break
        }
      }
    }
  }
  scroller.scrollTop = origScroll
  if (pageH > vh * maxSteps) out.scanNote = `page taller than ${maxSteps} viewports — interactive checks capped at ${maxSteps * vh}px`

  out.styleDrift = {
    uniqueFontSizes: fontSizes.size, fontSizes: [...fontSizes].slice(0, 20),
    uniqueFontFamilies: fontFamilies.size, fontFamilies: [...fontFamilies].slice(0, 8),
    uniqueTextColors: textColors.size, textColors: [...textColors].slice(0, 20),
    uniqueRadii: radii.size, radii: [...radii].slice(0, 12),
    tokens: Array.from(document.styleSheets).flatMap(ss => {
      try { return Array.from(ss.cssRules || []) } catch (e) { return [] }
    }).filter(r => r.selectorText === ':root').flatMap(r =>
      Array.from(r.style).filter(p => p.startsWith('--'))).slice(0, 60),
  }
  return out
})(typeof __SCAN_OPTS__ !== 'undefined' ? __SCAN_OPTS__ : {})
