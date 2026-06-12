import { describe, expect, test } from "vitest";
import { filterSlotsByTimeRange, parseJsonSlots, parseTimeValue, parseDaysOfWeek } from "../src/services/teeTimeMonitor.js";

describe("teeTimeMonitor helpers", () => {
  test("parseTimeValue parses 24-hour times", () => {
    expect(parseTimeValue("07:00")).toBe(7);
    expect(parseTimeValue("11:30")).toBe(11.5);
    expect(parseTimeValue("00:15")).toBe(0.25);
  });

  test("parseTimeValue parses AM/PM times", () => {
    expect(parseTimeValue("7:00 AM")).toBe(7);
    expect(parseTimeValue("12:00 PM")).toBe(12);
    expect(parseTimeValue("1:30 PM")).toBe(13.5);
    expect(parseTimeValue("12:00 AM")).toBe(0);
  });

  test("filterSlotsByTimeRange includes matching slots", () => {
    const slots = ["06:00", "08:15", "11:00", "12:30"];
    const matched = filterSlotsByTimeRange(slots, ["07:00", "11:00"]);
    expect(matched).toEqual(["08:15", "11:00"]);
  });

  test("filterSlotsByTimeRange returns all when time range invalid", () => {
    const slots = ["08:00", "09:00"];
    expect(filterSlotsByTimeRange(slots, ["bad", "time"]))
      .toEqual(slots);
  });

  test("parseTimeValue parses ISO date-time strings", () => {
    expect(parseTimeValue("2026-06-11 17:40")).toBeCloseTo(17.666666666666668);
    expect(parseTimeValue("2026-06-11T07:15")).toBe(7.25);
  });

  test("parseJsonSlots extracts time values from ForeUp JSON objects", async () => {
    const response = {
      json: async () => [
        { time: "2026-06-11 17:40" },
        { time: "2026-06-11T07:15" },
      ],
    } as any;

    const slots = await parseJsonSlots(response);
    expect(slots).toEqual(["2026-06-11 17:40", "2026-06-11T07:15"]);
  });

  test("parseDaysOfWeek resolves exact days", () => {
    const set = parseDaysOfWeek(["monday", "wednesday"]);
    expect(set.has(1)).toBe(true);
    expect(set.has(3)).toBe(true);
    expect(set.has(2)).toBe(false);
  });

  test("parseDaysOfWeek accepts abbreviations", () => {
    const set = parseDaysOfWeek(["mon", "fri"]);
    expect(set.has(1)).toBe(true);
    expect(set.has(5)).toBe(true);
  });
});
