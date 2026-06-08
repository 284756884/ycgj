import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

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

assert.match(html, /id="dateChangeModeWrap"/, 'batch date change modal should expose date-change mode options');
assert.match(html, /name="dateChangeMode"\s+value="local"/, 'date change modal should support local-only mode');
assert.match(html, /name="dateChangeMode"\s+value="backend"/, 'date change modal should support backend sync mode');
assert.match(html, /enableBackendChange:\s*true/, 'batch date change button should enable backend mode choices');

const openDateChangeModalSource = html.slice(html.indexOf('function openDateChangeModal'), html.indexOf('function getSelectedDateChangeMode'));
assert.match(openDateChangeModalSource, /enableBackendChange\s*=\s*false/, 'single date changes should keep backend mode hidden by default');
assert.match(openDateChangeModalSource, /dateChangeModeWrap/, 'openDateChangeModal should toggle backend mode visibility');
assert.match(openDateChangeModalSource, /backendMode[\s\S]*backendMode\.checked\s*=\s*Boolean\(enableBackendChange\)/, 'unified backend date change should be selected by default');

const confirmHandlerSource = html.slice(html.indexOf("document.getElementById('confirmDateChangeBtn').onclick"), html.indexOf("document.getElementById('closeDateChangeModalBtn').onclick"));
assert.match(confirmHandlerSource, /await\s+pendingDateChangeHandler/, 'date change confirmation should wait for backend work before closing');
assert.match(confirmHandlerSource, /getSelectedDateChangeMode\s*\(/, 'date change confirmation should pass selected mode to handlers');

const batchChangeSnippet = html.slice(html.indexOf("document.querySelectorAll('.batch-change-date-btn')"), html.indexOf("document.querySelectorAll('.batch-retract-date-btn')"));
assert.match(batchChangeSnippet, /changePendingDateWithBackend\s*\(/, 'backend batch mode should call backend date change before local mutation');
assert.match(batchChangeSnippet, /applyPendingShipmentsDateChange\s*\(/, 'batch date change should share one local mutation helper');
assert.match(batchChangeSnippet, /applyPendingShipmentsDateChangeForRequestNos\s*\(/, 'backend batch mode should only change successfully updated request numbers locally');

assert.match(html, /\/v1\/supply-order\/timeslot\/get/, 'backend date change should query editable timeslots');
assert.match(html, /\/v1\/supply-order\/timeslot\/update/, 'backend date change should submit timeslot update');
assert.match(html, /resolveSupplyOrderIdsFromOrderNumbers\s*\(/, 'backend date change should resolve visible request numbers to internal supply_order_id');
assert.match(html, /function\s+chooseSupplyOrderTimeslotForDate\s*\(/, 'backend date change should select a timeslot for the chosen date');
assert.match(html, /id="dateChangeProgressText"/, 'backend date change should show progress in the modal');
assert.match(html, /function\s+setDateChangeProgress\s*\(/, 'backend date change should have a progress helper');
assert.match(html, /id="dateChangeAvailableWrap"/, 'date change modal should have an available-date calendar panel');
assert.match(html, /id="dateChangeAvailableCalendar"/, 'date change modal should render available backend dates');
assert.match(html, /\.date-change-day\.has-slot::after/, 'available backend dates should be marked with a blue dot');
assert.match(html, /function\s+collectSupplyOrderTimeslotsByDate\s*\(/, 'backend timeslots should be grouped by selectable date');
assert.match(html, /function\s+renderDateChangeAvailableCalendar\s*\(/, 'date change modal should render a selectable calendar');
assert.match(html, /function\s+loadSingleDateChangeAvailability\s*\(/, 'single request date changes should query available backend dates before submit');

const syncTimeslotSource = html.slice(html.indexOf('async function syncSupplyOrderTimeslotDateForRequests'), html.indexOf('async function changePendingDateWithBackend'));
assert.match(syncTimeslotSource, /for\s*\(\s*let\s+index\s*=\s*0;\s*index\s*<\s*targets\.length/, 'backend date change should iterate request numbers one by one');
assert.match(syncTimeslotSource, /catch\s*\(\s*error\s*\)\s*{[\s\S]*failures\.push/, 'backend date change should record a failed request and continue');
assert.doesNotMatch(syncTimeslotSource, /throw\s+new\s+Error\(`[^`]*(?:requestNo|申请)/, 'per-request failures should not abort the whole backend batch');
assert.match(syncTimeslotSource, /successes\.push/, 'backend date change should record successful requests');

const singleChangeSnippet = html.slice(html.indexOf("document.querySelectorAll('.change-date-btn')"), html.indexOf("document.querySelectorAll('.batch-change-date-btn')"));
assert.match(singleChangeSnippet, /loadSingleDateChangeAvailability\s*\(/, 'single request date button should load available backend dates when opened');
assert.match(singleChangeSnippet, /updateSupplyOrderTimeslot\s*\(/, 'single request date button should submit backend timeslot update on confirm');
assert.match(singleChangeSnippet, /shipment\.date\s*=\s*newDate/, 'single request date button should update local page data after backend success');
assert.match(singleChangeSnippet, /showCopyToast\s*\(/, 'single request date button should show a success result after backend update');

console.log('ship date backend change hooks are present');
