import { TEXT_FAMILIES } from './text-fonts.js';

export function setupFontPicker(select, { fontPreview = true, label = 'Animation font' } = {}) {
  const prefix = select.id === 'textFont' ? 'text-font' : select.id;
  select.hidden = true;
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = `${prefix}-toggle`; trigger.className = 'font-picker-toggle';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', label);
  select.parentElement.htmlFor = trigger.id;
  select.after(trigger);
  const list = document.createElement('div');
  list.id = `${prefix}-options`; list.className = 'font-picker-options'; list.hidden = true;
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', label);
  if (!fontPreview) list.classList.add('settings-select-options');
  trigger.setAttribute('aria-controls', list.id);
  document.body.append(list);
  const options = [...select.options].map(option => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('role', 'option'); button.dataset.value = option.value;
    button.textContent = option.text; if (fontPreview) button.style.fontFamily = TEXT_FAMILIES[option.value];
    button.onclick = () => { if (button.disabled) return; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(true); };
    list.append(button); return button;
  });
  function sync() {
    trigger.textContent = select.selectedOptions[0]?.text ?? 'Choose font';
    trigger.disabled = select.disabled;
    if (fontPreview) trigger.style.fontFamily = TEXT_FAMILIES[select.value];
    for (const [index, option] of options.entries()) {
      option.disabled = select.options[index].disabled;
      option.setAttribute('aria-selected', String(option.dataset.value === select.value));
      option.title = option.disabled ? 'Unsupported with the current export settings' : '';
    }
  }
  function close(focus = false) {
    list.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    if (focus) trigger.focus();
  }
  function open() {
    if (select.disabled || select.closest('fieldset')?.disabled) return;
    const rect = trigger.getBoundingClientRect();
    list.style.width = `${rect.width}px`;
    list.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left))}px`;
    const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
    const down = below >= Math.min(220, above);
    list.style.maxHeight = `${Math.min(320, down ? below : above)}px`;
    list.style.top = down ? `${rect.bottom + 6}px` : 'auto';
    list.style.bottom = down ? 'auto' : `${innerHeight - rect.top + 6}px`;
    list.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    if (fontPreview) for (const option of options) document.fonts.load(`16px ${TEXT_FAMILIES[option.dataset.value]}`).catch(() => {});
    (options.find(option => !option.disabled && option.dataset.value === select.value) ?? options.find(option => !option.disabled))?.focus();
  }
  trigger.onclick = () => list.hidden ? open() : close();
  trigger.onkeydown = event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); } };
  list.onkeydown = event => {
    const enabled = options.filter(option => !option.disabled);
    const index = enabled.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') close(true);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!enabled.length) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      enabled[next].focus();
    }
  };
  document.addEventListener('pointerdown', event => { if (!trigger.contains(event.target) && !list.contains(event.target)) close(); });
  window.addEventListener('resize', () => close());
  new MutationObserver(() => { if (select.closest('fieldset')?.disabled || select.closest('fieldset')?.hidden) close(); }).observe(select.closest('fieldset'), { attributes: true, attributeFilter: ['disabled', 'hidden'] });
  sync(); return sync;
}
