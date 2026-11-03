"""Builds the 808 Alerts pages from tools/site/src/.

    python3 tools/site/build.py

Writes, at the repo root: index.html, oahu-alerts/, maui-alerts/,
hawaii-island-alerts/, kauai-alerts/ and big-island-road-closures/ (each an
index.html), plus functions/_middleware.js, functions/_lib/core.js and
_routes.json for Cloudflare Pages. Edit the files in src/, never the outputs.

The page script is src/core.js + src/core-extra.js (data and HTML building,
shared with the server) and src/ui.js (browser only). The server copy in
functions/_lib/core.js is generated from the same two core files.
"""
import json, re, os, html as H

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src') + '/'
OUT = os.path.normpath(os.path.join(HERE, '..', '..')) + '/'
isl_paths = open(SRC + 'islands.json').read()
core = open(SRC + 'core.js').read().replace('__ISLAND_PATHS__', isl_paths) + open(SRC + 'core-extra.js').read() + open(SRC + 'hero.js').read()
ui = open(SRC + 'ui.js').read()
browser_js = "(function () {\n'use strict';\n" + core + ui + "\n})();"
font = open(SRC + 'font.css').read()
css = open(SRC + 'style.css').read()
fav = open(SRC + 'favicon.html').read()
tpl = open(SRC + 'page.html').read()

def jsonld(obj):
    return json.dumps(obj, ensure_ascii=False)

def guide(name):
    return open(SRC + 'guides/' + name + '.html').read()

HERO = '''<section class="hero" id="hero">
<div class="h-st"><div class="h-in" id="hstatus"><!--SSR:HERO--><div class="h-k n"><i class="lv-CHECKING"></i>HAWAIʻI RIGHT NOW</div><p class="hw lv-CHECKING"><span class="sr">Checking alerts.</span><span class="flaps" aria-hidden="true" style="--n:8"><b class="fl">C</b><b class="fl">H</b><b class="fl">E</b><b class="fl">C</b><b class="fl">K</b><b class="fl">I</b><b class="fl">N</b><b class="fl">G</b></span></p><p class="h-sum">Checking the National Weather Service…</p><!--/SSR:HERO--></div></div>
<figure class="h-sat" id="hsat">
<div class="frames" id="frames"></div>
<div class="h-chip n"><i></i>LIVE SATELLITE · LAST 3 HOURS</div>
<div class="h-bar"><div class="h-time"><b id="stime">LOADING…</b><span>NOAA/NASA GOES-West</span></div>
<div class="h-btns"><button type="button" class="n" id="sloop" hidden>PAUSE LOOP</button><a class="n pri" id="smap" href="/map/">OPEN MAP →</a></div></div>
<figcaption class="sr">Satellite imagery of the Hawaiian Islands from the GOES-West weather satellite over the last three hours, playing as a loop.</figcaption>
</figure>
</section>
<section class="cty" id="counties"><!--SSR:COUNTIES--><!--/SSR:COUNTIES--></section>
'''

def feed_body(h1, about_h2, about, guide=''):
    return '''<div id="feedwrap">
''' + HERO + '''<h1 class="kick n">''' + h1 + '''</h1>
<div id="banners"><!--SSR:BANNERS--><!--/SSR:BANNERS--></div>
<main id="feed"><noscript><div class="empty"><h2>808 Alerts needs JavaScript to keep alerts current.</h2><p>Go straight to the sources: <a href="https://www.weather.gov/hfo/">NWS Honolulu</a>, <a href="https://dod.hawaii.gov/hiema/">HI-EMA</a>, and your county emergency agency.</p></div></noscript><!--SSR:FEED--><div class="loading">Loading alerts…</div><!--/SSR:FEED--></main>
<section class="aboutfeed"><div><h2>''' + about_h2 + '''</h2>''' + about + '''<div id="now"><!--SSR:NOW--><!--/SSR:NOW--></div></div></section>
''' + ('<div class="guidewrap"><section class="guide">\n' + guide + '\n</section></div>\n' if guide else '<div class="guidewrap"></div>\n') + '''</div>
<div id="detail" hidden></div>'''

ROADS_BODY = '''<div id="feedwrap">
<main class="page">
<h1>Big Island road closures today</h1>
<p class="lead">Every road the County of Hawaiʻi lists as closed or down to one lane, straight from Hawaiʻi County Civil Defense’s road closure map, newest first. The list refreshes every minute while this page is open.</p>
<div id="banners"></div>
<div id="roads"><!--SSR:ROADS--><div class="loading">Loading the county road closure list…</div><!--/SSR:ROADS--></div>
</main>
<div class="guidewrap"><section class="guide">
<h2>State highways are listed separately</h2>
<p>This list is the county’s. Lane closures and roadwork on state highways, such as the Hawaiʻi Belt Road (Route 11 and Route 19), are posted by the Hawaiʻi Department of Transportation.</p>
<ul class="links">
<li><a href="https://hidot.hawaii.gov/highways/roadwork/hawaii/" target="_blank" rel="noopener">HDOT Hawaiʻi Island lane closures<span class="p">Hawaiʻi Department of Transportation</span></a></li>
<li><a href="https://hidot.hawaii.gov/weather-traffic/" target="_blank" rel="noopener">HDOT weather-related traffic alerts<span class="p">Hawaiʻi Department of Transportation</span></a></li>
<li><a href="https://www.arcgis.com/apps/dashboards/5865229bcba74020992b372ef18b6f17" target="_blank" rel="noopener">Hawaiʻi County Civil Defense hazard map<span class="p">Road closures, evacuations and hazards on a map</span></a></li>
<li><a href="https://www.hawaiicounty.gov/departments/civil-defense" target="_blank" rel="noopener">Hawaiʻi County Civil Defense<span class="p">County messages and updates</span></a></li>
</ul>
<h2>Where this list comes from</h2>
<p>Each entry is read from the public road closure layer that Hawaiʻi County Civil Defense and the Department of Public Works maintain. It includes long-term closures, some of them years old, as well as new ones from storms, landslides and flooding. New closures from the last 7 days are marked NEW and also appear in the <a href="/hawaii-island-alerts/">Big Island alerts feed</a>.</p>
<p>A road missing from this list is not necessarily open. The county posts closures as crews confirm them. If you come across a hazard, call 911 when it is an emergency, or Hawaiʻi County Civil Defense at <a href="tel:8089350031">(808) 935-0031</a>.</p>
</section></div>
</div>
<div id="detail" hidden></div>'''

HOME_ABOUT = '<p>808 Alerts brings every official alert for the Hawaiian Islands into one list, newest first: National Weather Service warnings, watches and advisories (hurricanes, tropical storms, flash floods, high surf, high wind and tsunami), Hawaiʻi County Civil Defense road closures and shelter openings, and Hawaiian Electric storm and outage updates. Each alert is tagged with the islands it covers and links to the agency that issued it. Choose an island at the top for <a href="/kauai-alerts/">Kauaʻi</a>, <a href="/oahu-alerts/">Oʻahu</a>, <a href="/maui-alerts/">Maui County</a> or <a href="/hawaii-island-alerts/">Hawaiʻi Island</a> alerts, or see every <a href="/big-island-road-closures/">Big Island road closure</a>.</p>'

PAGES = [
    dict(path='/', out='index.html', page='feed', isl='ALL',
         title='Hawaii Alerts Today: Live Warnings, Road Closures & Outages · 808 Alerts',
         desc='Live Hawaii alerts today for every island: National Weather Service warnings and watches, Big Island road closures and shelters, and Hawaiian Electric outage updates, newest first.',
         h1='Hawaii alerts today · every island, newest first',
         about_h2='Hawaii alerts today, in one place', about=HOME_ABOUT,
         ld={"@context": "https://schema.org", "@type": "WebSite", "name": "808 Alerts", "url": "https://808alerts.com/",
             "description": "Every official alert in Hawaiʻi, newest first, tagged by island. Not an official alert system.", "inLanguage": "en", "isAccessibleForFree": True}),
    dict(path='/oahu-alerts/', out='oahu-alerts/index.html', page='feed', isl='OAH',
         title='Oahu Alerts Today (Oʻahu): Live Warnings & Emergency Info · 808 Alerts',
         desc='Oahu alerts today: live National Weather Service warnings, watches and advisories for Oʻahu and Honolulu, plus evacuation zones, refuge sites and verified emergency numbers.',
         h1='Oʻahu alerts today · newest first',
         about_h2='Oʻahu alerts today',
         about='<p>Every official alert that covers Oʻahu, newest first: National Weather Service warnings, watches and advisories for Honolulu and the rest of the island, and Hawaiian Electric storm and outage updates. Below are the City & County of Honolulu planning links and emergency numbers worth saving while the weather is calm.</p>',
         guide='oahu'),
    dict(path='/maui-alerts/', out='maui-alerts/index.html', page='feed', isl='MAUCO',
         title='Maui Alerts Today: Maui County, Molokaʻi & Lānaʻi Warnings · 808 Alerts',
         desc='Maui alerts today: live National Weather Service warnings and watches for Maui, Molokaʻi, Lānaʻi and Kahoʻolawe, Hawaiian Electric outage updates, evacuation maps and emergency numbers.',
         h1='Maui County alerts today · Maui, Molokaʻi, Lānaʻi',
         about_h2='Maui alerts today',
         about='<p>Every official alert that covers Maui County, newest first: National Weather Service warnings, watches and advisories for Maui, Molokaʻi, Lānaʻi and Kahoʻolawe, and Hawaiian Electric storm and outage updates. Below are the County of Maui planning links and emergency numbers worth saving while the weather is calm.</p>',
         guide='maui'),
    dict(path='/hawaii-island-alerts/', out='hawaii-island-alerts/index.html', page='feed', isl='HAW',
         title='Big Island Alerts Today (Hawaiʻi Island): Warnings & Road Closures · 808 Alerts',
         desc='Big Island alerts today: live National Weather Service warnings, Hawaiʻi County Civil Defense road closures and shelters, and Hawaiian Electric outage updates for Hawaiʻi Island.',
         h1='Big Island alerts today · Hawaiʻi Island, newest first',
         about_h2='Big Island alerts today',
         about='<p>Every official alert that covers Hawaiʻi Island, newest first: National Weather Service warnings, watches and advisories, Hawaiʻi County Civil Defense road closures and shelter openings, and Hawaiian Electric storm and outage updates. New road closures from the last week show here; the full list is on the <a href="/big-island-road-closures/">Big Island road closures</a> page.</p>',
         guide='hawaii-island'),
    dict(path='/kauai-alerts/', out='kauai-alerts/index.html', page='feed', isl='KAU',
         title='Kauai Alerts Today (Kauaʻi): Live Emergency & Weather Alerts · 808 Alerts',
         desc='Kauai alerts today: live National Weather Service warnings, watches and advisories for Kauaʻi and Niʻihau, plus Kauaʻi evacuation zones, refuge status, KIUC outages and emergency numbers.',
         h1='Kauaʻi alerts today · Kauaʻi and Niʻihau, newest first',
         about_h2='Kauaʻi alerts today',
         about='<p>Every official alert that covers Kauaʻi and Niʻihau, newest first, from the National Weather Service. Below are the County of Kauaʻi planning links and emergency numbers worth saving while the weather is calm.</p>',
         guide='kauai'),
    dict(path='/big-island-road-closures/', out='big-island-road-closures/index.html', page='roads', isl='HAW',
         title='Big Island Road Closures Today: Live List (Hawaiʻi Island) · 808 Alerts',
         desc='Big Island road closures today: every road Hawaiʻi County lists as closed or down to one lane, with reasons, locations and alternate routes, updated live from Hawaiʻi County Civil Defense.'),
]

for p in PAGES:
    if p['page'] == 'roads':
        body = ROADS_BODY
        ld = {"@context": "https://schema.org", "@type": "WebPage", "name": "Big Island road closures today", "url": "https://808alerts.com" + p['path'], "description": p['desc'], "inLanguage": "en"}
    else:
        g = p.get('guide')
        guide_html = guide(g) if g else ''
        body = feed_body(H.escape(p['h1'].upper()), p['about_h2'], p['about'], guide_html)
        ld = p.get('ld') or {"@context": "https://schema.org", "@type": "WebPage", "name": p['about_h2'], "url": "https://808alerts.com" + p['path'], "description": p['desc'], "inLanguage": "en"}
    out = (tpl.replace('__PAGE__', p['page']).replace('__ISL__', p['isl'])
           .replace('__TITLE__', H.escape(p['title'], quote=True)).replace('__DESC__', H.escape(p['desc'], quote=True))
           .replace('__PATH__', p['path']).replace('__FAVICON__', fav).replace('__JSONLD__', jsonld(ld))
           .replace('__FONT__', font).replace('__CSS__', css).replace('__BODY__', body).replace('__JS__', browser_js))
    assert '—' not in out, p['path']
    assert not re.search(r'<script[^>]+src=|<link[^>]+stylesheet', out)
    leftover = re.findall(r'__[A-Z]+__', out)
    assert not leftover, (p['path'], leftover)
    os.makedirs(os.path.dirname(OUT + p['out']) or OUT, exist_ok=True)
    open(OUT + p['out'], 'w').write(out)
    print(p['out'], len(out))

# server copy of the shared code
names = ['S', 'setFetchHeaders', 'loadAll', 'loadNWSHistory', 'assemble', 'feedHTML', 'bannerHTML', 'rightNowHTML',
         'findCard', 'alertPath', 'detailHTML', 'detailTitle', 'detailDesc', 'missingHTML', 'roadsHTML', 'mapHref', 'tm',
         'heroHTML', 'countiesHTML', 'heroSig', 'windowStart as __ws']
os.makedirs(OUT + 'functions/_lib', exist_ok=True)
open(OUT + 'functions/_lib/core.js', 'w').write(
    '/* Generated by the build from the page script. Do not edit here. */\n' + core + '\nexport { ' + ', '.join(names) + ' };\n')
open(OUT + 'functions/_middleware.js', 'w').write('/* Generated by tools/site/build.py from tools/site/src/middleware.js. Do not edit here. */\n' + open(SRC + 'middleware.js').read())
open(OUT + '_routes.json', 'w').write(json.dumps({"version": 1, "include": ["/", "/alert/*", "/oahu-alerts/*", "/maui-alerts/*", "/hawaii-island-alerts/*", "/kauai-alerts/*", "/big-island-road-closures/*"], "exclude": []}, indent=2) + '\n')
print('functions written')
