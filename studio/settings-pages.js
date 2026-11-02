// Keep controls in place so paging never resets their values or event handlers.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const previous = panel.querySelector('[data-settings-page="previous"]');
  const next = panel.querySelector('[data-settings-page="next"]');
  const label = panel.querySelector('#settings-page-label');
  let pages = [], current = 0, scheduled = false;
  function show(index) {
    current = Math.max(0, Math.min(index, pages.length - 1));
    const visible = pages[current] ?? [];
    for (const section of sections) section.hidden = !visible.includes(section);
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
    for (const section of sections) section.hidden = false;
    const style = getComputedStyle(content);
    const available = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const gap = parseFloat(style.rowGap) || 0;
    pages = [];
    let page = [], used = 0;
    for (const section of sections) {
      const height = section.getBoundingClientRect().height;
      if (page.length && used + gap + height > available + .5) {
        pages.push(page); page = []; used = 0;
      }
      used += (page.length ? gap : 0) + height;
      page.push(section);
    }
    if (page.length) pages.push(page);
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
