import { Suspense } from "react";
import { TrackGuestVisit } from "@/components/shell/analytics";
import { Aside } from "@/components/shell/aside";
import { ComposeProvider } from "@/components/shell/compose";
import { LiveCounts } from "@/components/shell/live-counts";
import { MobileHeader, MobileNav, SideNav } from "@/components/shell/nav";
import { Shortcuts } from "@/components/shell/shortcuts";
import { ViewerProvider } from "@/components/shell/viewer-context";
import { TrackNavigation } from "@/components/ui/back-link";
import { loadCounts } from "@/lib/data/shell";
import { getViewer } from "@/lib/viewer";
import { OnboardingGate } from "@/components/shell/onboarding-gate";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  const counts = viewer ? await loadCounts() : { notifications: 0, messages: 0 };

  return (
    <ViewerProvider viewer={viewer}>
      <LiveCounts viewerId={viewer?.id ?? null} initial={counts}>
        <ComposeProvider>
          <OnboardingGate viewer={viewer} />
          {viewer ? null : <TrackGuestVisit />}
          <TrackNavigation />
          <MobileHeader />
          <div className="mx-auto flex max-w-[1264px] justify-center">
            <div className="w-20 shrink-0 max-md:hidden lg:w-64">
              <SideNav />
            </div>
            <main className="min-h-dvh w-full max-w-[620px] min-w-0 border-hairline bg-surface pb-20 md:border-x md:pb-0">{children}</main>
            <Suspense fallback={<div className="hidden w-80 shrink-0 xl:block" />}>
              <Aside viewer={viewer} />
            </Suspense>
          </div>
          <MobileNav />
          <Shortcuts />
        </ComposeProvider>
      </LiveCounts>
    </ViewerProvider>
  );
}
