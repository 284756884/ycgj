import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

function findFunctionBodyStart(source, start) {
  let parenDepth = 0;
  for (let index = start; index < source.length; index++) {
    const ch = source[index];
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (ch === '{' && parenDepth === 0) return index;
  }
  throw new Error('Could not locate function body');
}

function extractAsyncFunctionSource(source, name) {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = findFunctionBodyStart(source, start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    const ch = source[index];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

assert.match(html, /function\s+buildPdfSkuDirectory\s*\(/, 'shared SKU folder helper should exist');

const saveWorkbookSource = extractAsyncFunctionSource(html, 'saveWorkbookToDirectory');
assert.match(saveWorkbookSource, /const\s+workbookDirectory\s*=\s*buildPdfSkuDirectory\s*\(\s*directory\s*,\s*skuArticle\s*\)/, 'workbook export should build a SKU subfolder under the selected directory');
assert.match(saveWorkbookSource, /directory:\s*workbookDirectory/, 'workbook local save request should use the SKU subfolder');
assert.match(saveWorkbookSource, /filename/, 'workbook filename should stay as sku-store-date.xlsx');

console.log('export workbook saves table under SKU folder');
