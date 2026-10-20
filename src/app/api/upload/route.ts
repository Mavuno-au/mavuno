import { NextResponse } from "next/server";
import { z } from "zod";
import { reencode } from "@/lib/images";
import { allow } from "@/lib/rate-limit";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

// Under the 4.5 MB a Vercel function accepts. The browser sends a WebP it
// already shrank, so real uploads are far smaller.
const MAX_BYTES = 4 * 1024 * 1024;

const WIDTHS = { posts: 1600, events: 1600, banners: 1500, avatars: 400 } as const;

const targetSchema = z.discriminatedUnion("bucket", [
  z.object({ bucket: z.literal("media"), folder: z.enum(["posts", "events", "banners", "avatars"]), ownerId: z.uuid() }),
  z.object({ bucket: z.literal("message-media"), conversationId: z.uuid() }),
]);

function destination(target: z.infer<typeof targetSchema>) {
  const name = `${crypto.randomUUID()}.webp`;
  switch (target.bucket) {
    case "media":
      return { folder: target.ownerId, path: `${target.ownerId}/${target.folder}/${name}`, width: WIDTHS[target.folder] };
    case "message-media":
      return { folder: target.conversationId, path: `${target.conversationId}/${name}`, width: 1600 };
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

const problem = (error: string, status: number) => NextResponse.json({ error }, { status });

// Every photo is stored as the server re-encoded it, so no upload keeps its
// metadata, whatever the client did. Storage takes writes only from the
// service role; without its key, uploads stay off rather than open.
export async function POST(request: Request) {
  const service = createServiceClient();
  if (!service) return problem("Photo uploads aren't available right now.", 503);
  const viewer = await getViewer();
  if (!viewer) return problem("Sign in to add photos.", 401);
  if (!allow(`upload:${viewer.id}`, 30, 60_000)) return problem("Too many photos at once. Wait a minute.", 429);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const target = targetSchema.safeParse(form ? Object.fromEntries([...form].filter(([, value]) => typeof value === "string")) : null);
  if (!(file instanceof Blob) || !target.success) return problem("Bad request", 400);
  if (file.size > MAX_BYTES) return problem("Images can be up to 4 MB.", 413);

  const { folder, path, width } = destination(target.data);
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_upload", { p_bucket: target.data.bucket, p_folder: folder });
  if (allowed !== true) return problem("You can't add photos here.", 403);

  const image = await reencode(await file.arrayBuffer(), width);
  if (!image) return problem("Use a JPEG, PNG, WebP or GIF image.", 415);

  const { error } = await service.storage.from(target.data.bucket).upload(path, image.data, {
    contentType: "image/webp",
    cacheControl: "31536000",
  });
  if (error) return problem("The upload failed. Try again.", 502);
  return NextResponse.json({ path, width: image.width, height: image.height });
}
