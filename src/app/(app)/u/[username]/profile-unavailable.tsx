import { UnblockButton } from "@/components/people/profile-actions";
import { EmptyState, PageHeader } from "@/components/ui/page";

export function ProfileUnavailable({ page }: { page: { username: string; blockedByViewer: boolean; id: string } }) {
  return (
    <>
      <PageHeader title={`@${page.username}`} back="/" />
      <EmptyState title="This profile isn't available" action={page.blockedByViewer ? <UnblockButton profileId={page.id} /> : undefined}>
        {page.blockedByViewer ? "You blocked this account. Unblock it to see their posts again." : "You can't see this account's posts."}
      </EmptyState>
    </>
  );
}
