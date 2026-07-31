const test = require('node:test');
const assert = require('node:assert/strict');
const { getDistanceUnitCode, getDistanceUnitPreference, getDistanceUnitLabel } = require('./distanceUnit.cjs');

test('maps UI preferences to backend codes', () => {
  assert.equal(getDistanceUnitCode('standard'), 'km');
  assert.equal(getDistanceUnitCode('metric'), 'km');
  assert.equal(getDistanceUnitCode('imperial'), 'mi');
  assert.equal(getDistanceUnitCode('km'), 'km');
  assert.equal(getDistanceUnitCode('mi'), 'mi');
});

test('maps backend codes back to UI preferences', () => {
  assert.equal(getDistanceUnitPreference('km'), 'standard');
  assert.equal(getDistanceUnitPreference('mi'), 'imperial');
  assert.equal(getDistanceUnitLabel('km'), 'km');
  assert.equal(getDistanceUnitLabel('mi'), 'mi');
});
