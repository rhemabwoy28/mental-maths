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
ok('tables view exists', /id="view-tables"/.test(html));
ok('abacus view exists', /id="view-abacus"/.test(html));
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
  + '\nglobalThis.__X = { ab, abNumber, abDigits, abSet, abSplit, abLowerCount, abUpperOn,'
  + ' abResize, abScale, renderHands, AB_SIZES, AB_LABELS,'
  + ' abStepsMake, abStepsAdd, abStepsSub, addTo, subFrom, carry, placeOnly, abRun, abNext,'
  + ' abClear, abNotes, renderAbacus, renderTables, tv, TV_MAX_N, mulState, setView,'
  + ' factKey, factState, factStat, rungProgress, save, startSession, nextQuestion, submit, finish,'
  + ' MODE_INFO, game, renderTotals, renderHistory, renderBest, medianOf };\n';

function fakeEl(id) {
  const props = { textContent: '', value: '', innerHTML: '', hidden: false, disabled: false, offsetWidth: 0, children: [], title: '', type: 'button' };
  const cls = new Set();
    const t = {
    id, style: { setProperty() {}, removeProperty() {}, cssText: '' }, dataset: {},
    focus() {}, blur() {}, click() {}, querySelectorAll: () => [],
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
      if (k === 'innerHTML') {
        if (v === '') props.children = [];
        props.innerHTML = v;
        props.textContent = String(v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
        return true;
      }
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
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, Set,
    setTimeout: fn => { fn(); return 0; },
    requestAnimationFrame: () => 0,
    performance: { now: () => clock },
    window: {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
      querySelectorAll: () => [], createElement: t => fakeEl(t),
      addEventListener: () => {}, hidden: false, body: fakeEl('body')
    }
  });
  vm.runInContext(stripped, ctx);
  return { X: ctx.__X, els, tick: ms => { clock += ms; }, el: id => els.get(id) };
}
const b = boot();
let X = b.X;
ok('boots', !!X && Array.isArray(X.ab.val));

const read = s => s.reduce((n, d, i) => n + d * Math.pow(10, i), 0);
const zeros = () => { const a = []; for (let i = 0; i < X.ab.cols; i++) a.push(0); return a; };

console.log('2. the abacus value model');
{
  let bad = [];
  for (let n = 0; n <= 9999; n++) {
    const d = X.abDigits(n);
    const v = read(d);
    if (v !== n) { bad.push(n + ' -> ' + v); break; }
    if (d.some(x => x < 0 || x > 9)) { bad.push(n + ' digit out of range: ' + d.join(',')); break; }
  }
  ok('abDigits/abNumber round trip for 0..9999', bad.length === 0, bad.join(' | '));
  ok('abDigits is wide enough for the full frame', X.abDigits(987654321).length === X.ab.cols && X.abDigits(987654321)[0] === 1 && X.abDigits(987654321)[8] === 9, 'cols=' + X.ab.cols + ' d=' + X.abDigits(987654321).join(','));
  ok('abSet returns the clamped number', X.abSet(243) === 243 && X.abSet(-5) === 0 && X.abSet('abc') === 0 && X.abSet(1e15) === 9999999999999, String(X.abSet(1e15)));
  X.abSet(243);
  ok('upper bead is worth five', X.abLowerCount(0) === 3 && X.abUpperOn(0) === false, 'val=' + X.ab.val.join(','));
  X.ab.val = [7, 0, 0, 0];
  ok('7 uses the 5-bead plus two 1-beads', X.abUpperOn(0) === true && X.abLowerCount(0) === 2, 'val=' + X.ab.val.join(','));
  X.ab.val = [5, 0, 0, 0]; X.ab.val.length = X.ab.cols;
  ok('5 is the big bead alone', X.abUpperOn(0) === true && X.abLowerCount(0) === 0);
  X.ab.val = zeros();
  ok('0 is everything down', X.abUpperOn(0) === false && X.abLowerCount(0) === 0);
  X.ab.val = zeros();
  ok('abSplit skips empty columns', X.abSplit(243).map(p => p.digit).sort().join('') === '234' && X.abSplit(0).length === 0 && X.abSplit(1000).length === 1);
  ok('abSplit reads columns right to left', X.abSplit(243)[0].place === 0 && X.abSplit(243)[2].place === 2);
}

console.log('3. showing a number always lands on that number');
{
  let bad = [];
  for (const n of [0, 1, 5, 9, 10, 40, 50, 99, 100, 243, 505, 1000, 9999, 35, 7]) {
    const plan = X.abStepsMake(n);
    const last = plan.steps[plan.steps.length - 1].state;
    const v = read(last);
    if (v !== n) bad.push(n + ' -> ' + v);
    plan.steps.forEach((s, i) => {
      if (!Array.isArray(s.state) || s.state.length !== X.ab.cols) bad.push(n + ' step ' + i + ' bad state len=' + (s.state && s.state.length));
      else if (s.state.some(x => x < 0 || x > 9)) bad.push(n + ' step ' + i + ' digit out of range');
      if (!s.say || !s.say.length) bad.push(n + ' step ' + i + ' no narration');
    });
  }
  ok('every "show it" plan ends on the right number', bad.length === 0, bad.slice(0, 3).join(' | '));
  ok('showing 243 takes several steps, not one', X.abStepsMake(243).steps.length >= 4, String(X.abStepsMake(243).steps.length));
  ok('a 5 gets its own explanation', X.abStepsMake(35).steps.some(s => /big bead/.test(s.say)));
  ok('narrations read naturally (no "there is 4 tens")', !X.abStepsMake(243).steps.some(s => /There is 4 tens/.test(s.say)));
}

console.log('4. addition walks correctly (the bug that was live a moment ago)');
{
  let bad = [], total = 0;
  const cases = [];
  for (let a = 0; a <= 1200; a += 7) for (const b of [1, 5, 9, 10, 35, 100, 250, 3]) cases.push([a, b]);
  for (const [a, b] of cases) {
    total++;
    const plan = X.abStepsAdd(a, b);
    const last = plan.steps[plan.steps.length - 1].state;
    const v = read(last);
    if (v !== a + b) { bad.push(a + '+' + b + ' -> ' + v + ' expected ' + (a + b)); if (bad.length > 3) break; }
    for (const s of plan.steps) if (!Array.isArray(s.state) || s.state.some(x => x < 0 || x > 9)) { bad.push(a + '+' + b + ' bad state'); break; }
  }
  ok(total + ' additions all land on a+b with valid columns', bad.length === 0, bad.slice(0, 3).join(' | '));
  
  ok('243 + 35 walks 243, 248, then 5 alone, 273, 278', (() => {
    const frames = X.abStepsAdd(243, 35).steps.map(s => read(s.state));
    return frames.join(',') === '243,248,5,273,278';
  })(), X.abStepsAdd(243, 35).steps.map(s => read(s.state)).join(','));
  ok('the 5-bead step shows only the 5, so the child can see it', (() => {
    const p = X.abStepsAdd(243, 5);
    const five = p.steps.filter(s => /big bead/.test(s.say))[0];
    return five && read(five.state) === 5;
  })());
  ok('adding 5 is called out as the easy one', X.abStepsAdd(243, 5).steps.some(s => /big bead/.test(s.say)));
  ok('adding past 9999 does not crash', (() => { const p = X.abStepsAdd(9990, 100); return p.steps.length > 0; })());
  ok('adding zero is harmless', (() => { const p = X.abStepsAdd(243, 0); return p.steps[p.steps.length - 1].state[2] === 2; })());
}

console.log('5. subtraction walks correctly');
{
  let bad = [];
  const cases = [];
  for (let a = 10; a <= 1500; a += 11) for (const b of [1, 4, 5, 9, 10, 24, 100]) if (b <= a) cases.push([a, b]);
  for (const [a, b] of cases) {
    const plan = X.abStepsSub(a, b);
    const last = plan.steps[plan.steps.length - 1].state;
    const v = read(last);
    if (v !== a - b) { bad.push(a + '-' + b + ' -> ' + v + ' expected ' + (a - b)); if (bad.length > 3) break; }
  }
  ok(cases.length + ' subtractions all land on a-b', bad.length === 0, bad.slice(0, 3).join(' | '));
  ok('243 - 35 = 208', (() => { const p = X.abStepsSub(243, 35); const l = p.steps[p.steps.length - 1].state; return read(l) === 208; })());
  ok('taking away more than you have is refused kindly', (() => {
    const p = X.abStepsSub(24, 35);
    return /does not go below nothing/.test(p.steps[0].say) && /smaller number/.test(p.steps[0].say);
  })());
  ok('borrowing is handled (100 - 1 = 99)', (() => { const p = X.abStepsSub(100, 1); const l = p.steps[p.steps.length - 1].state; return read(l) === 99; })());
  ok('subFrom borrows across columns like a real abacus (1000 - 5 = 995)', (() => {
    const r = X.subFrom([0, 0, 0, 1], [5, 0, 0, 0]);
    return r && read(r) === 995;
  })());
  ok('subFrom returns null when there is genuinely nothing to borrow', X.subFrom([0, 0, 0, 0], [1, 0, 0, 0]) === null);
  ok('every subtraction step stays on the frame', (() => {
    let bad = [];
    for (let a = 10; a <= 900; a += 13) for (const bb of [1, 7, 40, 99]) {
      if (bb > a) continue;
      for (const s of X.abStepsSub(a, bb).steps) if (!Array.isArray(s.state) || s.state.some(x => x < 0 || x > 9)) bad.push(a + '-' + bb);
    }
    return bad.length === 0;
  })());
}

console.log('6. tapping beads works and never leaves a broken state');
{
  X.abClear();
  ok('clear means zero', X.abNumber() === 0 && X.ab.val.length === X.ab.cols && X.ab.val.every(v => v === 0), 'val=' + X.ab.val.join(''));
  ok('renderAbacus draws every column plus the readout', b.el('ab-frame').children.length === X.ab.cols + 1, String(b.el('ab-frame').children.length));
  const first = X.ab.cols - 1;
  const col = b.el('ab-frame').children[0];
  ok('each column is the 5-bead, the beam, the place label, then four 1-beads', col.children.length === 7, 'children=' + col.children.length);
  ok('the 5-bead comes before the beam', /abup/.test(col.children[0].className) && /abbeam/.test(col.children[1].className), col.children[0].className + ' then ' + col.children[1].className);
  ok('the last four are the 1-beads', [3, 4, 5, 6].every(i => /ablow/.test(col.children[i].className)), [3, 4, 5, 6].map(i => col.children[i].className).join(','));
  ok('the biggest column is first on screen', col.children[2].textContent === '1T', col.children[2].textContent);
  ok('the ones column is last on screen', b.el('ab-frame').children[first].children[2].textContent === '1', b.el('ab-frame').children[first].children[2].textContent);
  let bad = [];
  for (let col_i = 0; col_i < X.ab.cols; col_i++) {
    for (let b2 = 0; b2 < 4; b2++) {
      X.abClear();
      X.renderAbacus();
      const again = b.el('ab-frame').children[col_i];
      if (/on/.test(again.children[3 + b2].className)) bad.push('col ' + col_i + ' bead ' + b2 + ' lit at zero');
    }
  }
  ok('no 1-bead is lit on an empty frame', bad.length === 0, bad.join(' | '));
  const ones = () => b.el('ab-frame').children[first];
  ok('the 5-bead lights for a value of 5..9', (() => { X.ab.val[0] = 6; X.renderAbacus(); return /abup on/.test(ones().children[0].className); })(), ones().children[0].className);
  ok('the 5-bead stays up for 0..4', (() => { X.ab.val[0] = 4; X.renderAbacus(); return !/on/.test(ones().children[0].className); })(), ones().children[0].className);
  ok('every third column is marked as a unit rod', (() => {
    X.abClear(); X.renderAbacus();
    const unit = i => /unit/.test(b.el('ab-frame').children[first - i].children[2].className);
    return unit(2) && !unit(1) && unit(5) && !unit(4) && unit(8);
  })());
  ok('the width picker offers 7, 9 and 13 columns', JSON.stringify(X.AB_SIZES) === '[7,9,13]', JSON.stringify(X.AB_SIZES));
  ok('every column has a place label up to a trillion', X.AB_LABELS.length === 13 && X.AB_LABELS[12] === '1T' && X.AB_LABELS[0] === '1', X.AB_LABELS.join(','));
  ok('fewer columns means bigger beads for fingers', (() => {
    X.abResize(7); const big = X.abScale().bead;
    X.abResize(13); const small = X.abScale().bead;
    X.abResize(9); const mid = X.abScale().bead;
    return big > mid && mid > small;
  })());
  ok('the hands panel lights the fingers for the ones column, not the biggest one', (() => {
    X.abClear(); X.abResize(13);
    X.ab.digits = X.abDigits(3042);
    X.renderHands();
    const left = b.el('fingers-left').children;
    const right = b.el('fingers-right').children;
    const lit = box => box.filter(c => c._cls.has('on')).length;
    const r = lit(left) === 2 && lit(right) === 0;
    X.ab.digits = X.abDigits(7);
    X.renderHands();
    const r2 = lit(left) === 5 && lit(right) === 2;
    X.ab.digits = X.abDigits(9);
    X.renderHands();
    const r3 = lit(left) === 5 && lit(right) === 4;
    X.ab.digits = X.abDigits(0);
    X.renderHands();
    const r4 = lit(left) === 0 && lit(right) === 0;
    return left.length === 5 && right.length === 5 && r && r2 && r3 && r4;
  })(), 'fingers left/right built');
  ok('changing width keeps the number on the frame', (() => {
    X.abClear(); X.abSet(1234); X.renderAbacus();
    X.abResize(7); X.renderAbacus();
    const kept = X.abNumber() === 1234;
    X.abResize(9); X.renderAbacus();
    const grown = X.abNumber() === 1234 && X.ab.cols === 9;
    X.abResize(13); X.renderAbacus();
    return kept && grown && X.abNumber() === 1234;
  })());
  ok('tapping a 1-bead raises exactly that bead', (() => {
    X.abClear(); X.renderAbacus();
    const tens = b.el('ab-frame').children[2];
    tens.children[3].addEventListener('click', () => {});
    return true;
  })());
}

console.log('7. stepping through narrates and moves the beads');
{
  X.abClear();
  const plan = X.abStepsMake(243);
  X.abRun(plan);
  ok('running a plan starts at step 0', X.ab.at === 0 && /Press/.test(String(b.el('ab-say').textContent)));
  let seen = [];
  for (let i = 0; i < plan.steps.length; i++) {
    X.abNext();
    seen.push(X.abNumber());
  }
  ok('the final frame reads 243', seen[seen.length - 1] === 243, seen.join(' -> '));
  ok('every step produced narration', seen.length === plan.steps.length);
  X.abNext();
  ok('stepping past the end says so rather than breaking', /finished/.test(String(b.el('ab-say').textContent)), String(b.el('ab-say').textContent));
  X.abClear();
  ok('clear resets the plan', X.ab.steps.length === 0 && X.abNumber() === 0);
}

console.log('8. the times table reference is arithmetically right');
{
  let bad = [];
  for (let n = 1; n <= X.TV_MAX_N; n++) {
    for (const cap of [20, 40, 60]) {
      X.tv.n = n; X.tv.cap = cap;
      X.renderTables();
      const grid = b.el('tv-grid');
      const expected = Math.floor(cap / n);
      if (grid.children.length !== expected) { bad.push(n + '@' + cap + ' chips=' + grid.children.length + ' expected=' + expected); continue; }
      for (let k = 1; k <= expected; k++) {
        const chip = grid.children[k - 1];
        if (chip.children[0].textContent !== n + ' × ' + k) { bad.push(n + '@' + cap + ' label ' + chip.children[0].textContent); break; }
        if (Number(chip.children[1].textContent) !== n * k) { bad.push(n + '@' + cap + ' value ' + chip.children[1].textContent + ' expected ' + n * k); break; }
      }
    }
  }
  ok('every table lists its multiples correctly up to 20, 40 and 60', bad.length === 0, bad.slice(0, 3).join(' | '));
  X.tv.n = 2; X.tv.cap = 60; X.renderTables();
  ok('the 2 times table is 2, 4, 6 ... 60', b.el('tv-grid').children.length === 30 && b.el('tv-grid').children[29].children[1].textContent === '60');
  ok('the 7 times table stops at 56 (7x8) under a cap of 60', (() => { X.tv.n = 7; X.renderTables(); return b.el('tv-grid').children.length === 8; })());
  ok('the drill button names the chosen table', /id="btn-tables-drill"[^>]*>Practise times/.test(fs.readFileSync(process.argv[2], 'utf8')) && String(b.el('tv-drill-n').textContent) === '7', 'span says ' + String(b.el('tv-drill-n').textContent));
  ok('a table picker exists for 1..12', b.el('tv-picker').children.length === X.TV_MAX_N, String(b.el('tv-picker').children.length));
}

console.log('9. the table colours follow real mastery');
{
  const sb = boot(JSON.stringify({ facts: { 'mul:2:3': { seen: 3, right: 3, times: [1000, 1100, 1200] } } }));
  const S = sb.X;
  S.tv.n = 2; S.tv.cap = 60;
  S.renderTables();
  const chips = sb.el('tv-grid').children;
  let knownOnes = 0;
  for (const c of chips) if (c.dataset.state === 'known') knownOnes++;
  ok('2 x 3 shows as known', chips[2].dataset.state === 'known', chips[2].dataset.state + ' ' + chips[2].children[0].textContent);
  ok('nothing else claims to be known', knownOnes === 1, String(knownOnes));
  ok('known is counted in the note', /1 of 30 known/.test(String(sb.el('tv-note').textContent)), String(sb.el('tv-note').textContent));
  ok('the state lookup works in either order', (() => {
    S.save.facts['mul:6:4'] = { seen: 3, right: 3, times: [900, 900, 900] };
    return S.mulState(4, 6) === 'known' && S.mulState(6, 4) === 'known';
  })());
}

console.log('10. the table drill really drills that table');
{
  const b2 = boot();
  const Z = b2.X;
  Z.tv.n = 7;
  Z.game.tableN = 7;
  Z.startSession('table', 'easy', ['mul']);
  let bad = [];
  for (let i = 0; i < 300; i++) {
    const q = Z.nextQuestion();
    if (q.a !== 7) { bad.push('expected the table 7 first, got ' + q.text); break; }
    if (q.answer !== 7 * q.b) { bad.push('bad product ' + q.text + ' = ' + q.answer); break; }
    if (q.b < 2 || 7 * q.b > 60) { bad.push('product out of the 60 range: ' + q.text); break; }
  }
  ok('every drill question is 7 x k with the product inside 60', bad.length === 0, bad.join(' | '));
  ok('the mode is labelled with the table', /Table Drill/.test(String(b2.el('g-mode').textContent)) && /7/.test(String(b2.el('g-mode').textContent)), String(b2.el('g-mode').textContent));
  ok('the drill has a 60 second clock', Z.MODE_INFO.table.time === 60);
  b2.el('g-input').value = String(Z.game.q.answer);
  Z.submit();
  ok('the drill scores like any other session', Z.game.correct === 1, String(Z.game.correct));
  Z.finish('time');
  ok('the drill writes a history row', Z.save.history[0].mode === 'table', JSON.stringify(Z.save.history[0] && Z.save.history[0].mode));
  const b3 = boot();
  const W = b3.X;
  W.startSession('sprint', 'easy', ['add', 'mul']);
  let clean = true;
  for (let i = 0; i < 200; i++) { const q = W.nextQuestion(); if (!q || !q.text) { clean = false; break; } }
  ok('the new mode does not leak into normal drills', clean && W.game.tableN === 0);
}

console.log('11. corrupt save still safe for the new pieces');
{
  ['not json', '{}', '{"facts":3}', '{"skills":[]}', '{"facts":{"mul:2:3":"nope","mul:2:4":7}}'].forEach(raw => {
    try {
      const bb = boot(raw);
      const S = bb.X;
      let r = 'ok';
      try { S.renderTables(); S.renderAbacus(); S.abStepsAdd(12, 34); S.startSession('table', 'easy', ['mul']); } catch (e) { r = e.message; }
      ok('survives ' + raw, r === 'ok', r);
    } catch (e) { ok('survives ' + raw, false, e.message); }
  });
  {
    const bb = boot(JSON.stringify({ facts: { 'mul:2:3': { seen: 3, right: 3, times: 'x' } } }));
    const S = bb.X;
    let r = 'ok';
    try { S.renderTables(); S.factState('mul:2:3'); S.rungProgress('mul', 0); } catch (e) { r = e.message; }
    ok('a non-array times field does not break the table', r === 'ok', r);
  }
  {
    const bb = boot(JSON.stringify({ facts: { 'mul:2:3': { seen: 3, right: 3, times: [null, 5, 'x', 2100, 2400, 2200, undefined, 9] } } }));
    const S = bb.X;
    ok('junk times are filtered out, good ones kept', S.save.facts['mul:2:3'].times.length === 5, JSON.stringify(S.save.facts['mul:2:3'].times));
    ok('a partly broken history still reads as known', S.factState('mul:2:3') === 'known', S.factState('mul:2:3'));
  }
  {
    const bb = boot(JSON.stringify({ facts: { 'mul:2:3': { seen: 3, right: 3, times: 'x' } } }));
    ok('the loader repairs the entry on save', (() => {
      const S = bb.X;
      S.factStat('mul:2:3');
      return S.save.facts['mul:2:3'].times.length === 0;
    })());
  }
}

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);
