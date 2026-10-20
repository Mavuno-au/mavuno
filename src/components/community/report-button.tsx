"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import type { Report } from "@/app/actions/social";
import { useSignedIn } from "@/components/community/use-signed-in";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { Button } from "@/components/ui/button";

type Target = Pick<Report, "targetType" | "targetId">;

export function ReportButton({ target, what }: { target: Target; what: string }) {
  const signedIn = useSignedIn();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => signedIn(() => setOpen(true))}>
        <Flag /> Report
      </Button>
      <ReportDialog target={open ? target : null} onClose={() => setOpen(false)} what={what} />
    </>
  );
}
