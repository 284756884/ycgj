import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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

const collectDateSupplyRowsSource = extractFunctionSource(html, 'collectDateSupplyRows');
const dataKey = 'Store A||SKU-1';
const sandbox = {
  REGION_ORDER: ['莫斯科', '雅罗斯拉夫尔'],
  currentSKU: { article: 'SKU-1' },
  result: null,
  getCurrentDataKey() {
    return dataKey;
  },
  getSkuData(region, article) {
    const data = {
      '莫斯科': {
        [dataKey]: {
          pendingShipments: [
            { date: '2026-06-09', qty: 3, requestNo: '200001' }
          ]
        }
      },
      '雅罗斯拉夫尔': {
        [dataKey]: {
          pendingShipments: [
            { date: '2026-06-09', qty: 4, requestNo: '200001' }
          ]
        }
      }
    };
    return data[region][article];
  }
};

vm.createContext(sandbox);
vm.runInContext(`${collectDateSupplyRowsSource}; result = collectDateSupplyRows('2026-06-09');`, sandbox);

assert.equal(sandbox.result.length, 1, 'same request number should still export once');
assert.equal(sandbox.result[0].qty, 7, 'same request number quantities should be summed');
assert.match(sandbox.result[0].region, /莫斯科/, 'exported region label should keep the first region');
assert.match(sandbox.result[0].region, /雅罗斯拉夫尔/, 'exported region label should include later regions for the same request');

console.log('export region aggregation preserves all regions for a request');
