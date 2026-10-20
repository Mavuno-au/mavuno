import type { Metadata } from "next";
import { profileMetadata, ProfileView } from "../profile-view";

export async function generateMetadata({ params }: PageProps<"/u/[username]/media">): Promise<Metadata> {
  return profileMetadata((await params).username);
}

export default async function ProfileMediaPage({ params }: PageProps<"/u/[username]/media">) {
  return <ProfileView username={(await params).username} tab="media" />;
}
