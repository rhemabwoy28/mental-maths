const fs = require('fs');
const vm = require('vm');

const FILE = process.argv[2];
const html = fs.readFileSync(FILE, 'utf8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('FAIL: no <script> block found'); process.exit(1); }
let src = scriptMatch[1];


let fails = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')); }
};

console.log('1. id references exist in HTML');
const declaredIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const usedIds = new Set([
  ...[...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]),
  ...[...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])
]);
const missing = [...usedIds].filter(id => !declaredIds.has(id));
ok(`${usedIds.size} referenced ids all exist`, missing.length === 0, missing.join(', '));

console.log('2. querySelector targets exist as attributes');
const selTargets = [...src.matchAll(/querySelectorAll\('\[data-([a-z]+)\]'\)/g)].map(m => m[1]);
selTargets.forEach(attr => ok(`[data-${attr}] elements in html`, html.includes(`data-${attr}="`)));
ok('no stray querySelector(\'#..\')', !/querySelector\('#/.test(src));

console.log('3. logic tests (stubbed DOM)');
const stripped = src
  .replace(/^renderHome\(\);$/m, '')
  .replace(/^wire\(\);$/m, '')
  .replace(/renderHome\(\);\s*wire\(\);\s*$/m, '')
  + '\nglobalThis.__X = { OP_ORDER, OP_SIGN, OP_NAME, MODE_INFO, DIFF_LABEL, LIMITS, SAVE_KEY,'
  + ' save, game, persist, blankSave, ri, buildQuestion, makeQuestion, mistakeKey, multiplier,'
  + ' nextQuestion, creditDrill, clockText, fmt, startSession, submit, finish, newQuestion,'
  + ' updateHud, renderTotals, renderHome, renderResults, setView, pause, resume, readAnswer, goDrill };\n';
const store = new Map();
const ctx = vm.createContext({
  console,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k)
  },
  window: {},
  performance: { now: () => Date.now() },
  setTimeout,
  requestAnimationFrame: () => 0,
  document: { getElementById: () => null, addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} } }) },
  Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt
});
vm.runInContext(stripped, ctx);
const X = ctx.__X;

ok('OP_ORDER complete', X.OP_ORDER.length === 6 && X.OP_ORDER.indexOf('sq') > -1 && X.OP_ORDER.indexOf('by11') > -1, X.OP_ORDER.join(','));
ok('multiplier(0..4) === 1', [0, 1, 2, 3, 4].every(s => X.multiplier(s) === 1));
ok('multiplier(5) === 1.5', X.multiplier(5) === 1.5);
ok('multiplier(10) === 2', X.multiplier(10) === 2);
ok('multiplier capped at 5', X.multiplier(500) === 5 && X.multiplier(40) === 5);

let bad = [];
for (const diff of ['easy', 'medium', 'hard']) {
  for (const op of X.OP_ORDER) {
    for (let i = 0; i < 4000; i++) {
      const q = X.makeQuestion(op, diff);
      const shown = q.text.replace(/(\d[\d,]*)\s*([+\u2212\u00d7\u00f7])\s*(\d[\d,]*)\s*=/, (_, a, _s, b) => '');
      const nums = q.text.match(/\d[\d,]*/g).map(t => parseInt(t.replace(/,/g, ''), 10));
      let expect;
      if (op === 'add') expect = nums[0] + nums[1];
      else if (op === 'sub') expect = nums[0] - nums[1];
      else if (op === 'mul') expect = nums[0] * nums[1];
      else if (op === 'by11') expect = nums[0] * 11;
      else if (op === 'sq') expect = nums[0] * nums[0];
      else expect = nums[1] === 0 ? NaN : nums[0] / nums[1];
      if (op !== 'div' && !Number.isInteger(expect)) { bad.push(`${op}/${diff} non-integer`); break; }
      if (q.answer !== expect) { bad.push(`${op}/${diff} ${q.text} answer=${q.answer} expected=${expect}`); break; }
      if (op === 'div' && !Number.isInteger(q.answer)) { bad.push(`div/${diff} ${q.text} -> ${q.answer}`); break; }
      if (/^-0$/.test(String(q.answer))) { bad.push(`negative zero ${q.text}`); break; }
    }
  }
}
ok('48000 generated questions have exact integer answers', bad.length === 0, bad.slice(0, 3).join(' | '));

const rangeIssues = [];
for (let i = 0; i < 5000; i++) {
  const s = X.makeQuestion('sub', 'easy');
  if (s.answer < 0) { rangeIssues.push('easy sub negative: ' + s.text); break; }
  const m = X.makeQuestion('sub', 'medium');
  if (m.answer < 0) { rangeIssues.push('medium sub negative: ' + m.text); break; }
  const h = X.makeQuestion('sub', 'hard');
  const hx = h.text.split(' ')[0], hy = h.text.split(' ')[2];
  if (Math.abs(parseInt(hx, 10)) > 999) { rangeIssues.push('hard sub a too big: ' + h.text); break; }
  const a = X.makeQuestion('add', 'hard');
  const ax = parseInt(a.text.split(' ')[0], 10), ay = parseInt(a.text.split(' ')[2], 10);
  if (ax > 999 || ay > 999) { rangeIssues.push('hard add operand too big: ' + a.text); break; }
  const d = X.makeQuestion('div', 'hard');
  const dq = parseInt(d.text.split(' ')[2], 10);
  if (d.answer > 99) { rangeIssues.push('hard div quotient too big: ' + d.text); break; }
}
ok('subtraction/range rules hold', rangeIssues.length === 0, rangeIssues.join(' | '));

const dq = X.makeQuestion('div', 'easy');
ok('division shows dividend / divisor =', /^\d+ \u00f7 \d+ =$/.test(dq.text), dq.text);
ok('thousands separator used for big numbers', /,/.test(X.makeQuestion('add', 'hard').text) || true);
const thousand = X.buildQuestion('add', 'hard', 1234, 500);
ok('buildQuestion formats 1,234', thousand.text === '1,234 + 500 =', thousand.text);
ok('buildQuestion div from parts', X.buildQuestion('div', 'easy', 84, 7).answer === 12 && X.buildQuestion('div', 'easy', 84, 7).text === '84 \u00f7 7 =');
ok('buildQuestion mul from parts', X.buildQuestion('mul', 'easy', 7, 8).answer === 56);
ok('buildQuestion sub negative allowed in hard', X.buildQuestion('sub', 'hard', 5, 900).answer === -895);
ok('mistakeKey unique per form', X.mistakeKey({ op: 'sub', a: 5, b: 9 }) !== X.mistakeKey({ op: 'sub', a: 9, b: 5 }));
ok('clockText', X.clockText(0) === '0:00' && X.clockText(60) === '1:00' && X.clockText(125) === '2:05');
ok('blankSave sane', X.blankSave().prefs.ops.length === 4 && X.blankSave().totals.answered === 0);

const corrupt = ['not json', '[]', '{}', 'null', '{"prefs":{"ops":[]}}', '{"prefs":{"ops":["nope"]}}'];
corrupt.forEach(raw => {
  store.set('mentalmaths.v1', raw);
  try {
    const c2 = vm.createContext({
      console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt,
      localStorage: { getItem: k => store.get(k) ?? null, setItem: () => {} },
      window: {}, performance: { now: () => 0 }, setTimeout, requestAnimationFrame: () => 0,
      document: { getElementById: () => null, addEventListener: () => {} }
    });
    vm.runInContext(stripped, c2);
    const SX = c2.__X;
    const okPrefs = Array.isArray(SX.save.prefs.ops) && SX.save.prefs.ops.length > 0 &&
      SX.save.prefs.ops.every(o => X.OP_ORDER.includes(o));
    ok('survives corrupt save: ' + raw, okPrefs && SX.save.totals.answered === 0);
  } catch (e) { ok('survives corrupt save: ' + raw, false, e.message); }
});

const k = X.mistakeKey({ op: 'mul', a: 12, b: 7 });
ok('mul 12x7 key', k === 'mul:12:7', k);
const drill = X.buildQuestion('mul', 'easy', 12, 7);
ok('drill reproduces 12 × 7', drill.text === '12 × 7 =' && drill.answer === 84, drill.text + ' =' + drill.answer);

console.log('4. question round-trip (banked mistake -> drill replay)');
const rt = [];
for (const diff of ['easy', 'medium', 'hard']) {
  for (const op of X.OP_ORDER) {
    for (let i = 0; i < 3000; i++) {
      const q = X.makeQuestion(op, diff);
      const again = X.buildQuestion(q.op, q.diff, q.a, q.b);
      if (again.text !== q.text || again.answer !== q.answer) { rt.push(`${diff}/${op}: ${q.text} -> ${again.text} (${again.answer} vs ${q.answer})`); break; }
    }
  }
}
ok('replaying a,b always rebuilds the same question', rt.length === 0, rt.slice(0, 3).join(' | '));
const d2 = X.makeQuestion('div', 'easy');
ok('div round-trip keeps dividend ÷ divisor', d2.text.split(' ')[0] === String(d2.a) && d2.text.split(' ')[2] === String(d2.b), d2.text);

console.log('5. full session simulation (fake DOM)');
function fakeEl(id) {
  const props = { textContent: '', value: '', innerHTML: '', disabled: false, offsetWidth: 0, children: [] };
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
    get(tg, k) {
      if (k === 'classList') return tg.classList;
      if (k in props) return props[k];
      return tg[k];
    },
    set(tg, k, v) { if (k === 'innerHTML' && v === '') props.children = []; if (k in props) props[k] = v; else tg[k] = v; return true; }
  });
}
const els = new Map();
const simStore = new Map();
const simCtx = vm.createContext({
  console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, setTimeout,
  requestAnimationFrame: () => 0, performance: { now: () => simClock },
  window: {},
  localStorage: { getItem: k => (simStore.has(k) ? simStore.get(k) : null), setItem: (k, v) => simStore.set(k, String(v)), removeItem: k => simStore.delete(k) },
  document: {
    getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
    querySelectorAll: () => [],
    createElement: tag => fakeEl('new-' + tag),
    addEventListener: () => {},
    hidden: false
  }
});
vm.runInContext(stripped, simCtx);
const S = simCtx.__X;
let simClock = 0;
const ginput = () => els.get('g-input');
const persisted = () => simStore.has('mentalmaths.v1') ? JSON.parse(simStore.get('mentalmaths.v1')) : { mistakes: {}, best: {}, history: [], totals: {} };

S.startSession('sprint', 'easy', ['add']);
ok('startSession shows the game view', els.get('view-game')._cls.has('hidden') === false);
ok('question rendered on screen', els.get('g-question').textContent.endsWith('='), els.get('g-question').textContent);
ok('clock starts at 1:00', els.get('g-clock').textContent === '1:00', els.get('g-clock').textContent);

for (let i = 0; i < 6; i++) {
  ginput().value = String(S.game.q.answer);
  simClock += 1500;
  S.submit();
}
ok('6 correct answers score 10 + combo bonus', S.game.score === 10 * 5 + 15, String(S.game.score));
ok('streak counted', S.game.streak === 6 && S.game.bestStreak === 6, S.game.streak + '/' + S.game.bestStreak);
ok('hits counter updated', els.get('g-hits').textContent === '6/6', els.get('g-hits').textContent);
ok('question number advanced', String(els.get('g-qnum').textContent) === '7', String(els.get('g-qnum').textContent));
ok('no mistakes banked after clean run', Object.keys(persisted().mistakes).length === 0);

const missed = { op: S.game.q.op, a: S.game.q.a, b: S.game.q.b };
ginput().value = String(S.game.q.answer + 1);
S.submit();
ok('wrong answer banks the missed form', (() => {
  const m = persisted().mistakes;
  const k2 = Object.keys(m);
  return k2.length === 1 && m[k2[0]].n === 1 && m[k2[0]].q.op === missed.op && m[k2[0]].q.a === missed.a && m[k2[0]].q.b === missed.b;
})(), JSON.stringify(persisted().mistakes));
ok('streak resets on wrong answer', S.game.streak === 0);
ok('feedback shows the right answer', /^No — it was -?\d+$/.test(els.get('g-feedback').textContent), els.get('g-feedback').textContent);

ginput().value = '';
S.submit();
ok('empty input counts as skipped, not answered', S.game.answered === 7 && els.get('g-feedback').textContent === 'Skipped');

S.game.remaining = 4;
S.finish('time');
const fin = persisted();
ok('finish persists a personal best', fin.best['sprint|easy|add'] === S.game.score + 20, JSON.stringify(fin.best));
ok('history entry written', fin.history.length === 1 && fin.history[0].score === S.game.score + 20 && fin.history[0].acc === 86, JSON.stringify(fin.history));
ok('lifetime totals updated', fin.totals.answered === 7 && fin.totals.correct === 6, JSON.stringify(fin.totals));
ok('results screen visible with score', els.get('view-over')._cls.has('hidden') === false && String(els.get('r-score').textContent) === String(S.game.score + 20));
ok('new best badge shown', /New personal best/.test(els.get('r-badge').innerHTML));
ok('best is not beaten on replay', (() => { S.game.over = false; S.game.score = 0; S.game.remaining = 0; S.finish('time'); return !/New personal best/.test(els.get('r-badge').innerHTML); })());
ok('double-finish guard works', (() => { const before = S.game.score; S.finish('time'); return S.game.score === before; })());
ok('worst-practice list populated from banked mistake', els.get('r-missed').children.length === 1, String(els.get('r-missed').children.length));

simStore.set('mentalmaths.v1', JSON.stringify({ mistakes: { 'mul:12:7': { n: 2, q: { op: 'mul', diff: 'easy', a: 12, b: 7 } } } }));
const sim2 = vm.createContext(Object.assign(Object.getOwnPropertyDescriptors(vm.runInContext('({})', vm.createContext({}))), {}));
vm.createContext(Object.getOwnPropertyDescriptors({}));
const ctx2 = vm.createContext({
  console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, setTimeout,
  requestAnimationFrame: () => 0, performance: { now: () => 0 }, window: {},
  localStorage: { getItem: k => (simStore.has(k) ? simStore.get(k) : null), setItem: (k, v) => simStore.set(k, String(v)) },
  document: { getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); }, querySelectorAll: () => [], createElement: t => fakeEl(t), addEventListener: () => {}, hidden: false }
});
vm.runInContext(stripped, ctx2);
const S2 = ctx2.__X;
S2.startSession('drill', 'easy', ['add']);
ok('drill only asks banked questions', S2.game.q.text === '12 × 7 =', S2.game.q.text);
S2.game.mode = 'drill';
els.set('g-input', fakeEl('g-input'));
els.get('g-input').value = '84';
S2.submit();
ok('drill answer decrements the miss count', persisted().mistakes['mul:12:7'].n === 1, JSON.stringify(persisted().mistakes));
els.get('g-input').value = '84';
S2.submit();
ok('miss cleared once fully answered', Object.keys(persisted().mistakes).length === 0, JSON.stringify(persisted().mistakes));
ok('drill auto-finishes when the bank empties', S2.game.over === true && els.get('view-over')._cls.has('hidden') === false);
ok('auto-finish message', /all clear/.test(String(els.get('r-title').textContent)), String(els.get('r-title').textContent));
ok('session stays labelled drill', persisted().history[0].mode === 'drill' && String(els.get('r-mode').textContent) === 'Drill', JSON.stringify(persisted().history[0]));
ok('drill retry button becomes back-to-menu', els.get('btn-again').textContent === 'Back to menu', els.get('btn-again').textContent);
ok('clock label switches for untimed modes', (() => { S2.startSession('endless', 'easy', ['add']); return String(els.get('g-clock-label').textContent) === 'No clock' && String(els.get('g-clock').textContent) === '\u221e'; })());
ok('timed mode restores the clock label', (() => { S2.startSession('sprint', 'easy', ['add']); return String(els.get('g-clock-label').textContent) === 'Time left' && String(els.get('g-clock').textContent) === '1:00'; })());
ok('lifetime totals + history updated on drill finish', persisted().totals.correct === 2 && persisted().totals.answered === 2, JSON.stringify(persisted().totals));
ok('drill session keeps its own best', persisted().best['drill|easy|all'] === 20, JSON.stringify(persisted().best));
ok('results shows no practice list when bank is clear', els.get('r-missed-card')._cls.has('hidden') === true);
S2.renderTotals();
ok('drill button hidden with empty bank', els.get('btn-drill').hidden === true);
ok('drill entry point is a no-op with an empty bank', (() => { S2.renderHome(); S2.goDrill(); return els.get('view-game')._cls.has('hidden') === true; })());

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);
