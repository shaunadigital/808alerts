/* Checks the hero logic against hand-built NWS data, including a wind window
 * written the way NWS Honolulu's TCV writes it (Hurricane Hone, 2024-08-24).
 *   python3 tools/site/build.py && node tools/site/test-hero.mjs */
import * as C from '../../functions/_lib/core.js';
const S = C.S;
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
const has = (name, s, sub) => eq(name, String(s).includes(sub), true);
const not = (name, s, sub) => eq(name, String(s).includes(sub), false);

function reset(status) {
  S.nws = { status, at: status === 'ok' ? Date.now() : (status === 'fail' ? Date.now() - 36e5 : 0), active: [], history: [], historyAt: Date.now() };
  S.roads = { status: 'ok', at: Date.now(), items: [] };
  S.shelters = { status: 'ok', at: Date.now(), items: [], edited: 0 };
  S.heco = { status: 'ok', at: Date.now(), items: [] };
  S.checkedAt = Date.now();
}
const HST = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h + 10);
const TCV = `* WIND:
    - LATEST LOCAL FORECAST: Equivalent Tropical Storm force wind
        - Peak Wind Forecast: 40-50 mph with gusts to 65 mph
        - Window for Tropical Storm force winds: early Saturday
          afternoon until early Sunday morning

    - THREAT TO LIFE AND PROPERTY THAT INCLUDES TYPHOON...`;

// windowStart reads each part of day as its earliest hour, in HST
const fri11pm = HST(2024, 8, 23, 23);
eq('early Saturday afternoon -> Sat noon HST', C.__ws('early Saturday afternoon', fri11pm).t, HST(2024, 8, 24, 12));
eq('Saturday evening -> Sat 6 PM', C.__ws('Saturday evening', fri11pm).t, HST(2024, 8, 24, 18));
eq('early Monday morning -> Mon midnight', C.__ws('early Monday morning', fri11pm).t, HST(2024, 8, 26, 0));
eq('tonight -> same day 6 PM', C.__ws('tonight', HST(2024, 8, 24, 9)).t, HST(2024, 8, 24, 18));
eq('this afternoon -> same day noon', C.__ws('this afternoon', HST(2024, 8, 24, 9)).t, HST(2024, 8, 24, 12));
eq('Friday from a Friday is the same day', C.__ws('Friday night', HST(2024, 8, 23, 9)).t, HST(2024, 8, 23, 18));
eq('nonsense gives no window', C.__ws('soon-ish', fri11pm), null);

// warning with a wind window 31.5 hours out
reset('ok');
const sent = Date.now() - 6e5;
S.nws.active = [{ id: 'urn:oid:2.49.0.1.840.0.' + 'a'.repeat(40) + '.001.1', sent, expires: sent + 864e5, ends: 0, event: 'Hurricane Warning', type: 'Alert', status: 'Actual',
  area: 'Big Island North', ugc: ['HIZ054'], refs: [], nhead: '', awips: 'TCVHFO', headline: '', desc: TCV, instr: '' }];
C.assemble();
const html = C.heroHTML('ALL');
has('warning word', html, 'data-c="W"');
has('warning level class', html, 'hw lv-WARNING');
has('summary names the event', html, 'Hurricane Warning for Hawaiʻi Island');
has('countdown appears', html, 'TROPICAL-STORM-FORCE WINDS COULD START ON HAWAIʻI ISLAND');
has('countdown cites the NWS window', html, 'early Saturday afternoon until early Sunday morning');
not('no get-ready block during a warning', html, 'A GOOD DAY');
eq('Oʻahu page has no countdown for a Big Island window', C.heroHTML('OAH').includes('COULD START'), false);
has('Oʻahu page is quiet', C.heroHTML('OAH'), 'hw lv-QUIET');
has('Hawaiʻi Island page gets the countdown', C.heroHTML('HAW'), 'COULD START ON HAWAIʻI ISLAND');
const cty = C.countiesHTML('HAW');
has('county board marks the current page', cty, 'aria-current="page"');
has('Big Island tile is red', cty, 'fill="#c22e22"');
has('Kauaʻi tile says no alerts', cty, 'No active alerts');

// quiet
reset('ok'); C.assemble();
const q = C.heroHTML('ALL');
has('quiet word', q, 'hw lv-QUIET');
has('quiet is not an all clear', q, 'Not an all clear');
has('quiet offers get ready', q, 'A GOOD DAY TO GET READY');

// NWS unreachable never reads as quiet
reset('fail'); C.assemble();
const u = C.heroHTML('ALL');
has('unreachable says unknown', u, 'hw lv-UNKNOWN');
not('unreachable is never quiet', u, 'lv-QUIET');
has('unreachable points to weather.gov', u, 'weather.gov/hfo');
has('county tiles show as-of time', C.countiesHTML('ALL'), 'data-c="A"');

// signature changes when the level changes
reset('ok'); C.assemble(); const s1 = C.heroSig('ALL');
reset('fail'); C.assemble(); const s2 = C.heroSig('ALL');
eq('signature changes with level', s1 === s2, false);
console.log(fail ? fail + ' FAILED' : 'all passed');
process.exit(fail ? 1 : 0);
