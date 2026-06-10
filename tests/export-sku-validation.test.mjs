import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../约仓工具2.5_店铺SKU名称独立版.html', import.meta.url);
const html = await readFile(htmlPath, 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1].trim())
  .filter(Boolean);

assert.ok(inlineScripts.length > 0, '页面需要包含可解析的内联脚本');
inlineScripts.forEach((script, index) => {
  assert.doesNotThrow(
    () => new Function(script),
    `第 ${index + 1} 段内联脚本需要没有 JavaScript 语法错误`
  );
});

assert.match(
  html,
  /function\s+safeWorkbookFilenamePart\s*\(/,
  '导出文件名需要先清理 Windows 非法文件名字符'
);

assert.match(
  html,
  /function\s+buildWorkbookFilename\s*\(\s*skuArticle\s*,\s*date\s*\)/,
  '需要集中生成 SKU-日期.xlsx 文件名'
);

assert.match(
  html,
  /buildWorkbookFilename\s*\(\s*skuArticle\s*,\s*date\s*\)/,
  '保存表格时需要使用 SKU-日期.xlsx 命名'
);

assert.doesNotMatch(
  html,
  /const\s+filename\s*=\s*`待送仓_\$\{date\}\.xlsx`/,
  '导出表格不能再使用 待送仓_日期.xlsx 命名'
);

assert.match(
  html,
  /async\s+function\s+saveWorkbookToDirectory\s*\(\s*wb\s*,\s*date\s*,\s*directory\s*,\s*skuArticle\s*\)/,
  '保存表格函数需要接收当前 SKU'
);

assert.match(
  html,
  /function\s+normalizeSkuMatchValue\s*\(/,
  'SKU 一致性检查需要规范化比较值'
);

assert.match(
  html,
  /function\s+assertSupplySkuMatchesCurrent\s*\(/,
  '校准前需要检查控制台 SKU 与交货申请 SKU 是否一致'
);

assert.match(
  html,
  /SKU不一致/,
  'SKU 不一致时需要给出明确提示'
);

assert.match(
  html,
  /readSupplyContext\s*\(\s*supplyNumber\s*,\s*storeName\s*,\s*fallbackQty\s*,\s*options\s*\)[\s\S]*assertSupplySkuMatchesCurrent\s*\(/,
  'smartSyncSupply 读取交货申请商品后需要先做 SKU 一致性检查'
);

assert.match(
  html,
  /smartSyncSupply\s*\(\s*supplyId\s*,\s*boxQty\s*,\s*currentStore\s*,\s*parseInt\(btn\.dataset\.qty,\s*10\)\s*\|\|\s*undefined\s*\)/,
  '单个齿轮校准需要继续走 smartSyncSupply 统一校验'
);

assert.match(
  html,
  /smartSyncSupply\s*\(\s*row\.requestNo\s*,\s*boxQty\s*,\s*currentStore\s*,\s*row\.qty\s*,\s*\{\s*request:\s*exportOzonRequest\s*\}\s*\)/,
  '批量导出校准需要继续走 smartSyncSupply 统一校验，并使用导出重试请求'
);

console.log('export workbook naming and SKU validation hooks are present');
