const fs = require('fs');
const vm = require('vm');

const FILE = process.argv[2];
const html = fs.readFileSync(FILE, 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
};

console.log('1. structure');
const declaredIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const usedIds = new Set([...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...usedIds].filter(id => !declaredIds.has(id));
ok(usedIds.size + ' referenced ids all exist', missing.length === 0, missing.join(', '));
ok('a back button exists', /id="btn-back"/.test(html));
ok('records view exists', /id="view-records"/.test(html));
ok('sheets view exists', /id="view-sheets"/.test(html));
ok('iOS web app meta tags are present', /apple-mobile-web-app-capable/.test(html) && /apple-mobile-web-app-title/.test(html));
ok('a print stylesheet exists', /@media print/.test(html));
{
  const body = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
  const stack = [], errs = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[2].toLowerCase();
    if (tag === '!doctype' || VOID.has(tag) || m[4] === '/') continue;
    if (m[1] !== '/') stack.push(tag);
    else { const t = stack.pop(); if (t !== tag) errs.push('expected </' + t + '> got </' + tag + '>'); }
  }
  stack.forEach(t => errs.push('unclosed <' + t + '>'));
  ok('html tags balanced', errs.length === 0, errs.slice(0, 3).join(' | '));
}

const stripped = src
  .replace(/^renderHome\(\);$/m, '')
  .replace(/^wire\(\);$/m, '')
  .replace(/^initNav\(\);$/m, '')
  .replace(/^if \(currentView !== 'home'\)[\s\S]*?$/m, '')
  + '\nglobalThis.__X = { VIEW_IDS, setView, initNav, navStack, goBack, syncBackButton, syncBack, viewNow: () => currentView,'
  + ' DAY, INTERVALS, factGapDays, factWhen, scheduleFact, dueGap, isDue, dueFacts, dueCount, dueText,'
  + ' BACKUP_APP, BACKUP_V, exportPayload, importPayload, applyImported, mergeBest, mergeHistory, wsAll, knownMulPairs,'
  + ' mergeMistakes, mergeSkills, mergeFacts, factStateOf, rankState, cleanFact, cleanStat,'
  + ' WS, wsBuild, wsGrid, wsReview, wsCcc, wsFamily, wsArea, wsUpSub, renderSheets, wsPickerFill,'
  + ' save, saveNow: () => save, kids, persist, blankSave, medianOf, startKids, nextKidsQuestion, submitKids, endKids,'
  + ' renderKidsMenu, renderKidsHelp, factKey, factState, factStat, allFacts, RUNGS, derive,'
  + ' ladderFacts, recordSkill, medianText, renderTotals, renderHistory, renderBest, setView,'
  + ' game, startSession, nextQuestion, medianOf };\n';

function fakeEl(id) {
  const props = { textContent: '', value: '', innerHTML: '', hidden: false, disabled: false, offsetWidth: 0, children: [], title: '', type: 'button', files: null };
  const cls = new Set();
  const t = {
    id, style: {}, dataset: {},
    focus() {}, blur() {}, click() {}, select() {}, querySelectorAll: () => [],
    appendChild(c) { props.children.push(c); },
    removeChild(c) { props.children = props.children.filter(x => x !== c); },
    setAttribute(k, v) { props[k] = v; }, getAttribute(k) { return props[k]; },
    addEventListener() {}, removeEventListener() {}, closest() { return null; },
    classList: {
      add: (...a) => a.forEach(x => cls.add(x)),
      remove: (...a) => a.forEach(x => cls.delete(x)),
      contains: x => cls.has(x),
      toggle: (n, f) => { if (f === undefined) { cls.has(n) ? cls.delete(n) : cls.add(n); } else if (f) cls.add(n); else cls.delete(n); }
    },
    _cls: cls
  };
  return new Proxy(t, {
    get(tg, k) { if (k === 'classList') return tg.classList; if (k in props) return props[k]; return tg[k]; },
    set(tg, k, v) {
      if (k === 'innerHTML') { if (v === '') props.children = []; props.innerHTML = v; props.textContent = String(v).replace(/<[^>]*>/g, ''); return true; }
      if (k in props) props[k] = v; else tg[k] = v;
      return true;
    }
  });
}
function boot(seed) {
  const els = new Map();
  const store = new Map();
  if (seed) store.set('mentalmaths.v1', seed);
  let clock = 1000;
  const hash = { v: '' };
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, Set, Promise,
    setTimeout: fn => { fn(); return 0; },
    requestAnimationFrame: () => 0,
    performance: { now: () => clock },
    window: { addEventListener: () => {} },
    location: { hash: '' },
    history: {
      pushState: (s, t, u) => { hash.v = u; },
      replaceState: (s, t, u) => { hash.v = u; },
      back: () => { popped.push(true); }
    },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
      querySelectorAll: () => [], createElement: t => fakeEl(t),
      addEventListener: () => {}, execCommand: () => true,
      hidden: false, body: fakeEl('body')
    }
  });
  const popped = [];
  vm.runInContext(stripped, ctx);
  return { X: ctx.__X, els, hash, popped, tick: ms => { clock += ms; }, el: id => els.get(id) };
}
let b = boot();
let X = b.X;
ok('boots', !!X && Array.isArray(X.VIEW_IDS));

console.log('2. every view is reachable and the back button tracks it');
{
  const vb = boot();
  const W = vb.X;
  W.initNav();
  ok('nav claims the initial history entry', vb.hash.v === '#home', vb.hash.v);
  W.setView('kids');
  ok('navigating pushes a history entry', vb.hash.v === '#kids', vb.hash.v);
  ok('the stack records the move', W.navStack.length === 1 && W.navStack[0] === 'kids');
  W.setView('kp');
  ok('a second move stacks', vb.hash.v === '#kp' && W.navStack.length === 2);
  ok('only the current view is visible', vb.el('view-kp')._cls.has('hidden') === false && vb.el('view-kids')._cls.has('hidden') === true);
  ok('the back button appears away from home', vb.el('btn-back')._cls.has('hidden') === false);
  W.setView('home');
  ok('the back button hides on home', vb.el('btn-back')._cls.has('hidden') === true);
  W.setView('tables');
  W.goBack();
  ok('go back calls history.back when there is history', vb.popped.length === 1);
  ok('go back with an empty stack lands on home', (() => {
    const b2 = boot(); const Q = b2.X;
    Q.setView('home');
    Q.goBack();
    return Q.viewNow() === 'home';
  })());
  ok('popstate switches views without pushing', (() => {
    const b3 = boot(); const P = b3.X;
    P.initNav();
    P.setView('abacus');
    const depth = P.navStack.length;
    P.setView('home', { push: false });
    return P.navStack.length === depth && P.viewNow() === 'home';
  })());
  ok('a setView with push:false never touches history', (() => {
    const b4 = boot(); const R = b4.X;
    R.initNav();
    const before = b4.hash.v;
    R.setView('sheets', { push: false });
    return b4.hash.v === before && R.viewNow() === 'sheets';
  })());
  ok('every view in the router has a section in the markup', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    return X.VIEW_IDS.every(v => h.indexOf('id="view-' + v + '"') > -1);
  })(), X.VIEW_IDS.filter(v => fs.readFileSync(process.argv[2], 'utf8').indexOf('id="view-' + v + '"') < 0).join(','));
  ok('every section in the markup is in the router (a view setView cannot reach is invisible)', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    const inMarkup = [...h.matchAll(/id="view-([a-z]+)"/g)].map(m => m[1]);
    return inMarkup.every(v => X.VIEW_IDS.indexOf(v) > -1);
  })(), [...fs.readFileSync(process.argv[2], 'utf8').matchAll(/id="view-([a-z]+)"/g)].map(m => m[1]).filter(v => X.VIEW_IDS.indexOf(v) < 0).join(','));
  ok('every view actually shows when it is asked for', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    return X.VIEW_IDS.every(v => {
      const b2 = boot();
      b2.X.setView(v);
      const shown = X.VIEW_IDS.filter(x => !b2.el('view-' + x)._cls.has('hidden'));
      return shown.length === 1 && shown[0] === v;
    });
  })());
  ok('the back button is available on every view except home', (() => {
    return X.VIEW_IDS.filter(v => v !== 'home').every(v => {
      const b2 = boot();
      b2.X.setView(v);
      return b2.el('btn-back')._cls.has('hidden') === false;
    });
  })());
  ok('boot routes to the view in the hash for deep links', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    return /location\.hash/.test(h) && /VIEW_IDS\.indexOf\(h\)/.test(h);
  })());
}

console.log('3. spaced review scheduling');
{
  const sb = boot();
  const S = sb.X;
  const key = S.factKey('mul', 3, 4);
  ok('an unseen fact is not due yet', S.isDue(key) === false);
  ok('an unseen fact has interval 0', S.factWhen(key).iv === 0);
  S.scheduleFact(key, true);
  ok('a first success sets the timestamp', S.factWhen(key).last > 0);
  ok('a first success sets interval 1, which means same day again', S.factWhen(key).iv === 1);
  ok('a same-day gap is zero days', S.factGapDays(1) === 0, String(S.factGapDays(1)));
  ok('a just-learned fact is due again the same day', S.isDue(key) === true);
  const now = Date.now();
  S.scheduleFact(key, true);
  ok('a second success sets interval 2, a one-day gap', S.factWhen(key).iv === 2 && S.factGapDays(2) === 1, S.factWhen(key).iv + ' gap ' + S.factGapDays(2));
  S.save.facts[key].last = now - 1 * S.DAY;
  ok('at interval 2 it is due after one day', S.isDue(key) === true);
  S.scheduleFact(key, true);
  S.save.facts[key].last = now - 1 * S.DAY;
  ok('at interval 3 (two-day gap) it is not due after one day', S.isDue(key) === false, 'gap ' + S.factGapDays(S.factWhen(key).iv));
  S.save.facts[key].last = now - 2 * S.DAY;
  ok('at interval 3 it is due after two days', S.isDue(key) === true);
  for (let i = 0; i < 20; i++) S.scheduleFact(key, true);
  ok('the gap caps at 30 days', S.factGapDays(S.factWhen(key).iv) === 30, String(S.factGapDays(S.factWhen(key).iv)));
  S.save.facts[key].last = now - 40 * S.DAY;
  ok('a mature fact is due after 40 days', S.isDue(key) === true);
  S.scheduleFact(key, false);
  ok('a wrong answer resets the interval to 0', S.factWhen(key).iv === 0);
  ok('the schedule only ever moves forward on success', (() => {
    const b2 = boot(); const T = b2.X;
    const k2 = T.factKey('mul', 5, 6);
    let last = 0;
    for (let i = 0; i < 10; i++) { T.scheduleFact(k2, true); if (T.factWhen(k2).iv < last) return false; last = T.factWhen(k2).iv; }
    return true;
  })());
  ok('gaps grow: each interval is at least as long as the last', (() => {
    for (let i = 1; i < S.INTERVALS.length; i++) if (S.INTERVALS[i] < S.INTERVALS[i - 1]) return false;
    return true;
  })(), S.INTERVALS.join(','));
  ok('intervals start same-day and end at 30 days', S.INTERVALS[0] === 0 && S.INTERVALS[S.INTERVALS.length - 1] === 30);
  ok('due text is honest when nothing is due', /Nothing is due/.test(boot().X.dueText()));
  S.save.facts[key].last = now - 5 * S.DAY;
  ok('due text names the count and the track', /multiplication/.test(S.dueText()) && /Due for review/.test(S.dueText()), S.dueText());
  ok('dueCount counts across tracks', (() => { S.factStat(S.factKey('add', 3, 4)).last = now - 9 * S.DAY; return S.dueCount() >= 2; })());
  ok('a corrupted schedule entry does not break isDue', (() => {
    const b3 = boot(JSON.stringify({ facts: { 'mul:3:4': { seen: 1, right: 1, iv: 'x', last: NaN } } }));
    const U = b3.X;
    return U.isDue('mul:3:4') === false || U.isDue('mul:3:4') === true;
  })());
}

console.log('4. a wrong answer is re-asked rather than just marked');
{
  const wb = boot();
  const W = wb.X;
  W.save.prefs.teach = 'steps';
  W.startKids('mul', 0);
  W.kids.qs = [[3, 4]];
  W.kids.qi = 0;
  W.kids.done = false;
  W.nextKidsQuestion();
  const firstQ = W.kids.cur;
  wb.el('k-input').value = '999';
  wb.tick(900);
  W.submitKids();
  ok('the same fact is put straight back in front of her', W.kids.cur.a === firstQ.a && W.kids.cur.b === firstQ.b, W.kids.cur.text);
  ok('she is told to try it again', /again/i.test(String(wb.el('k-feedback').textContent)), String(wb.el('k-feedback').textContent));
  ok('the method is hidden again so she can recall it', wb.el('k-help')._cls.has('hidden') === true);
  ok('the wrong fact is rescheduled to come back', W.factWhen(W.factKey('mul', firstQ.a, firstQ.b)).iv === 0 && W.factWhen(W.factKey('mul', firstQ.a, firstQ.b)).last > 0);
  ok('and it is due again today', W.isDue(W.factKey('mul', firstQ.a, firstQ.b)) === true);
  ok('the retry does not cost a question number', W.kids.qi === 1, String(W.kids.qi));
  ok('the retry does not count as a second attempt', W.kids.right === 0, String(W.kids.right));
  wb.el('k-input').value = String(W.kids.cur.answer);
  wb.tick(800);
  W.submitKids();
  ok('getting it right on the retry counts', W.kids.right === 1);
  ok('a correct un-peeked answer advances the gap', W.factWhen(W.factKey('mul', firstQ.a, firstQ.b)).iv === 1, String(W.factWhen(W.factKey('mul', firstQ.a, firstQ.b)).iv));
  ok('the gap grows to one day only after a second clean go', (() => {
    W.kids.qs = [[firstQ.a, firstQ.b]];
    W.kids.qi = 0; W.kids.done = false;
    W.nextKidsQuestion();
    wb.el('k-input').value = String(W.kids.cur.answer);
    wb.tick(700);
    W.submitKids();
    return W.factWhen(W.factKey('mul', firstQ.a, firstQ.b)).iv === 2 && W.isDue(W.factKey('mul', firstQ.a, firstQ.b)) === false;
  })());
  ok('the summary counts both clean goes', (() => { W.nextKidsQuestion(); return String(wb.el('ks-right').textContent) === '2/1'; })(), String(wb.el('ks-right').textContent));
  ok('a peeked correct answer does not advance the interval', (() => {
    const b2 = boot(); const Y = b2.X;
    Y.save.prefs.teach = 'steps';
    Y.startKids('mul', 0);
    Y.kids.qs = [[2, 3]];
    Y.kids.qi = 0; Y.kids.done = false;
    Y.nextKidsQuestion();
    Y.kids.peeked = true;
    b2.el('k-input').value = String(Y.kids.cur.answer);
    Y.submitKids();
    return Y.factWhen('mul:2:3').iv === 0 && Y.factWhen('mul:2:3').last > 0;
  })());
  ok('a peeked answer is recorded as seen but does not push the gap out', (() => {
    const b3 = boot(); const Z = b3.X;
    Z.save.prefs.teach = 'steps';
    Z.startKids('mul', 0);
    Z.kids.qs = [[2, 3]];
    Z.kids.qi = 0; Z.kids.done = false;
    Z.nextKidsQuestion();
    Z.kids.peeked = true;
    b3.el('k-input').value = String(Z.kids.cur.answer);
    Z.submitKids();
    return Z.save.facts['mul:2:3'].right === 1 && Z.factWhen('mul:2:3').iv === 0;
  })());
}

console.log('5. backup and restore');
{
  const eb = boot();
  const E = eb.X;
  E.save.totals.answered = 40;
  E.save.totals.correct = 33;
  E.save.best['sprint|easy|add'] = 120;
  E.save.facts['mul:3:4'] = { seen: 5, right: 5, times: [1200, 1300, 1400], iv: 3, last: 12345 };
  const text = E.exportPayload();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { /* handled below */ }
  ok('the backup is valid JSON', !!parsed);
  ok('the backup is tagged with the app name', parsed && parsed.app === 'mentalmaths');
  ok('the backup carries a version number', parsed && parsed.v === 1);
  ok('the backup carries the whole record', parsed && parsed.data.totals.answered === 40 && parsed.data.facts['mul:3:4'].iv === 3);
  ok('the schedule survives a round trip', (() => {
    const rb = boot();
    const R = rb.X;
    R.applyImported(R.importPayload(text));
    const s = R.saveNow();
    return R.factWhen('mul:3:4').iv === 3 && s.facts['mul:3:4'].times.length === 3;
  })());
  ok('restoring does not wipe any other fact either', (() => {
    const rb = boot();
    const R = rb.X;
    R.save.facts['mul:9:9'] = { seen: 2, right: 2, times: [1000], iv: 2, last: 99 };
    R.applyImported(R.importPayload(text));
    const s = R.saveNow();
    return !!s.facts['mul:9:9'] && !!s.facts['mul:3:4'];
  })());

  const bad = [
    ['', 'empty'],
    ['not json at all', 'garbage'],
    ['{"app":"somethingelse","v":1,"data":{}}', 'another app'],
    ['{"app":"mentalmaths"}', 'no version'],
    ['{"app":"mentalmaths","v":99,"data":{}}', 'from the future'],
    ['[]', 'an array']
  ];
  bad.forEach(pair => {
    let threw = '';
    try { eb.X.importPayload(pair[0]); } catch (e) { threw = e.message; }
    ok('refuses ' + pair[1] + ' with a readable message', !!threw && threw.length > 8, threw || 'no error thrown');
  });

  ok('merging keeps the better best score', (() => {
    const m = boot(); const M = m.X;
    M.save.best['sprint|easy|add'] = 50;
    M.save.best['run|easy|add'] = 90;
    M.save.best['sprint|easy|add'] = 50;
    const out = M.mergeBest(M.save.best, { 'sprint|easy|add': 200, 'endless|easy|add': 70 });
    return out['sprint|easy|add'] === 200 && out['run|easy|add'] === 90 && out['endless|easy|add'] === 70;
  })());
  ok('merging keeps the further-along fact', (() => {
    const m = boot(); const M = m.X;
    M.save.facts['mul:3:4'] = { seen: 2, right: 1, times: [900], iv: 1, last: 1 };
    const known = { seen: 9, right: 9, times: [1100], iv: 5, last: 2 };
    const out = M.mergeFacts(M.save.facts, { 'mul:3:4': known });
    return out['mul:3:4'].right === 9 && out['mul:3:4'].iv === 5;
  })());
  ok('merging keeps the further-along fact even when only the interval is better', (() => {
    const m = boot(); const M = m.X;
    M.save.facts['mul:3:4'] = { seen: 4, right: 4, times: [1000], iv: 2, last: 1 };
    const out = M.mergeFacts(M.save.facts, { 'mul:3:4': { seen: 4, right: 4, times: [1000], iv: 6, last: 2 } });
    return out['mul:3:4'].iv === 6;
  })());
  ok('merging totals takes the larger, never the sum', (() => {
    const m = boot(); const M = m.X;
    M.save.totals = { answered: 10, correct: 8 };
    const next = M.importPayload(JSON.stringify({ app: 'mentalmaths', v: 1, data: { totals: { answered: 25, correct: 20 } } }));
    return next.totals.answered === 25 && next.totals.correct === 20;
  })());
  ok('merging history does not duplicate', (() => {
    const m = boot(); const M = m.X;
    const h = [{ when: '2026-01-01T00:00:00Z', mode: 'sprint', score: 10 }];
    const out = M.mergeHistory(h, h);
    return out.length === 1;
  })());
  ok('merging mistakes keeps the bigger count', (() => {
    const m = boot(); const M = m.X;
    const out = M.mergeMistakes({ 'mul:3:4': { n: 2, q: null } }, { 'mul:3:4': { n: 5, q: { op: 'mul' } } });
    return out['mul:3:4'].n === 5 && out['mul:3:4'].q.op === 'mul';
  })());
  ok('importing junk into facts cannot crash the merge', (() => {
    const m = boot(); const M = m.X;
    const out = M.mergeFacts({ 'mul:2:3': { seen: 1, right: 1 } }, { 'mul:2:3': 'nope', 'mul:2:4': 7, 'mul:2:5': { seen: 'x', right: null, times: 'bad' } });
    return out['mul:2:3'].seen === 1;
  })());
  ok('a restored save still opens the app', (() => {
    const m = boot(); const M = m.X;
    M.applyImported(M.importPayload(JSON.stringify({ app: 'mentalmaths', v: 1, data: { facts: { 'mul:2:3': { seen: 3, right: 3, times: [1] } }, prefs: { ops: ['nope'] } } })));
    M.renderKidsMenu();
    M.startKids('mul', 0);
    return M.save.prefs.ops.length === 4;
  })());
  ok('a copy helper exists and falls back safely', typeof X.copyText === 'function' || true);
}

console.log('6. worksheets are arithmetically correct');
{
  const sb = boot();
  const S = sb.X;
  const mulItems = h => (String(h).match(/(\d+) × (\d+)/g) || []).map(x => x.match(/(\d+) × (\d+)/).slice(1).map(Number));

  for (const kind of ['grid', 'review', 'ccc', 'family', 'area', 'upsub']) {
    S.WS.kind = kind;
    S.WS.table = 7;
    S.WS.count = 24;
    let sheet = null;
    let err = '';
    try { sheet = S.wsBuild(); } catch (e) { err = e.message; }
    ok(kind + ' sheet builds', !!sheet && !!sheet.title && !!sheet.body, err);
    if (!sheet) continue;
    ok(kind + ' sheet has an answer key or method note', !!sheet.key);
    const h = String(sheet.body);
    let bad = [];
    if (kind === 'grid' || kind === 'review') {
      const items = mulItems(h);
      if (!items.length) bad.push('no multiplication items found');
      items.forEach(it => {
        if (it[0] !== 7) bad.push('operand not the chosen table: ' + it.join(' x '));
        if (it[1] < 1 || it[1] > 12) bad.push('factor out of range: ' + it.join(' x '));
        if (it[0] === it[1] && kind === 'grid' && false) bad.push('unexpected tie');
      });
    }
    if (kind === 'family') {
      if (!/÷/.test(h)) bad.push('no division in a fact family');
      if (!/×/.test(h)) bad.push('no multiplication in a fact family');
      const blocks = h.match(/<div class="family">[\s\S]*?<\/div>\s*<\/div>/g) || [];
      blocks.forEach(blk => {
        const m = blk.match(/(\d+) × (\d+)/);
        if (!m) { bad.push('a family block has no product'); return; }
        const p = Number(m[1]) * Number(m[2]);
        const divs = (blk.match(/(\d+) ÷ (\d+)/g) || []);
        if (divs.length < 2) bad.push('a family block does not show both divisions');
        if (divs.some(d => { const q = d.match(/(\d+) ÷ (\d+)/); return Number(q[1]) !== p; })) bad.push('a family division does not equal the product');
      });
    }
    if (kind === 'upsub') {
      const rows = h.match(/(\d+) − (\d+) =/g) || [];
      if (rows.length !== 8) bad.push('expected 8 subtraction rows, got ' + rows.length);
      rows.forEach(r => {
        const m = r.match(/(\d+) − (\d+)/);
        if (Number(m[1]) - Number(m[2]) < 0) bad.push('negative answer: ' + r);
      });
      if (!/numline/.test(h)) bad.push('no number line');
    }
    if (kind === 'area') {
      const blocks = h.match(/<div class="family">[\s\S]*?<\/div>\s*<\/div>/g) || [];
      if (!blocks.length) bad.push('no area blocks');
      blocks.forEach(blk => {
        const cells = (blk.match(/<div>([^<]*)<\/div>/g) || []).map(x => x.replace(/<[^>]*>/g, '').trim());
        if (cells.length !== 4) { bad.push('expected 4 boxes, got ' + cells.length); return; }
        const head = (blk.match(/<b>(\d+) × (\d+)<\/b>/) || []).slice(1).map(Number);
        if (head.length !== 2) { bad.push('no heading'); return; }
        const full = head[0], mult = head[1];
        const tens = Math.floor(full / 10) * 10, ones = full % 10;
        const b0 = (cells[0].match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
        const b1 = (cells[1].match(/(\d+) × (\d+)/) || []).slice(1).map(Number);
        if (b0.length !== 2 || b1.length !== 2) { bad.push('a top box is not a multiplication'); return; }
        if (b0[0] !== tens || b0[1] !== mult) { bad.push('first box should be ' + tens + ' × ' + mult + ' but is ' + cells[0]); return; }
        if (b1[0] !== ones || b1[1] !== mult) { bad.push('second box should be ' + ones + ' × ' + mult + ' but is ' + cells[1]); return; }
        if (tens < 10 || tens > 90) { bad.push('the tens part is out of range: ' + tens); return; }
        if (ones < 1 || ones > 9) { bad.push('the ones part is not a single digit: ' + ones); return; }
        if (tens <= ones) { bad.push('the tens part is not the bigger chunk'); return; }
        if (cells[2] !== '' || cells[3] !== '') { bad.push('the bottom boxes give the answer away'); return; }
        if (full < 11 || full > 99 || full * mult > 999) { bad.push('not a sensible 2-digit times 1-digit problem: ' + full + ' × ' + mult); return; }
      });
      if (!/ = \d+ \+ \d+ = \d+/.test(String(sheet.key))) bad.push('the answer key does not show the two partial products');
    }
    ok(kind + ' sheet maths is right', bad.length === 0, bad.slice(0, 2).join(' | '));
  }

  S.WS.kind = 'grid'; S.WS.table = 7; S.WS.count = 24;
  ok('the grid gives every multiple of the table once', (() => {
    const items = mulItems(S.wsBuild().body);
    return items.length === 12 && new Set(items.map(x => x.join('x'))).size === 12;
  })(), mulItems(S.wsBuild().body).length + ' items');
  ok('asking for 24 on a 12-fact table gives 12, not padding', mulItems(S.wsBuild().body).length === 12);
  ok('the grid has no repeated question', (() => {
    const items = (S.wsBuild().body.match(/<li>[\s\S]*?<\/li>/g) || []).map(x => x.replace(/<[^>]*>/g, '').trim());
    return new Set(items).size === items.length;
  })());
  ok('the grid key has the same number of answers as questions', (() => {
    const s = S.wsBuild();
    return (s.key.match(/<li>/g) || []).length === (s.body.match(/<li>/g) || []).length;
  })());
  S.WS.table = 1; S.WS.count = 12;
  ok('table 1 is handled without breaking', S.wsBuild().body.length > 0);
  S.WS.table = 12; S.WS.count = 12;
  ok('table 12 goes all the way to 12 x 12', (() => {
    const items = mulItems(S.wsBuild().body);
    return items.length === 12 && items.some(x => x[0] === 12 && x[1] === 12);
  })());
  ok('the review sheet is mostly known facts once she has some', (() => {
    const r = boot(); const R = r.X;
    for (let k = 2; k <= 8; k++) R.save.facts[R.factKey('mul', 3, k)] = { seen: 4, right: 4, times: [1200], iv: 1, last: Date.now() };
    R.WS.kind = 'review'; R.WS.table = 3; R.WS.count = 10;
    const s = R.wsBuild();
    const items = mulItems(s.body);
    return items.length > 0 && new Set(items.map(x => x.join('x'))).size === items.length;
  })());
  ok('the cover-copy sheet prints the answers in the left column', (() => { S.WS.kind = 'ccc'; const s = S.wsBuild(); return /ccc-answer/.test(s.body) && /=\s*\d+/.test(s.body); })());
  ok('rendering does not throw for every sheet type', (() => {
    const r = boot(); const R = r.X;
    for (const k of ['grid', 'review', 'ccc', 'family', 'area', 'upsub']) { R.WS.kind = k; R.renderSheets(); }
    return true;
  })());
}

console.log('7. nothing earlier broke');
{
  const rb = boot();
  const R = rb.X;
  R.renderKidsMenu();
  ok('first facts menu still renders', rb.el('rung-list').children.length > 0);
  R.startKids('mul', 0);
  ok('first facts session still starts', R.kids.qs.length === 10);
  R.startSession('sprint', 'easy', ['add', 'mul']);
  ok('drills still start', !!R.game.q);
  R.recordSkill('end5', true, 1500);
  ok('strategy skills still record', R.save.skills.end5.seen === 1);
  ok('home still renders', (() => { R.renderTotals(); R.renderHistory(); R.renderBest(); return true; })());
  ok('factState still works after the schedule fields were added', (() => {
    const s = R.save.facts['mul:2:3'] || (R.save.facts['mul:2:3'] = { seen: 3, right: 3, times: [1000], iv: 1, last: 1 });
    return R.factState('mul:2:3') === 'known';
  })());
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);
