// Keep controls in place so paging never resets their values or event handlers.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const previous = panel.querySelector('[data-settings-page="previous"]');
  const next = panel.querySelector('[data-settings-page="next"]');
  const label = panel.querySelector('#settings-page-label');
  const numbers = panel.querySelector('#settings-page-numbers');
  const tooltip = document.createElement('div');
  tooltip.id = 'settings-page-tooltip';
  tooltip.className = 'settings-page-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  function hideTooltip() { tooltip.hidden = true; }
  function showTooltip(button, text) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = tooltip.getBoundingClientRect().width;
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    tooltip.style.top = `${rect.top - tooltip.getBoundingClientRect().height - 8}px`;
  }
  window.addEventListener('resize', hideTooltip);
  let pages = [], current = 0, scheduled = false;
  function show(index) {
    hideTooltip();
    current = Math.max(0, Math.min(index, pages.length - 1));
    const visible = pages[current] ?? [];
    for (const section of sections) {
      section.hidden = !visible.includes(section);
      section.classList.toggle('page-start', section === visible[0]);
    }
    for (const [index, button] of [...numbers.children].entries()) {
      if (index === current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    previous.disabled = current === 0;
    next.disabled = current >= pages.length - 1;
    label.textContent = `${current + 1} / ${Math.max(1, pages.length)}`;
    content.scrollTop = 0;
  }
  function layout() {
    scheduled = false;
    if (!content.clientHeight) return;
    const focusedSection = document.activeElement?.closest('.control-section');
    const anchor = sections.includes(focusedSection) && !focusedSection.hidden ? focusedSection : pages[current]?.[0] ?? sections[0];
    for (const section of sections) { section.hidden = false; section.classList.remove('page-start'); }
    const style = getComputedStyle(content);
    const available = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const gap = parseFloat(style.rowGap) || 0;
    pages = [];
    let page = [], used = 0;
    for (const section of sections) {
      const height = section.getBoundingClientRect().height;
      const sectionStyle = getComputedStyle(section);
      const divider = parseFloat(sectionStyle.borderTopWidth) + parseFloat(sectionStyle.paddingTop);
      if (page.length && used + gap + height > available + .5) {
        pages.push(page); page = []; used = 0;
      }
      used += page.length ? gap + height : height - divider;
      page.push(section);
    }
    if (page.length) pages.push(page);
    numbers.replaceChildren(...pages.map((page, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const names = page.map(section => section.querySelector('h3').textContent).join(' · ');
      button.setAttribute('aria-describedby', tooltip.id);
      button.onpointerenter = button.onfocus = () => showTooltip(button, names);
      button.onpointerleave = button.onblur = hideTooltip;
      button.onkeydown = event => { if (event.key === 'Escape') hideTooltip(); };
      button.textContent = index + 1;
      button.setAttribute('aria-label', `Settings page ${index + 1}: ${page.map(section => section.querySelector('h3').textContent).join(', ')}`);
      button.onclick = () => show(index);
      return button;
    }));
    show(Math.max(0, pages.findIndex(page => page.includes(anchor))));
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(layout); }
  }
  previous.onclick = () => show(current - 1);
  next.onclick = () => show(current + 1);
  new ResizeObserver(schedule).observe(content);
  // Uploading a logo expands its placement controls; repaginate without losing context.
  new MutationObserver(records => {
    if (records.some(record => !sections.includes(record.target))) schedule();
  }).observe(content, { subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'], childList: true });
  document.fonts.ready.then(schedule);
  schedule();
}
