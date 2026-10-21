import { describe, expect, it } from "vitest";
import { revealsEmail, toUsername, usernameSchema } from "./schemas";

describe("toUsername", () => {
  it.each([
    ["Jean Paul", "jean_paul"],
    ["jean.paul", "jean_paul"],
    ["Jean-Luc", "jean_luc"],
    ["Jean-Paul N'Diaye", "jean_paul_ndiaye"],
    ["Amélie Kaboré", "amelie_kabore"],
    ["  Chidi  ", "chidi_"],
    ["@tendai", "tendai"],
    ["ama__mensah", "ama_mensah"],
    ["Wanjirũ Kamau-Njoroge the third of Nairobi", "wanjiru_kamau_njoroge_the_thir"],
  ])("turns %j into %j", (typed, username) => {
    expect(toUsername(typed)).toBe(username);
  });

  it("always gives something the username rule accepts once it's long enough", () => {
    for (const typed of ["Jean Paul", "Jean-Paul N'Diaye", "Amélie Kaboré", "Ọlá Adébáyọ̀"]) {
      expect(usernameSchema.safeParse(toUsername(typed)).success).toBe(true);
    }
  });
});

describe("revealsEmail", () => {
  it.each([
    ["jeanjabogmail_com", "jeanjabo@gmail.com", true],
    ["ama_outlook", "ama@example.org", true],
    ["ama_mentorsoutreach", "ama@mentorsoutreach.org", true],
    ["jean_jabo", "jeanjabo@gmail.com", false],
    ["kwame", "kwame@live.com", false],
  ])("%s with %s → %s", (username, email, reveals) => {
    expect(revealsEmail(username, email)).toBe(reveals);
  });
});
