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

const sources = [
  extractFunctionSource(html, 'getUpstreamBody'),
  extractFunctionSource(html, 'findDeep'),
  extractFunctionSource(html, 'findDeepValue'),
  extractFunctionSource(html, 'extractCargoLabelUrl'),
].join('\n');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${sources}; globalThis.extractCargoLabelUrl = extractCargoLabelUrl;`, sandbox);

const mixedResponse = {
  body: {
    result: {
      url: 'https://example.com/status-page',
      file_url: 'https://cdn.ozonusercontent.com/labels/2000050000000.pdf',
    },
  },
};

assert.equal(
  sandbox.extractCargoLabelUrl(mixedResponse),
  'https://cdn.ozonusercontent.com/labels/2000050000000.pdf',
  'PDF extraction should prefer explicit file/download URL fields over generic url fields'
);

console.log('export PDF URL extraction prefers real label URLs');
