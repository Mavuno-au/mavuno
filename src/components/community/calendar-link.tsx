"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const TWO_HOURS = 2 * 60 * 60 * 1000;

const stamp = (instant: number) => new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (text: string) => text.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");

type CalendarEvent = { id: string; title: string; description: string; startsAt: string; endsAt: string | null; place: string };

function icsFor(event: CalendarEvent, url: string) {
  const start = Date.parse(event.startsAt);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mavuno//Events//EN",
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
  ].join("\r\n");
}

export function CalendarLink({ event }: { event: CalendarEvent }) {
  function download() {
    const link = document.createElement("a");
    link.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(event, window.location.href))}`;
    link.download = `${event.title.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "event"}.ics`;
    link.click();
  }

  return (
    <Button size="sm" variant="outline" onClick={download}>
      <CalendarPlus /> Add to calendar
    </Button>
  );
}
