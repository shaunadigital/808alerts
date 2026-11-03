
/* ---------- constants ---------- */
var TZ = 'Pacific/Honolulu';
var NWS_BASE = 'https://api.weather.gov';
var NWS_PAGE = 'https://www.weather.gov/hfo/';
var WORKER = 'https://808alerts-api.shauna-coy.workers.dev';
var HCCDA = 'https://services1.arcgis.com/C2LPusZs5OXNGFDn/arcgis/rest/services';
var HCCDA_DASH = 'https://www.arcgis.com/apps/dashboards/5865229bcba74020992b372ef18b6f17';
var HCCDA_PAGE = 'https://www.hawaiicounty.gov/departments/civil-defense';
/* The county's public Hazard Impact Map (the web map behind the dashboard above),
   opened in ArcGIS Map Viewer at a given spot: the closest official view of one
   closure or shelter, since the county publishes no page per item. */
var HCCDA_WEBMAP = '5a3b24e3f64c4ababdeecfadb9bdb9f8';
function countyMapAt(lon, lat, level) {
  return 'https://www.arcgis.com/apps/mapviewer/index.html?webmap=' + HCCDA_WEBMAP + '&center=' + (+lon).toFixed(5) + ',' + (+lat).toFixed(5) + '&level=' + (level || 15);
}
/* NWS publishes the text of every product it issues. The alert names its product
   (AWIPS id, e.g. TCVHFO for a hurricane watch), which gives a page with exactly
   what NWS issued. It shows the latest issuance of that product, so it is only
   used while the alert is still in effect. */
function nwsProductURL(awips) {
  var m = /^([A-Z0-9]{3})(HFO)$/.exec(awips || '');
  return m ? 'https://forecast.weather.gov/product.php?site=HFO&issuedby=HFO&product=' + m[1] : '';
}
var ZONE_COUNTY = { HAW: 'HIC001', OAH: 'HIC003', KAU: 'HIC007', NII: 'HIC007', MAU: 'HIC009', MOL: 'HIC009', LAN: 'HIC009', KAH: 'HIC009' };
function nwsZoneURL(zone) {
  var isl = (Z[zone] || [])[0];
  return /^HIZ/.test(zone) && isl ? 'https://forecast.weather.gov/showsigwx.php?warnzone=' + zone + '&warncounty=' + ZONE_COUNTY[isl] : '';
}
var WEEK = 7 * 864e5;
var REFRESH = 60e3;
var HISTORY_REFRESH = 10 * 60e3;
var SHELTER_STALE = 6 * 36e5;

var ISL_ORDER = ['NII', 'KAU', 'OAH', 'MOL', 'LAN', 'MAU', 'KAH', 'HAW'];
var ISL_NAME = { NII: 'NIʻIHAU', KAU: 'KAUAʻI', OAH: 'OʻAHU', MOL: 'MOLOKAʻI', LAN: 'LĀNAʻI', MAU: 'MAUI', KAH: 'KAHOʻOLAWE', HAW: 'HAWAIʻI ISLAND' };
var FILTER_NAME = { ALL: 'All islands', KAU: 'Kauaʻi', OAH: 'Oʻahu', MAUCO: 'Maui County', HAW: 'Hawaiʻi Island' };
var FILTER_PAGE = { ALL: '/', KAU: '/kauai-alerts/', OAH: '/oahu-alerts/', MAUCO: '/maui-alerts/', HAW: '/hawaii-island-alerts/' };
var FILTER_ISL = { KAU: ['KAU', 'NII'], OAH: ['OAH'], MAUCO: ['MAU', 'MOL', 'LAN', 'KAH'], HAW: ['HAW'] };
var COUNTY_AGENCY = {
  KAU: ['Kauaʻi Emergency Management Agency', 'https://www.kauai.gov/Government/Departments-Agencies/Emergency-Management-Agency'],
  OAH: ['Honolulu Department of Emergency Management', 'https://www.honolulu.gov/dem/'],
  MAUCO: ['Maui Emergency Management Agency', 'https://www.mauicounty.gov/2921/Emergency-Management-Agency'],
  HAW: ['Hawaiʻi County Civil Defense', HCCDA_PAGE]
};

/* NWS zone and county codes to islands. Verified against api.weather.gov/zones on 2026-09-23. */
var Z = {};
function zset(codes, isl) { codes.forEach(function (c) { Z[c] = isl; }); }
zset(['HIZ001'], ['NII']);
zset(['HIZ003', 'HIZ004', 'HIZ029', 'HIZ030', 'HIZ031'], ['KAU']);
zset(['HIZ006', 'HIZ007', 'HIZ009', 'HIZ010', 'HIZ011', 'HIZ032', 'HIZ033', 'HIZ034', 'HIZ035', 'HIZ036'], ['OAH']);
zset(['HIZ037', 'HIZ038', 'HIZ039', 'HIZ040', 'HIZ041'], ['MOL']);
zset(['HIZ015', 'HIZ042', 'HIZ043', 'HIZ044'], ['LAN']);
zset(['HIZ016'], ['KAH']);
zset(['HIZ017', 'HIZ018', 'HIZ022', 'HIZ045', 'HIZ046', 'HIZ047', 'HIZ048', 'HIZ049', 'HIZ050'], ['MAU']);
zset(['HIZ023', 'HIZ026', 'HIZ027', 'HIZ028', 'HIZ051', 'HIZ052', 'HIZ053', 'HIZ054'], ['HAW']);
zset(['HIC001'], ['HAW']); zset(['HIC003'], ['OAH']); zset(['HIC005'], ['MOL']);
zset(['HIC007'], ['KAU', 'NII']); zset(['HIC009'], ['MAU', 'MOL', 'LAN', 'KAH']);
zset(['PHZ110', 'PHZ111', 'PHZ112'], ['KAU', 'NII']); zset(['PHZ113'], ['KAU', 'OAH']);
zset(['PHZ114', 'PHZ115'], ['OAH']); zset(['PHZ116'], ['OAH', 'MOL']);
zset(['PHZ117', 'PHZ118'], ['MAU', 'MOL', 'LAN', 'KAH']); zset(['PHZ119'], ['MAU']);
zset(['PHZ120'], ['MAU', 'MOL']); zset(['PHZ121'], ['MAU', 'HAW']);
zset(['PHZ122', 'PHZ123', 'PHZ124'], ['HAW']);

/* Hawaiian spellings for place names the feeds publish without diacritics. */
var PLACES = [
  ['Mamalahoa', 'Māmalahoa'], ['Ookala', 'ʻŌʻōkala'], ['Pahoa', 'Pāhoa'], ['Naalehu', 'Nāʻālehu'], ['Pahala', 'Pāhala'],
  ['Milolii', 'Miloliʻi'], ['Waikoloa', 'Waikōloa'], ['Mahukona', 'Māhukona'], ['Hawi', 'Hāwī'], ['Honokaa', 'Honokaʻa'],
  ['Keaau', 'Keaʻau'], ['Kau', 'Kaʻū'], ['Hamakua', 'Hāmākua'], ['Waipio', 'Waipiʻo'], ['Laupahoehoe', 'Laupāhoehoe'],
  ['Kaalaiki', 'Kaʻalāiki'], ['Kahoolawe', 'Kahoʻolawe'], ['Lanai', 'Lānaʻi'], ['Molokai', 'Molokaʻi'], ['Kauai', 'Kauaʻi'],
  ['Oahu', 'Oʻahu'], ['Niihau', 'Niʻihau'], ['Haleakala', 'Haleakalā'], ['Kipahulu', 'Kīpahulu'], ['Waianae', 'Waiʻanae'],
  ['Koolau', 'Koʻolau'], ['Ewa', 'ʻEwa']
];
function place(s) {
  if (!s) return s;
  PLACES.forEach(function (p) { s = s.replace(new RegExp('\\b' + p[0] + '\\b', 'g'), p[1]); });
  return s;
}

var ISL_PATHS = __ISLAND_PATHS__;

var TROPICAL_DEF = {
  'Hurricane Warning': 'Hurricane conditions are expected within the warning area. Rush preparations to completion.',
  'Hurricane Watch': 'Hurricane conditions are possible within the watch area. Get ready now.',
  'Tropical Storm Warning': 'Tropical storm conditions are expected within the warning area.',
  'Tropical Storm Watch': 'Tropical storm conditions are possible within the watch area.',
  'Storm Surge Warning': 'Life-threatening storm surge flooding is expected.',
  'Storm Surge Watch': 'Life-threatening storm surge flooding is possible.'
};
var IMPACT = { 'None': 0, 'Limited': 1, 'Elevated': 1, 'Significant': 2, 'Moderate': 2, 'Extensive': 3, 'High': 3, 'Devastating': 4, 'Catastrophic': 4, 'Devastating to Catastrophic': 4, 'Extreme': 4 };

/* ---------- utilities ---------- */
function $(s) { return document.querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function store(k, v) { try { if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
var fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
var fmtDay = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
var fmtWd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
var fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
function tm(t) { return fmtTime.format(new Date(t)); }
function dayKey(t) { return fmtKey.format(new Date(t)); }
function dayLabel(t) {
  var k = dayKey(t), now = Date.now();
  var lbl = fmtDay.format(new Date(t)).replace(',', '').toUpperCase();
  if (k === dayKey(now)) return 'TODAY · ' + lbl;
  if (k === dayKey(now - 864e5)) return 'YESTERDAY · ' + lbl;
  return lbl;
}
function whenShort(t) {
  return dayKey(t) === dayKey(Date.now()) ? tm(t) : fmtWd.format(new Date(t)) + ' ' + tm(t);
}
function ago(t) {
  var m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.round(m / 60);
  if (h < 24) return h + ' hr ago';
  var d = Math.round(h / 24);
  return d === 1 ? '1 day ago' : d + ' days ago';
}
var FETCH_HEADERS = {};
function setFetchHeaders(h) { FETCH_HEADERS = h || {}; }
function fetchJSON(url, ms) {
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 15000);
  var hd = { Accept: 'application/geo+json, application/json' }; for (var k in FETCH_HEADERS) hd[k] = FETCH_HEADERS[k];
  // The time limit covers the whole response, body included, and a hard race
  // backs up the abort: a feed that answers and then stalls must not hold a
  // page (or Cloudflare's server render) open.
  var limit = ms || 15000;
  var work = fetch(url, { signal: ctl ? ctl.signal : undefined, headers: hd })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  var cap = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, limit + 500); });
  return Promise.race([work, cap]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
}
function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
function clip(s, n) {
  s = (s || '').trim();
  if (s.length <= n) return s;
  var cut = s.slice(0, n), dot = cut.lastIndexOf('. ');
  return (dot > n * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…');
}
function unwrap(s) { return (s || '').replace(/\r/g, '').replace(/([^\n])\n(?!\n|\*|-)/g, '$1 ').replace(/[ \t]+/g, ' ').trim(); }

/* ---------- state ---------- */
var S = {
  island: 'ALL', showEnded: false,
  nws: { status: 'loading', at: 0, active: [], history: [], historyAt: 0 },
  roads: { status: 'loading', at: 0, items: [] },
  shelters: { status: 'loading', at: 0, items: [], edited: 0 },
  heco: { status: 'loading', at: 0, items: [] },
  cards: [], checkedAt: 0
};

/* ---------- NWS ---------- */
function trimFeature(f) {
  var p = f.properties;
  return {
    id: p.id, sent: Date.parse(p.sent), expires: p.expires ? Date.parse(p.expires) : 0, ends: p.ends ? Date.parse(p.ends) : 0,
    event: p.event, type: p.messageType, status: p.status, area: p.areaDesc, ugc: (p.geocode && p.geocode.UGC) || [],
    refs: (p.references || []).map(function (r) { return r.identifier; }),
    nhead: (p.parameters && p.parameters.NWSheadline && p.parameters.NWSheadline[0]) || '',
    awips: (p.parameters && p.parameters.AWIPSidentifier && p.parameters.AWIPSidentifier[0]) || '',
    headline: p.headline || '', desc: p.description || '', instr: p.instruction || ''
  };
}
function loadNWS() {
  return fetchJSON(NWS_BASE + '/alerts/active?area=HI').then(function (d) {
    S.nws.active = d.features.map(trimFeature).filter(function (a) { return a.status === 'Actual'; });
    S.nws.status = 'ok'; S.nws.at = Date.now();
    store('808:nws', { at: S.nws.at, active: S.nws.active });
  }).catch(function () {
    var c = store('808:nws');
    if (c && c.active && (!S.nws.at || c.at > S.nws.at)) { S.nws.active = c.active; S.nws.at = c.at; }
    S.nws.status = 'fail';
  });
}
function loadNWSHistory() {
  if (Date.now() - S.nws.historyAt < HISTORY_REFRESH) return Promise.resolve();
  var start = new Date(Date.now() - WEEK).toISOString().replace(/\.\d+Z$/, 'Z');
  return fetchJSON(NWS_BASE + '/alerts?area=HI&start=' + start + '&limit=500', 25000).then(function (d) {
    S.nws.history = d.features.map(trimFeature).filter(function (a) { return a.status === 'Actual'; });
    S.nws.historyAt = Date.now();
  }).catch(function () { });
}

function levelOf(ev) {
  if (/Warning/i.test(ev)) return 'WARNING';
  if (/Watch/i.test(ev)) return 'WATCH';
  if (/Advisory/i.test(ev)) return 'ADVISORY';
  return 'STATEMENT';
}
function sentence(s, ev) {
  if (!s) return '';
  if (s !== s.toUpperCase()) return s;
  var t = s.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  t = t.replace(/\b(hurricane|tropical storm|tropical depression|post-tropical cyclone)\s+([a-z]+)/g, function (m, kind, name) {
    var common = ['watch', 'warning', 'force', 'conditions', 'is', 'remains', 'continues', 'will', 'has', 'and', 'or', 'expected', 'center', 'season', 'to', 'in', 'for', 'watches', 'warnings', 'local'];
    return common.indexOf(name) > -1 ? m : kind + ' ' + name.charAt(0).toUpperCase() + name.slice(1);
  });
  if (ev) t = t.replace(new RegExp(ev.toLowerCase(), 'g'), ev);
  var proper = ['Hawaii', 'Big Island', 'Maui', 'Oahu', 'Kauai', 'Molokai', 'Lanai', 'Niihau', 'Kahoolawe', 'Hilo', 'Kona', 'Kohala', 'Honolulu',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December', 'Hurricane', 'Tropical Storm', 'Watch', 'Warning', 'Advisory'];
  proper.forEach(function (w) { t = t.replace(new RegExp('\\b' + w.toLowerCase() + '\\b', 'g'), w); });
  t = t.replace(/\bhst\b/g, 'HST').replace(/\bnws\b/g, 'NWS');
  t = t.replace(/^(.)/, function (c) { return c.toUpperCase(); });
  return place(t);
}
function field(desc, key) {
  var m = new RegExp('\\*\\s*' + key + '\\.\\.\\.([\\s\\S]*?)(?=\\n\\s*\\n|\\n\\*|$)').exec(desc);
  return m ? unwrap(m[1]) : '';
}
function summary(a) {
  var d = a.desc || '';
  var what = field(d, 'WHAT'), impacts = field(d, 'IMPACTS');
  if (what) return clip(what + (impacts ? ' ' + impacts : ''), 300);
  var so = /SITUATION OVERVIEW\s*\n-+\s*\n([\s\S]*?)(\n\s*\n|$)/.exec(d);
  if (so) return clip(unwrap(so[1]), 320);
  if (/LOCATIONS AFFECTED/.test(d) && TROPICAL_DEF[a.event]) return TROPICAL_DEF[a.event] + ' Open for the danger ratings in your area.';
  if (TROPICAL_DEF[a.event]) return TROPICAL_DEF[a.event];
  var paras = d.split(/\n\s*\n/).map(unwrap).filter(function (p) { return p && p !== p.toUpperCase(); });
  return clip(paras[0] || '', 300);
}
function islandsOf(ugc) {
  var out = [];
  ugc.forEach(function (c) { (Z[c] || []).forEach(function (i) { if (out.indexOf(i) < 0) out.push(i); }); });
  return ISL_ORDER.filter(function (i) { return out.indexOf(i) > -1; });
}
function whereLabel(isl) {
  var set = function (a) { return a.every(function (x) { return isl.indexOf(x) > -1; }); };
  if (isl.length >= 7) return 'ALL ISLANDS';
  var maui = ['MAU', 'MOL', 'LAN'];
  var parts = [];
  var rest = isl.slice();
  if (set(maui)) { parts.push('MAUI COUNTY'); rest = rest.filter(function (x) { return maui.concat('KAH').indexOf(x) < 0; }); }
  if (rest.indexOf('KAU') > -1 && rest.indexOf('NII') > -1) rest = rest.filter(function (x) { return x !== 'NII'; });
  var names = rest.map(function (x) { return ISL_NAME[x]; });
  if (parts.length && names.indexOf('HAWAIʻI ISLAND') > -1) { names = names.filter(function (x) { return x !== 'HAWAIʻI ISLAND'; }); parts.unshift('HAWAIʻI ISLAND'); }
  return parts.concat(names).join(' + ') || 'HAWAIʻI';
}

function buildNWSCards() {
  var activeIds = {};
  S.nws.active.forEach(function (a) { activeIds[a.id] = true; });
  var all = {};
  S.nws.history.concat(S.nws.active).forEach(function (a) { all[a.id] = a; });
  var list = Object.keys(all).map(function (k) { return all[k]; }).filter(function (a) { return Date.now() - a.sent < WEEK || activeIds[a.id]; });

  // union-find threads over references
  var parent = {};
  function find(x) { while (parent[x] && parent[x] !== x) x = parent[x] = parent[parent[x]] || parent[x]; return x; }
  function union(a, b) { parent[a] = parent[a] || a; parent[b] = parent[b] || b; var ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  list.forEach(function (a) {
    parent[a.id] = parent[a.id] || a.id;
    a.refs.forEach(function (r) { if (all[r]) union(a.id, r); });
  });
  var threads = {};
  list.forEach(function (a) {
    // storm statements carry no references; each new one replaces the last
    var key = a.event === 'Tropical Cyclone Local Statement' ? 'TCLS' : find(a.id);
    (threads[key] = threads[key] || []).push(a);
  });
  var now = Date.now();
  var th = Object.keys(threads).map(function (k) {
    var msgs = threads[k].sort(function (x, y) { return x.sent - y.sent; });
    var latest = msgs[msgs.length - 1];
    var cancelled = latest.type === 'Cancel';
    var end = latest.ends || latest.expires;
    var active = !cancelled && (activeIds[latest.id] || (S.nws.status !== 'ok' && end > now && S.nws.active.some(function (x) { return x.id === latest.id; })));
    return { msgs: msgs, latest: latest, first: msgs[0], active: !!active, cancelled: cancelled };
  });
  // drop threads where only a cancel message is visible and nothing else
  th = th.filter(function (t) { return !(t.cancelled && t.msgs.length === 1 && !t.latest.event); });

  // group threads that went out together (same event, same minute): one card, many zones
  var groups = {};
  th.forEach(function (t) {
    var k = t.latest.event + '|' + Math.floor(t.latest.sent / 6e4) + '|' + (t.active ? 1 : 0) + '|' + (t.cancelled ? 1 : 0);
    (groups[k] = groups[k] || []).push(t);
  });
  return Object.keys(groups).map(function (k) {
    var g = groups[k];
    var L = g[0].latest;
    var ugc = uniq([].concat.apply([], g.map(function (t) { return t.latest.ugc; })));
    var isl = islandsOf(ugc);
    var firstSent = Math.min.apply(null, g.map(function (t) { return t.first.sent; }));
    var active = g[0].active;
    var ended = !active;
    var zoneNames = uniq([].concat.apply([], g.map(function (t) { return t.latest.area.split(/;\s*/); }))).map(place);
    var where = field(L.desc, 'WHERE');
    var area = '';
    var hiz = ugc.filter(function (c) { return /^HIZ/.test(c); });
    if (hiz.length > 1 && hiz.length <= 10) area = hiz.length + ' zones: ' + zoneNames.join(', ');
    else if (hiz.length > 10) area = hiz.length + ' forecast zones';
    else if (where) area = clip(place(where), 140);
    else if (hiz.length === 1) area = zoneNames[0];
    var thread;
    if (L.event === 'Tropical Cyclone Local Statement') {
      var prev = g[0].msgs[g[0].msgs.length - 2];
      thread = prev ? 'Replaces the ' + whenShort(prev.sent) + ' statement' : 'Issued ' + whenShort(L.sent);
    } else if (g[0].msgs.length > 1) {
      thread = (L.type === 'Cancel' ? 'Cancelled ' : 'Updated ') + whenShort(L.sent) + ' · first issued ' + whenShort(firstSent);
    } else thread = 'Issued ' + whenShort(L.sent);
    var endT = L.ends || L.expires;
    var until;
    if (ended) until = L.type === 'Cancel' ? 'Cancelled' : 'Expired ' + (endT ? whenShort(endT) : '');
    else if (L.ends) until = 'Until ' + whenShort(L.ends);
    else if (/Hurricane|Tropical Storm|Storm Surge|Typhoon/.test(L.event) && /Watch|Warning/.test(L.event)) until = 'Until further notice';
    else if (L.event === 'Tropical Cyclone Local Statement') until = '';
    else until = L.expires ? 'Until ' + whenShort(L.expires) : '';
    var head = sentence(L.nhead, L.event) || (L.event + (ended ? '' : ' in effect'));
    if (L.type === 'Cancel' && !L.nhead) head = L.event + ' cancelled';
    return {
      src: 'nws', id: g.map(function (t) { return t.latest.id; }).sort()[0], ids: g.map(function (t) { return t.latest.id; }),
      threads: g, level: ended ? 'ENDED' : levelOf(L.event), baseLevel: levelOf(L.event), event: L.event,
      agency: 'NWS HONOLULU', t: L.sent, timed: true, isl: isl, where: whereLabel(isl), area: area,
      head: head, body: L.type === 'Cancel' ? 'This alert is no longer in effect.' : summary(L),
      thread: thread, until: until, active: active, url: (active && nwsProductURL(L.awips)) || NWS_PAGE, detail: true, stale: S.nws.status === 'fail'
    };
  });
}

/* ---------- Hawaiʻi County Civil Defense ---------- */
function loadRoads() {
  var q = HCCDA + '/Road_Closures_(HCCDA)_Public/FeatureServer/0/query?where=' + encodeURIComponent("Active='Active'") +
    '&outFields=OBJECTID,Name,District,Location,Mile_Marker,Road_Closure_Type,Reason,Notes,Alternate_Route,Start_Date,CreationDate&returnGeometry=true&outSR=4326&geometryPrecision=5&f=json';
  return fetchJSON(q).then(function (d) {
    if (d.error) throw new Error('arcgis');
    S.roads.items = (d.features || []).map(function (f) {
      var a = f.attributes, g = f.geometry, pt = null;
      var path = g && g.paths && g.paths[0];
      if (path && path.length) pt = path[Math.floor(path.length / 2)];
      else if (g && g.x != null) pt = [g.x, g.y];
      if (pt) { a._lon = pt[0]; a._lat = pt[1]; }
      return a;
    });
    S.roads.status = 'ok'; S.roads.at = Date.now();
  }).catch(function () { S.roads.status = 'fail'; });
}
function roadCards() {
  var now = Date.now();
  return S.roads.items.filter(function (r) {
    var t = r.Start_Date || r.CreationDate;
    return t && now - t < WEEK; // long-term closures stay on the county map, not in the feed
  }).map(function (r) {
    var t = Math.max(r.Start_Date || 0, 0) || r.CreationDate;
    var type = r.Road_Closure_Type || 'Closed';
    var lane = /lane/i.test(type);
    var loc = r.Location && !/^n\/?a$/i.test(r.Location) ? ' at ' + place(r.Location) : '';
    var alt = r.Alternate_Route && !/^(n\/?a|none)$/i.test(r.Alternate_Route) ? 'Alternate route: ' + place(r.Alternate_Route) + '.' : 'No alternate route listed.';
    var body = [r.Reason ? place(r.Reason).replace(/\.?$/, '.') : '', r.Notes ? place(r.Notes).replace(/\.?$/, '.') : '', alt].filter(Boolean).join(' ');
    return {
      src: 'roads', id: 'road-' + r.OBJECTID, level: 'NOTICE', event: lane ? 'Lane Closure' : 'Road Closed', agency: 'HAWAIʻI COUNTY CIVIL DEFENSE',
      t: t, timed: true, isl: ['HAW'], where: 'HAWAIʻI ISLAND', area: r.District ? place(r.District) + ' district' : '',
      head: place(r.Name) + ': ' + type.toLowerCase() + loc, body: body,
      thread: 'From the county road closure map', until: 'Until reopened', active: true, url: r._lon != null ? countyMapAt(r._lon, r._lat, 16) : HCCDA_DASH, more: ['All Big Island road closures', '/big-island-road-closures/']
    };
  });
}
function loadShelters() {
  var base = HCCDA + '/Emergency_Shelters_(HCCDA)_Public/FeatureServer/0';
  return Promise.all([
    fetchJSON(base + '/query?where=' + encodeURIComponent("Status='Open'") + '&outFields=Name,City,Animals&returnGeometry=false&f=json'),
    fetchJSON(base + '?f=json').catch(function () { return {}; })
  ]).then(function (r) {
    if (r[0].error) throw new Error('arcgis');
    S.shelters.items = (r[0].features || []).map(function (f) { return f.attributes; });
    var ei = r[1].editingInfo || {};
    S.shelters.edited = ei.dataLastEditDate || ei.lastEditDate || 0;
    S.shelters.status = 'ok'; S.shelters.at = Date.now();
  }).catch(function () { S.shelters.status = 'fail'; });
}
function shelterCards() {
  var s = S.shelters.items;
  if (!s.length) return [];
  var t = S.shelters.edited || S.shelters.at;
  var list = s.map(function (x) {
    var pets = x.Animals && !/^\s*$/.test(x.Animals) ? (/^none$/i.test(x.Animals.trim()) ? 'no pets' : 'pets: ' + x.Animals.trim().toLowerCase()) : '';
    return place(x.Name) + (x.City ? ' in ' + place(x.City) : '') + (pets ? ' (' + pets + ')' : '');
  });
  var staleFlag = Date.now() - t > SHELTER_STALE;
  return [{
    src: 'shelters', id: 'shelters', level: 'NOTICE', event: 'Shelters Open', agency: 'HAWAIʻI COUNTY CIVIL DEFENSE',
    t: t, timed: true, isl: ['HAW'], where: 'HAWAIʻI ISLAND', area: '',
    head: s.length + (s.length === 1 ? ' shelter listed open' : ' shelters listed open'),
    body: list.join('; ') + '.', confirm: true,
    staleNote: staleFlag ? 'County list last edited ' + ago(t) + '.' : '',
    thread: 'Shelter list from the county map, checked ' + tm(S.shelters.at), until: '', active: true, url: countyMapAt(-155.5, 19.6, 9)
  }];
}

/* ---------- Hawaiian Electric (via the 808 Alerts worker) ---------- */
var HECO_COUNTIES = [['HIC003', ['OAH']], ['HIC009', ['MAU', 'MOL', 'LAN']], ['HIC001', ['HAW']]];
function loadHECO() {
  return Promise.all(HECO_COUNTIES.map(function (c) {
    return fetchJSON(WORKER + '/api/power?county=' + c[0]).then(function (d) { d._isl = c[1]; return d; });
  })).then(function (rs) {
    S.heco.items = rs; S.heco.status = 'ok'; S.heco.at = Date.now();
  }).catch(function () { S.heco.status = 'fail'; });
}
function hecoCards() {
  var byUrl = {};
  S.heco.items.forEach(function (d) {
    if (!d || !d.sourceUrl || !d.published) return;
    var t = Date.parse(d.published + 'T00:00:00-10:00');
    if (!(Date.now() - t < WEEK)) return;
    var c = byUrl[d.sourceUrl] = byUrl[d.sourceUrl] || { d: d, t: t, isl: [], lines: [] };
    c.isl = c.isl.concat(d._isl);
    if (d.available && d.out) c.lines.push('About ' + Number(d.out).toLocaleString() + ' customers without power on ' + d.countyShort + (d.asOf ? ' as of ' + d.asOf : '') + '.');
  });
  return Object.keys(byUrl).map(function (u) {
    var c = byUrl[u], d = c.d;
    var isl = ISL_ORDER.filter(function (i) { return c.isl.indexOf(i) > -1; });
    return {
      src: 'heco', id: 'heco-' + u, level: 'STATEMENT', event: 'Utility Update', agency: 'HAWAIIAN ELECTRIC',
      t: c.t, timed: false, isl: isl, where: 'HAWAIIAN ELECTRIC ISLANDS', area: '',
      head: place(d.title), body: c.lines.length ? c.lines.join(' ') + ' ' + (d.caveat || '') : 'Outage updates appear here as Hawaiian Electric releases them. Kauaʻi is served by KIUC.',
      thread: 'News release', until: '', active: true, url: u
    };
  });
}

/* ---------- assemble ---------- */
function assemble() {
  var cards = buildNWSCards().concat(roadCards(), shelterCards(), hecoCards());
  cards.sort(function (a, b) {
    var ka = dayKey(a.t), kb = dayKey(b.t);
    if (ka !== kb) return kb < ka ? -1 : 1;
    if (a.timed !== b.timed) return a.timed ? -1 : 1;
    return b.t - a.t;
  });
  S.cards = cards;
}
function applies(c, isl) {
  if (isl === 'ALL') return true;
  return (FILTER_ISL[isl] || []).some(function (i) { return c.isl.indexOf(i) > -1; });
}

/* ---------- alert addresses ----------
   /alert/<event>-<islands>-<token>. The token comes from an NWS message id, so a
   shared link keeps working after the alert is updated: any message in the
   card's threads, old or new, resolves back to the card. */
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯʻ‘’']/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function token(id) {
  var m = /([0-9a-f]{40})\.(\d+)\.\d+$/.exec(id || '');
  return m ? m[1].slice(0, 12) + m[2] : slugify(id).slice(-16);
}
function slugFor(c) { return slugify(c.event) + '-' + slugify(c.where) + '-' + token(c.id); }
function alertPath(c) { return '/alert/' + slugFor(c); }
function findCard(key) {
  if (!key) return null;
  var tok = key.indexOf('urn:') === 0 ? token(key) : key.split('-').pop();
  return S.cards.filter(function (c) {
    return c.src === 'nws' && c.threads.some(function (t) { return t.msgs.some(function (m) { return m.id === key || token(m.id) === tok; }); });
  })[0] || null;
}
function titleCase(s) {
  return String(s).toLowerCase().replace(/(^|[\s+])([a-zʻā])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/ʻ([A-Z])/g, function (m, a) { return 'ʻ' + a.toLowerCase(); });
}

/* ---------- map links ---------- */
function mapHref(isl) {
  var f = uniq((isl || []).map(function (i) { return i === 'NII' ? 'KAU' : i === 'KAH' ? 'MAU' : i; }));
  return f.length === 1 ? '/map/?island=' + f[0] : '/map/';
}
function filterMapHref(isl) { return isl === 'ALL' ? '/map/' : isl === 'MAUCO' ? '/map/?island=MAU' : '/map/?island=' + isl; }

/* ---------- render ---------- */
var ARROW = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9L9 3M4 3h5v5"/></svg>';
var MAPICON = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 3.5l4.5-2 5 2 4.5-2v11l-4.5 2-5-2-4.5 2z M5.5 1.5v11 M10.5 3.5v11"/></svg>';
var CHEV = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#101010" stroke-width="2" aria-hidden="true"><path d="M5 3l5 5-5 5"/></svg>';
function islandSVG(on, color, label, w, h) {
  var paths = ISL_ORDER.map(function (k) {
    var hit = on.indexOf(k) > -1;
    return '<path d="' + ISL_PATHS[k] + '" fill="' + (hit ? color : '#cbc2b3') + '"/>';
  }).join('');
  return '<svg viewBox="-2 -2 156 104"' + (w ? ' width="' + w + '" height="' + h + '"' : '') + ' role="img" aria-label="' + esc(label) + '">' + paths + '</svg>';
}
function cardHTML(c, opts) {
  opts = opts || {};
  var time = c.timed ? tm(c.t) : fmtDay.format(new Date(c.t)).replace(/^\w+,\s*/, '').toUpperCase();
  var agoTxt = c.timed ? ago(c.t) : (dayKey(c.t) === dayKey(Date.now()) ? 'today' : ago(c.t + 12 * 36e5));
  var link = c.detail ? alertPath(c) : '';
  var h = '<article class="card' + (c.level === 'ENDED' ? ' ended' : '') + (opts.pin ? ' pin' : '') + '">' +
    '<div class="c-top"><div class="c-id">' +
    '<div class="c-ev"><span class="tag n t-' + c.level + '">' + c.level + '</span><span class="ev">' + esc(c.event) + '</span></div>' +
    '<div class="when"><span><b>' + esc(time) + '</b> <span class="dot">·</span> ' + esc(agoTxt) + '</span>' +
    (c.stale && c.src === 'nws' && c.active ? '<span class="stale n">AS OF ' + esc(tm(S.nws.at)) + '</span>' : '') + '</div></div>' +
    '<a class="loc" href="' + mapHref(c.isl) + '" title="See on the map">' + islandSVG(c.isl, c.active ? '#101010' : '#8c8c8c', c.where + ', see on the map') + '<span class="n">' + esc(c.where) + '</span></a></div>' +
    '<div class="c-body"><h2>' + (link ? '<a href="' + link + '">' + esc(c.head) + '</a>' : esc(c.head)) + '</h2>' +
    (c.body ? '<p>' + esc(c.body) + '</p>' : '') + (c.area ? '<div class="area">' + esc(c.area) + '</div>' : '') + (c.more ? '<a class="morel" href="' + c.more[1] + '">' + esc(c.more[0]) + ' →</a>' : '') + '</div>' +
    (c.staleNote ? '<div class="band amb"><b>MAY BE OUT OF DATE. </b>' + esc(c.staleNote) + '</div>' : '') +
    (c.confirm ? '<div class="band red"><b>CONFIRM BEFORE YOU TRAVEL. </b>“Listed open” is the county’s report, not a guarantee. Status can change. Call ahead or check the county page.</div>' : '') +
    '<div class="c-foot"><div class="c-meta"><span class="ag n">' + esc(c.agency) + '</span><span>' + esc(c.thread) + '</span>' +
    (c.until ? '<span class="until">' + esc(c.until) + '</span>' : '') + '</div>' +
    '<a class="src" href="' + esc(c.url) + '" target="_blank" rel="noopener">OFFICIAL SOURCE' + ARROW + '</a></div></article>';
  return h;
}
function rule(t, cls) { return '<div class="rule' + (cls ? ' ' + cls : '') + '"><span class="n">' + esc(t) + '</span><span></span></div>'; }
function tiles(label) {
  return rule(label) + '<div class="tiles">' +
    '<a class="tile" href="/hurricane-preparation-hawaii/"><span><b>Prepare</b><small>Make a plan for your household.</small></span>' + CHEV + '</a>' +
    '<a class="tile" href="/emergency-shelters-hawaii/"><span><b>Shelters</b><small>Know where you would go, and what to bring.</small></span>' + CHEV + '</a>' +
    '<a class="tile" href="/hurricane-kit-checklist/"><span><b>Kit checklist</b><small>What to have on hand for a week without power or water.</small></span>' + CHEV + '</a></div>';
}

function bannerHTML(isl) {
  isl = isl || 'ALL';
  var out = '';
  if (S.nws.status === 'fail') {
    out += '<div class="banner" role="status"><strong>CAN’T REACH THE NATIONAL WEATHER SERVICE</strong><span>' +
      (S.nws.at ? 'Last good check was ' + esc(whenShort(S.nws.at)) + ', so NWS alerts below may be out of date. ' : 'NWS alerts are missing below until it answers. ') +
      'Retrying every minute. <a href="' + NWS_PAGE + '" target="_blank" rel="noopener">Check weather.gov directly</a></span></div>';
  }
  var others = [];
  if ((isl === 'ALL' || isl === 'HAW') && (S.roads.status === 'fail' || S.shelters.status === 'fail')) others.push('Hawaiʻi County Civil Defense (road closures and shelters)');
  if (isl !== 'KAU' && S.heco.status === 'fail') others.push('Hawaiian Electric updates');
  if (others.length) out += '<div class="banner" role="status"><strong>SOME SOURCES AREN’T ANSWERING</strong><span>Couldn’t load ' + esc(others.join(' or ')) + '. Anything from them is missing below, which does not mean nothing is happening.</span></div>';
  return out;
}

function feedHTML(isl, showEnded) {
  var cards = S.cards.filter(function (c) { return applies(c, isl); });
  var active = cards.filter(function (c) { return c.active; });
  var ended = cards.filter(function (c) { return !c.active; });
  var pinned = active.filter(function (c) { return c.level === 'WARNING'; });
  var flow = active.filter(function (c) { return c.level !== 'WARNING'; }).concat(showEnded ? ended : []);
  flow.sort(function (a, b) {
    var ka = dayKey(a.t), kb = dayKey(b.t);
    if (ka !== kb) return kb < ka ? -1 : 1;
    if (a.timed !== b.timed) return a.timed ? -1 : 1;
    return b.t - a.t;
  });
  var nwsKnown = S.nws.status === 'ok' || S.nws.at;
  var h = '';
  if (!active.length && nwsKnown) {
    if (isl === 'ALL') {
      // The hero above already says QUIET and offers the get-ready links.
      h += '<div class="empty"><h2>No alerts in effect across Hawaiʻi right now.</h2><p>Checked at ' + esc(tm(S.checkedAt || Date.now())) + ' against NWS Honolulu, Hawaiʻi County Civil Defense and Hawaiian Electric. This is not an all clear: conditions can change quickly, and new alerts show up here as soon as they’re issued.</p></div>';
    } else {
      var ag = COUNTY_AGENCY[isl];
      h += '<div class="empty"><h2>No alerts in effect for ' + esc(FILTER_NAME[isl]) + ' right now.</h2><p>That covers the agencies we follow. It is not an all clear. For local updates, check with the <a href="' + ag[1] + '" target="_blank" rel="noopener">' + esc(ag[0]) + '</a>.</p></div>';
    }
  } else if (!active.length && !nwsKnown) {
    h += '<div class="empty"><h2>Alerts couldn’t load.</h2><p>We can’t reach the National Weather Service right now, so we can’t tell you what’s in effect. Please check <a href="' + NWS_PAGE + '" target="_blank" rel="noopener">weather.gov/hfo</a> directly.</p></div>';
  }
  if (pinned.length) {
    h += '<div class="group">' + rule(pinned.length === 1 ? 'PINNED · WARNING IN EFFECT' : 'PINNED · ' + pinned.length + ' WARNINGS IN EFFECT', 'red') +
      pinned.map(function (c) { return cardHTML(c, { pin: true }); }).join('') + '</div>';
  }
  var lastDay = null, open = false;
  flow.forEach(function (c) {
    var k = dayKey(c.t);
    if (k !== lastDay) { if (open) h += '</div>'; h += '<div class="group">' + rule(dayLabel(c.t)); lastDay = k; open = true; }
    h += cardHTML(c);
  });
  if (open) h += '</div>';
  if (ended.length) {
    h += '<button type="button" class="more" id="more">' + (showEnded ? 'HIDE ENDED ALERTS' : 'SHOW ' + ended.length + ' ENDED ' + (ended.length === 1 ? 'ALERT' : 'ALERTS') + ' FROM THIS WEEK') + '</button>';
  }
  if (active.length || isl !== 'ALL' || !nwsKnown) h += tiles('GET READY');
  h += '<div class="note">Showing alerts from the last 7 days.</div>';
  return h;
}


/* A plain-language status line for the bottom of the page. It answers the
   "is there a hurricane in Hawaii right now" kind of search with what NWS
   actually has in effect, and says when that was checked. */
function rightNowHTML(isl) {
  if (!S.nws.at) return '';
  var act = S.cards.filter(function (c) { return c.active && c.src === 'nws' && applies(c, isl); });
  var where = isl === 'ALL' ? 'Hawaiʻi' : FILTER_NAME[isl];
  var when = whenShort(S.nws.at) + ' HST';
  if (!act.length) return '<p><b>As of ' + esc(when) + ',</b> the National Weather Service has no watches, warnings or advisories in effect for ' + esc(where) + '.</p>';
  var parts = uniq(act.map(function (c) { return c.event + ' (' + titleCase(c.where) + ')'; }));
  return '<p><b>As of ' + esc(when) + ',</b> the National Weather Service has ' + act.length + (act.length === 1 ? ' alert' : ' alerts') + ' in effect for ' + esc(where) + ': ' + esc(parts.join('; ')) + '.</p>';
}
/* ---------- detail ---------- */
function parseZone(a) {
  var d = a.desc || '';
  var locs = /\* LOCATIONS AFFECTED\s*\n([\s\S]*?)\n\s*\n/.exec(d);
  var towns = locs ? locs[1].split('\n').map(function (l) { return place(l.replace(/^\s*-\s*/, '').trim()); }).filter(Boolean) : [];
  var sections = [];
  var re = /\*\s*(WIND|STORM SURGE|FLOODING RAIN|TORNADO)\s*\n([\s\S]*?)(?=\n\*\s|$)/g, m;
  while ((m = re.exec(d))) {
    var s = m[2];
    var imp = /POTENTIAL IMPACTS:\s*([^\n]+)/.exec(s);
    var peak = /Peak [^:]*:\s*([^\n]+(?:\n(?!\s*-|\s*\n)[^\n]+)*)/.exec(s);
    var sit = /LATEST LOCAL FORECAST:\s*\n?\s*-?\s*([^\n]+)/.exec(s);
    var act = /ACT:\s*([\s\S]*?)(?=\n\s*\n|\n\s*-\s*[A-Z]+:|$)/.exec(s);
    sections.push({
      name: m[1], rating: imp ? imp[1].trim() : '',
      peak: peak ? unwrap(peak[1]) : (sit ? unwrap(sit[1]) : ''),
      act: act ? unwrap(act[1]) : ''
    });
  }
  return { name: place(a.area), towns: towns, sections: sections, url: nwsZoneURL((a.ugc || [])[0]) };
}
var DZ = { key: null, zone: 0 };
function missingHTML() {
  return '<main><div class="empty"><h2>This alert isn’t in the last 7 days of alerts.</h2><p>It may have ended some time ago. <a href="/">See all current alerts</a>, or check <a href="' + NWS_PAGE + '" target="_blank" rel="noopener">weather.gov/hfo</a>.</p></div></main>';
}
function detailTitle(c) { return c.event + ' · ' + titleCase(c.where); }
function detailDesc(c) { return clip((c.active ? '' : 'Ended. ') + c.head + '. ' + c.body.replace(' Open for the danger ratings in your area.', ''), 155); }
function detailHTML(c) {
  var L = c.threads[0].latest;
  var first = Math.min.apply(null, c.threads.map(function (t) { return t.first.sent; }));
  var zones = c.threads.map(function (t) { return parseZone(t.latest); }).filter(function (z) { return z.sections.length; });
  zones.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  if (DZ.key !== c.id) { DZ.key = c.id; DZ.zone = 0; }
  var h = '<main><section class="d-head"><div class="d-in">' +
    '<div class="c-ev"><span class="tag n t-' + c.level + '">' + c.level + '</span><span class="ev">' + esc(c.event) + '</span></div>' +
    '<h1>' + esc(c.head) + '</h1>' +
    '<div class="facts">' +
    '<div><span class="n">' + (c.threads[0].msgs.length > 1 ? 'UPDATED' : 'ISSUED') + '</span><b>' + esc(whenShort(L.sent)) + '</b></div>' +
    '<div><span class="n">' + (c.active ? 'IN EFFECT' : 'STATUS') + '</span><b>' + esc(c.until || (c.active ? 'Now' : 'Ended')) + '</b></div>' +
    (c.threads[0].msgs.length > 1 ? '<div><span class="n">FIRST ISSUED</span><b>' + esc(whenShort(first)) + '</b></div>' : '') +
    '<div><span class="n">ISSUED BY</span><b>NWS Honolulu</b></div></div>' +
    '<p>' + esc(c.body) + '</p></div>' +
    '<div class="acts"><button type="button" class="share" id="share"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 10V2M4.5 5.5L8 2l3.5 3.5M3 9v5h10V9"/></svg><span>SHARE</span></button>' +
    '<a class="mapl" href="' + mapHref(c.isl) + '">' + MAPICON + '<span>SEE ON MAP</span></a>' +
    '<a class="src" href="' + esc(c.url) + '" target="_blank" rel="noopener">OFFICIAL SOURCE' + ARROW + '</a></div></section>';

  if (zones.length) {
    var z = zones[Math.min(DZ.zone, zones.length - 1)];
    h += rule(zones.length > 1 ? 'FIND YOUR AREA' : 'DANGER IN THIS AREA') + '<section class="panel">';
    if (zones.length > 1) {
      h += '<p>NWS rates the danger separately for each of the ' + zones.length + ' areas under this ' + esc(c.event.toLowerCase().replace(/^.*\s/, '')) + '. Pick yours.</p><div class="zones" role="group" aria-label="Forecast area">' +
        zones.map(function (x, i) {
          return '<button type="button" data-z="' + i + '" aria-pressed="' + (x === z) + '"><b>' + esc(x.towns.length ? x.towns.join(' · ') : x.name) + '</b><span class="n">' + esc(x.name.toUpperCase()) + '</span></button>';
        }).join('') + '</div>';
    }
    h += '<div class="threats"><div class="zt"><b>' + esc(z.towns.length ? z.towns.join(' · ') : z.name) + '</b><span>' + esc(z.name) + ' forecast zone' + (z.url ? ' · <a href="' + esc(z.url) + '" target="_blank" rel="noopener">NWS text for this area</a>' : '') + '</span></div>' +
      z.sections.map(function (s) {
        var n = IMPACT[s.rating] != null ? IMPACT[s.rating] : 0;
        var bars = [1, 2, 3, 4].map(function (i) { return '<i' + (i <= n ? ' class="on"' : '') + '></i>'; }).join('');
        return '<div class="thr"><div class="h"><span class="n">' + esc(s.name) + '</span><span class="bars" aria-hidden="true">' + bars + '</span></div>' +
          (s.rating ? '<b>' + esc(s.rating) + ' impact</b>' : '') + (s.peak ? '<small>' + esc(s.peak) + '</small>' : '') + '</div>';
      }).join('') + '</div><p class="fine">Ratings are NWS’s own, on its scale from limited to devastating or catastrophic.</p></section>';
    var acts = z.sections.filter(function (s) { return s.act; });
    if (acts.length) {
      h += rule('WHAT NWS SAYS TO DO') + '<section class="rows">' + acts.map(function (s) {
        return '<div><span class="n">' + esc(s.name === 'FLOODING RAIN' ? 'FLOOD' : s.name === 'STORM SURGE' ? 'SURGE' : s.name) + '</span><span>' + esc(s.act) + '</span></div>';
      }).join('') + '</section>';
    }
  } else if (L.instr) {
    h += rule('WHAT NWS SAYS TO DO') + '<section class="rows"><div><span class="n">ACTION</span><span>' + esc(unwrap(L.instr)) + '</span></div></section>';
  }

  var hist = c.threads[0].msgs.slice().reverse();
  if (hist.length > 1 || c.event === 'Tropical Cyclone Local Statement') {
    h += rule('HISTORY') + '<section class="rows">' + hist.slice(0, 8).map(function (m, i) {
      var what = m.type === 'Cancel' ? 'Cancelled.' : i === hist.length - 1 ? 'Issued.' : 'Updated.';
      return '<div><span>' + esc(whenShort(m.sent)) + '</span><span><b>' + what + '</b> ' + esc(sentence(m.nhead, m.event) || m.event) + '</span></div>';
    }).join('') + '</section>';
  }
  var full = unwrap(L.desc).replace(/\n{3,}/g, '\n\n');
  if (full) h += '<details class="full"><summary>READ THE FULL NWS TEXT</summary><pre>' + esc(L.desc.trim()) + (L.instr ? '\n\n' + esc(L.instr.trim()) : '') + '</pre></details>';

  var rel = S.cards.filter(function (x) { return x !== c && x.active && x.isl.some(function (i) { return c.isl.indexOf(i) > -1; }); }).slice(0, 4);
  if (rel.length) {
    h += rule('ALSO IN EFFECT ON THESE ISLANDS') + '<div class="tiles" style="display:flex;flex-direction:column">' + rel.map(function (x) {
      var href = x.detail ? alertPath(x) : x.url;
      return '<a class="rel" href="' + href + '"><span class="h"><span class="tag n t-' + x.level + '">' + x.level + '</span><span class="ev">' + esc(x.event) + '</span><time>' + esc(x.timed ? whenShort(x.t) : '') + '</time></span><b>' + esc(x.head) + '</b></a>';
    }).join('') + '</div>';
  }
  h += '</main>';
  return h;
}

