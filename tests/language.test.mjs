import test from 'node:test';
import assert from 'node:assert/strict';
import { menuTemplate, validLanguage } from '../desktop/language.mjs';

test('native menu language follows the explicit setting or the OS', () => {
  assert.equal(menuTemplate('system', ['zh-Hans'])[1].label, '编辑');
  assert.equal(menuTemplate('en', ['zh-CN'])[1].label, 'Edit');
  assert.equal(menuTemplate('zh-CN', ['en'])[2].label, '视图');
  assert.equal(menuTemplate('system', ['de-DE'])[1].label, 'Edit');
  assert.equal(menuTemplate('zh-CN', ['en'])[1].submenu[0].role, 'undo');
});
test('native language bridge only accepts the supported preference values', () => {
  for (const value of ['system', 'en', 'zh-CN']) assert.equal(validLanguage(value), true);
  for (const value of [undefined, null, {}, '', 'fr', '../settings'])
    assert.equal(validLanguage(value), false);
});
