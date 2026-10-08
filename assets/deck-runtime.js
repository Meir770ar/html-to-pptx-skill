'use strict';
(() => {
  const slides = [...document.querySelectorAll('[data-pptx-slide]')];
  if (!slides.length) throw new Error('No presentation slides found');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search), audience = params.has('audience');
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`html-deck:${location.pathname}`) : null;
  document.body.classList.toggle('audience', audience);
  let current = 0, fragment = 0, animations = [], countFrame = 0, started = Date.now();
  const counter = document.querySelector('.counter'), notes = document.querySelector('.notes-panel textarea');
  const key = slide => `html-deck-notes:${location.pathname}:${slide.id}`;
  const readNotes = slide => { try { return localStorage.getItem(key(slide)) ?? slide.dataset.notes ?? ''; } catch { return slide.dataset.notes || ''; } };
  function scale() { document.documentElement.style.setProperty('--deck-scale', Math.min(innerWidth / 1920, innerHeight / 1080)); }
  function stop() { animations.forEach(a => a.cancel()); animations = []; cancelAnimationFrame(countFrame); }
  function animate(el, frames, timing) { if (!reduce.matches && !document.documentElement.dataset.pptxExporting) animations.push(el.animate(frames, { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)', ...timing })); }
  function counts(slide, immediate) {
    const targets = [...slide.querySelectorAll('[data-count]')];
    const frame = begin => now => {
      const progress = Math.min(1, (now - begin) / 1100), eased = 1 - (1 - progress) ** 3;
      targets.forEach(el => { el.textContent = new Intl.NumberFormat('he-IL').format(Math.round(Number(el.dataset.count) * eased)); });
      if (progress < 1) countFrame = requestAnimationFrame(frame(begin));
    };
    if (immediate || reduce.matches) targets.forEach(el => { el.textContent = new Intl.NumberFormat('he-IL').format(Number(el.dataset.count)); });
    else countFrame = requestAnimationFrame(now => frame(now)(now));
  }
  function syncNotes() {
    if (notes) notes.value = readNotes(slides[current]);
    const next = document.querySelector('.next-title');
    if (next) next.textContent = current + 1 < slides.length ? `הבא: ${slides[current + 1].querySelector('h1,h2')?.textContent || ''}` : 'השקופית האחרונה';
  }
  function show(index, step = 0, publish = true, exporting = false) {
    stop(); current = Math.max(0, Math.min(slides.length - 1, index)); fragment = step;
    slides.forEach((slide, i) => { slide.classList.toggle('is-active', i === current); slide.setAttribute('aria-hidden', String(i !== current)); });
    const slide = slides[current], fragments = [...slide.querySelectorAll('[data-fragment]')];
    fragments.forEach((el, i) => { el.classList.toggle('is-revealed', i < fragment); el.setAttribute('aria-hidden', String(i >= fragment)); });
    if (!exporting) {
      animate(slide, [{ opacity: 0, transform: 'translateY(26px) scale(.985)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 700 });
      slide.querySelectorAll('[data-motion]').forEach((el, i) => {
        if (el.closest('[data-fragment]') && !el.closest('[data-fragment]').classList.contains('is-revealed')) return;
        const type = el.dataset.motion;
        const first = type === 'draw' ? { transform: 'scaleX(0)', opacity: 1 } : type === 'tilt' ? { transform: 'perspective(1000px) rotateY(-16deg) translateY(40px)', opacity: 0 } : { transform: 'translateY(36px)', opacity: 0 };
        animate(el, [first, { transform: 'none', opacity: 1 }], { delay: Math.min(i * 90, 500) });
      });
      const ring = slide.querySelector('.orbit-inner'); if (ring && !reduce.matches) animations.push(ring.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 15000, iterations: Infinity }));
    }
    counts(slide, exporting);
    if (counter) counter.textContent = `${current + 1} / ${slides.length}`;
    syncNotes();
    if (publish) channel?.postMessage({ type: 'slide', index: current, step: fragment });
  }
  function next() {
    const fragments = [...slides[current].querySelectorAll('[data-fragment]')];
    if (fragment < fragments.length) { const el = fragments[fragment++]; el.classList.add('is-revealed'); el.setAttribute('aria-hidden', 'false'); animate(el, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], {}); channel?.postMessage({ type: 'slide', index: current, step: fragment }); }
    else show(current + 1);
  }
  function previous() { if (fragment > 0) show(current, fragment - 1); else show(current - 1); }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { const status = document.querySelector('.status'); if (status) status.textContent = 'אפשר להציג במסך מלא דרך תפריט הדפדפן'; } }
  document.querySelector('[data-next]')?.addEventListener('click', next);
  document.querySelector('[data-prev]')?.addEventListener('click', previous);
  document.querySelector('[data-fullscreen]')?.addEventListener('click', fullscreen);
  document.querySelector('[data-present]')?.addEventListener('click', () => {
    const url = new URL(location.href); url.searchParams.set('audience', '1');
    const target = window.open(url.href, 'html-deck-audience');
    document.querySelector('.notes-panel')?.classList.add('is-open');
    if (!target) document.querySelector('.status').textContent = 'הדפדפן חסם חלון קהל. יש לאפשר חלונות קופצים.';
  });
  notes?.addEventListener('input', () => { try { localStorage.setItem(key(slides[current]), notes.value); } catch { document.querySelector('.status').textContent = 'ההערות זמינות בסשן הזה; אחסון מקומי חסום'; } });
  document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', event => { event.preventDefault(); const index = slides.findIndex(s => s.id === el.dataset.goto); if (index >= 0) show(index); }));
  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,[contenteditable=true]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowRight', 'ArrowDown', ' '].includes(event.key)) { event.preventDefault(); next(); }
    else if (['ArrowLeft', 'ArrowUp', 'Backspace'].includes(event.key)) { event.preventDefault(); previous(); }
    else if (event.key.toLowerCase() === 'f') fullscreen();
    else if (event.key.toLowerCase() === 'n') document.querySelector('.notes-panel')?.classList.toggle('is-open');
  });
  let touchX;
  document.addEventListener('touchstart', e => { if (!e.target.closest('.controls,.notes-panel')) touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => { if (touchX !== undefined) { const delta = e.changedTouches[0].clientX - touchX; if (Math.abs(delta) > 50) delta < 0 ? next() : previous(); touchX = undefined; } }, { passive: true });
  channel && (channel.onmessage = event => { const value = event.data; if (value?.type === 'slide' && Number.isInteger(value.index)) show(value.index, value.step || 0, false); if (value?.type === 'ready' && !audience) channel.postMessage({ type: 'slide', index: current, step: fragment }); });
  addEventListener('resize', scale);
  setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); const timer = document.querySelector('[data-timer]'); if (timer) timer.textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`; }, 1000);
  window.__pptxPrepareSlide = async (index, options) => {
    document.documentElement.dataset.pptxExporting = 'true';
    const total = slides[index].querySelectorAll('[data-fragment]').length;
    show(index, options.fragments === 'final' ? total : Math.min(total, Number(options.fragments)), false, true);
  };
  window.__interactiveDeck = { show, next, previous, getState: () => ({ index: current, fragment }) };
  scale(); show(0, 0, false); if (audience) channel?.postMessage({ type: 'ready' });
})();
