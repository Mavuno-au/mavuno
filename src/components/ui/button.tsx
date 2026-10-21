import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  outline: "border border-rail bg-shell text-ink hover:bg-wash",
  ghost: "text-ink-muted hover:bg-wash hover:text-ink",
  destructive: "bg-destructive text-destructive-ink hover:opacity-90",
} as const;

const SIZES = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
  icon: "size-9",
} as const;

type Style = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

export function buttonClass({ variant = "primary", size = "md" }: Style = {}, className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({ variant, size, className, type = "button", ...props }: ComponentProps<"button"> & Style) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: ComponentProps<typeof Link> & Style) {
  return <Link className={buttonClass({ variant, size }, className)} {...props} />;
}
