"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { setProfileImage } from "@/app/actions/settings";
import { Avatar } from "@/components/ui/avatar";
import type { AccountType, Colour } from "@/lib/domain";
import { prepareImage, uploadMedia } from "@/lib/upload";

const KINDS = {
  avatar: { width: 400, folder: "avatars" },
  banner: { width: 1500, folder: "banners" },
} as const;

type Kind = keyof typeof KINDS;

function useImage(profileId: string, kind: Kind, initial: string | null) {
  const [url, setUrl] = useState(initial);
  const [pending, startTransition] = useTransition();

  function apply(next: string | null) {
    return setProfileImage({ profileId, kind, url: next }).then((result) => {
      if (result.ok) setUrl(next);
      else toast.error(result.error);
    });
  }

  function upload(file: File) {
    startTransition(async () => {
      try {
        const image = await prepareImage(file, KINDS[kind].width);
        URL.revokeObjectURL(image.preview);
        const uploaded = await uploadMedia({ ownerId: profileId, kind: KINDS[kind].folder, blob: image.blob });
        await apply(uploaded.url);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The upload failed. Try again.");
      }
    });
  }

  return { url, pending, upload, remove: () => startTransition(() => apply(null)) };
}

function Picker({ label, onFile, disabled }: { label: string; onFile: (file: File) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="rounded-full bg-black/55 p-2 text-white hover:bg-black/70 disabled:opacity-60 [&_svg]:size-4"
      >
        <Camera />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded-full bg-black/55 p-2 text-white hover:bg-black/70 disabled:opacity-60 [&_svg]:size-4">
      <Trash2 />
    </button>
  );
}

export function ProfileImages({
  profileId,
  person,
  avatarUrl,
  bannerUrl,
  avatarLabel = "photo",
}: {
  profileId: string;
  person: { displayName: string; colour: Colour; accountType: AccountType };
  avatarUrl: string | null;
  bannerUrl: string | null;
  avatarLabel?: string;
}) {
  const avatar = useImage(profileId, "avatar", avatarUrl);
  const banner = useImage(profileId, "banner", bannerUrl);

  return (
    <div className="relative mb-12">
      <div className="relative aspect-[3/1] overflow-hidden rounded-lg bg-wash">
        {banner.url ? <img src={banner.url} alt="" className="size-full object-cover" /> : null}
        <div className="absolute inset-0 flex items-center justify-center gap-2">
          <Picker label="Change banner" onFile={banner.upload} disabled={banner.pending} />
          {banner.url ? <RemoveButton label="Remove banner" onClick={banner.remove} disabled={banner.pending} /> : null}
        </div>
        {banner.pending ? <div className="absolute inset-0 animate-pulse bg-surface/40" /> : null}
      </div>
      <div className="absolute -bottom-10 left-4">
        <div className="relative">
          <Avatar person={{ ...person, avatarUrl: avatar.url }} size="xl" className="ring-4 ring-surface" />
          <div className="absolute inset-0 flex items-center justify-center gap-1">
            <Picker label={`Change ${avatarLabel}`} onFile={avatar.upload} disabled={avatar.pending} />
            {avatar.url ? <RemoveButton label={`Remove ${avatarLabel}`} onClick={avatar.remove} disabled={avatar.pending} /> : null}
          </div>
        </div>
      </div>
      <p className="absolute right-0 -bottom-8 text-xs text-ink-muted">JPEG, PNG, WebP or GIF, up to 10 MB.</p>
    </div>
  );
}
