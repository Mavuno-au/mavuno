import type { CityPhoto } from "@/lib/domain";
import { cn } from "@/lib/cn";

const SIZES = { sm: "size-10 rounded-lg text-xl", md: "size-14 rounded-xl text-3xl" } as const;

// City spaces show their city's photo; interest spaces keep their emoji.
export function SpaceAvatar({ photo, emoji, size = "sm" }: { photo: CityPhoto | null; emoji: string | null; size?: keyof typeof SIZES }) {
  if (photo) return <img src={photo.thumbUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={cn(SIZES[size], "shrink-0 bg-wash object-cover")} />;
  return (
    <span aria-hidden className={cn(SIZES[size], "flex shrink-0 items-center justify-center bg-wash")}>
      {emoji ?? "#"}
    </span>
  );
}

export function PhotoBanner({ photo, name }: { photo: CityPhoto; name: string }) {
  return (
    <figure className="relative h-36 overflow-hidden bg-wash sm:h-44">
      <img src={photo.url} alt={name} decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" />
      <figcaption className="absolute right-2 bottom-2 max-w-[calc(100%-1rem)] truncate rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
        Photo:{" "}
        <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {photo.author}
        </a>
        ,{" "}
        {photo.licenseUrl ? (
          <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="hover:underline">
            {photo.license}
          </a>
        ) : (
          photo.license
        )}
      </figcaption>
    </figure>
  );
}
