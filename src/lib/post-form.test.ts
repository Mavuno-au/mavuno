import { describe, expect, it } from "vitest";
import { newMessageSchema } from "./messages";
import { postSchemas } from "./post-form";
import { profileSchema } from "./profile-form";

const { newPost } = postSchemas("https://example.supabase.co");
const draft = { body: "", language: "en", authorId: null, parentId: null, quoteId: null, spaceId: null, eventId: null, opportunityId: null, linkUrl: null, images: [], poll: null };

// Postgres text can't hold a NUL character, so a paste that carries one
// would be refused whole with nothing to say why.
describe("text that people write", () => {
  it("drops a NUL character from a post, its poll and its image descriptions", () => {
    const parsed = newPost.parse({ ...draft, body: "Jollof\0 night", poll: { options: ["Yes\0", "No"], durationHours: 24 } });
    expect(parsed.body).toBe("Jollof night");
    expect(parsed.poll?.options).toEqual(["Yes", "No"]);
  });

  it("drops it from a message and a profile", () => {
    const message = newMessageSchema.parse({ conversationId: "1d1f9b7e-8b2c-4c6e-9f0d-2d8a3b4c5d6e", body: "See you\0 there", imagePaths: [], imageAlts: [], replyToId: null });
    expect(message.body).toBe("See you there");
    const profile = profileSchema.parse({ displayName: "Ama\0", bio: "Hi\0" });
    expect(profile).toMatchObject({ display_name: "Ama", bio: "Hi" });
  });
});
