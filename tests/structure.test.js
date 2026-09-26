const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const body = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const stack = [];
const errs = [];
const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
let m;
while ((m = re.exec(body))) {
  const closing = m[1] === '/';
  const tag = m[2].toLowerCase();
  const self = m[4] === '/';
  if (tag === '!doctype' || VOID.has(tag) || self) continue;
  if (!closing) stack.push({ tag: tag, i: m.index });
  else {
    const top = stack.pop();
    if (!top) errs.push('extra </' + tag + '> at ' + m.index);
    else if (top.tag !== tag) errs.push('expected </' + top.tag + '> but got </' + tag + '> near char ' + m.index);
  }
}
stack.forEach(s => errs.push('unclosed <' + s.tag + '> opened at char ' + s.i));
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]);
const views = [...html.matchAll(/id="view-([a-z]+)"/g)].map(x => x[1]);
const refs = [...new Set([...html.matchAll(/setView\('([a-z]+)'\)/g)].map(x => x[1]))];
const missing = refs.filter(v => views.indexOf(v) < 0);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
const referenced = [...new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(x => x[1]))];
const unknown = referenced.filter(id => ids.indexOf(id) < 0);

let bad = 0;
const report = (name, good, extra) => {
  console.log((good ? '  ok   ' : '  FAIL ') + name + (good || !extra ? '' : ' -> ' + extra));
  if (!good) bad += 1;
};
report('html tags balanced', errs.length === 0, errs.slice(0, 3).join(' | '));
report('no duplicate element ids', dupes.length === 0, dupes.join(', '));
report(referenced.length + ' referenced ids all exist', unknown.length === 0, unknown.join(', '));
report('every setView target exists', missing.length === 0, missing.join(','));
console.log('  info  views: ' + views.join(', '));
console.log('  info  bytes: ' + html.length + '  lines: ' + html.split('\n').length);
console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nall checks passed');
process.exit(bad ? 1 : 0);

