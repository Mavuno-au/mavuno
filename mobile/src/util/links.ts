import * as WebBrowser from "expo-web-browser";
import { Platform, Share } from "react-native";
import { siteLink } from "@/data/env";

// Links open in Safari's in-app view, so the reader comes straight back.
export function openLink(href: string) {
  void WebBrowser.openBrowserAsync(href, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
}

export const postLink = (post: { id: string; author: { username: string } }) => siteLink(`/@${post.author.username}/posts/${post.id}`);
export const profileLink = (username: string) => siteLink(`/@${username}`);

// The design turns the website's Copy link into the share sheet.
export function shareLink(url: string) {
  void Share.share(Platform.OS === "ios" ? { url } : { message: url });
}
