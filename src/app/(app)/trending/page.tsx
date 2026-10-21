import type { Metadata } from "next";
import { HomeFeedView } from "../(home)/home-feed";

export const metadata: Metadata = { title: "Trending" };

export default function TrendingPage() {
  return <HomeFeedView feed="trending" />;
}
