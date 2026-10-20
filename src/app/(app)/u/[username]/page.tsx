import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { profileMetadata, ProfileView } from "./profile-view";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  return profileMetadata((await params).username);
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[username]">) {
  const [{ username }, { tab }] = await Promise.all([params, searchParams]);
  // Links from before tabs had their own addresses.
  if (tab === "replies" || tab === "media") permanentRedirect(`/@${username.toLowerCase()}/${tab}`);
  return <ProfileView username={username} tab="posts" />;
}
