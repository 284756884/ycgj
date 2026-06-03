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
  /id="shipManagementPanel"/,
  '送仓管理外层面板需要稳定 ID，便于拖拽逻辑定位'
);

assert.match(
  html,
  /id="shipStatusWrap"/,
  '当前待送仓表格容器需要稳定 ID，便于调节高度'
);

assert.match(
  html,
  /id="shipHistoryWrap"/,
  '已完成送仓历史表格容器需要稳定 ID，便于调节高度'
);

assert.match(
  html,
  /class="[^"]*\bship-height-resizer\b[^"]*"/,
  '当前待送仓和已完成历史之间需要高度拖拽分隔条'
);

assert.match(
  html,
  /\.ship-height-resizer\s*\{[\s\S]*cursor:\s*ns-resize/,
  '高度分隔条需要显示上下拖拽光标'
);

assert.match(
  html,
  /const\s+SHIP_PANEL_HEIGHTS_KEY\s*=\s*['"]ozonShipPanelHeights['"]/,
  '拖拽后的高度需要使用独立 localStorage 键保存'
);

assert.doesNotMatch(
  html,
  /ozonShipPanelWidth/,
  '这次需求是调节高度，不应保留送仓面板宽度保存逻辑'
);

assert.doesNotMatch(
  html,
  /cursor:\s*ew-resize/,
  '这次需求是调节高度，不应保留横向拖拽光标'
);

assert.match(
  html,
  /function\s+initShipPanelHeightResize\s*\(/,
  '需要初始化当前待送仓和已完成历史高度拖拽逻辑'
);

assert.match(
  html,
  /addEventListener\(['"]pointerdown['"]/,
  '拖拽逻辑需要监听 pointerdown'
);

assert.match(
  html,
  /addEventListener\(['"]dblclick['"]/,
  '高度分隔条需要支持双击恢复默认高度'
);

assert.match(
  html,
  /Math\.min\([^;]+Math\.max\(/,
  '拖拽高度需要在两个模块的最小可用高度之间约束'
);

assert.match(
  html,
  /initShipPanelHeightResize\(\);/,
  '页面加载时需要启用当前待送仓和已完成历史高度拖拽'
);

assert.match(
  html,
  /t\.id===['"]shipContent['"]\?['"]flex['"]:['"]block['"]/,
  '送仓管理收起后重新展开时需要恢复 flex 布局'
);

console.log('ship panel height resize markup and behavior hooks are present');
