import { describe, expect, it } from "vitest";
import { findPersonalInfo, personalInfoWarning } from "./personal-info";

const kinds = (body: string) => findPersonalInfo(body).map((item) => item.kind);

describe("findPersonalInfo", () => {
  it("finds Australian mobile and landline numbers, however they are written", () => {
    for (const body of ["Call me on 0412 345 678", "text 0412345678 after 5", "+61 412 345 678", "office (02) 9876 5432", "+61 (0)2 9876-5432", "ring 08.9123.4567"]) {
      expect(kinds(body), body).toEqual(["phone"]);
    }
  });

  it("leaves business numbers, prices, dates and short numbers alone", () => {
    for (const body of ["Call 1300 655 506 or 13 11 14", "Tickets $1,250 or $45.50", "See you 2026-10-20 at 10.30", "Room 12, level 3", "Postcode 4000", "Order 123456789"]) {
      expect(kinds(body), body).toEqual([]);
    }
  });

  it("finds email addresses but not mentions", () => {
    expect(findPersonalInfo("Email amara.o@example.com.au or ask @kofi")).toEqual([{ kind: "email", text: "amara.o@example.com.au" }]);
  });

  it("finds bank details", () => {
    expect(kinds("BSB 062-000")).toEqual(["bank"]);
    expect(kinds("Pay to 062-000 12345678 please")).toEqual(["bank"]);
    expect(kinds("acc no: 12345678")).toEqual(["bank"]);
  });

  it("finds card numbers that pass the Luhn check, and only those", () => {
    expect(kinds("My card is 4111 1111 1111 1111")).toEqual(["card"]);
    expect(kinds("4111-1111-1111-1112")).toEqual([]);
  });

  it("finds tax file numbers by their check digits, or when labelled", () => {
    expect(kinds("123 456 782")).toEqual(["tfn"]);
    expect(kinds("123 456 789")).toEqual([]);
    expect(kinds("TFN: 123-456-782")).toEqual(["tfn"]);
  });

  it("finds Medicare numbers by their check digit", () => {
    expect(kinds("Medicare 2123 45670 1")).toEqual(["medicare"]);
    expect(kinds("2123 45671 1")).toEqual([]);
  });

  it("ignores numbers and @ signs inside links", () => {
    expect(kinds("https://example.org/posts/0412345678?by=amara@example.com")).toEqual([]);
  });
});

describe("personalInfoWarning", () => {
  it("names what was found", () => {
    expect(personalInfoWarning(findPersonalInfo("0412 345 678"))).toBe("Anyone can see this. Remove your phone number?");
    expect(personalInfoWarning(findPersonalInfo("0412 345 678, a@b.com, 0412 999 888"))).toBe("Anyone can see this. Remove your phone number and email address?");
    expect(personalInfoWarning(findPersonalInfo("a@b.com 0412 345 678 BSB 062-000"))).toBe("Anyone can see this. Remove your email address, phone number and bank details?");
  });
});
