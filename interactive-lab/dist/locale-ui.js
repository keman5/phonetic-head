import {LANGUAGE_KEY, locale, readLanguage, t, translateDocument} from './i18n.js';

document.documentElement.lang = locale;
translateDocument(document.documentElement);
if (!new URLSearchParams(location.search).has('embed')) {
  const label = document.createElement('label');
  label.className = 'language-switch';
  const caption = document.createElement('span');
  caption.textContent = t('界面语言');
  const select = document.createElement('select');
  select.id = 'language-select';
  select.setAttribute('aria-label', t('界面语言'));
  for (const [value, text] of [['auto', t('跟随浏览器')], ['zh-CN', '简体中文'], ['en', 'English']]) {
    const option = document.createElement('option');
    option.value = value; option.textContent = text; select.append(option);
  }
  try { select.value = readLanguage(localStorage); } catch { select.value = 'auto'; }
  const requested = new URLSearchParams(location.search).get('ui-lang');
  if (['auto', 'en', 'zh-CN'].includes(requested)) select.value = requested;
  if (!select.value) select.value = 'auto';
  let previous = select.value;
  select.onchange = () => {
    if (!window.dispatchEvent(new Event('beforelanguagechange', {cancelable:true}))) { select.value = previous; return; }
    const url = new URL(location.href);
    url.searchParams.delete('ui-lang');
    try { localStorage.setItem(LANGUAGE_KEY, select.value); }
    catch {
      // With storage blocked, keep the selected language for this page reload.
      url.searchParams.set('ui-lang', select.value);
    }
    previous = select.value;
    if (url.href === location.href) location.reload();
    else location.replace(url.href);
  };
  label.append(caption, select);
  document.querySelector('body > header')?.append(label);
}
