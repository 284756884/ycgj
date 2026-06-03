import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serverPath = new URL('../proxy/server.js', import.meta.url);
const source = await readFile(serverPath, 'utf8');

assert.doesNotThrow(() => new Function('require', 'module', '__dirname', source), 'proxy/server.js 需要没有语法错误');
assert.match(source, /DEFAULT_PERFORMANCE_API_HOST\s*=\s*["']https:\/\/api-performance\.ozon\.ru["']/, '代理需要定义 Performance API host');
assert.match(source, /function\s+normalizePerformanceEndpoint\s*\(/, '代理需要限制 Performance endpoint');
assert.match(source, /async\s+function\s+getPerformanceToken\s*\(/, '代理需要用 Performance Client ID/Secret 换 token');
assert.match(source, /async\s+function\s+proxyPerformance\s*\(/, '代理需要转发 Performance API 请求');
assert.match(source, /parsedUrl\.pathname\s*===\s*["']\/api\/performance["']/, '代理需要开放 /api/performance');
assert.match(source, /\/api\/client\/token/, '代理需要请求 Performance token 接口');
assert.match(source, /Bearer/, '代理需要用 Bearer token 调用 Performance API');
assert.doesNotMatch(source, /writeFileSync\([^)]*performance/i, 'Performance 报表不应写入临时文件');
assert.doesNotMatch(source, /createWriteStream\([^)]*performance/i, 'Performance 报表不应通过文件流落地');

console.log('performance proxy hooks are present');
