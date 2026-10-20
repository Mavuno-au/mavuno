import type { ReactNode } from "react";

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 px-4 py-6 text-[15px] leading-relaxed sm:px-6 [&_a]:text-primary [&_a:hover]:underline [&_h2]:mt-4 [&_h2]:scroll-mt-32 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-1 [&_h3]:scroll-mt-32 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
      {children}
    </div>
  );
}

// A short boxed note: the point of a section, or where to get help.
export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-hairline bg-wash px-4 py-3 text-[15px]">{children}</div>;
}
