import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const htmlName = fs.readdirSync(repoRoot).find((name) => name.endsWith('.html'));
assert.ok(htmlName, 'main HTML file should exist');
const html = fs.readFileSync(new URL(htmlName, repoRoot), 'utf8');

const historyUndoSnippet = html.slice(
  html.indexOf("document.querySelectorAll('.undo-date')"),
  html.indexOf('bindRequestCopyHandlers();', html.indexOf("document.querySelectorAll('.undo-date')"))
);

assert.match(historyUndoSnippet, /pendingShipments\.push\s*\(/, 'completed history date rollback should return records to current pending shipments');
assert.doesNotMatch(historyUndoSnippet, /queueInputRestore\s*\(/, 'completed history date rollback should not return records to input boxes');
assert.match(historyUndoSnippet, /date:\s*ed/, 'restored pending shipment should keep the original completed date');
assert.match(historyUndoSnippet, /requestNo:\s*e\.requestNo/, 'restored pending shipment should keep the request number');
assert.match(historyUndoSnippet, /qty:\s*e\.value/, 'restored pending shipment should keep the completed quantity');

const eventUndoSnippet = html.slice(
  html.indexOf("document.querySelectorAll('.undo-event')"),
  html.indexOf('function updateTodayTotal', html.indexOf("document.querySelectorAll('.undo-event')"))
);

assert.match(eventUndoSnippet, /pendingShipments\.push\s*\(/, 'event panel completed rollback should return records to current pending shipments');
assert.doesNotMatch(eventUndoSnippet, /queueInputRestore\s*\(/, 'event panel completed rollback should not return records to input boxes');
assert.match(eventUndoSnippet, /date:\s*\(e\.date\|\|new Date\(e\.time\)/, 'event rollback should keep the original event date');

console.log('ship history rollback returns completed shipments to pending');
