// One continuous inspector with section shortcuts; controls stay mounted.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const navigation = panel.querySelector('#settings-section-links');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
    button.textContent = index + 1;
    button.setAttribute('aria-label', `${index + 1}. ${name}`);
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
      const top = content.scrollTop + section.getBoundingClientRect().top - content.getBoundingClientRect().top - 16;
      content.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      panel.dispatchEvent(new Event('settings-section-change'));
    };
    return button;
  });
  navigation.replaceChildren(...buttons);
  function update() {
    scheduled = false;
    const edge = content.getBoundingClientRect().top + 28;
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
