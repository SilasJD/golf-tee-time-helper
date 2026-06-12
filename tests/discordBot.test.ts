import { describe, expect, test } from "vitest";
import { parseDaysInput, parseTimeInput, parseCoursesInput } from "../src/services/discordBot.js";

describe("parseDaysInput", () => {
  test("weekdays preset", () => {
    expect(parseDaysInput("weekdays")).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
    ]);
  });

  test("weekends preset", () => {
    expect(parseDaysInput("weekends")).toEqual(["Saturday", "Sunday"]);
  });

  test("all preset", () => {
    expect(parseDaysInput("all")).toHaveLength(7);
  });

  test("custom day list", () => {
    expect(parseDaysInput("Mon Wed Sat")).toEqual(["Monday", "Wednesday", "Saturday"]);
  });

  test("comma separated", () => {
    expect(parseDaysInput("Mon, Fri")).toEqual(["Monday", "Friday"]);
  });

  test("returns null for unrecognised input", () => {
    expect(parseDaysInput("whenever")).toBeNull();
  });
});

describe("parseTimeInput", () => {
  test("early preset", () => {
    expect(parseTimeInput("early")).toEqual(["06:00", "09:00"]);
  });

  test("morning preset", () => {
    expect(parseTimeInput("morning")).toEqual(["09:00", "12:00"]);
  });

  test("all day preset", () => {
    expect(parseTimeInput("all day")).toEqual(["06:00", "20:00"]);
  });

  test("custom am range", () => {
    expect(parseTimeInput("7am-11am")).toEqual(["07:00", "11:00"]);
  });

  test("custom range with 'to'", () => {
    expect(parseTimeInput("8am to 1pm")).toEqual(["08:00", "13:00"]);
  });

  test("returns null for unrecognised input", () => {
    expect(parseTimeInput("sometime")).toBeNull();
  });
});

describe("parseCoursesInput", () => {
  test("all returns all four courses", () => {
    expect(parseCoursesInput("all")).toHaveLength(4);
  });

  test("single code DR", () => {
    expect(parseCoursesInput("DR")).toEqual(["diamond-ridge-woodlands"]);
  });

  test("multiple codes", () => {
    expect(parseCoursesInput("DR FH")).toEqual([
      "diamond-ridge-woodlands",
      "fox-hollow-golf-course",
    ]);
  });

  test("full name alias", () => {
    expect(parseCoursesInput("greystone")).toEqual(["greystone-golf-course"]);
  });

  test("returns null for unrecognised input", () => {
    expect(parseCoursesInput("some other course")).toBeNull();
  });
});
