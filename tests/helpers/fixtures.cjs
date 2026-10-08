'use strict';
const fs = require('node:fs/promises');
const PptxGenJS = require('pptxgenjs');
const { createCanvas } = require('@napi-rs/canvas');
async function fixture(filename) {
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Synthetic test fixture';
  const cover = pptx.addSlide(); cover.background = { color: 'FCEFC5' };
  cover.addText('רעיון מוכן — עיצוב חדש', { x: 1.7, y: 1.8, w: 9.4, h: 1, fontFace: 'Comic Sans MS', fontSize: 20, color: 'A52A2A', rtlMode: true, align: 'right', objectName: 'Source title' });
  cover.addText('כל התוכן נשאר. PowerPoint 2026, מחיר 1,250 ₪.', { x: 1.7, y: 4, w: 9.4, h: 1, fontFace: 'Arial', fontSize: 17, color: '333333', rtlMode: true, align: 'right' });
  cover.addNotes('הערת מרצה מקורית: אין לשכתב או למחוק. English 123.');
  const table = pptx.addSlide(); table.background = { color: 'FFFFFF' };
  table.addText('טבלה ותמונה', { x: 0.6, y: 0.5, w: 12, h: 0.8, fontSize: 22, rtlMode: true, align: 'right' });
  table.addTable([['מוצר', 'כמות', 'מחיר'], ['מצגת', '12', '1,250 ₪'], ['עדכון', '3', '450 ₪']], { x: 0.8, y: 1.8, w: 7, h: 2.4, fontSize: 17, fontFace: 'Arial', rtlMode: true, border: { color: '999999', pt: 1 }, color: '000000', fill: 'EEEEEE' });
  const canvas = createCanvas(240, 140), ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b6770'; ctx.fillRect(0, 0, 240, 140); ctx.fillStyle = '#e3b65b'; ctx.fillRect(30, 25, 180, 90);
  table.addImage({ data: 'image/png;base64,' + canvas.toBuffer('image/png').toString('base64'), x: 9, y: 2, w: 2.5, h: 1.5 });
  table.addText('קישור מקור', { x: 9, y: 4.5, w: 2.5, h: 0.5, fontSize: 16, rtlMode: true, hyperlink: { url: 'https://example.com/reference' } });
  table.addNotes('הטבלה והאיור חייבים להישמר בדיוק מבחינת תוכן.');
  const chart = pptx.addSlide(); chart.background = { color: 'E8E8F0' };
  chart.addText('תרשים ותבליטים', { x: 0.6, y: 0.5, w: 12, h: 0.8, fontSize: 22, rtlMode: true, align: 'right' });
  chart.addChart(pptx.ChartType.bar, [{ name: 'נתוני בדיקה', labels: ['A', 'B', 'C'], values: [10, 20, 30] }], { x: 0.7, y: 1.7, w: 7, h: 4, showLegend: false, showTitle: false });
  chart.addText([{ text: 'סעיף ראשון', options: { bullet: true, breakLine: true, rtlMode: true } }, { text: 'סעיף שני', options: { bullet: true, rtlMode: true } }], { x: 8.4, y: 2, w: 3.5, h: 2, fontSize: 18, rtlMode: true, align: 'right' });
  chart.addNotes('הערה שלישית — בדיקת סדר השקופיות.');
  await pptx.writeFile({ fileName: filename });
}
function minimalPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>',
  ];
  const content = '0.96 0.93 0.85 rg 0 0 600 800 re f\n0.10 0.20 0.25 rg BT /F1 40 Tf 70 680 Td (DESIGN REFERENCE) Tj ET\n0.00 0.45 0.40 rg 70 610 460 8 re f\n';
  objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

module.exports = { fixture, minimalPdf };