/** Derive the control from current media state, not the last queued media event. */
export function syncPlaybackButton(button, media, ready) {
  const playing = ready && !media.paused && !media.ended;
  const symbol = playing ? 'Ⅱ' : '▶';
  const label = playing ? 'Pause' : 'Play';
  if (button.textContent !== symbol) button.textContent = symbol;
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
}
