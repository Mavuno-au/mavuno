import type { Metadata } from "next";
import { HomeFeedView } from "../home-feed";

export const metadata: Metadata = { title: "Trending" };

export default function TrendingPage() {
  return <HomeFeedView feed="trending" />;
}
