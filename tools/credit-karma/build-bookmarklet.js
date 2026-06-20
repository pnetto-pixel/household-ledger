// Generates tools/credit-karma/bookmarklet.txt (the pasteable javascript:
// one-liner) from bookmarklet.src.js. Run: node tools/credit-karma/build-bookmarklet.js
//
// Minification here is intentionally conservative: it strips the leading
// license/comment block and full-line // comments, then collapses runs of
// whitespace into single spaces. The source is written so this is safe
// (every statement terminates with ; } or {, no reliance on ASI, no //
// comments mid-line, no multi-line strings/regex).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, 'bookmarklet.src.js'), 'utf8');

const body = src
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line)) // drop full-line comments
  .join('\n')
  .replace(/\s+/g, ' ') // collapse whitespace
  .trim();

const bookmarklet = 'javascript:' + encodeURIComponent(body);
fs.writeFileSync(path.join(dir, 'bookmarklet.txt'), bookmarklet + '\n');
console.log('Wrote bookmarklet.txt (' + bookmarklet.length + ' chars)');
