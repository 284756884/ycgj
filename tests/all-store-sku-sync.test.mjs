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

assert.match(html, /id="syncAllStoresSkusBtn"/, 'top toolbar should include one-click all-store all-SKU sync button');
assert.match(html, /function\s+getAllStoreSkuSyncTargets\s*\(/, 'all sync should collect every store/SKU target');
assert.match(html, /async\s+function\s+syncAllStoresSkusAnalytics\s*\(/, 'all sync should have an orchestrator');
assert.match(html, /async\s+function\s+syncOneStoreSkuAnalyticsWithRetry\s*\(/, 'all sync should retry each store/SKU until transient interface errors recover');
assert.match(html, /async\s+function\s+fetchSkuAnalyticsStockSummary\s*\(/, 'analytics stock fetch should accept an explicit SKU/store');
assert.match(html, /function\s+applyAnalyticsSummaryToSku\s*\(/, 'analytics summary apply should accept an explicit SKU/store');

const targetsSource = extractFunctionSource(html, 'getAllStoreSkuSyncTargets');
assert.match(targetsSource, /syncStores\s*\(\s*\)/, 'all sync target collection should normalize stores first');
assert.match(targetsSource, /storeList/, 'all sync should iterate all stores');
assert.match(targetsSource, /getSkuObjectsForStore\s*\(\s*store/, 'all sync should include every SKU in each store');
assert.match(targetsSource, /seen/, 'all sync should avoid duplicate store/SKU targets');

const fetchSource = extractAsyncFunctionSource(html, 'fetchSkuAnalyticsStockSummary');
assert.match(fetchSource, /article/, 'explicit analytics fetch should use the target SKU article');
assert.match(fetchSource, /storeName/, 'explicit analytics fetch should use the target store');
assert.match(fetchSource, /resolveCurrentOzonSkuForAnalytics\s*\(\s*offerId\s*,\s*storeName\s*\)/, 'explicit analytics fetch should resolve Ozon SKU for the target');

const applySource = extractFunctionSource(html, 'applyAnalyticsSummaryToSku');
assert.match(applySource, /getDataKey\s*\(\s*article\s*,\s*storeName\s*\)/, 'summary apply should write to target store/SKU data key');
assert.match(applySource, /mode\s*===\s*'inventory'/, 'summary apply should update inventory');
assert.match(applySource, /monthlySales/, 'summary apply should update monthly sales');
assert.match(applySource, /setMonthlySummarySales\s*\(/, 'summary apply should update summary monthly sales cache');

const allSyncSource = extractAsyncFunctionSource(html, 'syncAllStoresSkusAnalytics');
const oneTargetRetrySource = extractAsyncFunctionSource(html, 'syncOneStoreSkuAnalyticsWithRetry');
assert.match(oneTargetRetrySource, /while\s*\(\s*true\s*\)/, 'each store/SKU sync should stay on the current target until it succeeds or hits a non-retryable error');
assert.match(oneTargetRetrySource, /isRetryableApiRequestError\s*\(\s*error\s*\)/, 'each store/SKU retry should only auto-repeat retryable interface errors');
assert.match(oneTargetRetrySource, /await\s+sleep\s*\(\s*API_RETRY_DELAY_MS\s*\)/, 'each store/SKU retry should wait the shared 1.5 seconds');
assert.match(oneTargetRetrySource, /onRetry\s*\(/, 'each store/SKU retry should expose progress updates while waiting');
assert.match(oneTargetRetrySource, /throw\s+error/, 'non-retryable setup/data errors should still surface');
assert.match(allSyncSource, /getAllStoreSkuSyncTargets\s*\(\s*\)/, 'all sync should process collected targets');
assert.match(allSyncSource, /for\s*\(\s*let\s+index\s*=\s*0;\s*index\s*<\s*targets\.length/, 'all sync should iterate targets one by one');
assert.match(allSyncSource, /syncOneStoreSkuAnalyticsWithRetry\s*\(\s*target\s*,\s*rollingDates\s*,/, 'all sync should use retry protection for each target');
assert.match(allSyncSource, /catch\s*\(\s*error\s*\)[\s\S]*failures\.push/, 'all sync should record failures and continue');
assert.match(oneTargetRetrySource, /fetchSkuAnalyticsStockSummary\s*\(\s*target\.article\s*,\s*target\.store/, 'all sync should fetch stock/sales for each target');
assert.match(oneTargetRetrySource, /applyAnalyticsSummaryToSku\s*\(\s*summary\s*,\s*'inventory'/, 'all sync should apply inventory');
assert.match(oneTargetRetrySource, /applyAnalyticsSummaryToSku\s*\(\s*summary\s*,\s*'monthlySales'/, 'all sync should apply monthly sales');
assert.match(oneTargetRetrySource, /syncMissingDailyAnalytics\s*\(\s*rollingDates\s*,\s*target\.store\s*,\s*target\.article\s*\)/, 'all sync should refresh daily sales cache per target');
assert.match(allSyncSource, /persist\s*\(\s*\)/, 'all sync should persist results');
assert.match(allSyncSource, /renderAll\s*\(\s*\)/, 'all sync should refresh current view after completion');

assert.match(html, /syncAllStoresSkusBtn[\s\S]*onclick\s*=\s*\(\s*\)\s*=>\s*syncAllStoresSkusAnalytics\s*\(\s*\)/, 'top button should trigger all-store all-SKU sync');

console.log('all store/SKU inventory and sales sync hooks are present');
