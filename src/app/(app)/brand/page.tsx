import type { Metadata } from "next";
import { Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, Section } from "@/components/ui/page";
import { COLOURS } from "@/lib/catalogue";
import { CopySwatch } from "./copy-swatch";

export const metadata: Metadata = { title: "Brand", description: "Mavuno's logo, colours and type, and how to use them." };

// Files drawn by scripts/brand-assets.mjs into public/brand.
const LOGOS = [
  { title: "Wordmark", file: "mavuno-wordmark", height: "h-12" },
  { title: "Mark", file: "mavuno-mark", height: "h-20" },
] as const;

const WALLPAPERS = [
  { title: "Light", file: "mavuno-wallpaper-light-4k.png" },
  { title: "Dark", file: "mavuno-wallpaper-dark-4k.png" },
] as const;

// Mirrors the tokens in src/app/globals.css.
const BRAND = [
  { name: "Harvest green", light: "#12704f", dark: "#5cc497", use: "Actions, links, the current place, the leaf" },
  { name: "Seed ochre", light: "#b7791f", dark: "#f2c24f", use: "The seed in the mark" },
  { name: "Sand", light: "#f6f4ef", dark: "#121110", use: "The page around the posts" },
  { name: "Ink", light: "#1b1a17", dark: "#ece8e1", use: "Text" },
] as const;

const IDENTITY = [
  ["#c2410c", "#fb8a50"],
  ["#b7791f", "#f2c24f"],
  ["#8e3fb5", "#c88bea"],
  ["#0e7c86", "#3cc8d3"],
  ["#c0265a", "#f26b98"],
  ["#4257c8", "#8b9bf5"],
] as const;

function DownloadLink({ file, children }: { file: string; children: ReactNode }) {
  return (
    <a href={`/brand/${file}`} download className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <Download className="size-4" aria-hidden />
      {children}
    </a>
  );
}

export default function BrandPage() {
  return (
    <>
      <PageHeader title="Brand" meta="Logo, colours and type" />
      <div className="border-b border-hairline px-4 py-5 text-[15px] leading-relaxed sm:px-6">
        <p>
          <strong>Mavuno</strong> means harvest in Swahili: what a community grows together. The mark is a shoot growing from its seed. Use these files when you write about Mavuno, link to it or put it on a poster for your event.
        </p>
      </div>

      <Section title="Logo">
        <div className="grid gap-4">
          {LOGOS.map((logo) => (
            <figure key={logo.title} className="grid gap-2">
              <div className="grid overflow-hidden rounded-xl border border-hairline sm:grid-cols-2">
                <div className="flex h-36 items-center justify-center bg-[#f6f4ef]">
                  <img src={`/brand/${logo.file}.svg`} alt={`${logo.title} on a light background`} className={logo.height} />
                </div>
                <div className="flex h-36 items-center justify-center bg-[#121110]">
                  <img src={`/brand/${logo.file}-dark-background.svg`} alt={`${logo.title} on a dark background`} className={logo.height} />
                </div>
              </div>
              <figcaption className="grid gap-1">
                <span className="font-medium">{logo.title}</span>
                <span className="flex flex-wrap gap-x-5 gap-y-1">
                  <DownloadLink file={`${logo.file}.svg`}>Light backgrounds, SVG</DownloadLink>
                  <DownloadLink file={`${logo.file}-4k.png`}>PNG 4K</DownloadLink>
                </span>
                <span className="flex flex-wrap gap-x-5 gap-y-1">
                  <DownloadLink file={`${logo.file}-dark-background.svg`}>Dark backgrounds, SVG</DownloadLink>
                  <DownloadLink file={`${logo.file}-dark-background-4k.png`}>PNG 4K</DownloadLink>
                </span>
              </figcaption>
            </figure>
          ))}
          <figure className="flex items-center gap-4">
            <img src="/brand/mavuno-app-icon.svg" alt="App icon" className="size-16" />
            <figcaption className="grid gap-1">
              <span className="font-medium">App icon</span>
              <span className="flex flex-wrap gap-x-5 gap-y-1">
                <DownloadLink file="mavuno-app-icon.svg">SVG</DownloadLink>
                <DownloadLink file="mavuno-app-icon-4096.png">PNG 4096 × 4096</DownloadLink>
              </span>
            </figcaption>
          </figure>
        </div>
      </Section>

      <Section title="Wallpapers" meta="3840 × 2160">
        <div className="grid gap-4 sm:grid-cols-2">
          {WALLPAPERS.map((wallpaper) => (
            <figure key={wallpaper.file} className="grid gap-2">
              <img src={`/brand/${wallpaper.file}`} alt={`${wallpaper.title} Mavuno wallpaper`} loading="lazy" className="aspect-video w-full rounded-xl border border-hairline object-cover" />
              <figcaption className="flex items-center justify-between gap-3">
                <span className="font-medium">{wallpaper.title}</span>
                <DownloadLink file={wallpaper.file}>PNG 4K</DownloadLink>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Colours" meta="tap to copy">
        <div className="grid gap-5">
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode}>
              <p className="mb-2 text-sm text-ink-muted">{mode === "light" ? "Light theme" : "Dark theme"}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {BRAND.map((colour) => (
                  <CopySwatch key={colour.name} name={colour.name} hex={colour[mode]} />
                ))}
              </div>
            </div>
          ))}
          <ul className="grid gap-1 text-sm text-ink-muted">
            {BRAND.map((colour) => (
              <li key={colour.name}>
                <span className="font-medium text-ink">{colour.name}:</span> {colour.use}.
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-2 text-sm text-ink-muted">Identity colours. Each member picks one; it rings their photo and marks their handle, and is never used for buttons or text.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {IDENTITY.map(([light], index) => (
                <CopySwatch key={light} name={COLOURS[index] ?? "Colour"} hex={light} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Type">
        <div className="grid gap-4">
          <div>
            <p className="text-3xl font-semibold tracking-tight">Geist</p>
            <p className="text-[15px] text-ink-muted">For everything people write and read. Bold for the wordmark, semibold for headings, regular for posts at 15px.</p>
          </div>
          <div>
            <p className="font-mono text-2xl">Geist Mono</p>
            <p className="text-[15px] text-ink-muted">For what a machine prints: @handles, times, counts and dates.</p>
          </div>
          <p className="text-sm text-ink-muted">
            Both are free under the SIL Open Font License from{" "}
            <a href="https://vercel.com/font" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">vercel.com/font</a>.
          </p>
        </div>
      </Section>

      <Section title="Voice">
        <ul className="grid list-disc gap-1.5 pl-5 text-[15px]">
          <li>Plain, warm and direct, in Australian English.</li>
          <li>Say what happens: “Sent for review”, “You're going”, “Link copied”.</li>
          <li>Sentence case for headings and buttons. No hype words.</li>
        </ul>
      </Section>

      <Section title="Usage" className="border-b-0">
        <div className="grid gap-4 text-[15px] sm:grid-cols-2">
          <div>
            <p className="mb-1.5 font-medium">Do</p>
            <ul className="grid list-disc gap-1 pl-5 text-ink-muted">
              <li>Write the name as Mavuno in sentences; the wordmark is lowercase.</li>
              <li>Leave space around the logo at least as wide as the seed.</li>
              <li>Use the dark-background files on photos and dark colours.</li>
            </ul>
          </div>
          <div>
            <p className="mb-1.5 font-medium">Don't</p>
            <ul className="grid list-disc gap-1 pl-5 text-ink-muted">
              <li>Recolour, stretch, rotate or outline the logo.</li>
              <li>Put it on busy patterns where the shoot disappears.</li>
              <li>Use it to suggest Mavuno endorses an event or business.</li>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-muted">
          City photos on spaces come from Wikimedia Commons under their own licences, credited on each space. See also <Link href="/about" className="text-primary hover:underline">About</Link>.
        </p>
      </Section>
    </>
  );
}
