'use strict';
// Slide layouts. Each layout declares its fields (so typos fail loudly) and renders export-safe HTML.
const { esc, rich, plain } = require('./text.cjs');
const { icon, ICON_NAMES } = require('./icons.cjs');
const { art, ART_NAMES } = require('./art.cjs');

const COMMON = ['layout', 'notes', 'tone', 'fragments', 'id'];
const TONES = ['base', 'alt', 'accent', 'deep'];
const pad2 = n => String(n).padStart(2, '0');
const isNumeric = value => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value));
const fmt = value => (isNumeric(value) ? new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(Number(value)) : String(value));
const decimals = value => (String(value).split('.')[1] || '').length;

// `cap` keeps titles beside a picture from using the largest size.
const titleClass = (text, cap) => { const n = plain(text).length, size = n <= 20 ? 't-xl' : n <= 40 ? 't-lg' : n <= 72 ? 't-md' : 't-sm'; return cap && size === 't-xl' ? cap : size; };
const displayClass = text => { const n = plain(text).length; return n <= 16 ? 'd-xl' : n <= 26 ? 'd-lg' : n <= 48 ? 'd-md' : 'd-sm'; };
const stmtClass = text => { const n = plain(text).length; return n <= 60 ? '' : n <= 100 ? 's-md' : 's-sm'; };

const mo = type => ` data-motion="${type}"`;
const fr = c => (c.frag ? ' data-fragment' : '');
const kicker = s => (s.kicker ? `<p class="kicker"${mo('fade')}><i class="kbar"></i><span>${rich(s.kicker)}</span></p>` : '');
const head = s => `<header class="head">${kicker(s)}<h2 class="title ${titleClass(s.title)}"${mo('rise')}>${rich(s.title)}</h2>${s.lead ? `<p class="sub"${mo('rise')}>${rich(s.lead)}</p>` : ''}</header>`;
const chrome = c => (c.deck.chrome === false ? '' : `<div class="chrome" data-chrome><span class="brand">${esc(c.deck.brand || '')}</span><span class="pg">${pad2(c.index + 1)}</span></div>`);

function items(s, key, min, max) {
  const list = s[key];
  if (!Array.isArray(list) || list.length < min || list.length > max) throw new Error(`"${key}" must be a list of ${min === max ? min : `${min}-${max}`} entries (got ${Array.isArray(list) ? list.length : typeof list})`);
  return list;
}
const need = (s, ...keys) => { for (const key of keys) if (s[key] === undefined || s[key] === '' || s[key] === null) throw new Error(`missing required field "${key}"`); };
const image = (c, src, alt, cls = '', extra = '') => {
  if (!src) return '';
  if (!alt) throw new Error(`image "${src}" needs an "alt" description`);
  return `<img${cls ? ` class="${cls}"` : ''} src="${esc(c.asset(src))}" alt="${esc(alt)}"${extra}>`;
};
const visual = (c, s, w, h) => (s.image ? image(c, s.image, s.alt) : art(s.art || c.theme.art, { w, h, seed: s.artSeed ?? c.index + 3 }));
const symbolic = unit => /^[%‰₪$€£×xX+\-–/]+$|^[A-Za-z]/.test(String(unit).trim());
// Symbol units (%, ₪, x) sit in an LTR run so "72%" never renders as "%72"; Hebrew words keep RTL order.
const numberHtml = (value, unit, unitBefore, cls = '') => {
  const body = isNumeric(value) ? `<bdi data-count="${esc(Number(value))}"${decimals(value) ? ` data-decimals="${decimals(value)}"` : ''}>${esc(fmt(value))}</bdi>` : `<bdi>${esc(value)}</bdi>`;
  if (!unit) return `<span class="${cls}" dir="ltr">${body}</span>`;
  if (!symbolic(unit)) return `<span class="${cls}">${body}<span class="u u-word">${esc(String(unit).trim())}</span></span>`;
  const u = `<span class="u">${esc(unit)}</span>`;
  return `<span class="${cls}" dir="ltr">${unitBefore ? u + body : body + u}</span>`;
};

// Pure number/currency cells get a fixed LTR run so ₪ and digits keep the same order in browsers and PowerPoint.
const NUMERIC_CELL = /^\s*[₪$€£]?\s*-?[\d.,]+\s*[₪$€£%x×]?\s*$/;

const LAYOUTS = {
  cover: {
    doc: 'פתיחה: כותרת גדולה, תת־כותרת, ומשמאל תמונה או אמנות גנרטיבית.',
    required: ['title'], optional: ['subtitle', 'kicker', 'meta', 'image', 'alt', 'art', 'artSeed'], chrome: false,
    tone: t => t.coverTone,
    render(s, c) {
      return `<div class="cover-text">${c.deck.brand ? `<div class="brandmark"${mo('fade')}><i></i><span>${esc(c.deck.brand)}</span></div>` : ''}${kicker(s)}<h1 class="display ${displayClass(s.title)}"${mo('words')}>${rich(s.title)}</h1>${s.subtitle ? `<p class="lead"${mo('rise')}>${rich(s.subtitle)}</p>` : ''}${s.meta ? `<p class="cover-meta"${mo('fade')}>${rich(s.meta)}</p>` : ''}</div><div class="cover-visual"${mo('scale')}>${visual(c, s, 740, 1080)}</div>`;
    },
  },
  section: {
    doc: 'מפריד פרק על רקע מודגש, עם מספר ענק. מומלץ בכל מצגת של יותר מ־9 שקופיות.',
    required: ['title'], optional: ['subtitle', 'number'], chrome: false, tone: t => t.sectionTone,
    render(s, c) {
      return `<div class="sec-text"><h2 class="display ${displayClass(s.title)}"${mo('rise')}>${rich(s.title)}</h2>${s.subtitle ? `<p class="lead"${mo('rise')}>${rich(s.subtitle)}</p>` : ''}</div><div class="sec-no" aria-hidden="true" data-decor${mo('fade')}>${esc(s.number ?? pad2(c.sectionNo))}</div>`;
    },
  },
  statement: {
    doc: 'משפט אחד גדול על רקע כהה. לטענה מרכזית, ציטוט עצמי או מסקנה. עד 18 מילים.',
    required: ['text'], optional: ['source', 'kicker'], chrome: false, tone: () => 'deep',
    render(s, c) {
      return `<div class="st-wrap"><i class="stmt-rule"${mo('draw')}></i><p class="stmt ${stmtClass(s.text)}"${mo('words')}>${rich(s.text)}</p>${s.source ? `<p class="stmt-src"${mo('fade')}>${rich(s.source)}</p>` : ''}</div>`;
    },
  },
  points: {
    doc: 'כרטיסים של 2–6 נקודות (אייקון או מספר, כותרת קצרה, משפט). ל"שלושה יתרונות", עקרונות, שירותים.',
    required: ['title', 'items'], optional: ['kicker', 'lead'], tone: () => 'base',
    render(s, c) {
      const list = items(s, 'items', 2, 6), useIcons = list.some(i => i.icon);
      list.forEach((it, i) => { need(it, 'title'); if (it.icon && !ICON_NAMES.includes(it.icon)) throw new Error(`items[${i}].icon "${it.icon}" is unknown. Available: ${ICON_NAMES.join(', ')}`); });
      const horizontal = list.length >= 4;
      const mark = (it, i) => (useIcons ? `<div class="chip"${mo('scale')}>${icon(it.icon || 'check', horizontal ? 38 : 42)}</div>` : `<div class="no"${mo('fade')}>${pad2(i + 1)}</div>`);
      const body = (it, i) => `<div class="card"${fr(c)}${mo('rise')}>${mark(it, i)}<div class="tx"><h3>${rich(it.title)}</h3>${it.text ? `<p>${rich(it.text)}</p>` : ''}</div></div>`;
      return `${head(s)}<div class="main"><div class="cards c${list.length}" style="--n:${list.length}">${list.map(body).join('')}</div></div>`;
    },
  },
  bignumber: {
    doc: 'מספר ענק אחד עם הסבר. לנתון המרכזי של המצגת (אחוז, סכום, שיעור צמיחה).',
    required: ['value', 'label'], optional: ['unit', 'unitBefore', 'text', 'kicker', 'title'], tone: () => 'alt',
    render(s, c) {
      return `${s.title || s.kicker ? `<header class="head">${kicker(s)}${s.title ? `<h2 class="title t-md"${mo('rise')}>${rich(s.title)}</h2>` : ''}</header>` : ''}<div class="bn"><div class="bn-val"${mo('scale')}>${numberHtml(s.value, s.unit, s.unitBefore)}</div><div class="bn-side"><i class="bn-rule"${mo('draw')}></i><p class="bn-label"${mo('rise')}>${rich(s.label)}</p>${s.text ? `<p class="bn-text"${mo('rise')}>${rich(s.text)}</p>` : ''}</div></div>`;
    },
  },
  stats: {
    doc: '2–4 מדדים זה לצד זה (מספר גדול + תיאור). לסיכום תוצאות או "המצגת במספרים".',
    required: ['title', 'items'], optional: ['kicker', 'lead', 'source'], tone: () => 'base',
    render(s, c) {
      const list = items(s, 'items', 2, 4);
      list.forEach(it => need(it, 'value', 'label'));
      const col = it => `<div class="stat"${fr(c)}><div class="val"${mo('rise')}>${numberHtml(it.value, it.unit, it.unitBefore)}</div><p class="lab">${rich(it.label)}</p></div>`;
      return `${head(s)}<div class="main"><div class="stats n${list.length}" style="--n:${list.length}">${list.map(col).join('')}</div>${s.source ? `<p class="src">${rich(s.source)}</p>` : ''}</div>`;
    },
  },
  compare: {
    doc: 'שני צדדים: לפני/אחרי, בעיה/פתרון, א׳/ב׳. הצד השני (משמאל) מודגש בצבע.',
    required: ['title', 'sides'], optional: ['kicker', 'lead'], tone: () => 'base',
    render(s, c) {
      const sides = items(s, 'sides', 2, 2);
      sides.forEach(side => { need(side, 'heading'); items(side, 'items', 1, 5); });
      const panel = (side, i) => `<div class="panel${i === 1 ? ' strong' : ''}"${fr(c)}${mo('rise')}><h3>${rich(side.heading)}</h3>${side.items.map(t => `<div class="li"><i class="dot"></i><span>${rich(t)}</span></div>`).join('')}</div>`;
      return `${head(s)}<div class="main"><div class="panels">${sides.map(panel).join('')}</div></div>`;
    },
  },
  steps: {
    doc: 'תהליך או ציר זמן של 3–5 שלבים עם קו מחבר ומספרים.',
    required: ['title', 'items'], optional: ['kicker', 'lead'], tone: () => 'base',
    render(s, c) {
      const list = items(s, 'items', 3, 5);
      list.forEach(it => need(it, 'title'));
      const step = (it, i) => `<div class="step"${fr(c)}${mo('rise')}><div class="node-row"><div class="node">${i + 1}</div>${i < list.length - 1 ? `<i class="seg"${mo('draw')}></i>` : ''}</div>${it.label ? `<p class="step-label">${rich(it.label)}</p>` : ''}<h3>${rich(it.title)}</h3>${it.text ? `<p>${rich(it.text)}</p>` : ''}</div>`;
      return `${head(s)}<div class="main"><div class="steps" style="--n:${list.length}">${list.map(step).join('')}</div></div>`;
    },
  },
  chart: {
    doc: 'גרף עמודות או פסים אמיתי (צורות Office ניתנות לעריכה). הדגשה אחת + משפט מסקנה.',
    required: ['title', 'items'], optional: ['kicker', 'lead', 'type', 'unit', 'unitBefore', 'highlight', 'takeaway', 'max', 'source'], tone: () => 'base',
    render(s, c) {
      const type = s.type || 'bars';
      if (!['bars', 'columns'].includes(type)) throw new Error('"type" must be bars or columns');
      const list = items(s, 'items', 2, type === 'bars' ? 8 : 7);
      list.forEach((it, i) => { need(it, 'label', 'value'); if (!isNumeric(it.value)) throw new Error(`items[${i}].value must be a number`); });
      const max = Number(s.max) || Math.max(...list.map(it => Number(it.value))), top = list.findIndex(it => Number(it.value) === Math.max(...list.map(x => Number(x.value))));
      const hi = s.highlight === 'max' || s.highlight === undefined ? top : s.highlight === 'none' ? -1 : Number(s.highlight);
      const label = it => it.display ?? `${s.unit && s.unitBefore ? s.unit : ''}${fmt(it.value)}${s.unit && !s.unitBefore ? s.unit : ''}`;
      const pct = it => Math.max(2, Math.round(Number(it.value) / max * 1000) / 10);
      const chart = type === 'bars'
        ? `<div class="bars${list.length > 5 ? ' dense' : ''}">${list.map((it, i) => `<div class="bar-row${i === hi ? ' hi' : ''}"${fr(c)}><span class="bar-label">${rich(it.label)}</span><div class="bar-track"><div class="bar-fill" style="--w:${pct(it)}%"${mo('draw')}></div></div><span class="bar-val"><bdi>${esc(label(it))}</bdi></span></div>`).join('')}</div>`
        : `<div class="cols${s.takeaway ? ' short' : ''}">${list.map((it, i) => `<div class="col${i === hi ? ' hi' : ''}"${fr(c)}><span class="col-val"><bdi>${esc(label(it))}</bdi></span><div class="col-bar" style="--h:${Math.round(Number(it.value) / max * (s.takeaway ? 250 : 380))}px"${mo('grow')}></div><span class="col-label">${rich(it.label)}</span></div>`).join('')}</div>`;
      const body = s.takeaway ? `<div class="chart-wrap">${chart}<p class="takeaway"${mo('rise')}>${rich(s.takeaway)}</p></div>` : chart;
      return `${head(s)}<div class="main">${body}${s.source ? `<p class="src">${rich(s.source)}</p>` : ''}</div>`;
    },
  },
  quote: {
    doc: 'ציטוט גדול עם שם הדובר ותפקידו (ואופציונלית תמונת דיוקן).',
    required: ['text', 'author'], optional: ['role', 'image', 'alt'], chrome: false, tone: () => 'alt',
    render(s, c) {
      const small = plain(s.text).length > 110 ? ' q-sm' : '';
      const who = `<div class="q-by"${mo('fade')}>${s.image ? image(c, s.image, s.alt || s.author, 'q-photo') : '<i class="q-rule"></i>'}<div><p class="q-name">${rich(s.author)}</p>${s.role ? `<p class="q-role">${rich(s.role)}</p>` : ''}</div></div>`;
      return `<div class="qmark" aria-hidden="true" data-decor>״</div><div class="q-wrap"><p class="q-text${small}"${mo('words')}>${rich(s.text)}</p>${who}</div>`;
    },
  },
  image: {
    doc: 'תמונה במסך מלא עם כותרת וכיתוב בתחתית. שקופית נשימה אחרי חומר צפוף.',
    required: ['image', 'alt'], optional: ['title', 'caption'], chrome: false, tone: () => 'deep',
    render(s, c) {
      return `${image(c, s.image, s.alt, 'bleed')}<div class="shade" data-pptx-raster aria-hidden="true"></div>${s.title || s.caption ? `<div class="cap">${s.title ? `<h2 class="title"${mo('rise')}>${rich(s.title)}</h2>` : ''}${s.caption ? `<p${mo('fade')}>${rich(s.caption)}</p>` : ''}</div>` : ''}`;
    },
  },
  split: {
    doc: 'חצי טקסט, חצי תמונה/אמנות. כותרת, פסקה קצרה ואופציונלית רשימה קצרה.',
    required: ['title'], optional: ['kicker', 'text', 'bullets', 'image', 'alt', 'art', 'artSeed', 'imageSide'], chrome: false, tone: () => 'base', classes: s => (s.imageSide === 'start' ? 'img-start' : ''),
    render(s, c) {
      const bullets = Array.isArray(s.bullets) ? `<div class="bl">${s.bullets.slice(0, 4).map(b => `<div class="li"${fr(c)}><i class="dot"></i><span>${rich(b)}</span></div>`).join('')}</div>` : '';
      return `<div class="split-text">${kicker(s)}<h2 class="title ${titleClass(s.title, 't-lg')}"${mo('rise')}>${rich(s.title)}</h2>${s.text ? `<p class="body"${mo('rise')}>${rich(s.text)}</p>` : ''}${bullets}${chrome(c)}</div><div class="split-visual"${mo('scale')}>${visual(c, s, 820, 1080)}</div>`;
    },
  },
  gallery: {
    doc: '2–4 תמונות עם כיתוב קצר.',
    required: ['title', 'items'], optional: ['kicker', 'lead'], tone: () => 'base',
    render(s, c) {
      const list = items(s, 'items', 2, 4);
      list.forEach(it => need(it, 'image', 'alt'));
      return `${head(s)}<div class="main"><div class="gallery" style="--n:${list.length}">${list.map(it => `<figure${fr(c)}${mo('rise')}>${image(c, it.image, it.alt)}${it.caption ? `<figcaption>${rich(it.caption)}</figcaption>` : ''}</figure>`).join('')}</div></div>`;
    },
  },
  table: {
    doc: 'טבלה אמיתית (נשמרת כטבלת PowerPoint). עד 6 עמודות ו־8 שורות; תאים טקסט פשוט בלי עיצוב פנימי.',
    required: ['title', 'columns', 'rows'], optional: ['kicker', 'lead'], tone: () => 'base',
    render(s, c) {
      const cols = items(s, 'columns', 2, 6), rows = items(s, 'rows', 1, 8);
      rows.forEach((row, i) => { if (!Array.isArray(row) || row.length !== cols.length) throw new Error(`rows[${i}] must have ${cols.length} cells`); });
      const dense = rows.length > 5 || cols.length > 4 ? ' dense' : '';
      return `${head(s)}<div class="main"><table class="tbl${dense}"><thead><tr>${cols.map(h => `<th>${esc(plain(h))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(cell => `<td${NUMERIC_CELL.test(plain(cell)) ? ' dir="ltr" class="num"' : ''}>${esc(plain(cell))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    },
  },
  agenda: {
    doc: 'תוכן עניינים: 3–7 סעיפים ממוספרים לצד כותרת.',
    required: ['title', 'items'], optional: ['kicker'], tone: () => 'base',
    render(s, c) {
      const list = items(s, 'items', 3, 7);
      const row = (it, i) => { const t = typeof it === 'string' ? { title: it } : it; need(t, 'title'); return `<div class="ag-row"${fr(c)}${mo('rise')}><span class="ag-n">${pad2(i + 1)}</span><div><p class="ag-t">${rich(t.title)}</p>${t.text ? `<p class="ag-d">${rich(t.text)}</p>` : ''}</div></div>`; };
      return `<div class="ag"><header class="head">${kicker(s)}<h2 class="title ${titleClass(s.title, 't-lg')}"${mo('rise')}>${rich(s.title)}</h2></header><div class="ag-list">${list.map(row).join('')}</div></div>`;
    },
  },
  closing: {
    doc: 'סיום: מסר אחד, קריאה לפעולה ופרטי קשר, עם אמנות או תמונה בצד.',
    required: ['title'], optional: ['subtitle', 'action', 'contacts', 'image', 'alt', 'art', 'artSeed', 'kicker'], chrome: false, tone: t => t.closingTone,
    render(s, c) {
      const contacts = Array.isArray(s.contacts) && s.contacts.length ? `<div class="contacts">${s.contacts.slice(0, 3).map(k => { need(k, 'label', 'value'); return `<div class="contact"><p class="k">${esc(k.label)}</p><p class="v"><bdi>${esc(k.value)}</bdi></p></div>`; }).join('')}</div>` : '';
      return `<div class="cl-text">${kicker(s)}<h2 class="display ${displayClass(s.title)}"${mo('words')}>${rich(s.title)}</h2>${s.subtitle ? `<p class="lead"${mo('rise')}>${rich(s.subtitle)}</p>` : ''}${s.action ? `<div class="cta"${mo('rise')}><span>${rich(s.action)}</span>${icon('arrow', 40)}</div>` : ''}${contacts}</div><div class="cl-art"${mo('scale')}>${visual(c, s, 680, 1080)}</div>`;
    },
  },
  custom: {
    doc: 'מוצא חירום: HTML חופשי בתוך השקופית. השתמשו במחלקות של המערכת (title, card, chip, li, dot...).',
    required: ['html'], optional: ['title'], tone: () => 'base',
    render(s) { return String(s.html); },
  },
};

module.exports = { LAYOUTS, COMMON, TONES, chrome };
