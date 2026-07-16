// Logs structures (roadmap n°107) : une ligne JSON par evenement (ts, level,
// msg) — Render les capture tels quels, filtrables par niveau, et les stacks
// d'erreurs restent lisibles dans msg.
function emit(level, args) {
  const parts = args.map((a) => {
    if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  });
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg: parts.join(' ') });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

module.exports = {
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args),
};
