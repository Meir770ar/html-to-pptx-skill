'use strict';
// Text helpers for Hebrew RTL slides: escaping, *highlight* markup, and isolating Latin/date runs
// so mixed Hebrew/English lines keep their visual order in the browser and in PowerPoint.

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const word = "[A-Za-z][A-Za-z0-9_'’\\-]*(?:\\.[A-Za-z0-9]+)*";
const digitsWord = "\\d+[A-Za-z][A-Za-z0-9_'’\\-]*";
const temporal = '\\d{1,4}(?:[/:.]\\d{1,4}){1,3}';
const tail = `(?:[ ]+(?:${word}|${digitsWord}|\\d[\\d,.]*%?))*`;
const LTR_RUN = new RegExp(`(?:${word}|${digitsWord})${tail}|${temporal}`, 'g');

// Wrap Latin phrases and dates/times in <bdi>; plain numbers, percents and currency already render correctly in RTL.
function isolate(text) {
  let out = '', last = 0;
  for (const match of text.matchAll(LTR_RUN)) {
    const raw = match[0], trimmed = raw.replace(/[.,:'’\-]+$/, '');
    if (!trimmed) continue;
    out += esc(text.slice(last, match.index)) + `<bdi>${esc(trimmed)}</bdi>`;
    last = match.index + trimmed.length;
  }
  return out + esc(text.slice(last));
}

// "*word*" marks a highlight; "\n" is a hard line break (use sparingly, text-wrap balances titles already).
function rich(value) {
  const parts = String(value ?? '').split('*');
  return parts.map((part, i) => {
    const html = part.split('\n').map(isolate).join('<br>');
    return i % 2 ? `<span class="hl">${html}</span>` : html;
  }).join('');
}

const plain = value => String(value ?? '').replace(/\*/g, '');
const words = value => plain(value).trim().split(/\s+/).filter(Boolean).length;

module.exports = { esc, rich, plain, words, isolate };
