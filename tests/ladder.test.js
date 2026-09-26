const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = process.argv[2];
const html = fs.readFileSync(FILE, 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/)[1];

let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
};

console.log('1. id + structure audit');
const declaredIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const usedIds = new Set([...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...usedIds].filter(id => !declaredIds.has(id));
ok(usedIds.size + ' referenced ids all exist', missing.length === 0, missing.join(', '));
['track-picker'].forEach(p => ok(p + ' present', html.includes(p)));
ok('track picker has [data-track] chips', (html.match(/data-track="/g) || []).length === 3);
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
const views = [...html.matchAll(/id="view-([a-z]+)"/g)].map(x => x[1]);
const refs = new Set([...src.matchAll(/setView\('([a-z]+)'\)/g)].map(x => x[1]));
ok('views: ' + views.join(','), [...refs].every(v => views.indexOf(v) > -1), 'missing ' + [...refs].filter(v => views.indexOf(v) < 0).join(','));

console.log('2. boot');
const stripped = src
  .replace(/^renderHome\(\);$/m, '')
  .replace(/^wire\(\);$/m, '')
  + '\nglobalThis.__X = { RUNGS, factKey, factAns, factText, factStat, factState, rungProgress, openRung,'
  + ' derive, knownFacts, invalidateFacts, allFacts, isKnownFact, clashesForSession, sameFact, factOperands, buildKidsSession,'
  + ' save, kids, persist, medianOf, startKids, nextKidsQuestion, submitKids, endKids, renderKidsMenu,'
  + ' renderKidsHelp, renderBeads, kidsNextText, setView, startSession, makeQuestion, buildQuestion,'
  + ' shuffle, dedupeRungs, col, updateKidsHud, ladderFacts,'
  + ' STRATEGIES, play, startLab, submitLab, renderLabMenu, renderLab, recordSkill, labNextText,'
  + ' beadGroups, renderTotals, renderHistory, renderBest };\n';

function fakeEl(id) {
  const props = { textContent: '', value: '', innerHTML: '', hidden: false, disabled: false, offsetWidth: 0, children: [], title: '' };
  const cls = new Set();
  const t = {
    id, style: {}, dataset: {},
    focus() {}, blur() {}, click() {}, querySelectorAll: () => [],
    appendChild(c) { props.children.push(c); },
    removeChild(c) { props.children = props.children.filter(x => x !== c); },
    setAttribute(k, v) { props[k] = v; }, getAttribute(k) { return props[k]; },
    addEventListener() {}, removeEventListener() {}, closest() { return null; },
    classList: {
      add: (...a) => a.forEach(x => cls.add(x)),
      remove: (...a) => a.forEach(x => cls.delete(x)),
      contains: x => cls.has(x),
      toggle: (n, force) => { if (force === undefined) { cls.has(n) ? cls.delete(n) : cls.add(n); } else if (force) cls.add(n); else cls.delete(n); }
    },
    _cls: cls
  };
  return new Proxy(t, {
    get(tg, k) { if (k === 'classList') return tg.classList; if (k in props) return props[k]; return tg[k]; },
    set(tg, k, v) { if (k === 'innerHTML' && v === '') props.children = []; if (k in props) props[k] = v; else tg[k] = v; return true; }
  });
}
function boot(seed) {
  const els = new Map();
  const store = new Map();
  if (seed) store.set('mentalmaths.v1', seed);
  let clock = 1000;
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, Set,
    setTimeout: fn => { fn(); return 0; },
    requestAnimationFrame: () => 0,
    performance: { now: () => clock },
    window: {}, Set,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
      querySelectorAll: () => [], createElement: t => fakeEl(t),
      addEventListener: () => {}, hidden: false, body: fakeEl('body')
    }
  });
  vm.runInContext(stripped, ctx);
  return { ctx, X: ctx.__X, els, store, tick: ms => { clock += ms; }, el: id => els.get(id) };
}
let b = boot();
let X = b.X;
ok('boots with no save', !!X && Object.keys(X.save.facts).length === 0);

console.log('3. ladder shape');
ok('three tracks', ['mul', 'add', 'sub'].every(t => Array.isArray(X.RUNGS[t]) && X.RUNGS[t].length > 0),
  ['mul', 'add', 'sub'].map(t => t + ':' + (X.RUNGS[t] || []).length).join(' '));
['mul', 'add', 'sub'].forEach(t => {
  X.RUNGS[t].forEach((r, i) => {
    ok(`${t} rung ${i + 1} has name/why/facts`, !!(r.name && r.why && r.facts && r.facts.length), r.name);
  });
});
const dupes = [];
['mul', 'add', 'sub'].forEach(t => {
  const seen = new Set();
  X.RUNGS[t].forEach(r => r.facts.forEach(f => {
    const k = f[0] + 'x' + f[1];
    if (seen.has(k)) dupes.push(t + ' ' + k);
    seen.add(k);
  }));
});
ok('no duplicated fact inside a track', dupes.length === 0, dupes.join(','));

console.log('4. every fact has the right arithmetic, in every rung');
const arith = [];
['mul', 'add', 'sub'].forEach(t => {
  X.RUNGS[t].forEach((r, ri) => r.facts.forEach(f => {
    const a = f[0], b = f[1];
    if (t === 'mul' && !(a >= 0 && b >= 0 && a <= b)) arith.push(`mul rung ${ri + 1} ${a}x${b} bad order/range`);
    if (t === 'add' && !(a >= 0 && b >= 0)) arith.push(`add rung ${ri + 1} ${a}+${b} negative`);
    if (t === 'sub' && !(a > b)) arith.push(`sub rung ${ri + 1} ${a}-${b} not a real subtraction`);
    if (t === 'sub' && a - b < 0) arith.push(`sub rung ${ri + 1} ${a}-${b} goes negative`);
  }));
});
ok('rung facts are well formed', arith.length === 0, arith.slice(0, 4).join(' | '));

console.log('5. the ladder only uses facts from below it (this is the whole point)');
const orderIssues = [];
const deriv = [];
['mul', 'add', 'sub'].forEach(t => {
  const known = new Set();
  X.RUNGS[t].forEach((r, ri) => r.facts.forEach(f => {
    const d = X.derive(t, f[0], f[1], known);
    if (!d) { orderIssues.push(`${t} rung ${ri + 1}: ${f[0]}?${f[1]} has no derivation`); return; }
    if (d.steps[d.steps.length - 1].answer !== X.factAns(t, f[0], f[1])) {
      orderIssues.push(`${t} rung ${ri + 1}: ${f[0]}?${f[1]} scaffold lands on ${d.steps[d.steps.length - 1].answer} not ${X.factAns(t, f[0], f[1])}`);
    }
    const needs = d.need || [];
    needs.forEach(nk => { if (!known.has(nk) && !(t !== 'mul' && nk === X.factKey(t, f[1], f[0]))) orderIssues.push(`${t} rung ${ri + 1}: ${f[0]}?${f[1]} needs ${nk} which is not below it`); });
    if (!needs.length) deriv.push(t + ' r' + (ri + 1) + ' ' + f[0] + '?' + f[1] + ' [' + d.steps[0].label + ']');
    known.add(X.factKey(t, f[0], f[1]));
    known.add(X.factKey(t, f[1], f[0]));
  }));
});
ok('no fact depends on anything above or beside it', orderIssues.length === 0, orderIssues.slice(0, 6).join(' | '));
console.log('     facts taught whole (no ingredients yet): ' + deriv.length + ' of ' + ['mul', 'add', 'sub'].reduce((s, t) => s + X.RUNGS[t].reduce((n, r) => n + r.facts.length, 0), 0));
console.log('     e.g. ' + deriv.slice(0, 5).join('  ·  '));

console.log('6. every scaffold step is arithmetically true');
const stepBad = [];
['mul', 'add', 'sub'].forEach(t => {
  const known = new Set();
  X.RUNGS[t].forEach(r => r.facts.forEach(f => {
    const d = X.derive(t, f[0], f[1], known);
    const a = f[0], b = f[1], ans = X.factAns(t, a, b);
    d.steps.forEach((s, i) => {
      if (typeof s.answer !== 'number' || !isFinite(s.answer)) stepBad.push(`${t} ${a}?${b} step ${i} answer not a finite number`);
      if (i === d.steps.length - 1) { if (s.answer !== ans) stepBad.push(`${t} ${a}?${b} last step != answer`); }
      else if (s.answer > ans * 10) stepBad.push(`${t} ${a}?${b} step ${i} (${s.answer}) is wildly bigger than the final answer ${ans}`);
      if (!s.expr || !String(s.expr).length) stepBad.push(`${t} ${a}?${b} step ${i} empty expr`);
      if (/undefined|NaN|Infinity/.test(String(s.expr))) stepBad.push(`${t} ${a}?${b} step ${i} expr "${s.expr}" contains a broken value`);
      if (!/\d/.test(String(s.expr))) stepBad.push(`${t} ${a}?${b} step ${i} expr "${s.expr}" has no numbers in it`);
    });
    if (!d.why || !d.why.length) stepBad.push(`${t} ${a}?${b} no why`);
    known.add(X.factKey(t, a, b));
    known.add(X.factKey(t, b, a));
  }));
});
ok('all scaffold steps are sound', stepBad.length === 0, stepBad.slice(0, 5).join(' | '));

console.log('7. the three facts the user named');
{
  const find = (a, bb) => {
    for (let i = 0; i < X.RUNGS.mul.length; i++) if (X.RUNGS.mul[i].facts.some(f => f[0] === a && f[1] === bb)) return i;
    return -1;
  };
  const c67r = find(6, 7), e89r = find(8, 9), c66r = find(6, 6);
  ok('6 × 6 exists', c66r > -1);
  ok('6 × 7 exists', c67r > -1);
  ok('8 × 9 exists', e89r > -1);
  ok('6 × 6 is on the same rung as 6 × 7 and comes first (the tie effect)', c66r === c67r && c66r > -1, 'rungs ' + (c66r + 1) + '/' + (c67r + 1));
  const known = new Set();
  let d67 = null, d89 = null;
  X.RUNGS.mul.forEach((r, ri) => r.facts.forEach(f => {
    if (f[0] === 6 && f[1] === 7) d67 = X.derive('mul', 6, 7, known);
    if (f[0] === 8 && f[1] === 9) d89 = X.derive('mul', 8, 9, known);
    known.add(X.factKey('mul', f[0], f[1]));
    known.add(X.factKey('mul', f[1], f[0]));
  }));
  ok('6 × 7 derives from 6 × 6, not from counting', d67.need.indexOf(X.factKey('mul', 6, 6)) > -1, d67.steps.map(s => s.expr).join(' | '));
  ok('6 × 7 scaffold is 36 + 6 = 42', d67.steps[0].answer === 36 && d67.steps[1].answer === 42, d67.steps.map(s => s.expr).join(' | '));
  ok('8 × 9 derives from 8 × 10, not from counting', d89.need.indexOf(X.factKey('mul', 8, 10)) > -1, d89.steps.map(s => s.expr).join(' | '));
  ok('8 × 9 = 72 via 80 − 8', d89.steps[0].answer === 80 && d89.steps[1].answer === 72 && d89.steps[1].expr.indexOf('80') > -1, d89.steps.map(s => s.expr).join(' | '));
  ok('8 × 9 sits in a late rung, not the first', e89r >= 8, 'rung ' + (e89r + 1));
  ok('9 × 9 is the very last fact', find(9, 9) === X.RUNGS.mul.length - 1);
  ok('8 × 9 is 72 to the plain generator too', X.factAns('mul', 8, 9) === 72);
}

console.log('8. times ten and times five are early');
{
  const rungOf = (a, bb) => { let i = -1; X.RUNGS.mul.forEach((r, ri) => { if (r.facts.some(f => (f[0] === a && f[1] === bb) || (f[0] === bb && f[1] === a))) i = ri; }); return i; };
  ok('2 × 10 is on rung 2', rungOf(2, 10) === 1, 'rung ' + (rungOf(2, 10) + 1));
  ok('9 × 5 is on rung 3', rungOf(9, 5) === 2, 'rung ' + (rungOf(9, 5) + 1));
  ok('5 × 5 sits on the times-five rung where it belongs', rungOf(5, 5) === 2, 'rung ' + (rungOf(5, 5) + 1));
  ok('9 × 9 is in the last rung', rungOf(9, 9) === X.RUNGS.mul.length - 1, 'rung ' + (rungOf(9, 9) + 1));
}

console.log('9. sessions are built the way the research says');
b = boot(); X = b.X;
for (const track of ['mul', 'add', 'sub']) {
  const s = X.buildKidsSession(track, 0).list;
  ok(track + ' rung 1 session has 10 questions', s.length === 10, String(s.length));
  const keys = s.map(f => X.factKey(track, f[0], f[1]));
  ok(track + ' rung 1 has no repeats', new Set(keys).size === keys.length, keys.join(','));
  ok(track + ' rung 1 questions all come from rung 1', s.every(f => X.RUNGS[track][0].facts.some(r => r[0] === f[0] && r[1] === f[1])));
}
ok('rung 1 of mul is only anchors (0, 1 or 2 involved)', X.RUNGS.mul[0].facts.every(f => f[0] === 0 || f[1] === 0 || f[1] === 1 || f[0] === 1 || f[1] === 2 || f[0] === 2),
  JSON.stringify(X.RUNGS.mul[0].facts));

console.log('10. later sessions mix review and new, and keep facts dissimilar');
{
  let collisions = 0, worstPair = '', len = 0, dupes = 0, minNew = 99, minRev = 99;
  for (let trial = 0; trial < 500; trial++) {
    const s = X.buildKidsSession('mul', 5).list;
    len = s.length;
    const keys = s.map(f => X.factKey('mul', f[0], f[1]));
    if (new Set(keys).size !== keys.length) dupes += 1;
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        if (X.clashesForSession('mul', s[i][0], s[i][1], s[j][0], s[j][1])) {
          if (worstPair === '') worstPair = s[i].join('x') + ' vs ' + s[j].join('x');
          collisions += 1;
        }
      }
    }
    const nNew = s.filter(f => X.RUNGS.mul[5].facts.some(r => r[0] === f[0] && r[1] === f[1])).length;
    minNew = Math.min(minNew, nNew);
    minRev = Math.min(minRev, s.length - nNew);
  }
  ok('no duplicates in 500 sessions', dupes === 0, dupes + ' had duplicates');
  ok('never two similar facts in one session (6x7 is never beside 6x8)', collisions === 0, collisions + ' collisions, e.g. ' + worstPair);
  ok('sessions are 10 long', len === 10, String(len));
  ok('every session carries new facts and review', minNew >= 3 && minRev >= 3, 'min new=' + minNew + ' min review=' + minRev);
  const s = X.buildKidsSession('mul', 5).list;
  const inRung6 = s.filter(f => X.RUNGS.mul[5].facts.some(r => r[0] === f[0] && r[1] === f[1])).length;
  ok('a mid-ladder session carries both new facts and review', inRung6 > 0 && s.length - inRung6 > 0, 'new=' + inRung6 + ' review=' + (s.length - inRung6));
  const first = X.buildKidsSession('mul', 0).list;
  ok('rung 1 has no review because there is nothing below it', first.every(f => X.RUNGS.mul[0].facts.some(r => r[0] === f[0] && r[1] === f[1])));
  ok('rung 1 still avoids repeats even though it must relax on similarity', new Set(first.map(f => X.factKey('mul', f[0], f[1]))).size === first.length);
  ok('similarity rule blocks consecutive siblings', X.clashesForSession('mul', 6, 7, 6, 8) && X.clashesForSession('mul', 6, 8, 6, 9) && X.clashesForSession('mul', 7, 8, 8, 7));
  ok('similarity rule allows spread-out facts in the same column', !X.clashesForSession('mul', 3, 4, 3, 8) && !X.clashesForSession('mul', 3, 5, 3, 7));
  ok('similarity rule ignores the cheap anchors 0, 1, 2, 10', !X.clashesForSession('mul', 1, 10, 3, 10) && !X.clashesForSession('mul', 2, 8, 1, 8));
  ok('subtraction keeps its order, so 9-4 and 4-9 are not the same fact', !X.sameFact('sub', 9, 4, 4, 9) && X.sameFact('mul', 9, 4, 4, 9));
}

console.log('11. mastery states and the three-second rule');
{
  const key = X.factKey('mul', 2, 3);
  ok('new fact starts as new', X.factState(key) === 'new');
  X.factStat(key).seen = 3; X.factStat(key).right = 1;
  ok('one right out of three is still learning', X.factState(key) === 'learning');
  X.factStat(key).right = 3;
  ok('three rights with no times yet is learning', X.factState(key) === 'learning');
  X.factStat(key).times = [2500, 3000, 3500];
  ok('three rights inside three seconds is known', X.factState(key) === 'known', X.factState(key));
  X.factStat(key).times = [9000, 12000];
  ok('three rights but slow is not known', X.factState(key) === 'learning', X.factState(key));
}

console.log('12. a whole session end to end');
b = boot(); X = b.X;
X.kids.track = 'mul';
X.startKids('mul', 0);
ok('session view showing', b.el('view-kp')._cls.has('hidden') === false);
ok('ten questions queued', X.kids.qs.length === 10);
ok('clue is masked before peeking', b.el('k-steps').children.every(li => li.className === 'masked'));
ok('no question text leaks the answer', !b.el('k-steps').innerHTML.includes(String(X.kids.cur.answer)));
let guard = 0;
const answers = [];
while (!X.kids.done && guard++ < 60) {
  answers.push(X.kids.cur.answer);
  b.el('k-input').value = String(X.kids.cur.answer);
  b.tick(1200);
  X.submitKids();
  if (guard < 3) break;
}
ok('answering right scores it', X.kids.right >= 1 && X.save.facts[X.factKey('mul', X.kids.qs[0][0], X.kids.qs[0][1])].right === 1);
ok('time recorded for un-peeked answers', X.kids.fast.length === 1);
ok('HUD updated', Number(b.el('k-right').textContent) === X.kids.right);
  ok('scaffold reveal works on demand (the peek path)', (() => {
    const pb = boot(); const P = pb.X;
    P.startKids('mul', 0);
    P.renderKidsHelp(true);
    return pb.el('k-steps').children.every(li => li.className !== 'masked') && String(pb.el('k-steps').children[0].children[2].textContent) !== '?';
  })());
ok('beads drawn', b.el('k-beads').children.length > 0);
  X.renderKidsMenu();
  ok('the fact wall is drawn with a chip per fact', b.el('fact-wall').children.length === X.allFacts('mul').length, b.el('fact-wall').children.length + ' vs ' + X.allFacts('mul').length);
  ok('chips are colour-coded by state', b.el('fact-wall').children.every(c => /fact/.test(String(c.className))));
{
  const f0 = X.factKey('mul', X.kids.qs[0][0], X.kids.qs[0][1]);
  const st = X.save.facts[f0];
  ok('a single correct answer is not yet known', X.factState(f0) === 'learning', X.factState(f0));
  st.right = 3; st.seen = 3; st.times = [1100, 1200, 1300];
  X.invalidateFacts();
  ok('three fast rights make it known', X.factState(f0) === 'known');
  X.kids.track = 'mul';
  X.renderKidsMenu();
  const rung0 = X.rungProgress('mul', 0);
  ok('rung progress counts it', rung0.known === 1 && rung0.seen === 1, JSON.stringify(rung0));
  ok('rung 1 not yet complete', rung0.done === false);
}

console.log('13. peek is free but recorded');
b = boot(); X = b.X;
X.startKids('add', 0);
const cur = X.kids.cur;
b.el('k-input').value = '0';
X.submitKids();
ok('wrong answer teaches and banks nothing into mistakes', Object.keys(X.save.mistakes).length === 0);
ok('the fact counts as seen', X.save.facts[X.factKey('add', cur.a, cur.b)].seen === 1);
{
  const b2 = boot(); const Y = b2.X;
  Y.startKids('mul', 0);
  const c = Y.kids.cur;
  b2.el('k-hint').value = '';
  Y.kids.peeks = 0;
  const peek = () => { Y.kids.peeked = true; Y.kids.peeks += 1; };
  b2.el('k-input').value = String(c.answer);
  peek();
  b2.tick(4000);
  Y.submitKids();
  ok('peeked run does not record a time', Y.kids.fast.length === 0);
  ok('peek is recorded on the fact', Y.save.facts[Y.factKey('mul', c.a, c.b)].peeks === 1);
  ok('peek still counts as correct', Y.kids.right === 1);
  ok('only an empty input is refused', (() => {
    const bb = boot(); const Z = bb.X; Z.startKids('mul', 0);
    bb.el('k-input').value = '';
    Z.submitKids();
    return /Type a number/.test(String(bb.el('k-feedback').textContent));
  })());
}

console.log('14. finishing a session writes the summary and unlocks nothing early');
{
  const bb = boot(); const Y = bb.X;
  Y.startKids('mul', 0);
  let g = 0;
  while (!Y.kids.done && g++ < 80) {
    bb.el('k-input').value = String(Y.kids.cur.answer);
    bb.tick(1000);
    Y.submitKids();
  }
  ok('session finished', Y.kids.done === true, 'guard=' + g);
  ok('10 of 10 right', Y.kids.right === 10, String(Y.kids.right));
  ok('summary shown, question hidden', bb.el('k-summary')._cls.has('hidden') === false && bb.el('k-ansrow')._cls.has('hidden') === true);
  ok('summary counts', String(bb.el('ks-right').textContent) === '10/10', String(bb.el('ks-right').textContent));
  ok('fastest reported', /^\d+\.\ds$/.test(String(bb.el('ks-fast').textContent)), String(bb.el('ks-fast').textContent));
  ok('totals written', Y.save.totals.answered === 10 && Y.save.totals.correct === 10);
  ok('no rung marked done after one pass', Y.rungProgress('mul', 0).done === false, JSON.stringify(Y.rungProgress('mul', 0)));
  ok('note mentions peeking honestly', /Peek/.test(String(bb.el('ks-note').textContent)) || /three seconds|rung/.test(String(bb.el('ks-note').textContent)), String(bb.el('ks-note').textContent));
}

console.log('15. the scaffold uses the ladder, not personal mastery (regression)');
{
  const fresh = boot();
  const Z = fresh.X;
  const showFor = (track, rung, a, bb) => {
    Z.startKids(track, rung);
    Z.kids.qs = [[a, bb]];
    Z.kids.qi = 0;
    Z.kids.done = false;
    Z.nextKidsQuestion();
    return Z.kids.cur.der;
  };
  const d89 = showFor('mul', 8, 8, 9);
  ok('8 x 9 on rung 9 teaches the times-ten method, not counting', d89.need.indexOf(Z.factKey('mul', 8, 10)) > -1, d89.steps.map(s => s.expr).join(' | '));
  ok('8 x 9 lands on 72 via 80 then 72', d89.steps[0].answer === 80 && d89.steps[1].answer === 72);
  ok('no step tells her to count in groups', !d89.steps.some(s => /Count in groups/.test(s.label)), d89.steps.map(s => s.label).join(' | '));

  const d67 = showFor('mul', 6, 6, 7);
  ok('6 x 7 on rung 7 teaches 36 + 6, not counting', d67.need.indexOf(Z.factKey('mul', 6, 6)) > -1 && !d67.steps.some(s => /Count in groups/.test(s.label)), d67.steps.map(s => s.expr).join(' | '));
  ok('6 x 7 lands on 42', d67.steps[d67.steps.length - 1].answer === 42);

  const d88 = showFor('mul', 8, 8, 8);
  ok('8 x 8 on rung 9 teaches 56 + 8, not counting', !d88.steps.some(s => /Count in groups/.test(s.label)), d88.steps.map(s => s.expr).join(' | '));
  ok('8 x 8 lands on 64', d88.steps[d88.steps.length - 1].answer === 64);

  let counted = 0, derived = 0;
  Z.RUNGS.mul.forEach((r, i) => r.facts.forEach(f => {
    const d = showFor('mul', i, f[0], f[1]);
    if (d.steps.some(s => /Count in groups/.test(s.label))) counted++;
    else derived++;
  }));
  ok('no fact on any rung falls back to counting', counted === 0, counted + ' of ' + (counted + derived) + ' fell back');
  ok('the vast majority are built from lower rungs', derived > counted, 'derived=' + derived + ' counted=' + counted);

  ok('ladderFacts includes the current rung and everything below', (() => {
    const s = Z.ladderFacts('mul', 8);
    return s.has(Z.factKey('mul', 8, 10)) && s.has(Z.factKey('mul', 6, 6)) && s.has(Z.factKey('mul', 9, 9)) === false;
  })());
}

console.log('16. the summary is honest about a bad session (regression)');
{
  const sb = boot();
  const W = sb.X;
  W.startKids('mul', 0);
  W.kids.qs = [[1, 1]];
  W.kids.qi = 0;
  W.kids.done = false;
  W.nextKidsQuestion();
  sb.el('k-input').value = '999';
  sb.tick(500);
  W.submitKids();
  W.endKids();
  ok('a 0-out-of-1 session is not called well done', !/well done/i.test(String(sb.el('k-summary-title').textContent)), String(sb.el('k-summary-title').textContent));
  ok('a 0-out-of-1 session invites another go', /another go/i.test(String(sb.el('k-summary-title').textContent)), String(sb.el('k-summary-title').textContent));
  const pb = boot();
  const V = pb.X;
  V.startKids('mul', 0);
  V.kids.qs = [[1, 1]];
  V.kids.qi = 0;
  V.kids.done = false;
  V.nextKidsQuestion();
  pb.el('k-input').value = String(V.kids.cur.answer);
  pb.tick(500);
  V.submitKids();
  V.endKids();
  ok('a perfect session is praised', /perfect ten/i.test(String(pb.el('k-summary-title').textContent)), String(pb.el('k-summary-title').textContent));
}

console.log('17. the answer box is reachable without scrolling (regression)');
{
  ok('the input row comes before the method card in the markup', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    const kp = h.slice(h.indexOf('id="view-kp"'));
    const ans = kp.indexOf('id="k-ansrow"');
    const help = kp.indexOf('id="k-help"');
    const q = kp.indexOf('id="k-question"');
    return q > -1 && ans > q && help > ans;
  })(), 'question < input < method');
  ok('the method card starts hidden', (() => {
    const h = fs.readFileSync(process.argv[2], 'utf8');
    return /id="k-help"[^>]*class="[^"]*hidden|id="k-help" class="card hidden"/.test(h) || h.includes('class="card hidden" id="k-help"');
  })());
  ok('a progress bar exists for the session', fs.readFileSync(process.argv[2], 'utf8').includes('id="k-progress"'));
}

console.log('18. nothing earlier broke');
{
  const bb = boot(); const Y = bb.X;
  Y.startSession('sprint', 'easy', ['add', 'sq']);
  ok('main game still runs', /² =$| \+ \d+ =$/.test(String(bb.el('g-question').textContent)), String(bb.el('g-question').textContent));
  Y.startLab('end5');
  ok('strategy lab still runs', Y.play.q && /² =$/.test(Y.play.q.text), Y.play.q && Y.play.q.text);
  Y.renderLabMenu();
  ok('lab menu renders', true);
  ok('all 8 lessons intact', Y.STRATEGIES.length === 8, String(Y.STRATEGIES.length));
  ok('home text for both new cards', (() => {
    Y.renderTotals(); Y.renderHistory(); Y.renderBest();
    return true;
  })());
  Y.kids.track = 'sub';
  Y.renderKidsMenu();
  ok('kids menu renders for subtraction', Y.kids.track === 'sub');
  Y.startKids('sub', 0);
  ok('subtraction session starts', Y.kids.qs.length === 10 && Y.kids.cur.a > Y.kids.cur.b);
  ok('home note functions', typeof Y.kidsNextText() === 'string' && Y.kidsNextText().length > 10, Y.kidsNextText());
}

console.log('16. corrupt save does not break the new fields');
['not json', '{}', '{"facts":7}', '{"facts":{"mul:2:3":"nope"}}', '[]'].forEach(raw => {
  try {
    const bb = boot(raw);
    const Y = bb.X;
    const okFacts = Y.save.facts && typeof Y.save.facts === 'object' && !Array.isArray(Y.save.facts);
    const safe = (() => { try { Y.factState('mul:2:3'); Y.renderKidsMenu(); Y.startKids('mul', 0); return true; } catch (e) { return String(e.message); } })();
    ok('survives ' + raw, okFacts && safe === true, String(safe));
  } catch (e) { ok('survives ' + raw, false, e.message); }
});
{
  const bad = JSON.stringify({ facts: { 'mul:2:3': { seen: 2, right: 1, times: 'x' } } });
  const bb = boot(bad); const Y = bb.X;
  let r = 'ok';
  try { Y.factState('mul:2:3'); Y.rungProgress('mul', 0); Y.startKids('mul', 0); Y.submitKids(); } catch (e) { r = e.message; }
  ok('survives a non-array times field', r === 'ok', r);
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);
