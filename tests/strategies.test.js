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

console.log('1. id references exist in HTML');
const declaredIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const usedIds = new Set([...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
const missing = [...usedIds].filter(id => !declaredIds.has(id));
ok(`${usedIds.size} referenced ids all exist`, missing.length === 0, missing.join(', '));
const dupes = [...declaredIds].filter(id => (html.match(new RegExp('id="' + id + '"', 'g')) || []).length > 1);
ok('no duplicate ids', dupes.length === 0, dupes.join(', '));
[['mode-picker', 'data-mode'], ['diff-picker', 'data-diff'], ['op-picker', 'data-op'], ['teach-picker', 'data-teach']].forEach(pair => {
  ok(`${pair[0]} has [${pair[1]}] targets`, html.includes(`${pair[1]}="`));
});

console.log('2. boot with stubbed DOM');
const stripped = src
  .replace(/^renderHome\(\);$/m, '')
  .replace(/^wire\(\);$/m, '')
  + '\nglobalThis.__X = { STRATEGIES, STRATEGY_BY_ID, TEACH_LABEL, TEACH_HINT, OP_ORDER, OP_SIGN, OP_NAME,'
  + ' MODE_INFO, LIMITS, LAB_LENGTH, save, play, game, persist, blankSave, ri, buildQuestion, makeQuestion,'
  + ' mistakeKey, multiplier, qLabel, nextQuestion, startSession, submit, finish, goDrill,'
  + ' skillFor, medianOf, medianText, skillAccuracy, skillNeed, pickWeightedLesson, recordSkill,'
  + ' startLab, nextLabQuestion, submitLab, endLab, renderLab, renderLabMenu, labNextText,'
  + ' setView, updateHud, renderHome, renderResults, renderTotals, renderHistory, renderBest, escapeHtml, fmt, pad2, pad3 };\n';

function fakeEl(id) {
  const props = { textContent: '', value: '', innerHTML: '', hidden: false, disabled: false, offsetWidth: 0, children: [] };
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
      toggle: (n, force) => {
        if (force === undefined) { cls.has(n) ? cls.delete(n) : cls.add(n); }
        else if (force) cls.add(n); else cls.delete(n);
      }
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
function boot(seed) {
  const els = new Map();
  const store = new Map();
  if (seed) store.set('mentalmaths.v1', seed);
  let clock = 1000;
  const ctx = vm.createContext({
    console, Math, JSON, Date, Object, Array, String, Number, isNaN, parseInt, setTimeout,
    requestAnimationFrame: () => 0,
    performance: { now: () => clock },
    window: {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); },
      querySelectorAll: () => [],
      createElement: t => fakeEl(t),
      addEventListener: () => {},
      hidden: false,
      body: fakeEl('body')
    }
  });
  vm.runInContext(stripped, ctx);
  return { ctx, X: ctx.__X, els, store, tick: ms => { clock += ms; }, el: id => els.get(id) };
}

console.log('3. registry integrity');
let b = boot();
let X = b.X;
ok('8 lessons registered', X.STRATEGIES.length === 8, String(X.STRATEGIES.length));
const ids = X.STRATEGIES.map(s => s.id);
ok('lesson ids unique', new Set(ids).size === ids.length);
X.STRATEGIES.forEach(s => {
  const complete = !!(s.id && s.name && s.rule && s.why && s.op && typeof s.make === 'function' && typeof s.accepts === 'function' && typeof s.steps === 'function');
  ok(`${s.id}: has id/name/rule/why/op/make/accepts/steps`, complete, Object.keys(s).join(','));
  ok(`${s.id}: op is a real op`, X.OP_ORDER.indexOf(s.op) > -1, s.op);
  ok(`${s.id}: registered in lookup`, X.STRATEGY_BY_ID[s.id] === s);
});
ok('all teaching modes known', X.TEACH_LABEL.example && X.TEACH_LABEL.steps && X.TEACH_LABEL.hint);

console.log('4. generators honour their own precondition (2000 each)');
const preIssues = [];
X.STRATEGIES.forEach(s => {
  ['easy', 'medium', 'hard'].forEach(diff => {
    for (let i = 0; i < 2000; i++) {
      let q;
      try { q = s.make(diff); } catch (e) { preIssues.push(`${s.id}/${diff} threw ${e.message}`); return; }
      if (!s.accepts(q)) { preIssues.push(`${s.id}/${diff} -> ${q.text} violates precondition`); return; }
      if (!q || q.answer === undefined || Number.isNaN(q.answer)) { preIssues.push(`${s.id}/${diff} -> ${q && q.text} bad answer`); return; }
    }
  });
});
ok('24000 generated lesson questions all satisfy their precondition', preIssues.length === 0, preIssues.slice(0, 3).join(' | '));

console.log('5. lesson steps reconstruct the true answer');
const stepIssues = [];
X.STRATEGIES.forEach(s => {
  ['easy', 'medium', 'hard'].forEach(diff => {
    for (let i = 0; i < 1500; i++) {
      const q = s.make(diff);
      const expectByOp = { add: q.a + q.b, sub: q.a - q.b, mul: q.a * q.b, div: q.a / q.b, sq: q.a * q.a, by11: q.a * 11 };
      if (q.answer !== expectByOp[q.op]) stepIssues.push(`${s.id}: ${q.op} answer wrong for ${q.text} (${q.answer} vs ${expectByOp[q.op]})`);
      const steps = s.steps(q);
      if (!Array.isArray(steps) || steps.length < 2) { stepIssues.push(`${s.id}: no steps for ${q.text}`); continue; }
      const last = steps[steps.length - 1];
      if (last.answer !== q.answer) { stepIssues.push(`${s.id}: last step ${last.answer} != answer ${q.answer} for ${q.text}`); continue; }
      steps.forEach((st, idx) => {
        if (typeof st.label !== 'string' || !st.label) stepIssues.push(`${s.id}: step ${idx} no label`);
        if (typeof st.expr !== 'string' || !st.expr) stepIssues.push(`${s.id}: step ${idx} no expr`);
        if (st.answer !== null && (typeof st.answer !== 'number' || !Number.isFinite(st.answer))) stepIssues.push(`${s.id}: step ${idx} bad answer ${st.answer} for ${q.text}`);
      });
      if (steps.filter(st => st.answer !== null).length < 1) stepIssues.push(`${s.id}: no typeable step for ${q.text}`);
    }
  });
});
ok('36000 step sets end on the true answer and are well formed', stepIssues.length === 0, stepIssues.slice(0, 4).join(' | '));

console.log('6. hand-checked worked examples match the docs');
const show = id => {
  const s = X.STRATEGY_BY_ID[id];
  const q = s.make('easy');
  return { q: q.text, steps: s.steps(q).map(st => `${st.label}: ${st.expr}${st.answer === null ? '' : ' = ' + st.answer}`) };
};
const end5 = show('end5');
ok('ends in 5 example squares a number ending in 5', /^\d+5² =$/.test(end5.q), end5.q);
ok('ends in 5 steps mention n x (n+1)', end5.steps.some(s => /× \d+ = \d+$/.test(s)) && end5.steps.some(s => /25/.test(s)), end5.steps.join(' / '));
const near = show('near');
ok('near-100 example sits within 9 of a base', /^(9\d|10\d) × (9\d|10\d) =$|^\d{3} × \d{3} =$/.test(near.q), near.q);
ok('near-100 steps produce a 2/3-digit right half', near.steps.some(s => /right half is always \d digits/.test(s)), near.steps.join(' / '));
const cw = show('crosswise');
ok('crosswise example is two 2-digit numbers', /^\d\d × \d\d =$/.test(cw.q), cw.q);
ok('crosswise steps mention crosswise', cw.steps.some(s => /Crosswise/.test(s)), cw.steps.join(' / '));
const fr = show('fromround');
ok('subtract-from-round example is 100 - n', /^\d00 − \d+ =$/.test(fr.q), fr.q);
ok('subtract-from-round steps use all nines', fr.steps.some(s => /99 −/.test(s)) || fr.steps.some(s => /999 −/.test(s)), fr.steps.join(' / '));
const t11 = show('times11');
ok('times 11 example ends with × 11', /× 11 =$/.test(t11.q), t11.q);
ok('times 11 steps show neighbour sums', t11.steps.some(s => /\d \+ \d = \d+$/.test(s)), t11.steps.join(' / '));
const sn = show('squarenear');
ok('square-near-round example is a square', /² =$/.test(sn.q), sn.q);
ok('square-near-round steps use difference of squares', sn.steps.some(s => /Difference of squares/.test(s)), sn.steps.join(' / '));
const hv = show('halve');
ok('halve example multiplies by 5, 25 or 50', /× (5|25|50) =$/.test(hv.q), hv.q);
const nn = show('nine');
ok('nine-family example is ×9, ×99 or +9', /× (9|99) =$| \+ 9 =$/.test(nn.q), nn.q);

console.log('7. 995^2 and 98x97 land on the values we advertise');
const e5 = X.STRATEGY_BY_ID.end5;
ok('995² generated for the hard level and equals 990025', (() => {
  for (let i = 0; i < 4000; i++) { const q = e5.make('hard'); if (q.a === 995) return q.answer === 990025; }
  return false;
})());
const nr = X.STRATEGY_BY_ID.near;
ok('98 × 97 generated and equals 9506', (() => {
  for (let i = 0; i < 40000; i++) { const q = nr.make('medium'); if (q.a === 98 && q.b === 97) return q.answer === 9506; }
  return false;
})());

console.log('8. skills + recommendation');
b = boot(); X = b.X;
ok('no skills at boot', Object.keys(X.save.skills).length === 0);
ok('recommends Ends in 5 when nothing is tried', /Ends in 5/.test(X.labNextText()), X.labNextText());
X.recordSkill('end5', true, 1500);
X.recordSkill('end5', true, 2500);
X.recordSkill('end5', true, 2100);
X.recordSkill('near', false, 9000);
X.recordSkill('near', false, 8000);
ok('median of odd-length list', X.medianOf([1500, 2500, 2100]) === 2100, String(X.medianOf([1500, 2500, 2100])));
ok('median of even-length list', X.medianOf([1500, 2500, 2100, 2400]) === 2250, String(X.medianOf([1500, 2500, 2100, 2400])));
ok('median of empty list', X.medianOf([]) === 0);
ok('accuracy computed', X.skillAccuracy(X.save.skills.end5) === 100 && X.skillAccuracy(X.save.skills.near) === 0);
ok('worst lesson recommended', /Numbers near 100/.test(X.labNextText()), X.labNextText());
ok('no successes means no bogus speed claim', /none right yet/.test(X.labNextText()) && !/inside 3 seconds/.test(X.labNextText()), X.labNextText());
ok('weighted pick returns a real lesson', (() => { for (let i = 0; i < 300; i++) { const l = X.pickWeightedLesson(); if (X.STRATEGY_BY_ID[l.id] !== l) return false; } return true; })());
const counts = {};
for (let i = 0; i < 4000; i++) { const l = X.pickWeightedLesson(); counts[l.id] = (counts[l.id] || 0) + 1; }
ok('weak lesson is picked more often than the strong one', (counts.near || 0) > (counts.end5 || 0), JSON.stringify(counts));
ok('times list capped at 20', (() => { for (let i = 0; i < 40; i++) X.recordSkill('times11', true, 1000 + i); return X.save.skills.times11.times.length === 20; })());

console.log('9. skills survive a save/load round trip');
const seeded = JSON.stringify({ skills: { end5: { seen: 3, correct: 2, times: [1000, 2000, 3000] } }, prefs: { teach: 'hint' } });
b = boot(seeded); X = b.X;
ok('skills loaded', X.save.skills.end5.seen === 3 && X.save.skills.end5.times.length === 3);
ok('teach pref loaded', X.save.prefs.teach === 'hint');
ok('new lessons default to no skill entry', X.save.skills.crosswise === undefined);
b = boot('{"prefs":{"teach":"nonsense"}}'); X = b.X;
ok('invalid teach pref falls back', X.save.prefs.teach === 'steps', X.save.prefs.teach);
ok('invalid ops still repaired', X.save.prefs.ops.length === 4, JSON.stringify(X.save.prefs.ops));

console.log('10. full lab session: type every step');
b = boot(); X = b.X;
X.save.prefs.teach = 'steps';
X.save.prefs.diff = 'easy';
X.startLab('end5');
ok('lab view is showing', b.el('view-play')._cls.has('hidden') === false);
ok('play view hides home', b.el('view-home')._cls.has('hidden') === true);
ok('question rendered', /² =$/.test(b.el('p-question').textContent), b.el('p-question').textContent);
ok('three steps listed', b.el('p-steps').children.length === 3, String(b.el('p-steps').children.length));
ok('step 1 prompt is the n x (n+1) line', /^\d+ × \d+$/.test(b.el('p-prompt').innerHTML.split('</span>')[1]), b.el('p-prompt').innerHTML);
ok('asked steps show ? until reached', b.el('p-steps').children[1].className === 'now' && b.el('p-steps').children[2].className === 'masked');
ok('nothing scored yet', X.play.score === 0 && X.play.answered === 0);
const firstQ = X.play.q;
b.el('p-input').value = '99999';
b.tick(400);
X.submitLab();
ok('wrong intermediate advances and teaches', X.play.stepIdx === 1 && /No — it was/.test(b.el('p-feedback').textContent), b.el('p-feedback').textContent);
ok('wrong intermediate does not score or count as answered', X.play.score === 0 && X.play.answered === 0);
ok('wrong intermediate does not touch the mistake bank', Object.keys(X.save.mistakes).length === 0);
const step2 = X.play.ask[1].answer;
b.el('p-input').value = String(step2);
X.submitLab();
ok('last step is the final answer', X.play.answered === 1 && X.play.correct === 1 && X.play.score === 10, X.play.score + '/' + X.play.answered);
ok('moved to question 2', X.play.qnum === 2 && X.play.q !== firstQ);
ok('time recorded', X.play.times.length === 1);
ok('skill updated', X.save.skills.end5.seen === 1 && X.save.skills.end5.correct === 1);
ok('streak carried', X.play.streak === 1);
ok('input cleared and refocused', b.el('p-input').value === '');

console.log('11. wrong final answer banks the mistake and reveals');
b = boot(); X = b.X;
X.save.prefs.teach = 'hint';
X.startLab('crosswise');
const q = X.play.q;
b.el('p-input').value = String(q.answer + 3);
b.tick(2500);
X.submitLab();
ok('answered counted as wrong', X.play.answered === 1 && X.play.correct === 0);
ok('mistake banked under the right form', Object.keys(X.save.mistakes).length === 1 && Object.keys(X.save.mistakes)[0] === X.mistakeKey(q), Object.keys(X.save.mistakes)[0]);
ok('skill records the miss', X.save.skills.crosswise.seen === 1 && X.save.skills.crosswise.correct === 0);
ok('hint mode reveals the method after a miss', b.el('p-hint').hidden === true);
ok('feedback shows the true answer', b.el('p-feedback').textContent === 'No — it was ' + q.answer, b.el('p-feedback').textContent);
ok('steps no longer masked', b.el('p-steps').children.every(li => li.className !== 'masked'), b.el('p-steps').children.map(li => li.className).join('|'));
ok('drill can now replay it', (() => {
  X.save.mistakes[Object.keys(X.save.mistakes)[0]].q = { op: q.op, diff: q.diff, a: q.a, b: q.b };
  X.game.mode = 'drill'; X.game.ops = ['mul'];
  const replay = X.nextQuestion();
  return replay.answer === q.answer && replay.text === q.text;
})(), X.nextQuestion && 'replay text: ' + X.nextQuestion().text);

console.log('12. worked-example mode shows the answer first');
b = boot(); X = b.X;
X.save.prefs.teach = 'example';
X.startLab('times11');
ok('first question is the worked example', X.play.example === true);
ok('input row hidden for the example', b.el('p-ansrow').hidden === true);
ok('example button offered', b.el('p-next-example').hidden === false);
ok('all steps revealed', b.el('p-steps').children.every(li => li.className !== 'masked'));
ok('nothing recorded for the example', X.play.answered === 0);
b.el('p-next-example').value = '';
X.nextLabQuestion();
ok('moving on gives a real question', X.play.example === false && X.play.qnum === 2 && b.el('p-ansrow').hidden === false);
ok('no method revealed for the free question', b.el('p-steps').children.some(li => li.className === 'masked'));
ok('final answer scored once right', (() => { b.el('p-input').value = String(X.play.q.answer); X.submitLab(); return X.play.answered === 1 && X.play.correct === 1; })());

console.log('13. session ends after 8 questions and writes totals');
b = boot(); X = b.X;
X.save.prefs.teach = 'steps';
X.startLab('halve');
let guard = 0;
while (!X.play.done && guard++ < 200) {
  const expect = X.play.stepIdx < X.play.ask.length ? X.play.ask[X.play.stepIdx].answer : X.play.q.answer;
  b.el('p-input').value = String(expect);
  b.tick(1800);
  const before = X.play.qnum;
  X.submitLab();
  if (X.play.done) break;
  if (X.play.qnum === before && X.play.stepIdx === 0) throw new Error('stuck on q' + before);
}
ok('session completes', X.play.done === true, 'guard=' + guard);
ok('exactly 8 questions', X.play.answered === 8 && X.play.qnum === 8, X.play.answered + '/' + X.play.qnum);
ok('all correct', X.play.correct === 8);
ok('combo scoring kicked in', X.play.score > 80, String(X.play.score));
ok('summary shown, question hidden', b.el('p-summary')._cls.has('hidden') === false && b.el('p-ask')._cls.has('hidden') === true);
ok('median reported as seconds', /^1\.8s$/.test(String(b.el('s-median').textContent)), String(b.el('s-median').textContent));
ok('summary note names the lesson and the 3s target', /Multiply by 5, 25 and 50/.test(String(b.el('s-note').textContent)) && /3-second target/.test(String(b.el('s-note').textContent)), String(b.el('s-note').textContent));
ok('totals persisted', X.save.totals.answered === 8 && X.save.totals.correct === 8);
ok('history labels it a lab session', X.save.history[0].mode === 'lab');
ok('history row renders without crashing', (() => { X.renderHistory(); return true; })());
ok('next run is a fresh session', (() => { X.startLab('halve'); return X.play.qnum === 1 && X.play.score === 0 && X.play.done === false; })());

console.log('14. mixed lab picks a lesson and quits cleanly');
b = boot(); X = b.X;
X.startLab('mixed');
ok('mixed resolves to a real lesson', !!X.STRATEGY_BY_ID[X.play.lesson.id]);
ok('no questions answered yet', X.play.answered === 0);
ok('quitting with nothing answered returns to the menu', (() => { X.endLab(); return X.play.done === true && X.save.totals.answered === 0; })());

console.log('15. existing game modes still work after the refactor');
b = boot(); X = b.X;
X.startSession('sprint', 'easy', ['sq']);
ok('sq question generates', /² =$/.test(b.el('g-question').textContent), b.el('g-question').textContent);
ok('qLabel squares compactly', (() => { const q = X.play && X.makeQuestion('sq', 'easy'); return X.qLabel(q) === q.a + '²'; })());
ok('by11 generates', /× 11 =$/.test(X.makeQuestion('by11', 'medium').text));
ok('by11 answer is right', (() => { const q = X.makeQuestion('by11', 'medium'); return q.answer === q.a * 11; })());
for (const op of X.OP_ORDER) {
  let good = true;
  for (let i = 0; i < 3000; i++) {
    const q = X.makeQuestion(op, 'medium');
    const nums = q.text.match(/\d[\d,]*/g).map(t => parseInt(t.replace(/,/g, ''), 10));
    let expect;
    if (op === 'add') expect = nums[0] + nums[1];
    else if (op === 'sub') expect = nums[0] - nums[1];
    else if (op === 'mul') expect = nums[0] * nums[1];
    else if (op === 'div') expect = nums[0] / nums[1];
    else if (op === 'sq') expect = nums[0] * nums[0];
    else expect = nums[0] * nums[1];
    if (q.answer !== expect) { good = false; console.log('    ' + op + ': ' + q.text + ' = ' + q.answer + ' expected ' + expect); break; }
  }
  ok('makeQuestion(' + op + ') is arithmetically exact', good);
}
ok('round trip of sq through the bank', (() => {
  const q = X.makeQuestion('sq', 'medium');
  const again = X.buildQuestion(q.op, q.diff, q.a, q.b);
  return again.text === q.text && again.answer === q.answer;
})());
ok('round trip of by11 through the bank', (() => {
  const q = X.makeQuestion('by11', 'hard');
  const again = X.buildQuestion(q.op, q.diff, q.a, q.b);
  return again.text === q.text && again.answer === q.answer;
})());

console.log(fails ? `\n${fails} FAILURE(S)` : '\nall checks passed');
process.exit(fails ? 1 : 0);
