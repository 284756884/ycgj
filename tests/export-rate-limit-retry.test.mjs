import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

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

assert.match(html, /const\s+EXPORT_RETRY_DELAY_MS\s*=\s*1500/, 'export retries should wait 1.5 seconds between retryable request failures');
assert.match(html, /function\s+isRetryableExportRequestError\s*\(/, 'export should classify retryable request failures');
assert.match(html, /async\s+function\s+retryExportRequest\s*\(/, 'export should have a retry wrapper that does not abort on rate limit');
assert.match(html, /async\s+function\s+exportOzonRequest\s*\(/, 'export Ozon calls should use the retry wrapper');
assert.match(html, /async\s+function\s+exportLocalJsonRequest\s*\(/, 'export PDF download calls through local proxy should also be retryable');

const retryExportRequestSource = extractAsyncFunctionSource(html, 'retryExportRequest');
assert.match(retryExportRequestSource, /while\s*\(\s*true\s*\)/, 'retryable export request failures should keep retrying instead of aborting the export');
assert.match(retryExportRequestSource, /isRetryableExportRequestError\s*\(\s*error\s*\)/, 'retry wrapper should only continue for retryable request failures');
assert.match(retryExportRequestSource, /await\s+sleep\s*\(\s*EXPORT_RETRY_DELAY_MS\s*\)/, 'retry wrapper should wait the configured 1.5 seconds before retrying');
assert.match(retryExportRequestSource, /throw\s+error/, 'non-retryable business errors should still stop the export');

const exportOzonRequestSource = extractAsyncFunctionSource(html, 'exportOzonRequest');
assert.match(exportOzonRequestSource, /retryExportRequest\s*\(/, 'export Ozon requests should run through retryExportRequest');
assert.match(exportOzonRequestSource, /attempts:\s*1/, 'export retry wrapper should own retry timing instead of nesting ozonRequest retries');

const readSupplyContextSource = extractAsyncFunctionSource(html, 'readSupplyContext');
assert.match(readSupplyContextSource, /options\s*=\s*\{\}/, 'supply context reader should accept an export request override');
assert.match(readSupplyContextSource, /request\s*\(/, 'supply context reader should use the injected request function');

const smartSyncSupplySource = extractAsyncFunctionSource(html, 'smartSyncSupply');
assert.match(smartSyncSupplySource, /options\s*=\s*\{\}/, 'smartSyncSupply should accept an export request override');
assert.match(smartSyncSupplySource, /request\s*\(/, 'smartSyncSupply should use the retryable request function when provided');

const downloadCargoLabelPdfSource = extractAsyncFunctionSource(html, 'downloadCargoLabelPdf');
assert.match(downloadCargoLabelPdfSource, /options\s*=\s*\{\}/, 'PDF download should accept retryable request overrides');
assert.match(downloadCargoLabelPdfSource, /localRequest\s*\(/, 'PDF file download should use the retryable local request function when provided');

const exportDateWithOzonSource = extractAsyncFunctionSource(html, 'exportDateWithOzon');
assert.match(exportDateWithOzonSource, /smartSyncSupply\s*\(\s*row\.requestNo\s*,\s*boxQty\s*,\s*currentStore\s*,\s*row\.qty\s*,\s*\{\s*request:\s*exportOzonRequest\s*\}\s*\)/, 'batch export box sync should use retryable Ozon requests');
assert.match(exportDateWithOzonSource, /downloadCargoLabelPdf\s*\(\s*row\.requestNo\s*,\s*directory\s*,\s*currentStore\s*,\s*\{\s*request:\s*exportOzonRequest\s*,\s*localRequest:\s*exportLocalJsonRequest\s*\}\s*\)/, 'batch export PDF download should use retryable Ozon and local requests');

console.log('export rate limit retry hooks are present');
