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
  let current = -1, scheduled = false;
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
    button.onclick = () => {
      hideTooltip();
      const top = content.scrollTop + section.getBoundingClientRect().top - content.getBoundingClientRect().top - 8;
      content.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      panel.dispatchEvent(new Event('settings-section-change'));
    };
    return button;
  });
  navigation.replaceChildren(...buttons);
  function update() {
    scheduled = false;
    const edge = content.getBoundingClientRect().top + 12;
    let active = 0;
    sections.forEach((section, index) => { if (section.getBoundingClientRect().top <= edge) active = index; });
    if (content.scrollTop > 1 && content.scrollTop + content.clientHeight >= content.scrollHeight - 2) active = sections.length - 1;
    if (active === current) return;
    current = active;
    buttons.forEach((button, index) => {
      if (index === active) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    });
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  content.addEventListener('scroll', schedule, { passive: true });
  new ResizeObserver(schedule).observe(content);
  document.fonts.ready.then(schedule);
  schedule();
}
