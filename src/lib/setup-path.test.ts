import { describe, expect, it } from "vitest";
import { setupPath } from "./setup-path";

const member = { banned: false, age: { kind: "confirmed" }, onboarded: true } as const;

describe("setupPath", () => {
  it("lets set-up members through", () => {
    expect(setupPath(member, "/events")).toBeNull();
  });

  it("sends new members to setup, then back", () => {
    expect(setupPath({ ...member, onboarded: false }, "/")).toBe("/onboarding");
    expect(setupPath({ ...member, onboarded: false }, "/events")).toBe("/onboarding?next=%2Fevents");
  });

  it("asks for the age first, then goes straight on to setup", () => {
    const unconfirmed = { ...member, age: { kind: "unconfirmed" } } as const;
    expect(setupPath(unconfirmed, "/events")).toBe("/onboarding/age?next=%2Fevents");
    expect(setupPath({ ...unconfirmed, onboarded: false }, "/")).toBe("/onboarding/age?next=%2Fonboarding");
  });

  it("leaves a link that already goes to setup as it is", () => {
    expect(setupPath({ ...member, onboarded: false }, "/onboarding?next=%2Fevents")).toBeNull();
  });

  it("keeps banned and deactivated members to their pages", () => {
    expect(setupPath({ ...member, banned: true }, "/")).toBe("/banned");
    expect(setupPath({ ...member, age: { kind: "deactivated", deletesAt: "2026-11-24" } }, "/")).toBe("/deactivated");
  });

  it("leaves settings and the legal pages open", () => {
    expect(setupPath({ ...member, onboarded: false, banned: true }, "/settings/account")).toBeNull();
    expect(setupPath({ ...member, onboarded: false }, "/terms")).toBeNull();
  });
});
