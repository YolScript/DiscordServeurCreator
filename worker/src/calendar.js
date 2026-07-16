// Flux iCalendar (RFC 5545) du serveur (roadmap n°102) : evenements Discord
// planifies + annonces programmees du dashboard, abonnable dans Google
// Agenda, Outlook ou Apple Calendar via l'URL publique tokenisee.

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Format UTC compact exige par iCalendar : 20260716T140000Z
function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildCalendarIcs(guildName, discordEvents, scheduledTasks) {
  const now = icsDate(Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ServeurCreator//Dashboard//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(guildName)} - evenements Discord`,
  ];

  for (const ev of discordEvents || []) {
    const start = Date.parse(ev.scheduled_start_time);
    if (!start) continue;
    const end = Date.parse(ev.scheduled_end_time) || start + 3600000;
    lines.push(
      'BEGIN:VEVENT',
      `UID:discord-event-${ev.id}@serveurcreator`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(ev.name)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${icsEscape(ev.description)}`);
    if (ev.entity_metadata?.location) lines.push(`LOCATION:${icsEscape(ev.entity_metadata.location)}`);
    lines.push('END:VEVENT');
  }

  for (const task of scheduledTasks || []) {
    if (!task.runAt) continue;
    const summary = `Annonce programmee : ${(task.message || 'embed').slice(0, 60)}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:scheduled-${task.id}@serveurcreator`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(task.runAt)}`,
      `DTEND:${icsDate(task.runAt + 15 * 60000)}`,
      `SUMMARY:${icsEscape(summary)}`,
    );
    if (task.repeatIntervalMs === 86400000) lines.push('RRULE:FREQ=DAILY');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
