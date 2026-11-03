
/* ---------- the hero (added 2026-11-02) ----------
   The top of every feed page: one big status word for the area the page covers,
   a countdown to tropical-storm-force winds when NWS has published a window for
   it, and a board with one tile per county. Built from the same cards as the
   feed, so the hero and the feed can never disagree. The satellite loop beside
   it is browser only (ui.js). */
var LV_RANK = { WARNING: 4, WATCH: 3, ADVISORY: 2, STATEMENT: 1 };
var COUNTY_ORDER = ['KAU', 'OAH', 'MAUCO', 'HAW'];
var COUNTY_VB = { KAU: '0 1 29 15', OAH: '54 16 20 15', MAUCO: '81 30 39 24', HAW: '115 58 38 43' };
var COUNTY_TILE = { KAU: 'KAUAʻI', OAH: 'OʻAHU', MAUCO: 'MAUI COUNTY', HAW: 'HAWAIʻI ISLAND' };
var COUNTY_SUB = { KAU: 'Kauaʻi and Niʻihau', OAH: 'Oʻahu', MAUCO: 'Maui, Molokaʻi, Lānaʻi', HAW: 'Hawaiʻi Island' };
var LEVEL_FILL = { WARNING: '#c22e22', WATCH: '#1c6f7d', ADVISORY: '#e8a317', STATEMENT: '#101010', UNKNOWN: '#8c8c8c', QUIET: '#cbc2b3', CHECKING: '#cbc2b3' };

function nwsActiveFor(isl) {
  return S.cards.filter(function (c) { return c.src === 'nws' && c.active && applies(c, isl); })
    .sort(function (a, b) { return (LV_RANK[b.level] || 0) - (LV_RANK[a.level] || 0) || b.t - a.t; });
}
function levelFor(isl) {
  if (S.nws.status === 'loading' && !S.nws.at) return 'CHECKING';
  if (S.nws.status === 'fail') return 'UNKNOWN';
  var act = nwsActiveFor(isl);
  return act.length ? act[0].level : 'QUIET';
}
function scopeName(isl) { return isl === 'ALL' ? 'ALL ISLANDS' : COUNTY_TILE[isl]; }
// "KAUAʻI + OʻAHU + MAUI" reads as "Kauaʻi, Oʻahu and Maui" in a sentence.
function placeList(where) {
  var a = titleCase(where).split(/\s*\+\s*/);
  return a.length < 2 ? a[0] : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
}
function eventList(act) {
  var seen = {}, out = [];
  act.forEach(function (c) {
    var k = c.event + ' for ' + placeList(c.where);
    if (!seen[k]) { seen[k] = 1; out.push(k); }
  });
  return out;
}

/* ---- tropical-storm-force wind window ----
   NWS Honolulu's tropical watches and warnings carry, zone by zone, a line like
   "Window for Tropical Storm force winds: early Saturday afternoon until early
   Sunday morning" (checked against the Hurricane Hone TCV, 2024-08-24). The
   countdown counts to the START of the earliest window on the islands in view,
   reading each part of day as its earliest hour, so it errs early, never late.
   Nothing here guesses: no window in the text, no countdown. */
var WDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function windowStart(phrase, sent) {
  var p = String(phrase || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!p) return null;
  if (/^(now|ongoing|currently)/.test(p)) return { now: true };
  var mod = '';
  var m = /^(early|late)\s+(.*)$/.exec(p);
  if (m) { mod = m[1]; p = m[2]; }
  var day = null, part = '';
  if (/^tonight/.test(p)) { day = 'today'; part = 'night'; }
  else {
    m = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday|today|this)\b\s*(morning|afternoon|evening|night|overnight)?/.exec(p);
    if (!m) return null;
    day = m[1] === 'this' ? 'today' : m[1];
    part = m[2] || '';
  }
  var base = { '': 0, morning: 6, afternoon: 12, evening: 18, night: 18, overnight: 0 }[part];
  if (mod === 'early' && part === 'morning') base = 0;
  if (mod === 'late') base = { '': 12, morning: 9, afternoon: 15, evening: 21, night: 21, overnight: 3 }[part];
  // Calendar day in HST (UTC-10, no daylight saving).
  var h = new Date(sent - 10 * 36e5);
  var ahead = day === 'today' ? 0 : (WDAYS.indexOf(day) - h.getUTCDay() + 7) % 7;
  return { t: Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate() + ahead, base + 10) };
}
function windWindows() {
  var out = [];
  S.nws.active.forEach(function (a) {
    if (!/Hurricane|Tropical Storm/.test(a.event || '')) return;
    var d = String(a.desc || '').replace(/\s+/g, ' ');
    var m = /Window for Tropical Storm force winds:\s*(.+?)\s+until\s+(.+?)(?=\s+-\s|\s+\*|\s+Window\b|$)/i.exec(d);
    if (!m) return;
    var st = windowStart(m[1], a.sent);
    if (!st) return;
    out.push({ start: st.now ? a.sent : st.t, now: !!st.now, from: m[1].trim(), until: clip(m[2].trim(), 60), zone: place(a.area), isl: islandsOf(a.ugc || []) });
  });
  return out;
}
function countdownFor(isl) {
  if (S.nws.status !== 'ok') return null;
  var want = isl === 'ALL' ? null : FILTER_ISL[isl];
  var ws = windWindows().filter(function (w) { return !want || w.isl.some(function (i) { return want.indexOf(i) > -1; }); });
  if (!ws.length) return null;
  ws.sort(function (a, b) { return a.start - b.start; });
  var w = ws[0];
  var mine = want ? w.isl.filter(function (i) { return want.indexOf(i) > -1; }) : w.isl;
  var where = whereLabel(mine);
  var hrs = Math.floor((w.start - Date.now()) / 36e5);
  return {
    where: where, hrs: hrs, now: w.now || w.start <= Date.now(),
    note: 'NWS forecast window for ' + w.zone + ': ' + w.from + ' until ' + w.until + '. Counted from the start of that window. Winds can arrive sooner, so finish getting ready early.'
  };
}

/* ---- HTML ---- */
function flapsHTML(word, cls) {
  return '<span class="' + cls + '" aria-hidden="true" style="--n:' + word.length + '">' + word.split('').map(function (ch) {
    return ch === ' ' ? '<i class="gap"></i>' : '<b class="fl" data-c="' + esc(ch) + '">' + esc(ch) + '</b>';
  }).join('') + '</span>';
}
function heroData(isl) {
  var lv = levelFor(isl);
  var where = isl === 'ALL' ? 'any island' : FILTER_NAME[isl];
  var act = nwsActiveFor(isl);
  var others = S.cards.filter(function (c) { return c.active && c.src !== 'nws' && applies(c, isl); }).length;
  var checkedAt = S.nws.at || S.checkedAt || Date.now();
  var d = { lv: lv, word: lv, summary: '', checked: '', cd: null, ready: false };
  if (lv === 'CHECKING') {
    d.summary = 'Checking the National Weather Service…';
  } else if (lv === 'UNKNOWN') {
    d.summary = 'We can’t reach the National Weather Service right now.';
    var last = act.length ? eventList(act).slice(0, 2).join('; ') : 'no warnings, watches or advisories';
    d.checked = 'That does not mean nothing is happening. ' + (S.nws.at ? 'The last good check, at ' + tm(S.nws.at) + ' HST, showed ' + last + '. ' : '') +
      'Listen to local radio or check <a href="' + NWS_PAGE + '" target="_blank" rel="noopener">weather.gov/hfo</a>.';
  } else if (lv === 'QUIET') {
    d.summary = 'No warnings, watches or advisories for ' + where + '.' + (others ? ' ' + others + (others === 1 ? ' other update' : ' other updates') + ' below.' : '');
    d.checked = 'Checked with the National Weather Service at ' + tm(checkedAt) + ' HST. Not an all clear: new alerts show up here as soon as they’re issued.';
    d.ready = true;
  } else {
    var ev = eventList(act);
    d.summary = ev.slice(0, 2).join('. ') + '.' + (ev.length > 2 ? ' Plus ' + (ev.length - 2) + ' more below.' : '');
    d.checked = 'Checked with the National Weather Service at ' + tm(checkedAt) + ' HST. Every alert below links to the agency that issued it.';
    d.cd = countdownFor(isl);
  }
  return d;
}
function heroSig(isl) {
  var d = heroData(isl);
  return [d.lv, d.summary, d.cd ? d.cd.hrs + '|' + d.cd.where : '', countyRows().map(function (r) { return r.lv + r.detail; }).join('|')].join('#');
}
function heroHTML(isl) {
  var d = heroData(isl);
  var h = '<div class="h-k n"><i class="lv-' + d.lv + '"></i>HAWAIʻI RIGHT NOW · ' + esc(scopeName(isl)) + '</div>' +
    '<p class="hw lv-' + d.lv + '"><span class="sr">Alert level for ' + esc(isl === 'ALL' ? 'all islands' : FILTER_NAME[isl]) + ': ' + esc(titleCase(d.word)) + '.</span>' + flapsHTML(d.word, 'flaps') + '</p>' +
    '<p class="h-sum">' + esc(d.summary) + '</p>' +
    (d.checked ? '<p class="h-chk">' + (d.lv === 'UNKNOWN' ? d.checked : esc(d.checked)) + '</p>' : '');
  if (d.cd) {
    var c = d.cd;
    h += '<div class="h-cd">';
    if (c.now) {
      h += '<div class="h-cdl n">TROPICAL-STORM-FORCE WINDS ARE POSSIBLE NOW ON ' + esc(c.where) + '</div>';
    } else {
      var n = Math.max(0, c.hrs);
      h += '<div class="h-cdl n">TROPICAL-STORM-FORCE WINDS COULD START ON ' + esc(c.where) + ' IN ' + (n < 1 ? 'UNDER' : 'ABOUT') + '</div>' +
        '<div class="h-cdn"><span class="sr">' + (n < 1 ? 'under 1 hour' : n + ' hours') + '</span>' + flapsHTML(String(Math.max(1, n)), 'flaps cdf') +
        '<span class="n u" aria-hidden="true">' + (n <= 1 ? 'HR' : 'HRS') + '</span></div>';
    }
    h += '<p class="h-cdnote">' + esc(c.note) + '</p></div>';
  } else if (d.ready) {
    h += '<div class="h-cd"><div class="h-cdl n">A GOOD DAY TO GET READY</div><div class="h-ready">' +
      '<a class="n pri" href="/hurricane-preparation-hawaii/">MAKE A PLAN</a><a class="n" href="/emergency-shelters-hawaii/">SHELTERS</a><a class="n" href="/hurricane-kit-checklist/">KIT CHECKLIST</a></div></div>';
  }
  return h;
}
function countyRows() {
  return COUNTY_ORDER.map(function (k) {
    var lv = levelFor(k);
    var act = nwsActiveFor(k);
    var word, detail;
    if (lv === 'CHECKING') { word = 'CHECKING'; detail = 'Checking…'; }
    else if (lv === 'UNKNOWN') {
      word = S.nws.at ? 'AS OF ' + tm(S.nws.at).replace(/\s?[AP]M$/, '') : 'UNKNOWN';
      detail = act.length ? act[0].event + ' at last check' : (S.nws.at ? 'No alerts at last check' : 'Can’t reach NWS');
    }
    else if (lv === 'QUIET') { word = 'NO ALERTS'; detail = 'No active alerts'; }
    else { word = lv; detail = act[0].event + (act.length > 1 ? ' + ' + (act.length - 1) + ' more' : ''); }
    return { k: k, lv: lv, word: word, detail: detail };
  });
}
function countiesHTML(isl) {
  var paths = ISL_ORDER.map(function (i) { return [i, ISL_PATHS[i]]; });
  return '<div class="rule"><span class="n">BY COUNTY</span><span></span></div><div class="cty-g">' + countyRows().map(function (r) {
    var mine = FILTER_ISL[r.k];
    var fill = LEVEL_FILL[r.lv] || LEVEL_FILL.QUIET;
    var svg = '<svg viewBox="' + COUNTY_VB[r.k] + '" preserveAspectRatio="xMinYMid meet" aria-hidden="true">' + paths.map(function (p) {
      return mine.indexOf(p[0]) > -1 ? '<path d="' + p[1] + '" fill="' + fill + '"/>' : '';
    }).join('') + '</svg>';
    return '<a class="ct' + (r.k === isl ? ' cur' : '') + '" href="' + FILTER_PAGE[r.k] + '"' + (r.k === isl ? ' aria-current="page"' : '') + '>' +
      '<span class="ct-h"><span class="n">' + esc(COUNTY_TILE[r.k]) + '</span><span aria-hidden="true">→</span></span>' + svg +
      '<span class="mf lv-' + (r.lv === 'QUIET' ? 'NONE' : r.lv) + '">' + flapsHTML(r.word.replace(/[^A-Z0-9: ]/g, ''), 'flaps') + '</span>' +
      '<span class="ct-d"><b>' + esc(r.detail) + '</b><span>' + esc(COUNTY_SUB[r.k]) + '</span></span></a>';
  }).join('') + '</div>';
}
