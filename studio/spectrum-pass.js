// Group expensive canvas shadows by color, then draw the original crisp spectrum.
// This bounds blur operations even for the 512-segment wave outline.
export function spectrumPass(ctx, scale, strength) {
  const commands = [];
  const batch = strength > 0 && Number.isFinite(ctx.canvas?.width);
  function path(command) {
    ctx.moveTo(...command.start);
    if (command.control) ctx.quadraticCurveTo(...command.control, ...command.end);
    else ctx.lineTo(...command.end);
  }
  function crisp(command, shadow) {
    ctx.strokeStyle = command.color; ctx.lineWidth = Math.max(1, 2.2 * scale);
    ctx.shadowColor = command.color; ctx.shadowBlur = shadow;
    ctx.beginPath(); path(command); ctx.stroke();
  }
  return {
    draw(command) {
      if (batch) commands.push(command);
      else crisp(command, strength > 0 ? (9 + command.level * 9) * scale * strength : 0);
    },
    finish() {
      if (!batch) return;
      const buckets = Array.from({ length: 12 }, () => []);
      for (const command of commands) buckets[Math.min(11, Math.floor(command.position * 12))].push(command);
      for (const group of buckets) {
        if (!group.length) continue;
        const middle = group[Math.floor(group.length / 2)];
        ctx.strokeStyle = middle.color; ctx.shadowColor = middle.color;
        ctx.lineWidth = Math.max(1, 2.2 * scale);
        ctx.shadowBlur = (9 + group.reduce((sum, c) => sum + c.level, 0) / group.length * 9) * scale * strength;
        ctx.beginPath(); for (const command of group) path(command); ctx.stroke();
      }
      for (const command of commands) crisp(command, 0);
      ctx.shadowBlur = 0;
    },
  };
}
