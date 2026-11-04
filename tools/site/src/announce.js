
/* ---------- screen reader announcements (added 2026-11-04) ----------
   The feed redraws itself every minute, which a screen reader user cannot see.
   alertSnapshot() records what is showing for one island filter; announce()
   compares the last record with a new one and returns the sentences to speak.
   No DOM here, so the server copy can be tested in Node (test-announce.mjs).
   ui.js calls it only after a refresh, never on the 30-second redraw or the
   ended-alerts toggle, and the first call only records (nothing on page load). */
var LV_WORD = { WARNING: 'warning', WATCH: 'watch', ADVISORY: 'advisory', STATEMENT: 'statement' };
var HERO_WORD = { WARNING: 'Warning', WATCH: 'Watch', ADVISORY: 'Advisory', STATEMENT: 'Statement', QUIET: 'quiet, no warnings, watches or advisories' };

function alertSnapshot(isl) {
  var items = nwsActiveFor(isl).map(function (c) {
    // Every message id in the card's threads, and every id those messages
    // reference, so an update still matches the alert it updates even when
    // the older message is no longer in the active list.
    var ids = [];
    c.threads.forEach(function (t) {
      if (t.latest.event === 'Tropical Cyclone Local Statement') ids.push('TCLS');
      t.msgs.forEach(function (m) { ids.push(m.id); m.refs.forEach(function (r) { ids.push(r); }); });
    });
    return { ids: uniq(ids), level: c.level, event: c.event, where: placeList(c.where), t: c.t };
  });
  var down = [];
  if ((isl === 'ALL' || isl === 'HAW') && (S.roads.status === 'fail' || S.shelters.status === 'fail')) down.push('Hawaiʻi County Civil Defense road closures and shelters');
  if (isl !== 'KAU' && S.heco.status === 'fail') down.push('Hawaiian Electric updates');
  return { nws: S.nws.status, level: levelFor(isl), items: items, down: down };
}

function sameAlert(a, b) { return a.ids.some(function (id) { return b.ids.indexOf(id) > -1; }); }
function alertLine(it) { return it.event + ' for ' + it.where + ', issued ' + tm(it.t); }

// rec is what the last call returned (null on the first call). Returns
// { rec, polite, assertive }; an empty string means say nothing in that region.
function announce(rec, snap, isl) {
  var scope = isl === 'ALL' ? 'all islands' : FILTER_NAME[isl];
  var out = { rec: rec, polite: '', assertive: '' };
  if (!rec) {
    // page load: record, say nothing, even when a source is already down
    out.rec = { base: snap.nws === 'ok' ? snap : null, nwsDown: snap.nws === 'fail', said: false, down: snap.down };
    return out;
  }
  var polite = [], loud = [];
  var r = { base: rec.base, nwsDown: rec.nwsDown, said: rec.said, down: snap.down };

  snap.down.filter(function (d) { return rec.down.indexOf(d) < 0; }).forEach(function (d) { polite.push('Couldn’t load ' + d + '. Retrying every minute.'); });

  if (snap.nws === 'fail') {
    if (!rec.nwsDown) { polite.unshift('Can’t reach the National Weather Service. Alerts on this page may be out of date. Retrying every minute.'); r.said = true; }
    r.nwsDown = true;
    out.rec = r; out.polite = polite.join(' ');
    return out;
  }
  if (snap.nws !== 'ok') { out.rec = r; out.polite = polite.join(' '); return out; }

  if (rec.nwsDown && rec.said) polite.unshift('The National Weather Service is answering again.');
  r.nwsDown = false; r.said = false;
  r.base = snap;
  if (!rec.base) { out.rec = r; out.polite = polite.join(' '); return out; } // first good answer: record only

  var prev = rec.base.items;
  var fresh = [], changed = [];
  snap.items.forEach(function (it) {
    var old = prev.filter(function (p) { return sameAlert(p, it); })[0];
    if (!old) fresh.push(it);
    else if (old.level !== it.level || old.event !== it.event) changed.push({ old: old, it: it });
  });

  if (fresh.length > 3) {
    var top = fresh.slice().sort(function (a, b) { return (LV_RANK[b.level] || 0) - (LV_RANK[a.level] || 0) || b.t - a.t; })[0];
    var line = fresh.length + ' new alerts. Most serious: ' + alertLine(top) + '.';
    (top.level === 'WARNING' ? loud : polite).push(line);
  } else {
    fresh.forEach(function (it) {
      var line = 'New ' + (LV_WORD[it.level] || 'alert') + ': ' + alertLine(it) + '.';
      (it.level === 'WARNING' ? loud : polite).push(line);
    });
  }
  changed.forEach(function (c) {
    var up = (LV_RANK[c.it.level] || 0) > (LV_RANK[c.old.level] || 0);
    var line = c.old.event + ' for ' + c.old.where + ' is now ' +
      (c.it.event !== c.old.event ? (/^[AEIOU]/.test(c.it.event) ? 'an ' : 'a ') + c.it.event : 'a ' + (LV_WORD[c.it.level] || 'alert')) +
      (c.it.where !== c.old.where ? ' for ' + c.it.where : '') + ', issued ' + tm(c.it.t) + '.';
    (up && c.it.level === 'WARNING' ? loud : polite).push(line);
  });
  if (rec.base.level !== snap.level && HERO_WORD[snap.level]) polite.push('Alert level for ' + scope + ' is now ' + HERO_WORD[snap.level] + '.');

  out.rec = r; out.polite = polite.join(' '); out.assertive = loud.join(' ');
  return out;
}
