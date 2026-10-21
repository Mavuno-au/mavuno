const TWO_HOURS = 2 * 60 * 60 * 1000;

export type CalendarEvent = { id: string; title: string; description: string; startsAt: string; endsAt: string | null; place: string };

const stamp = (instant: number) => new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (text: string) => text.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");

// Calendar files allow 75 bytes a line; longer lines continue on the next one
// after a space. Some calendar apps refuse a file with longer lines.
function fold(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  for (const character of line) {
    if (encoder.encode(current + character).length > (lines.length === 0 ? 75 : 74)) {
      lines.push(current);
      current = "";
    }
    current += character;
  }
  lines.push(current);
  return lines.join("\r\n ");
}

export function calendarFile(event: CalendarEvent, url: string) {
  const start = Date.parse(event.startsAt);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mavuno//Events//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@mavuno.au`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(event.endsAt ? Date.parse(event.endsAt) : start + TWO_HOURS)}`,
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(`${event.description.slice(0, 1000)}\n\n${url}`.trim())}`,
    `LOCATION:${escape(event.place)}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}

export const calendarFileName = (title: string) => `${title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}.ics`;
