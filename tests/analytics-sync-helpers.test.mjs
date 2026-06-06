import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const htmlPath = new URL("../约仓工具2.5_店铺SKU名称独立版.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(/\/\* analytics-sync-testable-start \*\/([\s\S]*?)\/\* analytics-sync-testable-end \*\//);

assert.ok(match, "主工具 HTML 中应包含可测试的库存/月销量同步辅助函数");

const context = { console };
vm.createContext(context);
vm.runInContext(`
${match[1]}
globalThis.api = {
  buildAnalyticsStocksPayload,
  summarizeAnalyticsStocksByRegion,
  findRegionForOzonCluster,
  applyMonthlySalesInputValue,
  filterRestorableInputs,
  normalizeRegionClusterMap,
  mappingTextToList,
  getDailyAnalyticsOverwriteDate,
  mergeDailyAnalyticsSyncDates
};
`, context);

const { api } = context;

assert.equal(JSON.stringify(api.buildAnalyticsStocksPayload("2348323874")), JSON.stringify({ skus: ["2348323874"] }));
assert.throws(() => api.buildAnalyticsStocksPayload(" "), /SKU/);

const managedMap = api.normalizeRegionClusterMap({
  "莫斯科、莫斯科地区及远地区": ["Москва, МО и Дальние регионы"],
  "叶卡捷琳堡": ["ЕКАТЕРИНБУРГ_РФЦ_НОВЫЙ"],
}, ["莫斯科、莫斯科地区及远地区", "叶卡捷琳堡"]);

assert.equal(api.findRegionForOzonCluster("Москва, МО и Дальние регионы", ["莫斯科、莫斯科地区及远地区"], managedMap), "莫斯科、莫斯科地区及远地区");
assert.equal(api.findRegionForOzonCluster("ЕКАТЕРИНБУРГ_РФЦ_НОВЫЙ", ["叶卡捷琳堡"], managedMap), "叶卡捷琳堡");
assert.equal(api.findRegionForOzonCluster("Казань", ["喀山"], { "喀山": [] }), "");
assert.equal(JSON.stringify(api.mappingTextToList("Казань\nКАЗАНЬ_РФЦ_НОВЫЙ, Казань")), JSON.stringify(["Казань", "КАЗАНЬ_РФЦ_НОВЫЙ"]));

const rows = api.summarizeAnalyticsStocksByRegion({
  body: {
    items: [
      { cluster_name: "Казань", available_stock_count: 7, ads_cluster: 1.5 },
      { cluster_name: "КАЗАНЬ_РФЦ_НОВЫЙ", available_stock_count: 8, ads_cluster: 9.9 },
      { cluster_name: "Екатеринбург", available_stock_count: 516, ads_cluster: 9.571428571428571 },
      { cluster_name: "Unknown", available_stock_count: 100, ads_cluster: 100 },
    ],
  },
}, ["喀山", "叶卡捷琳堡"], api.normalizeRegionClusterMap({
  "喀山": ["Казань", "КАЗАНЬ_РФЦ_НОВЫЙ"],
  "叶卡捷琳堡": ["Екатеринбург"],
}, ["喀山", "叶卡捷琳堡"]));

assert.equal(JSON.stringify(rows.applied.map((row) => row.region)), JSON.stringify(["喀山", "叶卡捷琳堡"]));
assert.equal(rows.applied[0].remainingStock, 15);
assert.equal(rows.applied[0].averageDailySales28Days, 1.5);
assert.equal(rows.applied[0].monthlySales28Days, 42);
assert.equal(rows.applied[1].remainingStock, 516);
assert.equal(rows.applied[1].monthlySales28Days, 268);
assert.equal(rows.unmapped.length, 1);

const fakeDocument = {
  input: { value: "" },
  getElementById(id) {
    return id === "mon-莫斯科、莫斯科地区及远地区" ? this.input : null;
  },
};

assert.equal(api.applyMonthlySalesInputValue(fakeDocument, "莫斯科、莫斯科地区及远地区", 1234), true);
assert.equal(fakeDocument.input.value, "1234");
assert.equal(api.applyMonthlySalesInputValue(fakeDocument, "喀山", 99), false);

const restorable = api.filterRestorableInputs({
  "inv-喀山": "10",
  "mon-喀山": "280",
  "req-喀山": "200001",
}, { includeMonthly: false });
assert.equal(JSON.stringify(restorable), JSON.stringify({
  "inv-喀山": "10",
  "req-喀山": "200001",
}));

assert.equal(api.getDailyAnalyticsOverwriteDate(new Date(2026, 5, 4)), "2026-06-03");
assert.equal(JSON.stringify(api.mergeDailyAnalyticsSyncDates(
  ["2026-05-31", "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"],
  ["2026-06-04"],
  new Date(2026, 5, 4)
)), JSON.stringify(["2026-06-03", "2026-06-04"]));
assert.equal(JSON.stringify(api.mergeDailyAnalyticsSyncDates(
  ["2026-06-02", "2026-06-03", "2026-06-04"],
  ["2026-06-03", "2026-06-04"],
  new Date(2026, 5, 4)
)), JSON.stringify(["2026-06-03", "2026-06-04"]));
assert.equal(JSON.stringify(api.mergeDailyAnalyticsSyncDates(
  ["2026-06-02", "2026-06-03", "2026-06-04"],
  [],
  new Date(2026, 5, 4)
)), JSON.stringify(["2026-06-03", "2026-06-04"]));

console.log("analytics sync helper tests passed");
