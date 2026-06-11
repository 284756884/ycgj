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

assert.match(html, /function\s+splitShipRequestNos\s*\(/, 'request numbers should be normalized before duplicate checks');
assert.match(html, /function\s+findDuplicateShipRequestRows\s*\(/, 'ship request input should have duplicate detection');
assert.match(html, /function\s+formatDuplicateShipRequestError\s*\(/, 'duplicate errors should be formatted for users');

const findDuplicateSource = extractFunctionSource(html, 'findDuplicateShipRequestRows');
assert.match(findDuplicateSource, /pendingShipments/, 'duplicate check should include current pending shipments');
assert.match(findDuplicateSource, /events/, 'duplicate check should include completed shipment history');
assert.match(findDuplicateSource, /existingByRequest/, 'duplicate check should scan all pending requests across every region');
assert.match(findDuplicateSource, /existingRegion/, 'duplicate check should report where the request already exists');
assert.doesNotMatch(findDuplicateSource, /existingByRegion/, 'duplicate check should not be limited to the same region');
assert.match(findDuplicateSource, /row\.region/, 'duplicate check should report the duplicate input region');
assert.match(findDuplicateSource, /requestNo/, 'duplicate check should report the duplicate request number');

const formatErrorSource = extractFunctionSource(html, 'formatDuplicateShipRequestError');
assert.match(formatErrorSource, /地区/, 'duplicate error should mention the region');
assert.match(formatErrorSource, /已存在地区/, 'duplicate error should mention the existing pending region');
assert.match(formatErrorSource, /交货申请号码/, 'duplicate error should mention the request number');

const singleShipSnippet = html.slice(html.indexOf("document.querySelectorAll('.single-ship')"), html.indexOf("document.querySelectorAll('.region-name-header')"));
assert.match(singleShipSnippet, /findDuplicateShipRequestRows\s*\(\s*\[\s*\{\s*region:\s*r\s*,\s*requestNo:\s*reqNo\s*\}\s*\]\s*,\s*art\s*\)/, 'single region ship should validate duplicate request number before saving');
assert.match(singleShipSnippet, /alert\s*\(\s*formatDuplicateShipRequestError/, 'single region duplicate should show a clear alert');
assert.ok(singleShipSnippet.indexOf('findDuplicateShipRequestRows') < singleShipSnippet.indexOf('pendingShipments.push'), 'single region duplicate check should run before adding pending shipment');

const batchShipSnippet = html.slice(html.indexOf("document.getElementById('batchShipAllBtn').onclick"), html.indexOf("document.getElementById('exportDataBtn').onclick"));
assert.match(batchShipSnippet, /batchShipRows\s*=\s*\[\]/, 'batch ship should collect rows before writing data');
assert.match(batchShipSnippet, /findDuplicateShipRequestRows\s*\(\s*batchShipRows\s*,\s*getCurrentDataKey\s*\(\s*\)\s*\)/, 'batch ship should validate all selected rows for duplicates before saving');
assert.match(batchShipSnippet, /alert\s*\(\s*formatDuplicateShipRequestError/, 'batch duplicate should show a clear alert');
assert.ok(batchShipSnippet.indexOf('findDuplicateShipRequestRows') < batchShipSnippet.indexOf('pendingShipments.push'), 'batch duplicate check should run before adding pending shipments');

console.log('ship request duplicate protection hooks are present');
