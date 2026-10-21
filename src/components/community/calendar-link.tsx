import { CalendarPlus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

// A plain link, not next/link: the address is a file, not a page.
export function CalendarLink({ eventId }: { eventId: string }) {
  return (
    <a href={`/events/${eventId}/calendar`} className={buttonClass({ size: "sm", variant: "outline" })}>
      <CalendarPlus /> Add to calendar
    </a>
  );
}
