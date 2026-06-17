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

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
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

assert.match(html, /function\s+sanitizePathSegment\s*\(/, 'PDF SKU folder should sanitize path segment names');
assert.match(html, /function\s+buildPdfSkuDirectory\s*\(/, 'PDF export should build a SKU subdirectory under the selected directory');

const sanitizeSource = extractFunctionSource(html, 'sanitizePathSegment');
assert.match(sanitizeSource, /replace\s*\(\s*\/\[\\\\\/:\*\?"<>\|\]/, 'SKU folder name should replace invalid Windows path characters');
assert.match(sanitizeSource, /slice\s*\(\s*0\s*,\s*80\s*\)/, 'SKU folder name should be bounded');

const folderSource = extractFunctionSource(html, 'buildPdfSkuDirectory');
assert.match(folderSource, /sanitizePathSegment\s*\(\s*skuArticle/, 'PDF folder should be based on the current SKU');
assert.match(folderSource, /replace\s*\(\s*\/\[\\\\\/\]\+\$/, 'PDF folder should keep the custom base directory and append one child folder');
assert.match(folderSource, /`\$\{cleanBase\}\\\\\$\{folder\}`/, 'PDF folder should use a Windows child directory under the selected directory');

const downloadSource = extractAsyncFunctionSource(html, 'downloadCargoLabelPdf');
assert.match(downloadSource, /skuArticle\s*=\s*options\.skuArticle\s*\|\|\s*currentSKU\.article/, 'PDF download should accept the current SKU article for folder creation');
assert.match(downloadSource, /const\s+pdfDirectory\s*=\s*buildPdfSkuDirectory\s*\(\s*directory\s*,\s*skuArticle\s*\)/, 'PDF download should save into the SKU subfolder');
assert.match(downloadSource, /directory:\s*pdfDirectory/, 'PDF download request should pass the SKU subfolder to the local proxy');
assert.match(downloadSource, /filename:\s*`\$\{supplyId\}\.pdf`/, 'PDF filename should remain the request number');

const exportSource = extractAsyncFunctionSource(html, 'exportDateWithOzon');
assert.match(exportSource, /downloadCargoLabelPdf\s*\(\s*row\.requestNo\s*,\s*directory\s*,\s*currentStore\s*,\s*\{\s*request:\s*exportOzonRequest\s*,\s*localRequest:\s*exportLocalJsonRequest\s*,\s*skuArticle:\s*currentSKU\.article\s*\}\s*\)/, 'PDF export should pass the current SKU to PDF downloads');
assert.match(exportSource, /buildPdfSkuDirectory\s*\(\s*directory\s*,\s*currentSKU\.article\s*\)/, 'PDF export progress should mention the SKU subfolder');

console.log('export PDF saves labels under SKU folder');
