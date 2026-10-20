import { describe, expect, it } from "vitest";
import { failFrom } from "./result";

describe("failFrom", () => {
  it("passes on sentences raised by database functions", () => {
    expect(failFrom({ code: "23514", message: "Polls need 2 to 4 different options" })).toEqual({
      ok: false,
      error: "Polls need 2 to 4 different options",
    });
  });

  it("hides constraint and permission details", () => {
    expect(failFrom({ code: "23514", message: 'new row violates check constraint "x"' })).toMatchObject({ error: "Something went wrong. Try again." });
    expect(failFrom({ code: "42501", message: "permission denied for table posts" })).toMatchObject({ error: "You can't do that." });
    expect(failFrom({ code: "23505", message: "duplicate key value violates unique constraint" })).toMatchObject({ error: "That is already taken." });
  });
});
