import {EN} from './messages.js';
import {escapeHTML} from './html.js';

export const LANGUAGE_KEY = 'phonetic-language';
export function resolveLanguage(preference, languages = []) {
  if (preference === 'en' || preference === 'zh-CN') return preference;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
    if (/^en(?:-|$)/i.test(language)) return 'en';
  }
  return 'en';
}
export function readLanguage(storage) {
  try { return storage.getItem(LANGUAGE_KEY) || 'auto'; }
  catch { return 'auto'; }
}
const inBrowser = typeof window !== 'undefined';
let preference = 'auto';
if (inBrowser) {
  try { preference = readLanguage(window.localStorage); } catch { /* Storage may be disabled. */ }
  const requested = new URLSearchParams(location.search).get('ui-lang');
  if (['auto', 'en', 'zh-CN'].includes(requested)) preference = requested;
}
export const locale = inBrowser ? resolveLanguage(preference, navigator.languages || [navigator.language]) : 'zh-CN';
const ZH = {'Method not allowed':'不支持此操作。', Forbidden:'无权访问。', 'Not found':'未找到内容。'};
export function translate(key, language, ...values) {
  const message = language === 'en' ? (Object.hasOwn(EN, key) ? EN[key] : key) : (ZH[key] || key);
  return message.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
export const t = (key, ...values) => translate(key, locale, ...values);

function translatePadded(text, escape = false, normalizeSlots = false) {
  const source = text.trim(), slots = [];
  const key = normalizeSlots ? source.replace(/\{\d+\}/g, slot => {
    if (!slots.includes(slot)) slots.push(slot);
    return `{${slots.indexOf(slot)}}`;
  }) : source;
  const translated = t(key, ...slots);
  if (translated === source) return text;
  return text.replace(source, () => escape ? escapeHTML(translated) : translated);
}
// Translate authored markup before inserting already-escaped dynamic values.
export function htmlT(strings, ...values) {
  const source = typeof strings === 'string' ? strings : strings.map((part, i) => part + (i < values.length ? `{${i}}` : '')).join('');
  const translated = source
    .replace(/(^|>)([^<]*)(?=<|$)/g, (_, start, text) => start + translatePadded(text, true, true))
    .replace(/((?:aria-label|aria-description|aria-valuetext|title|placeholder)\s*=\s*)(["'])(.*?)\2/g,
      (_, prefix, quote, text) => prefix + quote + translatePadded(text, true, true) + quote);
  return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}
export function translateDocument(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest('script, style, textarea, [translate="no"]')) node.textContent = translatePadded(node.textContent);
  }
  for (const element of root.querySelectorAll('[aria-label], [aria-description], [aria-valuetext], [title], [placeholder]')) {
    for (const attribute of ['aria-label','aria-description','aria-valuetext','title','placeholder']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translatePadded(element.getAttribute(attribute)));
    }
  }
}

// Published built-in copy arrives in its original language. Never alter exercise text or audio IDs.
export function localizeCourse(course) {
  for (const key of ['title', 'contrast', 'translation', 'hint']) if (typeof course[key] === 'string') course[key] = t(course[key]);
  const note = ' 此内容暂未配置口型演示，请先听声音并跟读。';
  if (course.hint?.endsWith(note)) course.hint = t(course.hint.slice(0, -note.length)) + t(note);
  if (course.scene) {
    for (const key of ['place','question','answer','transfer']) course.scene[key] = t(course.scene[key]);
    course.scene.choices = course.scene.choices.map(value => t(value));
  }
  return course;
}

const errorPatterns = [
  '{0}不能为空，也不能包含 HTML；最多 {1} 字。',
  '请先配置 {0} 的密钥与{1}。',
  '语音服务返回 {0}，请检查密钥、音色权限和服务额度。',
  '{0} 的内容已经改变，请重新配音。',
  '{0} 缺少与当前内容匹配的音频，请上传或生成后再发布。',
  '{0}（{1}）',
];
export function translateError(message, language) {
  if (language !== 'en' || Object.hasOwn(EN, message)) return translate(message, language);
  for (const pattern of errorPatterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\d+\\\}/g, '(.+?)');
    const match = message.match(new RegExp('^' + escaped + '$', 's'));
    if (match) return translate(pattern, language, ...match.slice(1).map(value => translateError(value, language)));
  }
  return message;
}
