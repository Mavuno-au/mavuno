import type { Metadata } from "next";
import { Connections } from "../connections";

// Lists of people are for browsing, not for search results; the profiles they link to are.
export const metadata: Metadata = { title: "Following", robots: { index: false, follow: true } };

export default async function FollowingPage({ params }: PageProps<"/u/[username]/following">) {
  return <Connections username={(await params).username} direction="following" />;
}
