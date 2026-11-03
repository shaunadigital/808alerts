
/* ---------- browser layer ----------
   Everything above builds data and HTML strings and runs the same on Cloudflare,
   which uses it to send each page with the current alerts already in it.
   Everything below touches the page. */
var PAGE = document.documentElement.getAttribute('data-page') || 'feed';
var FIXED = document.documentElement.getAttribute('data-island') || 'ALL';
S.island = FIXED;
S.showEnded = false;

function alertKey() {
  var m = /^\/alert\/([^/?#]+)/.exec(location.pathname);
  if (m) return decodeURIComponent(m[1]);
  var h = /^#alert\/(.+)$/.exec(location.hash); // links shared before 2026-09-24
  return h ? decodeURIComponent(h[1]) : null;
}
function updated() {
  var el = $('#upd');
  if (el) el.textContent = S.checkedAt ? 'UPDATED ' + tm(S.checkedAt) + ' HST' : 'CHECKING…';
}
function setMeta(sel, attr, val) { var m = document.querySelector(sel); if (m) m.setAttribute(attr, val); }

/* ---------- hero: split-flap status and satellite loop ---------- */
var REDUCE = false;
try { REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }
var heroLast = null;
// Each tile runs through random letters (or digits) and lands on its own,
// left to right, like an airport board. Skipped for reduced motion.
function flip(root) {
  if (REDUCE || !root) return;
  Array.prototype.forEach.call(root.querySelectorAll('.flaps'), function (g, gi) {
    Array.prototype.forEach.call(g.querySelectorAll('.fl[data-c]'), function (el, i) {
      var target = el.getAttribute('data-c');
      var pool = /[0-9]/.test(target) ? '0123456789' : /[A-Z]/.test(target) ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '';
      if (!pool) return;
      var steps = 5 + gi * 2 + i * 2, n = 0;
      var t = setInterval(function () {
        if (++n >= steps) { el.textContent = target; clearInterval(t); return; }
        el.textContent = pool.charAt(Math.floor(Math.random() * pool.length));
      }, 55);
    });
  });
}
function renderHero() {
  var hs = $('#hstatus'), ct = $('#counties');
  if (!hs) return;
  var sig = heroSig(S.island);
  if (sig === heroLast) return;
  heroLast = sig;
  hs.innerHTML = heroHTML(S.island);
  if (ct) ct.innerHTML = countiesHTML(S.island);
  flip($('#hero')); flip(ct);
}

var SAT = { frames: [], i: 0, timer: null, paused: REDUCE, wide: true };
var GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=GOES-West_ABI_GeoColor&STYLES=&CRS=EPSG:4326&FORMAT=image/jpeg';
// GIBS publishes GOES-West frames roughly 50 to 60 minutes behind real time
// (measured 2026-11-03: anything newer comes back as a 5.9KB blank), so the
// loop ends about 70 minutes ago, six frames half an hour apart.
function satTimes() {
  var step = 6e5, end = Math.floor((Date.now() - 70 * 6e4) / step) * step, out = [];
  for (var k = 5; k >= 0; k--) out.push(end - k * 30 * 6e4);
  return out;
}
function satURL(t) {
  var iso = new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');
  return GIBS + (SAT.wide ? '&BBOX=13.5,-168,27.5,-147&WIDTH=840&HEIGHT=560' : '&BBOX=15.5,-164,25.5,-151&WIDTH=600&HEIGHT=460') + '&TIME=' + iso;
}
function satFetch(t) {
  return fetch(satURL(t)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
    .then(function (b) { if (b.size < 20000) throw new Error('blank'); return { t: t, src: URL.createObjectURL(b) }; });
}
function satShow(i) {
  var box = $('#frames'); if (!box) return;
  SAT.i = i;
  Array.prototype.forEach.call(box.children, function (img, k) { img.classList.toggle('on', k === i); });
  var f = SAT.frames[i];
  if (f) $('#stime').textContent = tm(f.t) + ' HST';
}
function satDraw() {
  var box = $('#frames'); if (!box) return;
  box.innerHTML = SAT.frames.map(function (f) { return '<img alt="" src="' + f.src + '">'; }).join('');
  satShow(SAT.frames.length - 1);
  var b = $('#sloop');
  if (b) { b.hidden = SAT.frames.length < 2; b.textContent = SAT.paused ? 'PLAY LOOP' : 'PAUSE LOOP'; }
}
function satTick() {
  clearTimeout(SAT.timer);
  if (SAT.paused || document.hidden || SAT.frames.length < 2) return;
  var last = SAT.i === SAT.frames.length - 1;
  SAT.timer = setTimeout(function () { satShow((SAT.i + 1) % SAT.frames.length); satTick(); }, last ? 2400 : 900);
}
function satLoad() {
  if (!$('#hsat')) return;
  var times = satTimes();
  var old = SAT.frames;
  // Newest frame first so something shows quickly; the rest only if motion is
  // welcome and the connection is not in data-saver mode.
  satFetch(times[times.length - 1]).catch(function () { return satFetch(times[times.length - 2]); }).then(function (f) {
    SAT.frames = [f]; satDraw();
    var save = navigator.connection && navigator.connection.saveData;
    if (REDUCE || save) return;
    return Promise.all(times.slice(0, -1).filter(function (t) { return t < f.t; }).map(function (t) { return satFetch(t).catch(function () { return null; }); }))
      .then(function (rest) {
        SAT.frames = rest.filter(Boolean).concat([f]).sort(function (a, b) { return a.t - b.t; });
        satDraw(); satTick();
      });
  }).catch(function () {
    if (!SAT.frames.length) $('#stime').textContent = 'SATELLITE UNAVAILABLE';
  }).then(function () {
    old.forEach(function (f) { if (SAT.frames.indexOf(f) < 0) URL.revokeObjectURL(f.src); });
  });
}
function satInit() {
  if (!$('#hsat') || !window.fetch || !window.URL) return;
  try { SAT.wide = window.matchMedia('(min-width:900px)').matches; } catch (e) { }
  var b = $('#sloop');
  if (b) b.onclick = function () { SAT.paused = !SAT.paused; b.textContent = SAT.paused ? 'PLAY LOOP' : 'PAUSE LOOP'; satTick(); };
  document.addEventListener('visibilitychange', satTick);
  var sm = $('#smap'); if (sm) sm.href = filterMapHref(FIXED);
  satLoad();
  setInterval(satLoad, 30 * 6e4);
}

function renderFeed() {
  var feed = $('#feed');
  if (!feed) return;
  if (S.nws.status === 'loading') {
    if (!feed.getAttribute('data-ssr')) feed.innerHTML = '<div class="loading">Loading alerts from the National Weather Service and county agencies…</div>';
    return;
  }
  renderHero();
  $('#banners').innerHTML = bannerHTML(S.island);
  feed.innerHTML = feedHTML(S.island, S.showEnded);
  var now = $('#now'); if (now) now.innerHTML = rightNowHTML(S.island);
  var more = $('#more');
  if (more) more.onclick = function () { S.showEnded = !S.showEnded; renderFeed(); };
}


function bindDetail(c) {
  var el = $('#detail');
  Array.prototype.forEach.call(el.querySelectorAll('.zones button'), function (b) {
    b.onclick = function () { DZ.zone = +b.getAttribute('data-z'); renderDetail(); };
  });
  var sh = $('#share');
  if (sh) sh.onclick = function () {
    var url = location.origin + (c ? alertPath(c) : location.pathname);
    var h1 = el.querySelector('h1');
    var data = { title: document.title, text: h1 ? h1.textContent : '', url: url };
    if (navigator.share) navigator.share(data).catch(function () { });
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { sh.querySelector('span').textContent = 'LINK COPIED'; });
  };
}
function renderDetail() {
  var el = $('#detail');
  var key = alertKey();
  if (S.nws.status === 'loading') {
    if (!el.getAttribute('data-ssr')) el.innerHTML = '<main><div class="loading">Loading alert…</div></main>';
    bindDetail(null);
    return;
  }
  var c = findCard(key);
  if (!c) {
    if (!S.nws.historyAt) { if (!el.getAttribute('data-ssr')) el.innerHTML = '<main><div class="loading">Looking back through this week’s alerts…</div></main>'; return; }
    el.innerHTML = missingHTML();
    return;
  }
  document.title = detailTitle(c) + ' · 808 Alerts';
  var mb = $('#mapbtn'); if (mb) mb.href = mapHref(c.isl);
  var canon = alertPath(c);
  if (location.pathname !== canon && history.replaceState) history.replaceState(null, '', canon);
  setMeta('link[rel=canonical]', 'href', 'https://808alerts.com' + canon);
  el.innerHTML = detailHTML(c);
  bindDetail(c);
}

function route() {
  if (PAGE === 'roads') { var r = $('#roads'); if (r && (S.roads.status !== 'loading')) r.innerHTML = roadsHTML(); return; }
  var detail = !!alertKey();
  document.body.classList.toggle('detail', detail);
  $('#feedwrap').hidden = detail;
  $('#detail').hidden = !detail;
  $('#pick').hidden = detail;
  $('#back').hidden = !detail;
  if (detail) renderDetail(); else renderFeed();
}

function refresh() {
  var jobs = PAGE === 'roads' ? [loadRoads()] : [loadNWS(), loadRoads(), loadShelters(), loadHECO()];
  return Promise.all(jobs).then(function () {
    S.checkedAt = Date.now();
    if (PAGE !== 'roads') assemble();
    updated(); route();
    if (PAGE === 'roads') return;
    return loadNWSHistory().then(function () { assemble(); route(); });
  });
}

(function init() {
  var sel = $('#island');
  if (sel) {
    sel.value = FIXED;
    sel.onchange = function () { store('808:island', sel.value); location.href = FILTER_PAGE[sel.value] || '/'; };
  }
  var mb = $('#mapbtn'); if (mb) mb.href = filterMapHref(FIXED);
  // "All alerts" goes back to wherever the person came from on this site, so the
  // feed they were scrolling is restored rather than reloaded at the top.
  var back = $('#back');
  if (back) {
    try {
      var ref = document.referrer && new URL(document.referrer);
      if (ref && ref.origin === location.origin && !/^\/alert\//.test(ref.pathname)) {
        back.href = ref.pathname;
        back.onclick = function (e) { if (history.length > 1) { e.preventDefault(); history.back(); } };
      }
    } catch (e) { }
  }
  window.addEventListener('hashchange', route);
  // A server-rendered hero carries the signature of what it shows, so the first
  // refresh only redraws it if something actually changed. Either way the
  // tiles flip in once on arrival.
  var hs = $('#hstatus');
  if (hs) { heroLast = hs.getAttribute('data-sig'); flip($('#hero')); flip($('#counties')); }
  satInit();
  route();
  refresh();
  setInterval(refresh, REFRESH);
  setInterval(function () { if (PAGE !== 'roads' && !alertKey() && S.nws.status !== 'loading') renderFeed(); }, 30e3);
})();
