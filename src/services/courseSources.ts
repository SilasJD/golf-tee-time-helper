import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CourseSource {
  id: string;
  code: string;
  name: string;
  city: string;
  region: string;
  queryUrl: string;
  bookingUrl: string;
  primeWindowHours: [number, number];
  lat?: number;
  lon?: number;
}

interface ConfigFile {
  courses: CourseSource[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, "../config/profiles.json");
const rawConfig = fs.readFileSync(configPath, "utf-8");
const config = JSON.parse(rawConfig) as ConfigFile;

const courses = config.courses;

export const getCourseSourceById = (id: string) =>
  courses.find((course) => course.id === id);

export const getCourseSourceByCode = (code: string) =>
  courses.find((course) => course.code.toLowerCase() === code.toLowerCase());

export const getCourseSourceByIdOrCode = (value: string) =>
  getCourseSourceById(value) ?? getCourseSourceByCode(value);
