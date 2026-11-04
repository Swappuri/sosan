import { SectionGesture, SECTION_TRANSITION_MS, sectionEase } from './section-scroll.js';
// One continuous inspector with section shortcuts; controls stay mounted.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const navigation = panel.querySelector('#settings-section-links');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const icons = [
    '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
    '<circle cx="12" cy="12" r="8"/><path d="m8 16 8-8M8 8h8v8"/>',
    '<circle cx="8" cy="9" r="4"/><circle cx="16" cy="9" r="4"/><circle cx="12" cy="16" r="4"/>',
    '<path d="M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4"/>',
    '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 3v4m-2-2h4"/>',
    '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 15 4-7 4 7ZM10 12h4"/>',
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-6 5 7"/>',
    '<path d="M4 5h16M12 5v15M8 20h8"/>',
    '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  ];
  let current = 0, scheduled = false;
  const gesture = new SectionGesture();
  let transition, moving = false;
  const pending = [];
  let buffers = [];
  const tooltip = document.createElement('div');
  tooltip.id = 'settings-section-tooltip'; tooltip.className = 'settings-page-tooltip';
  tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  document.body.append(tooltip);
  const hideTooltip = () => { tooltip.hidden = true; };
  window.addEventListener('resize', hideTooltip);
  content.addEventListener('scroll', hideTooltip, { passive: true });
  const buttons = sections.map((section, index) => {
    section.hidden = false;
    section.classList.toggle('page-start', index === 0);
    section.id ||= `settings-section-${index}`;
    const button = document.createElement('button');
    button.type = 'button';
    const name = section.querySelector('h3').textContent.trim();
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = icons[index]; button.append(icon);
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-describedby', tooltip.id);
    button.onmouseenter = button.onfocus = () => {
      tooltip.textContent = name; tooltip.hidden = false;
      const rect = button.getBoundingClientRect(), box = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, rect.left + rect.width / 2 - box.width / 2))}px`;
      tooltip.style.top = `${rect.bottom + 8}px`;
    };
    button.onmouseleave = button.onblur = hideTooltip;
    button.onkeydown = event => { if (event.key === 'Escape') hideTooltip(); };
    button.setAttribute('aria-controls', section.id);
    button.onclick = () => go(index);
    return button;
  });
  navigation.replaceChildren(...buttons);
  function arrange() {
    const focused = document.activeElement;
    buffers.forEach(node => node.remove()); buffers = [];
    content.append(...sections.slice(current), ...sections.slice(0, current));
    content.scrollTop = 0;
    if (content.contains(focused)) focused.focus({ preventScroll: true });
  }
  function step(direction) {
    if (moving) { pending.push(() => step(direction)); return; }
    go(current + direction, false, direction);
  }
  function go(index, instant = false, direction = 1) {
    if (moving && !instant) { pending.push(() => go(index, false, direction)); return; }
    const next = (index % sections.length + sections.length) % sections.length;
    if (instant) { cancelAnimationFrame(transition); moving = false; pending.length = 0; }
    hideTooltip();
    if (direction < 0 && next === (current - 1 + sections.length) % sections.length) {
      const oldTop = sections[current].getBoundingClientRect().top;
      content.prepend(sections[next]);
      content.scrollTop += sections[current].getBoundingClientRect().top - oldTop;
    }
    // Visual-only tail lets a long icon jump reach the last card without a blank end.
    // The real sections replace these seamlessly when the transition settles.
    if (!instant && !buffers.length) {
      let covered = 0;
      for (let i = 0; covered < content.clientHeight && i < sections.length; i++) {
        const clone = sections[(current + i) % sections.length].cloneNode(true);
        clone.inert = true; clone.setAttribute('aria-hidden', 'true');
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
        clone.querySelectorAll('[for]').forEach(node => node.removeAttribute('for'));
        clone.querySelectorAll('[name]').forEach(node => node.removeAttribute('name'));
        content.append(clone); buffers.push(clone);
        covered += clone.getBoundingClientRect().height + 12;
      }
    }
    const target = Math.max(0, content.scrollTop + sections[next].getBoundingClientRect().top - content.getBoundingClientRect().top - 12);
    const start = content.scrollTop, started = performance.now();
    current = next;
    buttons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
    panel.dispatchEvent(new Event('settings-section-change'));
    const finish = () => { moving = false; arrange(); pending.shift()?.(); };
    if (instant || reducedMotion.matches || Math.abs(target - start) < 1) { finish(); return; }
    moving = true;
    const animate = now => {
      const progress = Math.min(1, (now - started) / SECTION_TRANSITION_MS);
      content.scrollTop = start + (target - start) * sectionEase(progress);
      if (progress < 1) transition = requestAnimationFrame(animate);
      else finish();
    };
    transition = requestAnimationFrame(animate);
  }
  panel.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) * 2 || event.target.closest('.font-picker-options')) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? content.clientHeight : 1);
    const direction = gesture.take(delta, performance.now(), { discrete: event.deltaMode === 1 || (event.deltaX === 0 && [100, 120].includes(Math.abs(event.deltaY))) });
    if (direction) step(direction);
  }, { passive: false });
  content.addEventListener('focusin', event => {
    const index = sections.indexOf(event.target.closest('.control-section'));
    if (index >= 0 && index !== current) go(index);
  });
  content.addEventListener('keydown', event => {
    if (event.target !== content) return;
    const direction = ['PageDown', 'ArrowDown'].includes(event.key) ? 1 : ['PageUp', 'ArrowUp'].includes(event.key) ? -1 : 0;
    if (direction || ['Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (direction) step(direction); else go(event.key === 'Home' ? 0 : sections.length - 1);
    }
  });
  let touchY;
  content.addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY; }, { passive: true });
  content.addEventListener('touchend', event => {
    const distance = touchY - event.changedTouches[0]?.clientY;
    if (Math.abs(distance) > 35) step(Math.sign(distance));
    touchY = undefined;
  }, { passive: true });
  function update() {
    scheduled = false;
    if (!content.clientHeight) return;
    content.style.paddingBottom = '12px';
    go(current, true);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  new ResizeObserver(schedule).observe(content);
  new ResizeObserver(schedule).observe(sections.at(-1));
  document.fonts.ready.then(schedule);
  schedule();
}
