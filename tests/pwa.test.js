const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILE = process.argv[2];
const ROOT = path.dirname(path.resolve(FILE));
const html = fs.readFileSync(FILE, 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
};

console.log('1. the app is installable (a real PWA, not just a bookmark)');
const manifestPath = path.join(ROOT, 'manifest.json');
let man = null;
try { man = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); ok('manifest.json is valid JSON', true); }
catch (e) { ok('manifest.json is valid JSON', false, e.message); }

if (man) {
  ok('linked from the page', /<link rel="manifest" href="manifest\.json">/.test(html));
  ok('has a name and a short name', !!man.name && !!man.short_name, man.name + ' / ' + man.short_name);
  ok('opens standalone, with no browser bars', man.display === 'standalone', man.display);
  ok('theme and background match the app background',
    man.theme_color === '#0a0e1a' && man.background_color === '#0a0e1a',
    man.theme_color + ' / ' + man.background_color);
  ok('start_url and scope are relative so it works in a subfolder',
    /^\.\//.test(man.start_url) && /^\.\//.test(man.scope), man.start_url + ' ' + man.scope);

  const sizes = man.icons.map(i => i.sizes);
  ok('ships a 192 and a 512 icon', sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
  ok('ships a maskable icon for Android adaptive shapes',
    man.icons.some(i => /maskable/.test(i.purpose || '')), man.icons.map(i => i.purpose).join(','));

  let missing = [];
  man.icons.forEach(i => {
    const p = path.join(ROOT, i.src);
    if (!fs.existsSync(p)) missing.push(i.src);
    else if (fs.statSync(p).size < 300) missing.push(i.src + ' (too small to be a real png)');
  });
  ok('every icon in the manifest exists on disk', missing.length === 0, missing.join(', '));
  ok('the apple touch icon exists', fs.existsSync(path.join(ROOT, 'icons/apple-touch-icon.png')));
  ok('the apple touch icon is linked for iOS home screens',
    /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/.test(html));
  ok('a theme colour is declared for the address bar',
    /<meta name="theme-color" content="#0a0e1a">/.test(html));
}

console.log('2. the icons are real PNGs of the right size');
{
  const check = (name, want) => {
    const p = path.join(ROOT, 'icons', name);
    if (!fs.existsSync(p)) { ok(name + ' exists', false); return; }
    const b = fs.readFileSync(p);
    const sig = b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    ok(name + ' is a ' + want + 'x' + want + ' PNG', sig && w === want && h === want,
      sig ? w + 'x' + h + ' sig ok' : 'bad signature');
  };
  check('icon-192.png', 192);
  check('icon-512.png', 512);
  check('icon-maskable-192.png', 192);
  check('icon-maskable-512.png', 512);
  check('apple-touch-icon.png', 180);
}

console.log('3. the service worker makes it work with no signal');
const swPath = path.join(ROOT, 'sw.js');
ok('sw.js exists', fs.existsSync(swPath));
if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');
  ok('it precaches the app shell', /addAll\(SHELL\)/.test(sw));
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  const listed = shell ? [...shell[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
  let absent = listed.filter(p => !fs.existsSync(path.join(ROOT, p)));
  ok('every precached path exists (' + listed.length + ' entries)', absent.length === 0, absent.join(', '));
  ok('the page itself is precached', listed.includes('./index.html'), listed.join(' '));
  ok('page loads try the network first, so updates land', /req\.mode === 'navigate'/.test(sw) && /fetch\(req\)/.test(sw));
  ok('a failed page load falls back to the cache', /catch\(\(\) => caches\.match\('\.\/index\.html'\)/.test(sw));
  ok('old caches are cleaned up on activate', /caches\.delete/.test(sw));
  ok('the cache name carries a version to bust', /const CACHE = 'mental-maths-' \+ VERSION/.test(sw));
  ok('a new version takes over immediately', /skipWaiting/.test(sw) && /clients\.claim/.test(sw));
  ok('it ignores anything cross-origin and anything that is not a GET', /req\.method !== 'GET'/.test(sw) && /url\.origin !== self\.location\.origin/.test(sw));
}

console.log('4. the page registers it without breaking anywhere');
{
  ok('registers a service worker', /navigator\.serviceWorker\.register\(SW_URL\)/.test(src));
  ok('sw.js is the registered path', /const SW_URL = 'sw\.js'/.test(src));
  ok('registration failure is swallowed, not thrown', /\.catch\(\(\) => \{\}\)/.test(src));
  ok('no service worker is attempted on file://', /fileMode\(\)\) return/.test(src));
  ok('the install button is wired up', /\$\('btn-install'\)\.addEventListener\('click'/.test(src));
  ok('beforeinstallprompt is captured rather than lost', /beforeinstallprompt/.test(src) && /e\.preventDefault\(\)/.test(src));
  ok('already-installed hides the install card again', /navigator\.standalone === true/.test(src));
  ok('a new version is announced instead of silently swapping', /A new version is ready/.test(src));

  const declaredIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  ['install-card', 'btn-install', 'install-note'].forEach(id => {
    ok('the page declares id="' + id + '"', declaredIds.has(id));
  });
  const usedIds = new Set([...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  const missing = [...usedIds].filter(id => !declaredIds.has(id));
  ok('every referenced id exists (' + usedIds.size + ' ids)', missing.length === 0, missing.join(', '));
}

console.log('5. the home screen shortcuts go somewhere real');
{
  ok('the manifest offers shortcuts', Array.isArray(man && man.shortcuts) && man.shortcuts.length > 0);
  const sc = man ? man.shortcuts : [];
  ok('each shortcut url is relative', sc.every(s => /^\.\//.test(s.url)), sc.map(s => s.url).join(' '));
  const handled = [...src.matchAll(/go === '([a-z]+)'/g)].map(m => m[1]);
  const unhandled = sc.map(s => new URL(s.url, 'https://x/').searchParams.get('go')).filter(g => !handled.includes(g));
  ok('every shortcut is handled at startup', unhandled.length === 0,
    'handled: ' + handled.join(',') + ' unhandled: ' + unhandled.join(','));
  ok('the abacus shortcut opens the abacus view', /go === 'abacus'\) \{[^}]*setView\('abacus'/.test(src));
  ok('the abacus shortcut draws the frame instead of opening it empty',
    /go === 'abacus'\) \{ abNotes\(\); abClear\(\); setView\('abacus'/.test(src),
    'the shortcut must clear/render, not just switch the view');
}

console.log('6. it still boots');
{
  const els = new Map();
  const fakeEl = id => {
    const el = {
      id, style: { setProperty() {} }, dataset: {}, value: '', textContent: '', innerHTML: '', children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      appendChild(c) { el.children.push(c); }, addEventListener() {}, setAttribute() {},
      removeEventListener() {}, querySelectorAll: () => [], closest: () => null, scrollIntoView() {}
    };
    return el;
  };
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, Set,
    setTimeout: f => { f(); return 0; }, requestAnimationFrame: () => 0,
    performance: { now: () => 1 }, window: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
      querySelectorAll: () => [], createElement: () => fakeEl('x'), addEventListener: () => {}, hidden: false, body: fakeEl('body')
    }
  });
  const stripped = src.replace(/^renderHome\(\);$/m, '').replace(/^wire\(\);$/m, '');
  let err = null;
  try { vm.runInContext(stripped, ctx); } catch (e) { err = e; }
  ok('the script still evaluates with no navigator and no location', err === null, err && err.message);
}

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall checks passed');
process.exit(fails ? 1 : 0);
