import { CONTENT, SOURCES } from './content.js?v=flight3';
import { softmax, wilson, summarizeEvaluation } from './math.js';
import { detectLocale, setLocale } from '../js/i18n.js';

const $ = id => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const requested = new URL(location.href).searchParams.get('lang');
let locale = CONTENT[requested] ? requested : detectLocale(), report, reportFailed = false;
const percent = value => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
function references(keys) {
  const p = element('p', undefined, 'source-links');
  keys.forEach((key, index) => {
    if (index) p.append(' · ');
    const a = element('a', SOURCES[key].title);
    a.href = SOURCES[key].url;
    p.append(a);
  });
  return p;
}
function updateSoftmax() {
  const temperature = Number($('temperature').value);
  $('temperatureValue').value = temperature.toFixed(2);
  $('probabilities').replaceChildren(...softmax([0, 0, 0, 2, 1, 0, 0, -1], temperature).map((p, i) => {
    const li = element('li'), meter = element('meter');
    meter.min = 0; meter.max = 1; meter.value = p;
    meter.setAttribute('aria-label', CONTENT[locale].actions[i]);
    li.append(element('span', CONTENT[locale].actions[i]), meter, element('span', p > 0 && p < 0.001 ? `<${percent(0.001)}` : percent(p)));
    return li;
  }));
}
function updateSample() {
  const successes = $('successes').valueAsNumber, trials = $('trials').valueAsNumber;
  const valid = Number.isSafeInteger(successes) && Number.isSafeInteger(trials) && successes >= 0 && successes <= trials && trials >= 1 && trials <= 100000;
  for (const id of ['successes', 'trials']) $(id).setAttribute('aria-invalid', String(!valid));
  if (!valid) { $('sampleResult').value = CONTENT[locale].invalid; return; }
  const result = wilson(successes, trials);
  $('sampleResult').value = fill(CONTENT[locale].sampleResult, Object.fromEntries(Object.entries(result).map(([key, value]) => [key, percent(value)])));
}
function filterFAQ() {
  const query = normalize($('faqSearch').value.trim());
  let count = 0;
  for (const detail of $('faqList').children) {
    detail.hidden = !normalize(detail.textContent).includes(query);
    if (!detail.hidden) count++;
  }
  $('faqCount').textContent = count === 1 ? CONTENT[locale].countOne : fill(CONTENT[locale].count, { n: count });
}
function revealHash() {
  const detail = document.getElementById(location.hash.slice(1));
  if (detail?.tagName === 'DETAILS') {
    $('faqSearch').value = ''; filterFAQ(); detail.open = true;
    detail.scrollIntoView();
  }
}
function renderReport() {
  const c = CONTENT[locale];
  $('reportStatus').textContent = reportFailed ? c.reportError : report ? '' : c.loading;
  $('report').hidden = !report;
  if (!report) return;
  $('reportSummary').textContent = fill(c.reportSummary, { ...report, rate: percent(report.rate) });
  $('reportRows').replaceChildren(...report.rows.map(row => {
    const tr = element('tr');
    const seconds = value => `${new Intl.NumberFormat(locale).format(value)} s`;
    for (const text of [seconds(row.approach), seconds(row.roam), `${row.escapes}/${row.trials} · ${percent(row.escapes / row.trials)}`, `${row.baselineEscapes}/${row.trials} · ${percent(row.baselineEscapes / row.trials)}`]) tr.append(element('td', text));
    return tr;
  }));
}
function render() {
  const c = CONTENT[locale];
  setLocale(locale); $('language').value = locale;
  document.title = `Fly Brain · ${c.brand}`;
  document.querySelector('meta[name="description"]').content = c.intro;
  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = c[node.dataset.copy]; });
  for (const id of ['arenaLink', 'benchLink']) {
    const url = new URL($(id).href); url.searchParams.set('lang', locale); $(id).href = url.href;
  }
  $('evidenceCards').replaceChildren(...c.evidence.map(([tag, title, body, refs]) => {
    const article = element('article', undefined, 'card');
    article.append(element('p', tag, 'eyebrow'), element('h3', title), element('p', body), references(refs));
    return article;
  }));
  const openMath = new Set([...$('equations').children].filter(node => node.open).map(node => node.id));
  $('equations').replaceChildren(...c.math.map(([title, body, formula, refs], index) => {
    const detail = element('details'); detail.id = `equation-${index}`; detail.open = openMath.has(detail.id);
    detail.append(element('summary', title), element('p', body), element('pre', formula, 'formula'), references(refs));
    return detail;
  }));
  const openFAQ = new Set([...$('faqList').children].filter(node => node.open).map(node => node.id));
  $('faqList').replaceChildren(...c.faq.map(([id, title, body, refs]) => {
    const detail = element('details'); detail.id = `faq-${id}`; detail.open = openFAQ.has(detail.id);
    detail.append(element('summary', title), element('p', body), references(refs));
    return detail;
  }));
  $('experimentSteps').replaceChildren(...c.experiment.map(text => element('li', text)));
  $('sourcesList').replaceChildren(...Object.values(SOURCES).map((source, i) => {
    const li = element('li'), a = element('a', source.title); a.href = source.url;
    li.append(a, element('p', c.sourceNotes[i])); return li;
  }));
  updateSoftmax(); updateSample(); filterFAQ(); renderReport();
}
$('language').addEventListener('change', event => {
  locale = event.target.value;
  const url = new URL(location.href); url.searchParams.set('lang', locale); history.replaceState(null, '', url);
  render();
});
$('temperature').addEventListener('input', updateSoftmax);
for (const id of ['successes', 'trials']) $(id).addEventListener('input', updateSample);
$('faqSearch').addEventListener('input', filterFAQ);
window.addEventListener('hashchange', revealHash);
render(); revealHash();
try {
  const response = await fetch('../defend/data/pretrained-arena.json');
  if (!response.ok) throw new Error('Report unavailable');
  const data = await response.json();
  if (!Number.isSafeInteger(data.training?.episodes) || data.training.episodes < 0) throw new Error('Invalid training metadata');
  report = { ...summarizeEvaluation(data), episodes: data.training.episodes };
} catch { reportFailed = true; }
renderReport();
