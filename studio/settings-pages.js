// Reflow named groups to the available height without moving or recreating controls.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const tabs = panel.querySelector('#settings-tabs');
  const categories = [
    { name: 'Design', names: ['Audio', 'Appearance', 'Colors', 'Spectrum'] },
    { name: 'Effects', names: ['Effects'] },
    { name: 'Images', names: ['Logo', 'Background Image'] },
    { name: 'Text & Export', names: ['Text', 'Export'] },
  ];
  content.id = 'settings-tab-content'; content.setAttribute('role', 'tabpanel');
  let groups = [], buttons = [], current = 0, queued = false;
  const heading = section => section.querySelector('h3').textContent.trim();
  function show(index) {
    current = Math.max(0, Math.min(index, groups.length - 1));
    const visible = groups[current]?.sections ?? [];
    sections.forEach(section => {
      section.hidden = !visible.includes(section);
      section.classList.toggle('page-start', section === visible[0]);
    });
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === current)); button.tabIndex = i === current ? 0 : -1;
    });
    if (buttons[current]) content.setAttribute('aria-labelledby', buttons[current].id);
    panel.dispatchEvent(new Event('settings-tab-change'));
  }
  function layout() {
    queued = false;
    if (!content.clientHeight) return;
    const anchor = groups[current]?.sections[0];
    panel.classList.add('measuring-settings');
    sections.forEach(section => { section.hidden = false; section.classList.add('page-start'); });
    const style = getComputedStyle(content);
    const available = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const gap = 16;
    const heights = new Map(sections.map(section => [section, section.getBoundingClientRect().height]));
    groups = [];
    for (const category of categories) {
      const members = sections.filter(section => category.names.includes(heading(section)));
      const batches = []; let batch = [], used = 0;
      for (const section of members) {
        // Reserve a little space for the divider between sections.
        const height = heights.get(section);
        if (batch.length && used + height + gap + 16 > available) { batches.push(batch); batch = []; used = 0; }
        batch.push(section); used += height + (batch.length > 1 ? gap + 16 : 0);
      }
      if (batch.length) batches.push(batch);
      batches.forEach(batch => groups.push({
        name: batches.length === 1 ? category.name : batch.some(section => heading(section) === 'Appearance') ? 'Design' : batch.map(section => heading(section).replace(' Image', '')).join(' & '),
        sections: batch,
      }));
    }
    sections.forEach(section => section.style.setProperty('--section-weight', heights.get(section)));
    panel.classList.remove('measuring-settings');
    buttons = groups.map((group, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = group.name; button.id = `settings-tab-${index}`;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', content.id);
      button.onclick = () => show(index);
      button.onkeydown = event => {
        const next = event.key === 'ArrowRight' ? (current + 1) % groups.length : event.key === 'ArrowLeft' ? (current + groups.length - 1) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : undefined;
        if (next !== undefined) { event.preventDefault(); show(next); buttons[next].focus(); }
      };
      return button;
    });
    tabs.replaceChildren(...buttons);
    tabs.style.gridTemplateColumns = `repeat(${groups.length <= 4 ? groups.length : 3}, minmax(0, 1fr))`;
    show(Math.max(0, groups.findIndex(group => group.sections.includes(anchor))));
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(layout); } }
  new ResizeObserver(schedule).observe(content);
  document.fonts.ready.then(schedule);
  schedule();
}
