import { beforeEach, describe, expect, it, vi } from "vitest";

const MEMBER = "6f1c3c1e-8a52-4e0b-9a43-2b1f7d1f9c11";
const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

const row = {
  id: MEMBER,
  username: "wanjiru",
  display_name: "Wanjiru",
  avatar_url: null,
  colour: 2,
  city_id: null,
  languages: ["en"],
  profile_settings: {
    site_role: "member",
    suspended_until: null,
    banned_at: null,
    rules_accepted_at: null,
    translation_language: null,
    onboarded_at: null,
    age_confirmed_at: "2026-10-01T00:00:00Z",
    age_deactivated_at: null,
  },
  organisation_members: [],
};

// A client that knows one valid token, and answers the viewer query with `row`.
function fakeClient(valid: string | undefined) {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }) };
  return {
    auth: { getClaims: vi.fn(async (jwt?: string) => ({ data: jwt === valid ? { claims: { sub: MEMBER } } : null })) },
    from: vi.fn(() => query),
  };
}

const clients = vi.hoisted(() => ({ cookie: vi.fn(), token: vi.fn(), guest: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: clients.cookie, createTokenClient: clients.token, createGuestClient: clients.guest }));

const { getRequestViewer } = await import("./viewer");

const request = (authorization?: string) => new Request("https://mavuno.au/api/export", { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  clients.cookie.mockResolvedValue(fakeClient(undefined));
  clients.token.mockImplementation(() => fakeClient(TOKEN));
  clients.guest.mockReturnValue(fakeClient("never"));
});

describe("getRequestViewer", () => {
  it("reads the viewer from a bearer token", async () => {
    const { viewer } = await getRequestViewer(request(`Bearer ${TOKEN}`));
    expect(clients.token).toHaveBeenCalledWith(TOKEN);
    expect(clients.cookie).not.toHaveBeenCalled();
    expect(viewer?.id).toBe(MEMBER);
  });

  it("treats a token Supabase rejects as signed out", async () => {
    clients.token.mockImplementation(() => fakeClient("another.valid.token"));
    const { viewer } = await getRequestViewer(request(`Bearer ${TOKEN}`));
    expect(viewer).toBeNull();
    expect(clients.cookie).not.toHaveBeenCalled();
  });

  it("never falls back to the cookie for a malformed header", async () => {
    const { viewer } = await getRequestViewer(request("Bearer sb_publishable_abc"));
    expect(viewer).toBeNull();
    expect(clients.cookie).not.toHaveBeenCalled();
    expect(clients.token).not.toHaveBeenCalled();
  });

  it("uses the session cookie without a header", async () => {
    const { viewer } = await getRequestViewer(request());
    expect(clients.cookie).toHaveBeenCalled();
    expect(clients.token).not.toHaveBeenCalled();
    expect(viewer?.id).toBe(MEMBER);
  });
});
