'use strict';

// This function is serialized into the isolated conversion browser.
function extractLayout(root, config) {
  const origin = root.getBoundingClientRect();
  const all = [root, ...root.querySelectorAll('*')];
  const ids = new Map(all.map((el, index) => [el, `node-${index}`]));
  const style = el => getComputedStyle(el);
  const box = el => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  };
  const visible = el => {
    for (let p = el; p && root.contains(p); p = p.parentElement) {
      const s = style(p);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    const r = box(el);
    return r.w > 0 && r.h > 0 && r.x < origin.width && r.y < origin.height && r.x + r.w > 0 && r.y + r.h > 0;
  };
  const rgba = value => {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return { color: '000000', alpha: value === 'transparent' ? 0 : 1 };
    const v = m[1].split(/[ ,/]+/).map(Number);
    return { color: v.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join(''), alpha: v[3] ?? 1 };
  };
  const textStyle = el => {
    const s = style(el);
    return {
      font: s.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, ''), size: parseFloat(s.fontSize),
      color: rgba(s.color).color, bold: Number(s.fontWeight) >= 600 || s.fontWeight === 'bold',
      italic: s.fontStyle === 'italic', underline: s.textDecorationLine.includes('underline'),
      letterSpacing: parseFloat(s.letterSpacing) || 0, direction: s.direction,
      align: s.textAlign, lineHeight: parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2,
    };
  };
  const border = (s, side) => ({
    width: parseFloat(s[`border${side}Width`]) || 0,
    ...rgba(s[`border${side}Color`]),
    style: s[`border${side}Style`],
  });
  const diagnostics = [];
  const raster = [];
  const nativeTables = [];
  const excludes = new Set();
  const effects = el => {
    const s = style(el), reasons = [];
    if (s.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(s.transform)) reasons.push('transform');
    if (s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none')) reasons.push('filter');
    if (s.clipPath !== 'none' || s.maskImage && s.maskImage !== 'none') reasons.push('clip/mask');
    if (s.mixBlendMode !== 'normal') reasons.push('blend');
    if (s.backgroundImage !== 'none') reasons.push('background-image/gradient');
    if (s.boxShadow !== 'none' || s.textShadow !== 'none') reasons.push('shadow');
    if (s.opacity !== '1') reasons.push('opacity');
    if (s.textOverflow === 'ellipsis') reasons.push('text-overflow');
    if (s.display === 'list-item' && (s.listStylePosition === 'inside' || !['none', 'disc', 'decimal', 'circle', 'square'].includes(s.listStyleType))) reasons.push('custom list marker');
    const radii = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius];
    if (new Set(radii).size > 1) reasons.push('asymmetric rounded corners');
    return reasons;
  };
  const addRaster = (el, reason) => {
    raster.push({ id: ids.get(el), ...box(el), reason, containsText: !!el.textContent.trim(), tag: el.tagName });
    excludes.add(el);
    diagnostics.push({ type: 'raster', element: ids.get(el), reason, editableText: false });
  };
  if (config.mode === 'editable') {
    for (const el of all) {
      if (!visible(el) || [...excludes].some(parent => parent.contains(el))) continue;
      if (el.matches('[data-pptx-raster],svg,canvas,video,iframe')) { addRaster(el, 'explicit or graphical content'); continue; }
      const reasons = effects(el);
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(el, pseudo).content;
        if (content && content !== 'none' && content !== 'normal' && content !== '""') reasons.push('pseudo-element');
      }
      if (reasons.length) { addRaster(el, reasons.join(', ')); continue; }
      if (el.tagName === 'TABLE') {
        const rows = [...el.rows];
        const cells = rows.map(row => [...row.cells].sort((a, b) => box(a).x - box(b).x));
        const unsupported = cells.some(row => row.some(c => c.colSpan !== 1 || c.rowSpan !== 1 || c.querySelector('img,svg,canvas,table,span,b,strong,i,em,bdi,s,u,a') || effects(c).length));
        if (!cells.length || !cells[0].length || unsupported || cells.some(row => row.length !== cells[0].length)) { addRaster(el, 'complex or empty table'); continue; }
        nativeTables.push({ id: ids.get(el), ...box(el), widths: cells[0].map(c => box(c).w), heights: rows.map(r => box(r).h), rows: cells.map(row => row.map(c => {
          const s = style(c);
          return { text: c.innerText, style: textStyle(c), fill: rgba(s.backgroundColor), padding: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(s[`padding${side}`]) || 0), borders: ['Top', 'Right', 'Bottom', 'Left'].map(side => border(s, side)) };
        })) });
        excludes.add(el);
      }
    }
  }
  // Inline SVG/media and intentionally rasterized subtrees remain in the browser background in hybrid mode.
  if (config.mode === 'hybrid') {
    for (const el of all) {
      if (visible(el) && el.matches('[data-pptx-raster],svg,canvas,video,iframe')) excludes.add(el);
      if (visible(el) && (style(el).textShadow !== 'none' || style(el).backgroundClip === 'text')) excludes.add(el);
      if (visible(el) && style(el).transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(style(el).transform)) excludes.add(el);
      if (visible(el) && style(el).display === 'list-item' && (style(el).listStylePosition === 'inside' || !['none', 'disc', 'decimal', 'circle', 'square'].includes(style(el).listStyleType))) excludes.add(el);
    }
  }
  const ownerFor = el => {
    let p = el;
    while (p !== root && /^(inline|contents)/.test(style(p).display)) p = p.parentElement;
    return p;
  };
  if (config.mode === 'hybrid') {
    // Do not hide a parent text node if an inline descendant must stay raster.
    for (const el of [...excludes]) if (el.textContent.trim()) excludes.add(ownerFor(el));
  }
  const lines = [];
  const nodeIds = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !visible(el) || rgba(style(el).color).alpha === 0 || el.closest('script,style,noscript,[data-speaker-notes],[data-pptx-ignore]') || [...excludes].some(p => p.contains(el))) continue;
    const owner = ownerFor(el);
    const ts = textStyle(el);
    let segment = null;
    let previousRect = null;
    let pending = '';
    let pendingWidth = 0;
    let used = false;
    for (let i = 0; i < node.textContent.length; i++) {
      const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      if (r.height < 0.01) continue;
      if (/\s/.test(node.textContent[i])) {
        pending = ' '; pendingWidth += r.width;
        continue;
      }
      if (r.width < 0.01) {
        // Chromium sometimes gives bidi separator spaces a zero-width rect.
        // They still belong to the logical text and must not be dropped.
        if (/\s/.test(node.textContent[i])) pending = ' ';
        continue;
      }
      const sameLine = previousRect && Math.abs(previousRect.bottom - r.bottom) < Math.max(3, ts.size * 0.15);
      const tolerance = Math.max(1.2, Math.abs(ts.letterSpacing) + 0.8) + pendingWidth;
      const adjacentRtl = sameLine && Math.abs(r.right - previousRect.left) < tolerance;
      const adjacentLtr = sameLine && Math.abs(r.left - previousRect.right) < tolerance;
      const movement = adjacentRtl ? 'rtl' : adjacentLtr ? 'ltr' : null;
      const joins = segment && movement && (!segment.resolvedDirection || movement === segment.direction);
      if (!joins) {
        segment = { id: ids.get(owner), x: r.left - origin.left, y: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top,
          runs: [{ text: '', style: ts }], direction: /[\u0590-\u08ff]/.test(node.textContent[i]) ? 'rtl' : /[A-Za-z0-9]/.test(node.textContent[i]) ? 'ltr' : ts.direction,
          resolvedDirection: false, style: ts, ownerBox: box(owner) };
        lines.push(segment);
      } else { segment.direction = movement; segment.resolvedDirection = true; }
      segment.x = Math.min(segment.x, r.left - origin.left); segment.y = Math.min(segment.y, r.top - origin.top);
      segment.right = Math.max(segment.right, r.right - origin.left); segment.bottom = Math.max(segment.bottom, r.bottom - origin.top);
      segment.runs[0].text += pending + node.textContent[i]; pending = ''; pendingWidth = 0;
      previousRect = r; used = true;
    }
    if (pending && segment) segment.runs[0].text += pending;
    if (used) nodeIds.push(ids.get(el));
  }
  for (const line of lines) {
    line.w = line.right - line.x; line.h = line.bottom - line.y;
    line.text = line.runs.map(r => r.text).join('');
    line.runs[0].text = line.runs[0].text.trim();
    line.text = line.runs[0].text;
    delete line.right; delete line.bottom; delete line.baseline;
  }
  const backgrounds = [], images = [], markers = [];
  if (config.mode === 'editable' || config.mode === 'hybrid') {
    for (const el of all) {
      if (!visible(el) || [...excludes].some(parent => parent.contains(el))) continue;
      const s = style(el), fill = rgba(s.backgroundColor), r = box(el);
      const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => border(s, side));
      if (config.mode === 'editable' && (fill.alpha > 0 || borders.some(b => b.width > 0 && b.style !== 'none'))) backgrounds.push({ id: ids.get(el), ...r, fill, borders,
        ellipse: s.borderTopLeftRadius.includes('%') && parseFloat(s.borderTopLeftRadius) >= 50,
        uniformBorder: borders.every(b => b.width === borders[0].width && b.color === borders[0].color && b.style === borders[0].style) ? borders[0] : null,
        radius: parseFloat(s.borderTopLeftRadius) || 0 });
      if (config.mode === 'editable' && el.tagName === 'IMG') images.push({ id: ids.get(el), ...r, src: el.currentSrc, alt: el.alt });
      if (s.display === 'list-item' && s.listStyleType !== 'none') {
        const ordered = el.parentElement.tagName === 'OL';
        const index = [...el.parentElement.children].filter(c => c.tagName === 'LI').indexOf(el);
        const start = Number(el.parentElement.getAttribute('start') || 1);
        const label = ordered ? `${Number(el.getAttribute('value') || start + index)}.` : s.listStyleType === 'circle' ? '○' : s.listStyleType === 'square' ? '▪' : '•';
        const ts = textStyle(el), rtl = ts.direction === 'rtl';
        markers.push({ text: label, x: rtl ? r.x + r.w + ts.size * 0.18 : r.x - ts.size * 0.95, y: r.y + (ts.lineHeight - ts.size * 1.12) / 2, w: ts.size * 0.7, h: ts.size * 1.12, direction: 'ltr', style: ts, runs: [{ text: label, style: ts }], id: ids.get(el) + '-marker' });
      }
    }
  }
  for (const el of all) el.dataset.pptxNode = ids.get(el);
  const excludedText = [...excludes].filter(el => el.textContent.trim() && !el.matches('TABLE') && ![...excludes].some(p => p !== el && p.contains(el))).map(el => ({ element: ids.get(el), characters: el.textContent.trim().length }));
  const hiddenTextStyle = '[data-pptx-text-hidden], [data-pptx-text-hidden] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } [data-pptx-text-hidden]::marker { color: transparent !important; -webkit-text-fill-color: transparent !important }';
  return { width: origin.width, height: origin.height, lines, markers, backgrounds, images, raster, tables: nativeTables, diagnostics, nodeIds: [...new Set(nodeIds)], excludedText, hiddenTextStyle, notes: root.getAttribute('data-notes') || root.querySelector('[data-speaker-notes]')?.textContent || '', fonts: [...new Set(lines.flatMap(l => l.runs.map(r => r.style.font)))] };
}

module.exports = { extractLayout };
