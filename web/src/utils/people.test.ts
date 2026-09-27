import { describe, expect, test } from "vitest";
import { capitalized, nameOf, namesOf, youFirst } from "./people";

describe("people", () => {
  test("calls the viewer you", () => {
    expect(nameOf({ name: "Jason", you: true })).toBe("you");
    expect(nameOf({ name: "Sue" })).toBe("Sue");
  });

  test("puts the viewer first", () => {
    const people = [{ name: "Sue" }, { name: "Jason", you: true }, { name: "Bob" }];
    expect(youFirst(people).map((person) => person.name)).toEqual(["Jason", "Sue", "Bob"]);
  });

  test("lists the viewer first among others", () => {
    expect(namesOf([{ name: "Sue" }, { name: "Jason", you: true }])).toBe("you and Sue");
  });

  test("capitalizes the start of a sentence", () => {
    expect(capitalized("you and Sue")).toBe("You and Sue");
  });
});
