import { describe, expect, it } from "vitest";
import { inviteMessage, inviteUrl, whatsAppLink } from "./invites";

describe("invite links", () => {
  it("puts the username after /join on the site's origin", () => {
    expect(inviteUrl("https://mavuno.au", "kofi")).toBe("https://mavuno.au/join/kofi");
    expect(inviteUrl("https://mavuno.au/", "amara_o")).toBe("https://mavuno.au/join/amara_o");
  });

  it("ends the message with the link, so WhatsApp shows its card", () => {
    expect(inviteMessage("https://mavuno.au/join/kofi").endsWith(" https://mavuno.au/join/kofi")).toBe(true);
  });

  it("opens WhatsApp with the whole message filled in", () => {
    const link = new URL(whatsAppLink("https://mavuno.au/join/kofi"));
    expect(link.origin).toBe("https://wa.me");
    expect(link.searchParams.get("text")).toBe(inviteMessage("https://mavuno.au/join/kofi"));
  });
});
