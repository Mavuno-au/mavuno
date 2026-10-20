import type { Metadata } from "next";
import { HomeFeedView } from "../home-feed";

export const metadata: Metadata = { title: "Latest" };

export default function LatestPage() {
  return <HomeFeedView feed="latest" />;
}
