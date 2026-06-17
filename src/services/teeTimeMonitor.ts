import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fetch, { type Response } from "node-fetch";
import {
  getCourseSourceById,
  type CourseSource,
} from "./courseSources.js";
import { getProfiles, type ProfileConfig } from "./profileStore.js";
import { NotificationService } from "./notificationService.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, "../../data");
const slotsFile = join(dataDir, "lastKnownSlots.json");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TeeSlot {
  time: string;
  greenFee?: number;
  cartFee?: number;
  cartIncluded?: boolean;
  availablePlayers?: number;
}

export interface PriceInfo {
  green?: number;
  cart?: number;
  cartIncluded?: boolean;
}

export type PriceMap = Map<string, PriceInfo>;

// ── Slot persistence ──────────────────────────────────────────────────────────

const loadPersistedSlots = (): Map<string, Set<string>> => {
  try {
    if (!fs.existsSync(slotsFile)) return new Map();
    const raw = JSON.parse(fs.readFileSync(slotsFile, "utf-8")) as Record<string, string[]>;
    return new Map(Object.entries(raw).map(([k, v]) => [k, new Set(v)]));
  } catch { return new Map(); }
};

const persistSlots = (slots: Map<string, Set<string>>) => {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const obj: Record<string, string[]> = {};
    for (const [k, v] of slots) obj[k] = [...v];
    fs.writeFileSync(slotsFile, JSON.stringify(obj));
  } catch { /* non-fatal */ }
};

export interface MonitorResult {
  profileId: string;
  profileName: string;
  enabled: boolean;
  skipped: boolean;
  courseId: string;
  courseName: string;
  rawSlots: string[];
  matchedSlots: string[];
  priceMap: PriceMap;
}

export interface TeeTimeMonitor {
  start: () => Promise<void>;
  stop: () => void;
  lastRunAt: Date | null;
  lastResult: MonitorResult[];
  primeSlots: MonitorResult[];
  notifiedSlots: string[];
  lookaheadDays: number;
}

// ── Time/day helpers ──────────────────────────────────────────────────────────

const weekdayNames = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export const parseTimeValue = (time: string) => {
  const normalized = time.trim().toUpperCase();

  const ampmMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hour !== 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;
    return hour + minute / 60;
  }

  const plainMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (plainMatch) {
    return Number(plainMatch[1]) + Number(plainMatch[2]) / 60;
  }

  const dateTimeMatch = normalized.match(/^\d{4}-\d{2}-\d{2}[T ](\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (dateTimeMatch) {
    return Number(dateTimeMatch[1]) + Number(dateTimeMatch[2]) / 60;
  }

  return null;
};

export const parseDaysOfWeek = (days: string[] = []): Set<number> => {
  if (!Array.isArray(days) || days.length === 0) {
    return new Set(weekdayNames.map((_, i) => i));
  }
  const resolved = days
    .map((d) => d.trim().toLowerCase())
    .map((v) => {
      const exact = weekdayNames.indexOf(v);
      if (exact >= 0) return exact;
      return weekdayNames.findIndex((n) => n.startsWith(v.slice(0, 3)));
    })
    .filter((i) => i >= 0);
  return resolved.length > 0
    ? new Set(resolved)
    : new Set(weekdayNames.map((_, i) => i));
};

export const filterSlotsByTimeRange = (slots: string[], timeRange: [string, string]) => {
  const start = parseTimeValue(timeRange[0]);
  const end = parseTimeValue(timeRange[1]);
  if (start === null || end === null) return slots;
  return slots.filter((slot) => {
    const timePart = slot.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
    const v = parseTimeValue(timePart);
    return v !== null && v >= start && v <= end;
  });
};

// ── Date helpers ──────────────────────────────────────────────────────────────

const dateToParam = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
};

const getLookaheadDays = (): number => {
  const parsed = Number(process.env.LOOKAHEAD_DAYS ?? 17);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 60) : 17;
};

const getLookaheadDates = (profile: ProfileConfig, maxDays?: number): string[] => {
  const lookahead = maxDays ?? getLookaheadDays();
  const allowed = parseDaysOfWeek(profile.daysOfWeek);
  const dates: string[] = [];
  for (let i = 0; i < lookahead; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (allowed.has(d.getDay())) dates.push(dateToParam(d));
  }
  return dates;
};

// ── ForeUp auth ───────────────────────────────────────────────────────────────

const getAuthHeaders = (): Record<string, string> => {
  const jwt = process.env.FOREUP_JWT;
  if (!jwt) return {};

  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    const expiresAt = new Date(payload.exp * 1000);
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
    if (daysLeft <= 0) {
      logger.error("FOREUP_JWT has expired — update it in .env to restore Advantage Card access");
      return {};
    }
    if (daysLeft <= 5) {
      logger.info(`FOREUP_JWT expires in ${daysLeft} day(s) — update .env soon`);
    }
  } catch { /* ignore malformed JWT */ }

  return {
    "x-authorization": `Bearer ${process.env.FOREUP_JWT}`,
    "x-fu-golfer-location": "foreup",
    "x-requested-with": "XMLHttpRequest",
  };
};

const getBookingClass = (): string =>
  process.env.FOREUP_BOOKING_CLASS ?? "0";

// ── ForeUp parsing ────────────────────────────────────────────────────────────

const parseJsonSlots = async (response: Response): Promise<TeeSlot[]> => {
  try {
    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) {
      if (payload.every((item) => typeof item === "string")) {
        return payload.map((s) => ({ time: String(s) }));
      }

      return payload
        .filter((item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
        )
        .map((item): TeeSlot | null => {
          let time: string | null = null;
          if (typeof item.time === "string") {
            time = item.time;
          } else if (typeof item.start_front === "number") {
            const v = String(item.start_front).padStart(12, "0");
            time = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}`;
          }
          if (!time) return null;

          const toNum = (val: unknown): number | undefined => {
            const n = Number(val);
            return val != null && !isNaN(n) && n > 0 ? n : undefined;
          };
          const greenFee = toNum(item.green_fee ?? item.greenFee);
          const cartFee = toNum(item.cart_fee ?? item.cartFee);

          return { time, greenFee, cartFee };
        })
        .filter((s): s is TeeSlot => s !== null && s.time !== "");
    }
    if (
      typeof payload === "object" &&
      payload !== null &&
      Array.isArray((payload as { slots?: unknown }).slots)
    ) {
      return ((payload as { slots: unknown[] }).slots).map((s) => ({ time: String(s) }));
    }
  } catch { /* ignore */ }
  return [];
};

const parseHtmlSlots = async (response: Response): Promise<TeeSlot[]> => {
  const text = await response.text();
  return [...text.matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi)].map((m) => ({ time: m[1] }));
};

// ── TeeItUp parsing ───────────────────────────────────────────────────────────

// Parses one teetime object. Does NOT filter by player count — callers do that.
const parseTeeItUpItem = (item: Record<string, unknown>): TeeSlot | null => {
  if (typeof item.teetime !== "string") return null;

  const dt = new Date(item.teetime);
  if (isNaN(dt.getTime())) return null;
  const eastern = dt.toLocaleString("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const time = eastern.replace(", ", " ").replace(/(\d{2}:\d{2}):\d{2}/, "$1");

  const booked = Number(item.bookedPlayers ?? 0);
  const max = Number(item.maxPlayers ?? 4);
  const availablePlayers = Math.max(0, max - booked);

  let greenFee: number | undefined;
  let cartFee: number | undefined;
  let cartIncluded: boolean | undefined;
  const rates = item.rates;
  if (Array.isArray(rates) && rates.length > 0) {
    const rate = rates[0] as Record<string, unknown>;
    const walking = typeof rate.greenFeeWalking === "number" ? rate.greenFeeWalking : undefined;
    const riding = typeof rate.greenFeeRiding === "number" ? rate.greenFeeRiding : undefined;
    const cartTotal = typeof rate.greenFeeCart === "number" ? rate.greenFeeCart : undefined;
    if (walking != null) {
      greenFee = walking / 100;
      if (riding != null && riding > walking) cartFee = (riding - walking) / 100;
    } else if (cartTotal != null) {
      greenFee = cartTotal / 100;
      cartIncluded = true;
    }
  }

  return { time, greenFee, cartFee, cartIncluded, availablePlayers };
};

// Extracts the numeric GolfFacilityId from a teetime item's rates.
const getFacilityId = (item: Record<string, unknown>): number | undefined => {
  const rates = item.rates;
  if (!Array.isArray(rates) || rates.length === 0) return undefined;
  const golfnow = (rates[0] as Record<string, unknown>).golfnow;
  if (typeof golfnow !== "object" || golfnow === null) return undefined;
  const fid = (golfnow as Record<string, unknown>).GolfFacilityId;
  return typeof fid === "number" ? fid : undefined;
};

// Single-course parse (used by checkCourseOnDemand). Filters by minPlayers.
const parseTeeItUpSlots = (data: unknown, minPlayers: number): TeeSlot[] => {
  if (!Array.isArray(data)) return [];
  const slots: TeeSlot[] = [];
  for (const group of data) {
    if (typeof group !== "object" || group === null) continue;
    const teetimes = (group as Record<string, unknown>).teetimes;
    if (!Array.isArray(teetimes)) continue;
    for (const tt of teetimes) {
      if (typeof tt !== "object" || tt === null) continue;
      const slot = parseTeeItUpItem(tt as Record<string, unknown>);
      if (slot && (slot.availablePlayers ?? 0) >= minPlayers) slots.push(slot);
    }
  }
  return slots;
};

// ── Fetching ──────────────────────────────────────────────────────────────────

const fetchForeUpSlots = async (
  course: CourseSource,
  dateStr: string,
  players: number,
  authHeaders: Record<string, string>,
  bookingClass: string
): Promise<TeeSlot[]> => {
  try {
    const url = course.queryUrl
      .replace("{date}", dateStr)
      .replace("{players}", String(players))
      .replace("booking_class=0", `booking_class=${bookingClass}`);
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", ...authHeaders },
    });
    if (!response.ok) {
      logger.error(`Failed to fetch ${course.name}`, { status: response.status, url });
      return [];
    }
    const contentType = response.headers.get("content-type") ?? "";
    return contentType.includes("application/json")
      ? await parseJsonSlots(response)
      : await parseHtmlSlots(response);
  } catch (err) {
    logger.error(`Error fetching tee times for ${course.name}`, err);
    return [];
  }
};

// Single-course TeeItUp fetch (used by checkCourseOnDemand).
const fetchTeeItUpSlots = async (
  course: CourseSource,
  dateStr: string,
  players: number
): Promise<TeeSlot[]> => {
  try {
    const [mm, dd, yyyy] = dateStr.split("-");
    const url = course.queryUrl.replace("{date}", `${yyyy}-${mm}-${dd}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        "x-be-alias": course.teeitupAlias ?? "",
      },
    });
    if (!response.ok) {
      logger.error(`Failed to fetch ${course.name}`, { status: response.status, url });
      return [];
    }
    return parseTeeItUpSlots(await response.json(), players);
  } catch (err) {
    logger.error(`Error fetching tee times for ${course.name}`, err);
    return [];
  }
};

// Batched TeeItUp fetch — one request per alias group per date.
// Returns Map<courseId, TeeSlot[]> without player filtering (callers filter).
const fetchTeeItUpBatch = async (
  alias: string,
  courses: CourseSource[],
  dateStr: string // MM-DD-YYYY
): Promise<Map<string, TeeSlot[]>> => {
  const result = new Map(courses.map((c) => [c.id, [] as TeeSlot[]]));
  try {
    const [mm, dd, yyyy] = dateStr.split("-");
    const isoDate = `${yyyy}-${mm}-${dd}`;

    const facilityIdMap = new Map<number, string>(); // facilityId → courseId
    const facilityIds: number[] = [];
    for (const course of courses) {
      const m = course.queryUrl.match(/facilityIds=(\d+)/);
      if (m) {
        const fid = parseInt(m[1], 10);
        facilityIdMap.set(fid, course.id);
        facilityIds.push(fid);
      }
    }

    const url = `https://phx-api-be-east-1b.kenna.io/v2/tee-times?date=${isoDate}&facilityIds=${facilityIds.join(",")}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json", "x-be-alias": alias },
    });
    if (!response.ok) {
      logger.error(`Failed to fetch TeeItUp batch [${alias}]`, { status: response.status, url });
      return result;
    }

    const data = await response.json() as unknown;
    if (!Array.isArray(data)) return result;

    for (const group of data) {
      if (typeof group !== "object" || group === null) continue;
      const teetimes = (group as Record<string, unknown>).teetimes;
      if (!Array.isArray(teetimes)) continue;
      for (const tt of teetimes) {
        if (typeof tt !== "object" || tt === null) continue;
        const item = tt as Record<string, unknown>;
        const fid = getFacilityId(item);
        const courseId = fid != null ? facilityIdMap.get(fid) : undefined;
        if (!courseId) continue;
        const slot = parseTeeItUpItem(item);
        if (slot) result.get(courseId)!.push(slot);
      }
    }
  } catch (err) {
    logger.error(`Error in TeeItUp batch fetch [${alias}]`, err);
  }
  return result;
};

const fetchCourseSlots = async (
  course: CourseSource,
  dateStr: string,
  players: number,
  authHeaders: Record<string, string>,
  bookingClass: string
): Promise<TeeSlot[]> => {
  if (course.platform === "teeitup") return fetchTeeItUpSlots(course, dateStr, players);
  return fetchForeUpSlots(course, dateStr, players, authHeaders, bookingClass);
};

// ── Log helpers ───────────────────────────────────────────────────────────────

const formatSlotsForLog = (slots: string[]): string => {
  if (slots.length === 0) return "none";
  const byDate = new Map<string, string[]>();
  for (const slot of slots) {
    const spaceIdx = slot.indexOf(" ");
    const [date, time] = spaceIdx > 0 ? [slot.slice(0, spaceIdx), slot.slice(spaceIdx + 1)] : ["?", slot];
    byDate.set(date, [...(byDate.get(date) ?? []), time]);
  }
  return [...byDate.entries()]
    .map(([date, times]) => {
      const d = new Date(`${date}T12:00:00`);
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return `${label}: ${times.join(", ")}`;
    })
    .join(" | ");
};

// ── Slot tracking / notify helper (shared between scan loops) ─────────────────

const processMatchedSlots = async (
  tag: string,
  profile: ProfileConfig,
  course: CourseSource,
  rawSlots: string[],
  priceMap: PriceMap,
  lastKnownSlots: Map<string, Set<string>>,
  notificationService: NotificationService,
  results: MonitorResult[]
) => {
  const bookedDates = new Set(profile.bookedDates ?? []);
  const matchedSlots = filterSlotsByTimeRange(rawSlots, profile.timeRange)
    .filter((s) => !bookedDates.has(s.slice(0, 10)));

  const trackKey = `${profile.discordUserId}:${course.id}`;
  const prevSlots = lastKnownSlots.get(trackKey) ?? new Set<string>();
  const newSlots = matchedSlots.filter((s) => !prevSlots.has(s));
  lastKnownSlots.set(trackKey, new Set(matchedSlots));
  persistSlots(lastKnownSlots);

  if (matchedSlots.length > 0) {
    logger.info(`${tag} ${course.name}: ${matchedSlots.length} slot(s) in window — ${formatSlotsForLog(matchedSlots)}`);
  } else {
    logger.info(`${tag} ${course.name}: no slots in time window`);
  }
  if (newSlots.length > 0) {
    logger.info(`${tag} ${course.name}: ${newSlots.length} new slot(s) → notifying ${profile.discordUsername}`);
    await notificationService.notifyPrimeSlots(profile, course, newSlots, priceMap);
  }

  results.push({
    profileId: profile.discordUserId,
    profileName: profile.discordUsername,
    enabled: true, skipped: false,
    courseId: course.id, courseName: course.name,
    rawSlots, matchedSlots, priceMap,
  });
};

// ── Monitor ───────────────────────────────────────────────────────────────────

type ScanMode = "public" | "advantage";

const PUBLIC_WINDOW_DAYS = 9;

const PUBLIC_MIN_MS    =  5 * 60 * 1000;
const PUBLIC_MAX_MS    = 10 * 60 * 1000;
const ADVANTAGE_MIN_MS = 15 * 60 * 1000;
const ADVANTAGE_MAX_MS = 90 * 60 * 1000;
const TEEITUP_MIN_MS   = Number(process.env.TEEITUP_POLL_MIN_MS ?? 60_000);
const TEEITUP_MAX_MS   = Number(process.env.TEEITUP_POLL_MAX_MS ?? 90_000);

const randomDelay = (minMs: number, maxMs: number) =>
  Math.floor(Math.random() * (maxMs - minMs)) + minMs;

const getApiCallDelayMs = () => {
  const parsed = Number(process.env.API_CALL_DELAY_MS ?? 1000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const checkCourseOnDemand = async (
  course: CourseSource,
  isoDates: string[],
  players: number,
  timeRange: [string, string]
): Promise<{ slots: string[]; priceMap: PriceMap }> => {
  const authHeaders = getAuthHeaders();
  const bookingClass = getBookingClass();
  const allSlots: string[] = [];
  const priceMap: PriceMap = new Map();
  for (const isoDate of isoDates) {
    const [yyyy, mm, dd] = isoDate.split("-");
    const raw = await fetchCourseSlots(course, `${mm}-${dd}-${yyyy}`, players, authHeaders, bookingClass);
    for (const ts of raw) {
      const timePart = ts.time.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
      const slotKey = `${isoDate} ${timePart}`;
      allSlots.push(slotKey);
      if (ts.greenFee !== undefined) {
        priceMap.set(slotKey, { green: ts.greenFee, cart: ts.cartFee, cartIncluded: ts.cartIncluded });
      }
    }
  }
  return { slots: filterSlotsByTimeRange(allSlots, timeRange), priceMap };
};

export const initMonitor = (notificationService: NotificationService): TeeTimeMonitor => {
  const lookaheadDays = getLookaheadDays();
  const lastKnownSlots = loadPersistedSlots();

  const state = {
    lastRunAt: null as Date | null,
    lastResult: [] as MonitorResult[],
    primeSlots: [] as MonitorResult[],
  };

  // ── ForeUp scan (public / advantage) ───────────────────────────────────────

  const runCheck = async (mode: ScanMode) => {
    const results: MonitorResult[] = [];
    const slotCache = new Map<string, TeeSlot[]>();

    const authHeaders  = mode === "advantage" ? getAuthHeaders() : {};
    const bookingClass = mode === "advantage" ? getBookingClass() : "0";
    const effectiveDays = mode === "public" ? PUBLIC_WINDOW_DAYS : getLookaheadDays();
    const apiDelay = getApiCallDelayMs();
    const tag = `[${mode}]`;

    const profiles = getProfiles();
    const activeCourseIds = new Set(profiles.filter((p) => p.enabled).flatMap((p) => p.courseIds));
    const scanCourseIds = [...activeCourseIds].filter((id) => {
      const c = getCourseSourceById(id);
      if (c?.platform === "teeitup") return false; // handled by TeeItUp scan
      return mode === "advantage" ? c?.supportsAdvantage : true;
    });
    const activeCourseNames = scanCourseIds.map((id) => getCourseSourceById(id)?.name ?? id).join(", ");
    logger.info(`${tag} Scan started — querying ${scanCourseIds.length} course(s): ${activeCourseNames}`);

    for (const profile of profiles) {
      const profileName = profile.discordUsername;

      if (!profile.enabled) {
        for (const courseId of profile.courseIds) {
          const course = getCourseSourceById(courseId);
          if (course?.platform === "teeitup") continue;
          results.push({
            profileId: profile.discordUserId, profileName,
            enabled: false, skipped: false,
            courseId, courseName: course?.name ?? "Unknown course",
            rawSlots: [], matchedSlots: [], priceMap: new Map(),
          });
        }
        continue;
      }

      const allowedDates = getLookaheadDates(profile, effectiveDays);
      if (allowedDates.length === 0) {
        for (const courseId of profile.courseIds) {
          const course = getCourseSourceById(courseId);
          if (course?.platform === "teeitup") continue;
          results.push({
            profileId: profile.discordUserId, profileName,
            enabled: true, skipped: true,
            courseId, courseName: course?.name ?? "Unknown course",
            rawSlots: [], matchedSlots: [], priceMap: new Map(),
          });
        }
        continue;
      }

      for (const courseId of profile.courseIds) {
        const course = getCourseSourceById(courseId);
        if (!course || course.platform === "teeitup") continue;
        if (mode === "advantage" && !course.supportsAdvantage) continue;

        const players = profile.players ?? 4;
        logger.info(`${tag} Fetching ${course.name} — ${allowedDates.length} date(s): ${allowedDates.join(", ")}`);
        const rawSlots: string[] = [];
        const priceMap: PriceMap = new Map();

        for (const dateStr of allowedDates) {
          const cacheKey = `${mode}:${course.id}:${dateStr}:${players}`;
          if (!slotCache.has(cacheKey)) {
            if (apiDelay > 0) await sleep(apiDelay);
            slotCache.set(cacheKey, await fetchCourseSlots(course, dateStr, players, authHeaders, bookingClass));
          }
          const [mm, dd, yyyy] = dateStr.split("-");
          const isoDate = `${yyyy}-${mm}-${dd}`;
          for (const ts of slotCache.get(cacheKey)!) {
            const timePart = ts.time.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
            const slotKey = `${isoDate} ${timePart}`;
            rawSlots.push(slotKey);
            if (ts.greenFee !== undefined) {
              priceMap.set(slotKey, { green: ts.greenFee, cart: ts.cartFee, cartIncluded: ts.cartIncluded });
            }
          }
        }

        await processMatchedSlots(tag, profile, course, rawSlots, priceMap, lastKnownSlots, notificationService, results);
      }
    }

    state.lastRunAt = new Date();
    state.lastResult = [...state.lastResult.filter((r) => r.courseId !== "teeitup-placeholder"), ...results];
    state.primeSlots = state.lastResult.filter((r) => r.matchedSlots.length > 0);
    const withSlots = results.filter((r) => r.matchedSlots.length > 0).length;
    const total = results.filter((r) => r.enabled && !r.skipped).length;
    logger.info(`${tag} Scan complete — ${withSlots}/${total} course(s) have slots in window`);
  };

  // ── TeeItUp scan (batched by alias) ────────────────────────────────────────

  const runTeeItUpScan = async () => {
    const profiles = getProfiles();
    const apiDelay = getApiCallDelayMs();
    const tag = "[teeitup]";

    // Build alias groups and course→profiles mapping from enabled profiles
    const aliasGroups = new Map<string, CourseSource[]>();
    const courseProfiles = new Map<string, ProfileConfig[]>();

    for (const profile of profiles) {
      if (!profile.enabled) continue;
      for (const courseId of profile.courseIds) {
        const course = getCourseSourceById(courseId);
        if (!course || course.platform !== "teeitup") continue;
        const alias = course.teeitupAlias ?? "";
        if (!aliasGroups.has(alias)) aliasGroups.set(alias, []);
        if (!aliasGroups.get(alias)!.find((c) => c.id === course.id)) {
          aliasGroups.get(alias)!.push(course);
        }
        courseProfiles.set(courseId, [...(courseProfiles.get(courseId) ?? []), profile]);
      }
    }

    if (aliasGroups.size === 0) return;

    const totalCourses = [...aliasGroups.values()].flat().length;
    logger.info(`${tag} Scan started — ${totalCourses} course(s) across ${aliasGroups.size} tenant(s)`);

    // Union of all dates any enabled profile cares about
    const allDates = new Set<string>();
    for (const profile of profiles) {
      if (!profile.enabled) continue;
      for (const dateStr of getLookaheadDates(profile, getLookaheadDays())) {
        allDates.add(dateStr);
      }
    }

    // Batch fetch: one request per alias × date
    // batchCache["alias:dateStr"] → Map<courseId, TeeSlot[]>
    const batchCache = new Map<string, Map<string, TeeSlot[]>>();

    for (const [alias, courses] of aliasGroups) {
      for (const dateStr of allDates) {
        if (apiDelay > 0) await sleep(apiDelay);
        batchCache.set(`${alias}:${dateStr}`, await fetchTeeItUpBatch(alias, courses, dateStr));
      }
    }

    // Process per-profile × per-course
    const results: MonitorResult[] = [];
    for (const profile of profiles) {
      if (!profile.enabled) continue;
      const players = profile.players ?? 4;
      const allowedDates = getLookaheadDates(profile, getLookaheadDays());

      for (const courseId of profile.courseIds) {
        const course = getCourseSourceById(courseId);
        if (!course || course.platform !== "teeitup") continue;
        const alias = course.teeitupAlias ?? "";

        const rawSlots: string[] = [];
        const priceMap: PriceMap = new Map();

        for (const dateStr of allowedDates) {
          const cached = batchCache.get(`${alias}:${dateStr}`);
          const slots = cached?.get(course.id) ?? [];
          const [mm, dd, yyyy] = dateStr.split("-");
          const isoDate = `${yyyy}-${mm}-${dd}`;

          for (const ts of slots) {
            if ((ts.availablePlayers ?? 0) < players) continue;
            const timePart = ts.time.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
            const slotKey = `${isoDate} ${timePart}`;
            rawSlots.push(slotKey);
            if (ts.greenFee !== undefined) {
              priceMap.set(slotKey, { green: ts.greenFee, cart: ts.cartFee, cartIncluded: ts.cartIncluded });
            }
          }
        }

        await processMatchedSlots(tag, profile, course, rawSlots, priceMap, lastKnownSlots, notificationService, results);
      }
    }

    const withSlots = results.filter((r) => r.matchedSlots.length > 0).length;
    logger.info(`${tag} Scan complete — ${withSlots}/${results.length} course(s) have slots in window`);
  };

  // ── Timers ──────────────────────────────────────────────────────────────────

  let publicTimer: ReturnType<typeof setTimeout> | null = null;
  let advantageTimer: ReturnType<typeof setTimeout> | null = null;
  let teeitupTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePublic = () => {
    publicTimer = setTimeout(async () => {
      await runCheck("public");
      schedulePublic();
    }, randomDelay(PUBLIC_MIN_MS, PUBLIC_MAX_MS));
  };

  const scheduleAdvantage = () => {
    advantageTimer = setTimeout(async () => {
      await runCheck("advantage");
      scheduleAdvantage();
    }, randomDelay(ADVANTAGE_MIN_MS, ADVANTAGE_MAX_MS));
  };

  const scheduleTeeItUp = () => {
    teeitupTimer = setTimeout(async () => {
      await runTeeItUpScan();
      scheduleTeeItUp();
    }, randomDelay(TEEITUP_MIN_MS, TEEITUP_MAX_MS));
  };

  const start = async () => {
    await runCheck("public");
    await runCheck("advantage");
    await runTeeItUpScan();

    schedulePublic();
    scheduleAdvantage();
    scheduleTeeItUp();

    const teeitupInterval = `${Math.round(TEEITUP_MIN_MS / 1000)}–${Math.round(TEEITUP_MAX_MS / 1000)}s`;
    logger.info(
      `Monitoring started: ForeUp public every 5–10 min, advantage every 15–90 min (4 courses), ` +
      `TeeItUp batched every ${teeitupInterval} (4 requests/cycle), ` +
      `${lookaheadDays}-day lookahead, ${getApiCallDelayMs()}ms between calls`
    );
  };

  const stop = () => {
    if (publicTimer)   { clearTimeout(publicTimer);   publicTimer   = null; }
    if (advantageTimer){ clearTimeout(advantageTimer); advantageTimer= null; }
    if (teeitupTimer)  { clearTimeout(teeitupTimer);   teeitupTimer  = null; }
  };

  return {
    start, stop,
    get lastRunAt()      { return state.lastRunAt; },
    get lastResult()     { return state.lastResult; },
    get primeSlots()     { return state.primeSlots; },
    get notifiedSlots()  { return [...lastKnownSlots.values()].flatMap((s) => [...s]); },
    lookaheadDays,
  };
};

export { parseJsonSlots };
