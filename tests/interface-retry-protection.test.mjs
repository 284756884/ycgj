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

assert.match(html, /const\s+API_RETRY_DELAY_MS\s*=\s*1500/, 'all interface retries should use a shared 1.5 second delay');
assert.match(html, /const\s+EXPORT_RETRY_DELAY_MS\s*=\s*API_RETRY_DELAY_MS/, 'export retry delay should use the shared interface retry delay');
assert.match(html, /function\s+isRetryableApiRequestError\s*\(/, 'all interface calls should share retryable error detection');
assert.match(html, /async\s+function\s+retryProtectedRequest\s*\(/, 'all interface calls should share retry protection');

const retryProtectedRequestSource = extractAsyncFunctionSource(html, 'retryProtectedRequest');
assert.match(retryProtectedRequestSource, /while\s*\(\s*true\s*\)/, 'retryable interface failures should keep retrying');
assert.match(retryProtectedRequestSource, /isRetryableApiRequestError\s*\(\s*error\s*\)/, 'retry protection should only retry retryable network/congestion errors');
assert.match(retryProtectedRequestSource, /await\s+sleep\s*\(\s*API_RETRY_DELAY_MS\s*\)/, 'retry protection should wait exactly 1.5 seconds');
assert.match(retryProtectedRequestSource, /onRetry\s*\(/, 'retry protection should support progress callbacks');
assert.match(retryProtectedRequestSource, /throw\s+error/, 'non-retryable business errors should still surface');

const localJsonRequestSource = extractAsyncFunctionSource(html, 'localJsonRequest');
assert.match(localJsonRequestSource, /retryProtectedRequest\s*\(/, 'local proxy calls should use retry protection');

const ozonRequestSource = extractAsyncFunctionSource(html, 'ozonRequest');
assert.match(ozonRequestSource, /retryProtectedRequest\s*\(/, 'Ozon API calls should use retry protection');
assert.match(ozonRequestSource, /waitForOzonRequestSlot\s*\(\s*API_RETRY_DELAY_MS\s*\)/, 'Ozon API spacing should also use 1.5 seconds');
assert.doesNotMatch(ozonRequestSource, /baseDelayMs/, 'Ozon API retry delay should no longer use per-call baseDelayMs');
assert.doesNotMatch(ozonRequestSource, /attempts\s*=\s*Math\.max/, 'Ozon API retry protection should not stop after a small fixed attempt count');

assert.doesNotMatch(html, /baseDelayMs:\s*(?:1800|2200|2500)/, 'no Ozon API call should override retry delay above 1.5 seconds');
assert.doesNotMatch(html, /minIntervalMs:\s*(?:1200|1300|1500)/, 'no Ozon API call should override spacing; shared 1.5 second protection should apply');

console.log('interface retry protection hooks are present');
