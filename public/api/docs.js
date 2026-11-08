import {initLanguage} from '../i18n.js';
import {validateCatalog} from '../providers.js';
import {docsTranslations} from './translations.js';
import {buildExamples} from './examples.js';

const el = id => document.getElementById(id);
const catalogUrl = new URL('./v1/providers.json', import.meta.url).href;
let catalog = null;
let selectedId = null;
let failed = false;
let selectedUrl = null;
const message = key => docsTranslations[document.documentElement.lang]?.[key] ?? docsTranslations.en[key];

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    el('copied').textContent = message('copied');
  } catch {
    el('copied').textContent = message('copyFailed');
  }
}

function render() {
  el('copied').textContent = '';
  el('catalog-status').textContent = message(failed ? 'catalogError' : catalog ? 'catalogReady' : 'catalogLoading');
  el('catalog-status').className = failed ? 'warning' : '';
  el('catalog-url').textContent = catalogUrl;
  el('catalog-url').href = catalogUrl;
  el('docs-provider').disabled = !catalog;
  el('copy').disabled = !selectedUrl;
  el('provider-list').replaceChildren();
  if (!catalog) return;
  const select = el('docs-provider');
  select.replaceChildren();
  for (const provider of catalog.providers) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    select.append(option);
    const url = new URL(provider.tariffsUrl, catalogUrl).href;
    const card = document.createElement('article');
    card.className = 'api-provider';
    const title = document.createElement('h3');
    title.textContent = `${provider.name} (${provider.id})`;
    const name = document.createElement('p');
    name.textContent = [provider.fullName, provider.product].filter(Boolean).join(' · ');
    const status = document.createElement('p');
    status.className = provider.status === 'stale' ? 'api-health stale' : 'api-health';
    status.textContent = message(provider.status === 'ok' ? 'statusOk' : provider.status === 'stale' ? 'statusStale' : 'statusUnknown');
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = message('copy');
    button.setAttribute('aria-label', `${message('copy')}: ${provider.name}`);
    button.addEventListener('click', () => copy(url));
    card.append(title, name, status, link, button);
    for (const [field, key] of [['lastAttemptAt', 'attemptLabel'], ['lastSuccessAt', 'successLabel']]) {
      if (!provider[field]) continue;
      const detail = document.createElement('p');
      detail.className = 'api-timestamp';
      detail.textContent = `${message(key)}: ${provider[field]}`;
      card.append(detail);
    }
    el('provider-list').append(card);
  }
  const provider = catalog.providers.find(item => item.id === selectedId);
  select.value = selectedId;
  selectedUrl = new URL(provider.tariffsUrl, catalogUrl).href;
  el('endpoint').href = selectedUrl;
  el('endpoint').textContent = selectedUrl;
  el('copy').disabled = false;
  el('curl').textContent = `curl --fail '${selectedUrl}'`;
  el('example').textContent = buildExamples(catalogUrl, selectedId).javascript;
  el('catalog-example').textContent = JSON.stringify(catalog, null, 2);
}

el('copy').addEventListener('click', () => {if (selectedUrl) copy(selectedUrl);});
el('docs-provider').addEventListener('change', () => {
  selectedId = el('docs-provider').value;
  render();
});
initLanguage(render, docsTranslations);
try {
  const response = await fetch(catalogUrl, {cache: 'no-store', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  catalog = validateCatalog(await response.json());
  selectedId = catalog.defaultProviderId;
} catch {
  failed = true;
}
render();
