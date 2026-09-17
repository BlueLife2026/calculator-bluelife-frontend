const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync('src/' + file + '.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  new Function('exports', 'module', 'require', code)(result.exports, result, (path) => load(path.replace('./', '')));
  return result.exports;
}
const { indexPropertyHealthTickets, ticketInspectionDate } = load('propertyHistory');
const properties = [{ id: 'a', name: 'Marina Club' }, { id: 'b', name: 'Marina Club East' }];
const row = (ticketNumber, propertyName, extra = {}) => ({ ticketNumber, propertyName, receivedAt: '2026-09-17T00:00:00Z', healthData: {}, status: 'NEW', ...extra });
const rows = [
  row('old', 'Marina Club', { status: 'CLOSED', healthData: { 'Fecha de Inicio': '2026-01-01' }, comments: [{ id: '1', body: 'Preserved' }] }),
  row('new', ' marina   CLUB ', { healthData: { 'Fecha de Inicio': '2026-09-18' } }),
  row('east', 'Marina Club East'),
  row('similar', 'Marina'),
  row('missing', ''),
  row('deleted', 'Marina Club', { deletedAt: '2026-09-17' }),
  row('csv', null, { healthData: { Propiedad: 'Marina Club East' } }),
];
const index = indexPropertyHealthTickets(properties, rows);
assert.deepEqual(index.byProperty.get('a').map((ticket) => ticket.ticketNumber), ['new', 'old']);
assert.equal(index.byProperty.get('a')[1].comments[0].body, 'Preserved');
assert.equal(index.byProperty.get('b').length, 2);
assert.equal(index.unmatched, 2);
assert.equal(indexPropertyHealthTickets([...properties, { id: 'c', name: 'MARINA CLUB' }], [rows[0]]).unmatched, 1);
assert.equal(ticketInspectionDate(row('cleared', 'Marina Club', { visitDate: '2026-09-18', healthData: { 'Fecha de Inicio': '' } })), '');
console.log('PASS: exact property association, closed history, comments, deleted exclusion, no fuzzy matches and chronological sorting');
