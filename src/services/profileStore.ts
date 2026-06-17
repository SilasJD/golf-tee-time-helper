import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CourseSource } from "./courseSources.js";

export interface ProfileConfig {
  discordUserId: string;
  discordUsername: string;
  enabled: boolean;
  courseIds: string[];
  timeRange: [string, string];
  daysOfWeek: string[];
  players: number;
  rainThreshold?: number;   // suppress alerts when rain chance exceeds this %
  golfPartners?: string[];  // Discord user IDs to notify when a tee time is booked
  bookedDates?: string[];   // ISO dates ("YYYY-MM-DD") paused from notifications
}

interface ConfigFile {
  courses: CourseSource[];
  profiles: ProfileConfig[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, "../config/profiles.json");

const readConfig = (path = configPath): ConfigFile => {
  const content = fs.readFileSync(path, "utf-8");
  return JSON.parse(content) as ConfigFile;
};

const writeConfig = (config: ConfigFile, path = configPath): void => {
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
};

export const loadConfig = (path = configPath): ConfigFile => readConfig(path);
export const saveConfig = (config: ConfigFile, path = configPath): void =>
  writeConfig(config, path);

export const getCourseSources = (path = configPath): CourseSource[] =>
  loadConfig(path).courses;

export const getProfiles = (path = configPath): ProfileConfig[] =>
  loadConfig(path).profiles;

export const getProfileByDiscordId = (
  discordUserId: string,
  path = configPath
): ProfileConfig | undefined =>
  getProfiles(path).find((p) => p.discordUserId === discordUserId);

export const addOrUpdateProfile = (
  profile: ProfileConfig,
  path = configPath
): ProfileConfig => {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.bookedDates) {
    profile.bookedDates = profile.bookedDates.filter((d) => d >= today);
  }
  const config = loadConfig(path);
  const idx = config.profiles.findIndex(
    (p) => p.discordUserId === profile.discordUserId
  );
  if (idx >= 0) {
    config.profiles[idx] = profile;
  } else {
    config.profiles.push(profile);
  }
  saveConfig(config, path);
  return profile;
};

export const addBookedDates = (
  discordUserId: string,
  dates: string[],
  path = configPath
): void => {
  const config = loadConfig(path);
  const idx = config.profiles.findIndex((p) => p.discordUserId === discordUserId);
  if (idx < 0) return;
  const existing = new Set(config.profiles[idx].bookedDates ?? []);
  for (const d of dates) existing.add(d);
  config.profiles[idx].bookedDates = [...existing];
  saveConfig(config, path);
};

export const removeBookedDates = (
  discordUserId: string,
  dates: string[],
  path = configPath
): void => {
  const config = loadConfig(path);
  const idx = config.profiles.findIndex((p) => p.discordUserId === discordUserId);
  if (idx < 0) return;
  const remove = new Set(dates);
  config.profiles[idx].bookedDates = (config.profiles[idx].bookedDates ?? []).filter((d) => !remove.has(d));
  saveConfig(config, path);
};

export const getCourseSourceById = (
  id: string,
  path = configPath
): CourseSource | undefined =>
  getCourseSources(path).find((course) => course.id === id);
