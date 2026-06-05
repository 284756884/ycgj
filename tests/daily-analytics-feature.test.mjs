import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(inlineScripts.length > 0, 'page should include parseable inline scripts');
inlineScripts.forEach((script, index) => {
  assert.doesNotThrow(
    () => new Function(script),
    `inline script ${index + 1} should not have JavaScript syntax errors`
  );
});

assert.match(html, /id="storePerformanceClientIdInput"/, 'store API modal should still include Performance Client ID input');
assert.match(html, /id="storePerformanceClientSecretInput"/, 'store API modal should still include Performance Client Secret input');
assert.match(html, /performanceClientId:\s*String\(info\.performanceClientId/, 'getStoreApiInfo should return Performance Client ID');
assert.match(html, /performanceClientSecret:\s*String\(info\.performanceClientSecret/, 'getStoreApiInfo should return Performance Client Secret');
assert.match(html, /setStoreApiInfo\s*\(\s*store\s*,\s*clientId\s*,\s*apiKey\s*,\s*performanceClientId\s*,\s*performanceClientSecret\s*\)/, 'saving store API info should preserve Performance credentials');

assert.match(html, /\.sticky-leading-col/, 'stock table should have sticky first column style');
assert.match(html, /\.sticky-summary-col/, 'stock table should have sticky summary column style');
assert.match(html, /class="sticky-leading-col"/, 'stock table first column should apply sticky style');
assert.match(html, /class="summary-col sticky-summary-col/, 'stock table summary column should apply sticky style');

assert.match(html, /id="dailyAnalyticsModal"/, 'daily sales popup should exist');
assert.match(html, /id="dailyAnalyticsCalendar"/, 'daily sales popup should render a calendar grid');
assert.match(html, /id="dailyCalendarMonthLabel"/, 'daily sales calendar should show a month label');
assert.match(html, /function\s+renderDailyAnalyticsCalendar\s*\(/, 'daily sales popup should render a calendar-style view');
assert.match(html, /class="[^"]*\bmonthly-sales-value\b[^"]*"/, 'summary monthly sales number should be clickable');
assert.match(html, /<span\s+id="totalMonCell"\s+class="monthly-sales-value"/, 'daily popup should bind to the summary monthly sales number');
assert.doesNotMatch(html, /<input[^>]+class="monthly-input\s+monthly-sales-value"/, 'region monthly inputs must keep their original monthly-input style');
assert.match(html, /openDailyAnalyticsModal\s*\(/, 'clicking monthly summary should open daily sales calendar');

assert.match(html, /function\s+getMissingDailyAnalyticsDates\s*\(/, 'daily sales sync should only request uncached dates');
assert.match(html, /function\s+filterSyncableDailyAnalyticsDates\s*\(/, 'daily sales sync should filter out future dates before requesting Seller analytics');
assert.match(html, /function\s+mergeDailyAnalyticsSyncDates\s*\(/, 'daily sales sync should merge missing dates with the previous day overwrite date');
assert.match(html, /function\s+getRollingDailyAnalyticsDates\s*\(/, 'daily sales cache should use a rolling 28-day window');
assert.match(html, /function\s+getDailyAnalyticsSalesTotal\s*\(/, 'daily sales cache should expose a rolling total helper');
assert.match(html, /function\s+syncDailyAnalyticsForDates\s*\(/, 'daily sales sync should sync selected dates');
assert.match(html, /dailyAnalyticsCache/, 'daily sales results should be cached');
assert.match(html, /\/v1\/analytics\/data/, 'daily sales should use Seller analytics data');
assert.match(html, /ordered_units/, 'daily sales should read ordered_units');
assert.doesNotMatch(html, /\/api\/client\/statistics\/json/, 'daily sales calendar must not call Performance ad statistics');
assert.doesNotMatch(html, /adSharePercent|adSpend|广告占比|广告花费/, 'daily sales calendar must not keep ad share or ad spend fields');

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

const syncStoresSource = extractFunctionSource(html, 'syncStores');
const syncCurrentSkuAnalyticsSource = extractFunctionSource(html, 'syncCurrentSkuAnalytics');
const applyAnalyticsSummarySource = extractFunctionSource(html, 'applyAnalyticsSummaryToCurrentSku');
const syncDailyAnalyticsForDatesSource = extractFunctionSource(html, 'syncDailyAnalyticsForDates');
const syncMissingDailyAnalyticsSource = extractFunctionSource(html, 'syncMissingDailyAnalytics');

const sandbox = {
  DEFAULT_STORE: 'Default Store',
  currentStore: 'Store A',
  storeList: ['Default Store', 'Store A'],
  storeSkuMap: {},
  storeSkuNameMap: {},
  regionsData: {},
  storeApiMap: {
    'Store A': {
      clientId: 'seller-client',
      apiKey: 'seller-key',
      performanceClientId: 'perf-client',
      performanceClientSecret: 'perf-secret'
    }
  },
  parseDataKey: () => null
};
vm.createContext(sandbox);
vm.runInContext(`${syncStoresSource}; syncStores();`, sandbox);
assert.equal(sandbox.storeApiMap['Store A'].performanceClientId, 'perf-client', 'refresh initialization must preserve Performance Client ID');
assert.equal(sandbox.storeApiMap['Store A'].performanceClientSecret, 'perf-secret', 'refresh initialization must preserve Performance Client Secret');

assert.doesNotMatch(syncCurrentSkuAnalyticsSource, /requireStorePerformanceInfo|fetchPerformanceSpendMap|resolveCurrentPerformanceCampaignIds/, 'monthly sales sync must not call Performance ad analytics');
assert.match(applyAnalyticsSummarySource, /const\s+monthlyValue\s*=\s*Math\.max\s*\(\s*0\s*,\s*Math\.round\s*\(\s*toFiniteNumber\s*\(\s*row\.monthlySales28Days\s*\)\s*\)\s*\)/, 'monthly sales sync should normalize each regional monthly value');
assert.match(applyAnalyticsSummarySource, /getSkuData\s*\(\s*row\.region\s*,\s*art\s*\)\.monthlySales\s*=\s*monthlyValue/, 'monthly sales sync should update each region monthly value');
assert.match(applyAnalyticsSummarySource, /applyMonthlySalesInputValue\s*\(\s*document\s*,\s*row\.region\s*,\s*monthlyValue\s*\)/, 'monthly sales sync should update the visible region monthly input boxes');
assert.match(html, /monthlySummarySalesMap/, 'monthly sales sync needs a per SKU summary value cache');
assert.doesNotMatch(syncDailyAnalyticsForDatesSource, /requireStorePerformanceInfo|fetchPerformanceSpendMap|resolveCurrentPerformanceCampaignIds/, 'daily sales sync must only use Seller analytics data');
assert.match(syncMissingDailyAnalyticsSource, /filterSyncableDailyAnalyticsDates\s*\(/, 'syncMissingDailyAnalytics must avoid future dates rejected by date_to validation');
assert.match(syncMissingDailyAnalyticsSource, /mergeDailyAnalyticsSyncDates\s*\(\s*dates\s*,\s*missing\s*/, 'syncMissingDailyAnalytics must also refresh the previous day so partial same-day cache is overwritten');
assert.match(syncCurrentSkuAnalyticsSource, /const\s+rollingDates\s*=\s*getRollingDailyAnalyticsDates\s*\(\s*28\s*\)/, 'monthly sales sync should build the latest rolling 28-day window');
assert.match(syncCurrentSkuAnalyticsSource, /const\s+summary\s*=\s*await\s+fetchCurrentAnalyticsStockSummary\s*\(\s*currentStore\s*\)/, 'monthly sales sync should fetch regional monthly sales');
assert.match(syncCurrentSkuAnalyticsSource, /applyAnalyticsSummaryToCurrentSku\s*\(\s*summary\s*,\s*mode\s*\)/, 'monthly sales sync should apply regional monthly sales');
assert.match(syncCurrentSkuAnalyticsSource, /syncMissingDailyAnalytics\s*\(\s*rollingDates\s*,/, 'monthly sales sync should only backfill missing dates in the latest rolling 28 days');

console.log('daily sales calendar hooks are present');
