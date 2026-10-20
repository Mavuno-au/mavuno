import { allow } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

const HOUR = 60 * 60 * 1000;

// Opened as a plain link, so errors are short sentences rather than JSON.
const message = (text: string, status: number) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return message("Sign in to download your data.", 401);
  if (!allow(`export:${viewer.id}`, 3, HOUR)) return message("You can download your data 3 times an hour. Try again later.", 429);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_my_data");
  if (error || !data) return message("We couldn't prepare your data. Try again.", 500);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mavuno-export-${viewer.username}-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
