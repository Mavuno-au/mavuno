import type { Metadata } from "next";
import { profileMetadata, ProfileView } from "../profile-view";

export async function generateMetadata({ params }: PageProps<"/u/[username]/replies">): Promise<Metadata> {
  return profileMetadata((await params).username);
}

export default async function ProfileRepliesPage({ params }: PageProps<"/u/[username]/replies">) {
  return <ProfileView username={(await params).username} tab="replies" />;
}
