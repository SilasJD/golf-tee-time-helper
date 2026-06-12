import fs from "node:fs";
import path from "node:path";
import {
  addOrUpdateProfile,
  getProfileByDiscordId,
  getProfiles,
  loadConfig,
  saveConfig,
  type ProfileConfig,
} from "../src/services/profileStore.js";

const tempFile = path.join(process.cwd(), "tests", "test-profiles.json");

const sampleProfile: ProfileConfig = {
  discordUserId: "111222333",
  discordUsername: "testuser",
  enabled: true,
  courseIds: ["diamond-ridge-woodlands"],
  timeRange: ["07:00", "11:00"],
  daysOfWeek: ["Saturday", "Sunday"],
};

const sampleConfig = { courses: [], profiles: [sampleProfile] };

const writeSample = () =>
  fs.writeFileSync(tempFile, JSON.stringify(sampleConfig, null, 2), "utf-8");

beforeEach(() => { writeSample(); });
afterAll(() => { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); });

test("loadConfig returns config from path", () => {
  expect(loadConfig(tempFile)).toEqual(sampleConfig);
});

test("getProfileByDiscordId finds profile", () => {
  const p = getProfileByDiscordId("111222333", tempFile);
  expect(p).toBeDefined();
  expect(p?.discordUsername).toBe("testuser");
});

test("getProfileByDiscordId returns undefined for unknown user", () => {
  expect(getProfileByDiscordId("999", tempFile)).toBeUndefined();
});

test("getProfiles returns all profiles", () => {
  expect(getProfiles(tempFile)).toHaveLength(1);
});

test("addOrUpdateProfile updates an existing profile", () => {
  const p = getProfileByDiscordId("111222333", tempFile)!;
  p.enabled = false;
  addOrUpdateProfile(p, tempFile);
  expect(getProfileByDiscordId("111222333", tempFile)?.enabled).toBe(false);
});

test("addOrUpdateProfile inserts a new profile", () => {
  const newProfile: ProfileConfig = {
    discordUserId: "999888777",
    discordUsername: "newuser",
    enabled: true,
    courseIds: ["greystone-golf-course"],
    timeRange: ["09:00", "12:00"],
    daysOfWeek: ["Saturday"],
  };
  addOrUpdateProfile(newProfile, tempFile);
  expect(getProfiles(tempFile)).toHaveLength(2);
  expect(getProfileByDiscordId("999888777", tempFile)?.discordUsername).toBe("newuser");
});
