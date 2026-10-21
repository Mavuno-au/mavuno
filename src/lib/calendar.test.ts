import { describe, expect, it } from "vitest";
import { calendarFile, calendarFileName } from "./calendar";

const event = {
  id: "d05f694b-e6fc-4406-af85-63477b2fa7bc",
  title: "Dinner Dance; Ipswich, QLD",
  description: "Hey Queen! ".repeat(20),
  startsAt: "2026-11-21T08:00:00.000Z",
  endsAt: null,
  place: "Nicholas Street Precinct, Ipswich",
};

describe("calendarFile", () => {
  const file = calendarFile(event, "https://mavuno.au/events/d05f694b-e6fc-4406-af85-63477b2fa7bc");
  const lines = file.split("\r\n");

  it("keeps every line within 75 bytes", () => {
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("continues long lines after a space", () => {
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });

  it("escapes commas and semicolons and lasts two hours without an end", () => {
    expect(file).toContain(String.raw`SUMMARY:Dinner Dance\; Ipswich\, QLD`);
    expect(file).toContain("DTSTART:20261121T080000Z");
    expect(file).toContain("DTEND:20261121T100000Z");
  });

  it("ends with a line break", () => {
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("calendarFileName", () => {
  it.each([
    ["5th Annual Queensland African Women Dinner Dance", "5th-annual-queensland-african-women-dinner-dance.ics"],
    ["!!!", "event.ics"],
  ])("%s → %s", (title, name) => {
    expect(calendarFileName(title)).toBe(name);
  });
});
