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

assert.match(html, /name="exportMode"\s+value="table"/, 'export modal should offer table export mode');
assert.match(html, /name="exportMode"\s+value="pdf"/, 'export modal should offer PDF export mode');
assert.match(html, /id="exportRequestSelectAll"/, 'export modal should have select-all request checkbox');
assert.match(html, /id="exportRequestList"/, 'export modal should list selectable requests');
assert.match(html, /class="export-request-checkbox"[\s\S]*checked/, 'export request checkboxes should be selected by default');
assert.match(html, /id="boxQuantityGroup"/, 'box quantity should be in a mode-toggleable group');

assert.match(html, /function\s+renderExportRequestSelection\s*\(/, 'export modal should render request selection rows');
assert.match(html, /function\s+getSelectedExportRows\s*\(/, 'export should read only checked request rows');
assert.match(html, /function\s+getSelectedExportMode\s*\(/, 'export should read selected export mode');
assert.match(html, /function\s+updateExportModeUI\s*\(/, 'export modal should update fields for table/PDF mode');

const renderSelectionSource = extractFunctionSource(html, 'renderExportRequestSelection');
assert.match(renderSelectionSource, /collectDateSupplyRows\s*\(/, 'request list should use date supply rows');
assert.match(renderSelectionSource, /checked/, 'request list should default every request to checked');
assert.match(renderSelectionSource, /exportRequestCheckboxChanged/, 'request list should update select-all state after manual selection');

const selectedRowsSource = extractFunctionSource(html, 'getSelectedExportRows');
assert.match(selectedRowsSource, /querySelectorAll\s*\(\s*'\.export-request-checkbox:checked'\s*\)/, 'selected rows should come from checked request boxes');
assert.match(selectedRowsSource, /selected\.has\s*\(\s*row\.requestNo\s*\)/, 'selected rows should filter original rows by checked request numbers');

const modeUiSource = extractFunctionSource(html, 'updateExportModeUI');
assert.match(modeUiSource, /boxQuantityGroup[\s\S]*table/, 'box quantity should show only for table mode');
assert.match(modeUiSource, /confirmBoxBtn[\s\S]*PDF/, 'confirm button should change for PDF mode');

const exportSource = extractAsyncFunctionSource(html, 'exportDateWithOzon');
assert.match(exportSource, /const\s+mode\s*=\s*getSelectedExportMode\s*\(\s*\)/, 'export should branch by selected mode');
assert.match(exportSource, /const\s+rows\s*=\s*getSelectedExportRows\s*\(/, 'export should process only selected requests');
assert.match(exportSource, /if\s*\(\s*mode\s*===\s*'table'\s*\)/, 'table export path should be separate');
assert.match(exportSource, /if\s*\(\s*mode\s*===\s*'pdf'\s*\)/, 'PDF export path should be separate');
assert.match(exportSource, /saveWorkbookToDirectory\s*\(/, 'table export should still save workbook');
assert.match(exportSource, /downloadCargoLabelPdf\s*\(/, 'PDF export should download labels');

console.log('export mode selection hooks are present');
