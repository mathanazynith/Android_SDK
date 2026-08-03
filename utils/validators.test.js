import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ts from 'typescript';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const validatorsPath = path.join(__dirname, 'validators.ts');
const validatorsSource = readFileSync(validatorsPath, 'utf8');
const transpiled = ts.transpileModule(validatorsSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
}).outputText;

const module = { exports: {} };
const wrapper = new Function('module', 'exports', 'require', transpiled);
wrapper(module, module.exports, await import('node:module').then(({ createRequire }) => createRequire(import.meta.url)));
const {
  normalizeTimePartValue,
  formatTimeFromComponents,
  validateTimeFormat,
} = module.exports;

test('normalizes two-digit time parts without losing the tens digit', () => {
  assert.equal(normalizeTimePartValue('1', 2), '1');
  assert.equal(normalizeTimePartValue('12', 2), '12');
  assert.equal(normalizeTimePartValue('45', 2), '45');
  assert.equal(normalizeTimePartValue('59', 2), '59');
});

test('formats time components into a valid HH:MM:SS string', () => {
  assert.equal(formatTimeFromComponents('1', '2', '3'), '01:02:03');
  assert.equal(formatTimeFromComponents('12', '34', '56'), '12:34:56');
});

test('validates HH:MM:SS values with correct ranges', () => {
  assert.equal(validateTimeFormat('01:30:45').valid, true);
  assert.equal(validateTimeFormat('12:34:56').valid, true);
  assert.equal(validateTimeFormat('99:59:59').valid, true);
  assert.equal(validateTimeFormat('00:60:00').valid, false);
  assert.equal(validateTimeFormat('00:00:60').valid, false);
  assert.equal(validateTimeFormat('100:00:00').valid, false);
});
