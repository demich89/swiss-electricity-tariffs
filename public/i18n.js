import {translations} from './translations.js';
export const languages = {en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano'};
export function resolveLanguage(value) {
  return Object.hasOwn(languages, value) ? value : 'en';
}
let language = 'en';
export const t = key => translations[language][key] ?? translations.en[key];
export const locale = () => ({en: 'en-GB', de: 'de-CH', fr: 'fr-CH', it: 'it-CH'})[language];

export function initLanguage(onChange = () => {}, extra = null) {
  language = 'en';
  try {language = resolveLanguage(localStorage.getItem('electricity-language'));} catch {}
  const host = document.getElementById('language-switch');
  const label = document.createElement('label');
  label.htmlFor = 'language';
  const select = document.createElement('select');
  select.id = 'language';
  select.name = 'language';
  for (const [value, name] of Object.entries(languages)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    option.lang = value;
    select.append(option);
  }
  host.replaceChildren(label, select);
  function apply() {
    document.documentElement.lang = language;
    select.value = language;
    label.textContent = t('language');
    for (const node of document.querySelectorAll('[data-i18n]')) {
      const key = node.dataset.i18n;
      const text = extra
        ? extra[language]?.[key] ?? extra.en[key]
        : t(key);
      if (text !== undefined) node.textContent = text;
    }
    document.title = extra ? extra[language]?.title ?? extra.en.title : t('pageTitle');
    onChange();
  }
  select.addEventListener('change', () => {
    language = resolveLanguage(select.value);
    try {localStorage.setItem('electricity-language', language);} catch {}
    apply();
  });
  apply();
}
