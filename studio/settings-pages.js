// One continuous inspector with section shortcuts; controls stay mounted.
export function setupSettingsPages(panel) {
  const content = panel.querySelector('.settings-content');
  const sections = [...content.children];
  const navigation = panel.querySelector('#settings-section-links');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = -1, scheduled = false;
  const buttons = sections.map((section, index) => {
    section.hidden = false;
    section.classList.toggle('page-start', index === 0);
    section.id ||= `settings-section-${index}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = section.querySelector('h3').textContent.trim();
    button.setAttribute('aria-controls', section.id);
    button.onclick = () => {
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
