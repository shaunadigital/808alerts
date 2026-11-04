/* Checks what the feed says to screen readers when a refresh brings new NWS data.
 * Each case builds two snapshots of alert data and compares them.
 *   python3 tools/site/build.py && node tools/site/test-announce.mjs */
import * as C from '../../functions/_lib/core.js';
const S = C.S;
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '\n       got  ' + JSON.stringify(got) + '\n       want ' + JSON.stringify(want))); };

const now = Date.now();
const t0 = now - 20 * 6e4;
let n = 0;
const msg = (event, ugc, o = {}) => ({ id: 'urn:oid:2.49.0.1.840.0.test.' + (++n), sent: o.sent || t0, expires: (o.sent || t0) + 864e5, ends: 0, event, type: o.type || 'Alert', status: 'Actual',
  area: 'Somewhere', ugc, refs: o.refs || [], nhead: '', awips: '', headline: '', desc: '', instr: '' });

function load(status, active) {
  S.nws = { status, at: status === 'ok' ? now : now - 36e5, active: status === 'ok' ? active : (active || []), history: [], historyAt: now };
  S.roads = { status: 'ok', at: now, items: [] };
  S.shelters = { status: 'ok', at: now, items: [], edited: 0 };
  S.heco = { status: 'ok', at: now, items: [] };
  S.checkedAt = now;
  C.assemble();
}
const T = (t) => C.tm(t);
// rec from the first snapshot, then the result of comparing the second
function step(isl, first, second) {
  first(); let r = C.announce(null, C.alertSnapshot(isl), isl);
  eq('page load says nothing', [r.polite, r.assertive], ['', '']);
  second(); return C.announce(r.rec, C.alertSnapshot(isl), isl);
}

// 1. quiet to warning
let ffw = msg('Flash Flood Warning', ['HIZ033'], { sent: now - 6e4 });
let r = step('ALL', () => load('ok', []), () => load('ok', [ffw]));
eq('quiet to warning: assertive', r.assertive, 'New warning: Flash Flood Warning for Oʻahu, issued ' + T(ffw.sent) + '.');
eq('quiet to warning: level line is polite', r.polite, 'Alert level for all islands is now Warning.');

// 2. same data again: nothing
const rec = r.rec;
r = C.announce(rec, C.alertSnapshot('ALL'), 'ALL');
eq('unchanged refresh says nothing', [r.polite, r.assertive], ['', '']);

// 3. a new advisory goes to polite
let fwa = msg('Flood Watch', ['HIZ033']);
let adv = msg('Wind Advisory', ['HIZ053'], { sent: now - 2 * 6e4 });
r = step('ALL', () => load('ok', [fwa]), () => load('ok', [fwa, adv]));
eq('new advisory: polite', r.polite, 'New advisory: Wind Advisory for Hawaiʻi Island, issued ' + T(adv.sent) + '.');
eq('new advisory: nothing assertive', r.assertive, '');

// 4. watch upgraded to a warning in the same thread (the old message drops out of the active list)
let hwa = msg('Hurricane Watch', ['HIZ053']);
let hwr = msg('Hurricane Warning', ['HIZ053'], { sent: now - 6e4, refs: [hwa.id] });
r = step('HAW', () => load('ok', [hwa]), () => load('ok', [hwr]));
eq('upgrade: assertive', r.assertive, 'Hurricane Watch for Hawaiʻi Island is now a Hurricane Warning, issued ' + T(hwr.sent) + '.');
eq('upgrade: hero level', r.polite, 'Alert level for Hawaiʻi Island is now Warning.');

// 5. an update to the same alert at the same level is not news
let upd = msg('Flood Watch', ['HIZ033'], { sent: now - 6e4, refs: [fwa.id] });
r = step('ALL', () => load('ok', [fwa]), () => load('ok', [upd]));
eq('same-level update says nothing', [r.polite, r.assertive], ['', '']);

// 6. more than 3 new at once: one summary line naming the most serious
const many = [msg('High Surf Advisory', ['HIZ030']), msg('Wind Advisory', ['HIZ033']), msg('Flood Watch', ['HIZ018']), msg('Flash Flood Warning', ['HIZ053'], { sent: now - 3 * 6e4 }), msg('Small Craft Advisory', ['PHZ110'])];
r = step('ALL', () => load('ok', []), () => load('ok', many));
eq('summary: assertive names the warning', r.assertive, '5 new alerts. Most serious: Flash Flood Warning for Hawaiʻi Island, issued ' + T(now - 3 * 6e4) + '.');
eq('summary: no per-alert lines', r.polite, 'Alert level for all islands is now Warning.');

// 7. another island's alert is not announced on an island page
r = step('KAU', () => load('ok', []), () => load('ok', [msg('Flash Flood Warning', ['HIZ053'])]));
eq('other island ignored', [r.polite, r.assertive], ['', '']);

// 8. warning ends: back to quiet
r = step('ALL', () => load('ok', [ffw]), () => load('ok', []));
eq('back to quiet', r.polite, 'Alert level for all islands is now quiet, no warnings, watches or advisories.');

// 9. NWS stops answering: said once, then not again, then recovery
load('ok', [fwa]); r = C.announce(null, C.alertSnapshot('ALL'), 'ALL');
load('fail', [fwa]); r = C.announce(r.rec, C.alertSnapshot('ALL'), 'ALL');
eq('outage announced once', r.polite, 'Can’t reach the National Weather Service. Alerts on this page may be out of date. Retrying every minute.');
eq('outage is polite', r.assertive, '');
r = C.announce(r.rec, C.alertSnapshot('ALL'), 'ALL');
eq('outage not repeated', r.polite, '');
let late = msg('Flash Flood Warning', ['HIZ018'], { sent: now - 6e4 });
load('ok', [fwa, late]); r = C.announce(r.rec, C.alertSnapshot('ALL'), 'ALL');
eq('recovery is said, polite', r.polite, 'The National Weather Service is answering again. Alert level for all islands is now Warning.');
eq('alert issued during the outage is announced', r.assertive, 'New warning: Flash Flood Warning for Maui, issued ' + T(late.sent) + '.');

// 10. NWS already down at page load: nothing on load, nothing on later failed refreshes
load('fail', []); r = C.announce(null, C.alertSnapshot('ALL'), 'ALL');
r = C.announce(r.rec, C.alertSnapshot('ALL'), 'ALL');
eq('down from the start stays quiet', [r.polite, r.assertive], ['', '']);
load('ok', [ffw]); r = C.announce(r.rec, C.alertSnapshot('ALL'), 'ALL');
eq('first good answer after a failed load only records', [r.polite, r.assertive], ['', '']);

// 11. another source going down is said once
load('ok', []); r = C.announce(null, C.alertSnapshot('OAH'), 'OAH');
load('ok', []); S.heco.status = 'fail'; r = C.announce(r.rec, C.alertSnapshot('OAH'), 'OAH');
eq('Hawaiian Electric down', r.polite, 'Couldn’t load Hawaiian Electric updates. Retrying every minute.');
r = C.announce(r.rec, C.alertSnapshot('OAH'), 'OAH');
eq('not repeated', r.polite, '');

// banners carry no live role of their own any more
load('fail', []);
eq('NWS banner has no role=status', C.bannerHTML('ALL').includes('role='), false);

console.log(fail ? fail + ' failed' : 'all passed');
process.exit(fail ? 1 : 0);
