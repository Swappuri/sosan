// Named groups keep controls mounted, preserving values, focus, and event handlers.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const tabs = panel.querySelector('#settings-tabs');
  const groups = [
    { name: 'Design', sections: ['Audio', 'Appearance', 'Colors', 'Spectrum'] },
    { name: 'Effects', sections: ['Effects'] },
    { name: 'Images', sections: ['Logo', 'Background Image'] },
    { name: 'Text & Export', sections: ['Text', 'Export'] },
  ];
  content.id = 'settings-tab-content';
  content.setAttribute('role', 'tabpanel');
  content.tabIndex = 0;
  let current = 0;
  const buttons = groups.map((group, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = group.name;
    button.id = `settings-tab-${index}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', content.id);
    button.onclick = () => show(index);
    button.onkeydown = event => {
      let next;
      if (event.key === 'ArrowRight') next = (current + 1) % groups.length;
      if (event.key === 'ArrowLeft') next = (current + groups.length - 1) % groups.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = groups.length - 1;
      if (next !== undefined) { event.preventDefault(); show(next); buttons[next].focus(); }
    };
    return button;
  });
  tabs.replaceChildren(...buttons);
  function show(index) {
    current = index;
    let first = true;
    for (const section of sections) {
      const visible = groups[index].sections.includes(section.querySelector('h3').textContent.trim());
      section.hidden = !visible;
      section.classList.toggle('page-start', visible && first);
      if (visible) first = false;
    }
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    content.setAttribute('aria-labelledby', buttons[index].id);
    content.scrollTop = 0;
    panel.dispatchEvent(new Event('settings-tab-change'));
  }
  show(0);
}
