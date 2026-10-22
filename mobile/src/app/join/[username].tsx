import { Redirect, useLocalSearchParams } from "expo-router";
import { usernameSchema } from "@/lib/schemas";
import { useSession } from "@/data/session";

// mavuno.au/join/<username>, opened in the app: a guest starts joining with
// the invite, and a member sees the inviter's profile, as on the website.
export default function InviteLink() {
  const session = useSession();
  const username = usernameSchema.safeParse(useLocalSearchParams().username).data;
  if (session.kind === "signed-in") return <Redirect href={username ? `/profile/${username}` : "/"} />;
  return <Redirect href={username ? { pathname: "/join", params: { invite: username } } : "/join"} />;
}
