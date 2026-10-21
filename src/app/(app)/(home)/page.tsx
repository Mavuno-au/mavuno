import { permanentRedirect } from "next/navigation";
import { isHomeFeed } from "@/lib/feeds";
import { getViewer } from "@/lib/viewer";
import { HomeFeedView } from "./home-feed";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const requested = (await searchParams).feed;
  if (requested === "latest" || requested === "trending") permanentRedirect(`/${requested}`);
  // Members land on Following; guests, who follow no one, land on Trending.
  const viewer = await getViewer();
  return <HomeFeedView feed={viewer && (requested === undefined || isHomeFeed(requested)) ? "following" : "trending"} />;
}
