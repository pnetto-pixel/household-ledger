// Generates the pasteable javascript: one-liner from a readable *.src.js.
// Run: node tools/credit-karma/build-bookmarklet.js [input.src.js] [output.txt]
// Defaults to bookmarklet.src.js -> bookmarklet.txt.
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
const inFile = process.argv[2] || 'bookmarklet.src.js';
const outFile = process.argv[3] || inFile.replace(/\.src\.js$/, '.txt');
const src = fs.readFileSync(path.join(dir, inFile), 'utf8');

const body = src
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line)) // drop full-line comments
  .join('\n')
  .replace(/\s+/g, ' ') // collapse whitespace
  .trim();

const bookmarklet = 'javascript:' + encodeURIComponent(body);
fs.writeFileSync(path.join(dir, outFile), bookmarklet + '\n');
console.log('Wrote ' + outFile + ' (' + bookmarklet.length + ' chars)');
