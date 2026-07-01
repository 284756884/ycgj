import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const proxySource = fs.readFileSync(new URL('../proxy/server.js', import.meta.url), 'utf8');

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

const sandbox = { URL };
vm.createContext(sandbox);
vm.runInContext(`${extractFunctionSource(proxySource, 'normalizeDownloadUrl')}; globalThis.normalizeDownloadUrl = normalizeDownloadUrl;`, sandbox);

assert.equal(
  sandbox.normalizeDownloadUrl('https://ir-21.ozonru.cn/some/path/label.pdf').hostname,
  'ir-21.ozonru.cn',
  'proxy should allow Ozon PDF download CDN host ir-21.ozonru.cn'
);

assert.throws(
  () => sandbox.normalizeDownloadUrl('https://example.com/some/path/label.pdf'),
  /Rejected host: example\.com/,
  'proxy should still reject non-Ozon PDF URLs'
);

console.log('proxy PDF URL allowlist accepts Ozon CDN hosts');
