import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index++) {
    const ch = source[index];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const renderStockTableSource = extractFunctionSource(html, 'renderStockTable');
const renderShipStatusSource = extractFunctionSource(html, 'renderShipStatus');
const renderShipHistorySource = extractFunctionSource(html, 'renderShipHistory');
const renderEventPanelSource = extractFunctionSource(html, 'renderEventPanel');
const openWarehouseModalSource = extractFunctionSource(html, 'openWarehouseModal');

assert.doesNotMatch(html, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/, 'current local date should not be read through UTC toISOString');
assert.match(html, /function\s+todayYmd\s*\(/, 'local today should have a shared helper');
assert.match(html, /function\s+regionDomIdPart\s*\(/, 'region DOM ids should use a stable helper');
assert.match(html, /function\s+inventoryInputId\s*\(/, 'inventory inputs should use a stable helper');
assert.match(html, /function\s+requestInputId\s*\(/, 'request inputs should use a stable helper');
assert.match(html, /function\s+monthlySalesInputId\s*\([^)]*\)[\s\S]*regionDomIdPart/, 'monthly input ids should use the stable region id helper');
assert.doesNotMatch(html, /inv-'\s*\+\s*[^;\n]*replace\(\s*\/\\s\/g/, 'inventory ids should not be built by stripping spaces');
assert.doesNotMatch(html, /req-'\s*\+\s*[^;\n]*replace\(\s*\/\\s\/g/, 'request ids should not be built by stripping spaces');
assert.doesNotMatch(html, /mon-\$\{[^}]*replace\(\s*\/\\s\/g/, 'monthly ids should not be built by stripping spaces');

assert.match(renderStockTableSource, /data-region="\$\{escapeHtml\(r\)\}"/, 'stock table region attributes should escape region names');
assert.match(renderStockTableSource, />\$\{escapeHtml\(r\)\}<span/, 'stock table region headers should escape region names');
assert.match(renderShipStatusSource, /<th>\$\{escapeHtml\(r\)\}<\/th>/, 'pending shipment headers should escape region names');
assert.match(renderShipHistorySource, /<th>\$\{escapeHtml\(r\)\}<\/th>/, 'shipment history headers should escape region names');
assert.match(renderEventPanelSource, /<td>\$\{escapeHtml\(e\.region\)\}<\/td>/, 'event log should escape region names');
assert.match(renderEventPanelSource, /data-region="\$\{escapeHtml\(e\.region\)\}"/, 'event log data-region should escape region names');
assert.match(openWarehouseModalSource, /\$\{escapeHtml\(w\)\}/, 'warehouse tags should escape warehouse names');
assert.match(openWarehouseModalSource, /data-warehouse="\$\{escapeHtml\(w\)\}"/, 'warehouse remove buttons should store escaped warehouse names separately');

console.log('HTML safety, local date, and region id hooks are present');
