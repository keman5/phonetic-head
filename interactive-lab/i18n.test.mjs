import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EN} from './dist/messages.js';
import {resolveLanguage, readLanguage, translate, translateError, localizeCourse} from './dist/i18n.js';

test('language preference overrides browser order, with Chinese variants and English fallback', () => {
  assert.equal(resolveLanguage('en', ['zh-CN']), 'en');
  assert.equal(resolveLanguage('zh-CN', ['en-US']), 'zh-CN');
  assert.equal(resolveLanguage('auto', ['fr-FR','zh-TW','en']), 'zh-CN');
  assert.equal(resolveLanguage('auto', ['en-GB','zh-CN']), 'en');
  assert.equal(resolveLanguage('invalid', ['zh-Hans']), 'zh-CN');
  assert.equal(resolveLanguage(null, ['de-DE']), 'en');
  assert.equal(resolveLanguage(null, []), 'en');
  assert.equal(readLanguage({getItem(){throw Error('blocked');}}), 'auto');
});

test('all translations preserve placeholders and have no untranslated Chinese', () => {
  const slots = value => [...new Set(value.match(/\{\d+\}/g) || [])].sort();
  for (const [key, value] of Object.entries(EN)) {
    assert(value.trim(), key);
    assert(!/\p{Script=Han}/u.test(value), key);
    assert.deepEqual(slots(value), slots(key), key);
  }
  assert.equal(translate('我听到：{0}', 'en', '{1} <dog>'), 'I heard: {1} <dog>');
  assert.equal(translate('我听到：{0}', 'zh-CN', 'dog'), '我听到：dog');
  assert.equal(translate('custom lesson title', 'en'), 'custom lesson title');
});

test('server errors translate dynamic validation and voice details without changing user values', () => {
  assert.equal(translateError('课程标题不能为空，也不能包含 HTML；最多 100 字。', 'en'), 'Course title must not be empty or contain HTML. Maximum: 100 characters.');
  assert.equal(translateError('请先配置 Azure 的密钥与女声。', 'en'), 'Configure the Azure key and Female voice first.');
  assert.equal(translateError('Hello（男声） 的内容已经改变，请重新配音。', 'en'), 'Hello (Male voice) has changed. Please create new audio.');
  assert.equal(translateError('语音服务返回 429，请检查密钥、音色权限和服务额度。', 'en'), 'The speech service returned 429. Check the key, voice permissions and allowance.');
});

test('server-side imports preserve original course data', () => {
  const course = {title:'认识一只大狗',text:'This is a big dog.',audioText:'This is a big dog.',audio:{female:{builtinId:'dog-sentence'}}};
  assert.deepEqual(localizeCourse(structuredClone(course)), course);
});
