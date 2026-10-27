import fs from 'node:fs';

const WORKER = 'https://news-digest.worldnews7k2n.workers.dev';
const CODE = 'WT-7K2N-2026';
const EMAIL = 'huangdinglin520@gmail.com';
const CJK = /[\u3400-\u9fff]/;
const NOISE =
  /(football|soccer|world cup|cricket|manchester united|grand prix|formula 1|\bf1\b|tennis|basketball|\bnba\b|premier league|champions league|mbappe|olympic|rapper|singer|actor|actress|celebrity|film|movie|netflix|music|album|concert|fashion|kardashian|oscars|grammy|royal family)/i;

const LABELS = {
  politics: '政治',
  economy: '经贸',
  forex: '汇率',
  tariff: '关税',
  energy: '能源',
  shipping: '航运',
};

const PRIORITY = {
  tariff: 6,
  forex: 5,
  shipping: 5,
  energy: 5,
  economy: 4,
  politics: 2,
};

async function translate(title) {
  if (CJK.test(title)) return title;
  try {
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(title.slice(0, 500)) +
      '&langpair=en%7Czh-CN&de=' +
      encodeURIComponent(EMAIL);
    const res = await fetch(url);
    if (!res.ok) return title;
    const data = await res.json();
    const out = data?.responseData?.translatedText;
    if (typeof out === 'string' && CJK.test(out)) return out.trim();
  } catch (e) {
    console.log('translate failed:', e.message);
  }
  return title;
}

const newsRes = await fetch(`${WORKER}/api/news?code=${CODE}`);
if (!newsRes.ok) throw new Error('fetch news failed: ' + newsRes.status);
const news = await newsRes.json();
const rawItems = Array.isArray(news) ? news : news.items || [];
const sourceItems = rawItems.filter(
  (it) => !NOISE.test((it.title || '') + ' ' + (it.titleZh || '')),
);

const items = [];
for (let i = 0; i < sourceItems.length; i += 1) {
  const it = sourceItems[i];
  items.push({ ...it, titleZh: await translate(it.titleZh || it.title) });
  if (i % 10 === 9) await new Promise((resolve) => setTimeout(resolve, 200));
}

const output = { items, meta: news.meta || null };
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/news.json', JSON.stringify(output));
fs.writeFileSync('data/news.js', 'window.__NEWS_DATA__ = ' + JSON.stringify(output) + ';\n');

if (process.env.SEND_DIGEST === 'true') {
  const top = [...items]
    .sort(
      (a, b) =>
        (PRIORITY[b.category] || 0) - (PRIORITY[a.category] || 0) ||
        Date.parse(b.published) - Date.parse(a.published),
    )
    .slice(0, 12);
  const lines = ['【国际新闻 · 早报】'];
  top.forEach((it, i) => {
    lines.push(`${i + 1}. [${LABELS[it.category] || '资讯'}] ${it.titleZh}`);
    if (it.title && it.title !== it.titleZh) lines.push('   ' + it.title);
    lines.push('   ' + it.source + ' · ' + it.link);
  });
  const pushRes = await fetch(`${WORKER}/api/push?code=${CODE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: lines.join('\n') }),
  });
  console.log('digest push:', pushRes.status, await pushRes.text());
}
