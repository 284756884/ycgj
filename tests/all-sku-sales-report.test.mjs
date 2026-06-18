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

assert.match(html, /id="allSkuSalesReportBtn"/, 'bottom area should include all-SKU sales report button');
assert.match(html, /id="allSkuSalesReportBtn"[^>]*>\s*整体数据\s*<\/button>/, 'bottom button should be named 整体数据');
assert.doesNotMatch(html, />\s*📈 所有SKU销售数据\s*<\/button>/, 'old button text should be removed');
assert.match(html, /\.btn-xs\.all-sku-sales-report-btn\s*\{[^}]*background:\s*#4f46e5/, 'small overall data button should keep a visible filled background');
assert.match(html, /\.btn-xs\.all-sku-sales-report-btn\s*\{[^}]*color:\s*white/, 'small overall data button text should stay visible on the filled background');
assert.match(html, /id="allSkuSalesReportModal"/, 'all-SKU sales report should open in a standalone modal');
assert.match(html, /id="syncAllSkuSalesReportBtn"/, 'report modal should include a sync-all-SKU data button');
assert.match(html, /id="allSkuSalesReportStoreFilters"/, 'report modal should include store filter buttons');
assert.match(html, /id="allSkuSalesReportTable"/, 'all-SKU sales report modal should contain a table');
assert.match(html, /all-sku-sales-report-modal/, 'report modal should use the enlarged report layout');
assert.match(html, /all-sku-sales-report-header/, 'report modal should have a header area for title and sync action');
assert.match(html, /all-sku-sales-report-table/, 'report table should use the larger report table styling');
assert.match(html, /all-sku-name-cell/, 'SKU name cells should use dedicated visual styling');
assert.match(html, /中文名/, 'first report column should be Chinese SKU name');
assert.match(html, /总库存/, 'second report column should be total inventory');
assert.match(html, /昨日销量/, 'third report column should be yesterday sales');
assert.match(html, /7日内日均销量/, 'fourth report column should be 7-day average daily sales');
assert.match(html, /28日内日均销量/, 'fifth report column should be 28-day average daily sales');

assert.match(html, /function\s+getPreviousNDates\s*\(/, 'report should build ranges from yesterday backwards');
assert.match(html, /function\s+buildAllSkuSalesReportRows\s*\(/, 'report should compute all-SKU sales rows');
assert.match(html, /function\s+getAllSkuSalesReportStores\s*\(/, 'report should list available store filters');
assert.match(html, /function\s+renderAllSkuSalesReportStoreFilters\s*\(/, 'report should render all/store filter buttons');
assert.match(html, /function\s+formatAllSkuNameWithArticle\s*\(/, 'report should format Chinese name with SKU in parentheses');
assert.match(html, /function\s+renderAllSkuSalesReport\s*\(/, 'report should render sorted rows');
assert.match(html, /function\s+syncAllSkuSalesReportData\s*\(/, 'report should have a modal sync helper');
assert.match(html, /function\s+openAllSkuSalesReport\s*\(/, 'report should have an open modal helper');

const previousDatesSource = extractFunctionSource(html, 'getPreviousNDates');
assert.match(previousDatesSource, /setDate\s*\(\s*base\.getDate\(\)\s*-\s*1\s*\)/, 'date ranges should start from yesterday');
assert.match(previousDatesSource, /length:\s*count/, 'date ranges should include the requested number of days');

const rowsSource = extractFunctionSource(html, 'buildAllSkuSalesReportRows');
assert.match(rowsSource, /storeList/, 'report should aggregate across all stores');
assert.match(rowsSource, /selectedStore/, 'report should accept a selected store filter');
assert.match(rowsSource, /selectedStore\s*!==\s*ALL_SKU_SALES_REPORT_ALL_STORES/, 'report should support all stores versus one store');
assert.match(rowsSource, /getSkuObjectsForStore\s*\(\s*store/, 'report should include every SKU in every store');
assert.match(rowsSource, /getInventory\s*\(/, 'report should sum inventory');
assert.match(rowsSource, /getDailyAnalyticsSalesTotal\s*\(\s*yesterdayDates/, 'report should use cached daily data for yesterday sales');
assert.match(rowsSource, /getDailyAnalyticsSalesTotal\s*\(\s*sevenDates/, 'report should use cached daily data for 7-day sales');
assert.match(rowsSource, /getDailyAnalyticsSalesTotal\s*\(\s*twentyEightDates/, 'report should use cached daily data for 28-day sales');
assert.match(rowsSource, /totalInventory/, 'report rows should include total inventory');
assert.match(rowsSource, /average7Days/, 'report rows should include 7-day average daily sales');
assert.match(rowsSource, /average28Days/, 'report rows should include 28-day average daily sales');

const renderSource = extractFunctionSource(html, 'renderAllSkuSalesReport');
assert.match(renderSource, /sort\s*\(\s*\(a\s*,\s*b\)\s*=>\s*b\.average28Days\s*-\s*a\.average28Days/, 'report should default sort by 28-day average descending');
assert.match(renderSource, /allSkuSalesReportTable/, 'report should render into the report table');
assert.match(renderSource, /currentAllSkuSalesReportStore/, 'report should render rows for the selected store filter');
assert.match(renderSource, /formatAllSkuNameWithArticle\s*\(\s*row\s*\)/, 'report should render Chinese name with SKU in parentheses');

const filterSource = extractFunctionSource(html, 'renderAllSkuSalesReportStoreFilters');
assert.match(filterSource, /ALL_SKU_SALES_REPORT_ALL_STORES/, 'store filters should include an all-data option');
assert.match(filterSource, /getAllSkuSalesReportStores\s*\(\s*\)/, 'store filters should include every store');
assert.match(filterSource, /data-store-filter/, 'store filter buttons should carry their store value');

const nameSource = extractFunctionSource(html, 'formatAllSkuNameWithArticle');
assert.match(nameSource, /row\.name/, 'formatted name should include the Chinese SKU name');
assert.match(nameSource, /row\.article/, 'formatted name should include the SKU article');
const syncBusySource = extractFunctionSource(html, 'setAllStoresSkusSyncBusy');
assert.match(syncBusySource, /syncAllStoresSkusBtn/, 'top all-store sync button should keep receiving sync progress');
assert.match(syncBusySource, /syncAllSkuSalesReportBtn/, 'report modal sync button should receive sync progress');

const reportSyncSource = extractFunctionSource(html, 'syncAllSkuSalesReportData');
assert.match(reportSyncSource, /await\s+syncAllStoresSkusAnalytics\s*\(\s*\)/, 'report sync button should reuse existing all-store all-SKU sync logic');
assert.match(reportSyncSource, /renderAllSkuSalesReport\s*\(\s*\)/, 'report sync should refresh the modal table after sync');
assert.match(nameSource, /（[\s\S]*）/, 'formatted name should wrap SKU in Chinese parentheses');

assert.match(html, /allSkuSalesReportBtn[\s\S]*onclick\s*=\s*openAllSkuSalesReport/, 'bottom button should open the sales report modal');
assert.match(html, /syncAllSkuSalesReportBtn[\s\S]*onclick\s*=\s*syncAllSkuSalesReportData/, 'modal sync button should start all-SKU sync');
assert.match(html, /allSkuSalesReportStoreFilters[\s\S]*addEventListener\s*\(\s*'click'/, 'store filter buttons should switch the visible report rows');
assert.match(html, /currentAllSkuSalesReportStore\s*=\s*btn\.dataset\.storeFilter/, 'store filter click should update selected store');
assert.match(html, /closeAllSkuSalesReportBtn[\s\S]*allSkuSalesReportModal[\s\S]*display\s*=\s*'none'/, 'report modal should have a close button');

console.log('all SKU sales report hooks are present');
