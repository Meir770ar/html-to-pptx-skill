'use strict';
// Themes: a small set of complete visual identities. Each one is a palette + type pair + shape language.
// Everything else (surfaces, muted text, per-slide tones) is derived and contrast-checked here.
const { hex, mix, ratio, ensureContrast, bestInk } = require('./color.cjs');

const HEBREW_RANGE = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

// Bundled, SIL-OFL licensed families (assets/fonts). `ttf` is what PowerPoint needs installed for editable text.
const FONTS = {
  Heebo: { weight: '100 900', files: { hebrew: 'heebo-hebrew-wght-normal.woff2', latin: 'heebo-latin-wght-normal.woff2' }, ttf: 'Heebo-Variable.ttf', fallback: "'Segoe UI', Arial, sans-serif" },
  Rubik: { weight: '300 900', files: { hebrew: 'rubik-hebrew-wght-normal.woff2', latin: 'rubik-latin-wght-normal.woff2' }, ttf: 'Rubik-Variable.ttf', fallback: "'Segoe UI', Arial, sans-serif" },
  'Frank Ruhl Libre': { weight: '300 900', files: { hebrew: 'frank-ruhl-libre-hebrew-wght-normal.woff2', latin: 'frank-ruhl-libre-latin-wght-normal.woff2' }, ttf: 'FrankRuhlLibre-Variable.ttf', fallback: "'David', 'Times New Roman', serif" },
  'Secular One': { weight: '400', files: { hebrew: 'secular-one-hebrew-400-normal.woff2', latin: 'secular-one-latin-400-normal.woff2' }, ttf: 'SecularOne-Regular.ttf', fallback: "'Arial Black', Arial, sans-serif" },
};

const THEMES = {
  editorial: {
    label: 'עריכתי חם', use: 'סיפור, הרצאה, תוכן, חינוך, מותג אישי. מרגיש כמו מגזין איכותי.',
    mode: 'light', bg: '#F4EFE6', ink: '#1B1A17', accent: '#C2410C', accent2: '#1F4D3F', titleFont: 'Frank Ruhl Libre', bodyFont: 'Heebo', titleWeight: 800, radius: 6, cards: 'fill', art: 'bauhaus', coverTone: 'base', sectionTone: 'accent', closingTone: 'deep',
  },
  midnight: {
    label: 'חצות טכנולוגי', use: 'טכנולוגיה, AI, סטארטאפ, מוצר, כנס. כהה, חד ועתידני.',
    mode: 'dark', bg: '#0B1020', ink: '#F3F5FA', accent: '#38BDF8', accent2: '#A78BFA', titleFont: 'Heebo', bodyFont: 'Heebo', titleWeight: 800, radius: 24, cards: 'fill', art: 'rings', coverTone: 'deep', sectionTone: 'accent', closingTone: 'deep',
  },
  bold: {
    label: 'נועז וצהוב', use: 'שיווק, השקה, מכירות, קמפיין, אנרגיה גבוהה. ניגודיות חזקה וכותרות כבדות.',
    mode: 'light', bg: '#FAFAF7', ink: '#0A0A0A', accent: '#FFD60A', accent2: '#D92D12', accentText: '#D92D12', titleFont: 'Secular One', bodyFont: 'Heebo', titleWeight: 400, radius: 0, cards: 'outline', cardLine: 'ink', art: 'bauhaus', coverTone: 'accent', sectionTone: 'deep', closingTone: 'accent',
  },
  corporate: {
    label: 'עסקי נקי', use: 'משרד, פיננסים, דוחות, הצעות מחיר, ישיבות הנהלה. מקצועי ורגוע.',
    mode: 'light', bg: '#FFFFFF', ink: '#0F172A', accent: '#1D4ED8', accent2: '#0F766E', titleFont: 'Rubik', bodyFont: 'Rubik', titleWeight: 700, radius: 16, cards: 'fill', art: 'waves', coverTone: 'deep', sectionTone: 'accent', closingTone: 'deep',
  },
  sage: {
    label: 'ירוק רגוע', use: 'בריאות, חינוך, קהילה, עמותות, טיפול ורווחה. נעים ואנושי.',
    mode: 'light', bg: '#F3F5EE', ink: '#1E2A22', accent: '#3F6B4F', accent2: '#B8793A', titleFont: 'Frank Ruhl Libre', bodyFont: 'Rubik', titleWeight: 700, radius: 22, cards: 'fill', art: 'waves', coverTone: 'base', sectionTone: 'accent', closingTone: 'deep',
  },
  noir: {
    label: 'שחור וזהב', use: 'יוקרה, אירוע, התרמה, נאום, תוכן יהודי/מסורתי עם כבוד. כהה, חגיגי.',
    mode: 'dark', bg: '#121212', ink: '#F5F1E8', accent: '#D4A24C', accent2: '#7FA99B', titleFont: 'Frank Ruhl Libre', bodyFont: 'Heebo', titleWeight: 700, radius: 4, cards: 'outline', art: 'rings', coverTone: 'deep', sectionTone: 'accent', closingTone: 'deep',
  },
};

const fontStack = name => {
  const font = FONTS[name];
  return font ? `'${name}', ${font.fallback}` : `'${name}', 'Segoe UI', Arial, sans-serif`;
};

// One tone = the complete set of CSS variables for a slide background. All text pairs are verified.
function makeTone({ bg, ink, shape, shapeInk, accentText, accent2 }) {
  const surface = mix(bg, ink, 0.07);
  const muted = ensureContrast(mix(ink, bg, 0.36), surface, 4.5);
  return {
    bg: hex(bg), bg2: surface, ink: hex(ink), muted: ensureContrast(muted, bg, 4.5), line: mix(bg, ink, 0.18),
    accent: hex(shape), 'accent-ink': hex(shapeInk), 'accent-text': ensureContrast(accentText, surface, 4.5),
    accent2: hex(accent2), 'accent2-text': ensureContrast(accent2, surface, 4.5), 'bar-muted': mix(bg, shape, 0.38),
  };
}

function resolveTheme(name, overrides = {}) {
  const base = THEMES[name];
  if (!base) throw new Error(`Unknown theme "${name}". Available: ${Object.keys(THEMES).join(', ')}`);
  const t = { ...base, ...Object.fromEntries(Object.entries(overrides.palette || {}).filter(([, v]) => v)) };
  for (const key of ['bg', 'ink', 'accent', 'accent2']) t[key] = hex(t[key]);
  const darkTheme = t.mode === 'dark';
  const darkInk = mix(darkTheme ? t.bg : t.ink, '000000', 0.3);
  const accentInk = bestInk(t.accent, darkInk, 'FFFFFF');
  const accentText = ensureContrast(t.accentText || t.accent, mix(t.bg, t.ink, 0.07), 4.5);
  const light = darkTheme ? t.ink : t.bg;
  const deepBg = darkTheme ? mix(t.bg, '000000', 0.45) : mix(t.ink, t.accent, 0.06);
  const tones = {
    base: makeTone({ bg: t.bg, ink: t.ink, shape: t.accent, shapeInk: accentInk, accentText, accent2: t.accent2 }),
    alt: null,
    accent: makeTone({ bg: t.accent, ink: accentInk, shape: accentInk, shapeInk: t.accent, accentText: accentInk, accent2: accentInk }),
    deep: makeTone({ bg: deepBg, ink: light, shape: t.accent, shapeInk: accentInk, accentText: t.accentText || t.accent, accent2: t.accent2 }),
  };
  tones.alt = { ...tones.base, bg: tones.base.bg2, bg2: tones.base.bg, muted: ensureContrast(tones.base.muted, tones.base.bg2, 4.5) };
  // On a filled accent slide the "surface" must stay readable too.
  tones.accent.muted = ensureContrast(ensureContrast(mix(accentInk, t.accent, 0.22), t.accent, 4.5), tones.accent.bg2, 4.5);
  tones.accent.line = mix(t.accent, accentInk, 0.35);
  return { name, ...t, accentInk, tones, fontTitle: fontStack(overrides.titleFont || t.titleFont), fontBody: fontStack(overrides.bodyFont || t.bodyFont), titleFamily: overrides.titleFont || t.titleFont, bodyFamily: overrides.bodyFont || t.bodyFont };
}

const varsOf = tone => Object.entries(tone).map(([k, v]) => `--${k}:#${v}`).join(';');

function fontFaceCss(families, urlPrefix = 'fonts/') {
  const out = [];
  for (const family of families) {
    const font = FONTS[family];
    if (!font) continue;
    for (const [subset, range] of [['hebrew', HEBREW_RANGE], ['latin', LATIN_RANGE]]) {
      out.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${font.weight};font-display:block;src:url(${urlPrefix}${font.files[subset]}) format('woff2');unicode-range:${range}}`);
    }
  }
  return out.join('\n');
}

function themeCss(theme) {
  const t = theme.tones;
  return [
    fontFaceCss([...new Set([theme.titleFamily, theme.bodyFamily])]),
    `:root{--font-title:${theme.fontTitle};--font-body:${theme.fontBody};--title-weight:${theme.titleWeight};--radius:${theme.radius}px;${varsOf(t.base)};${theme.cards === 'outline' ? `--card-bg:transparent;--card-border:2px solid var(--${theme.cardLine || 'line'})` : '--card-bg:var(--bg2);--card-border:0 solid transparent'}}`,
    `.tone-alt{${varsOf(t.alt)}}`, `.tone-accent{${varsOf(t.accent)}}`, `.tone-deep{${varsOf(t.deep)}}`,
    theme.cards === 'outline' ? `.tone-alt,.tone-accent,.tone-deep{--card-bg:transparent;--card-border:2px solid var(--${theme.cardLine || 'line'})}` : '.tone-alt{--card-bg:var(--bg2)}',
  ].join('\n');
}

// Every contrast pair the system relies on. Used by the unit test and by the linter's palette report.
function paletteIssues(theme) {
  const issues = [];
  for (const [name, tone] of Object.entries(theme.tones)) {
    const check = (a, b, min, label) => { const r = ratio(tone[a], tone[b]); if (r < min) issues.push(`${theme.name}/${name}: ${label} ${r.toFixed(2)} < ${min}`); };
    check('ink', 'bg', name === 'accent' ? 4.5 : 7, 'ink on bg'); check('muted', 'bg', 4.5, 'muted on bg'); check('muted', 'bg2', 4.5, 'muted on surface');
    check('accent-text', 'bg', 4.5, 'accent text on bg'); check('accent-text', 'bg2', 4.5, 'accent text on surface'); check('accent-ink', 'accent', 4.5, 'text on accent shape');
    check('ink', 'bg2', 4.5, 'ink on surface'); check('accent2-text', 'bg', 3, 'accent2 text on bg');
  }
  return issues;
}

module.exports = { THEMES, FONTS, resolveTheme, themeCss, fontFaceCss, paletteIssues, fontStack };
