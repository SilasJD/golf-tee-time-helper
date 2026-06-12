import fetch, { type Response } from "node-fetch";
import {
  getCourseSourceById,
  type CourseSource,
} from "./courseSources.js";
import { getProfiles, type ProfileConfig } from "./profileStore.js";
import { NotificationService } from "./notificationService.js";
import { logger } from "../utils/logger.js";

export interface MonitorResult {
  profileId: string;
  profileName: string;
  enabled: boolean;
  skipped: boolean;
  courseId: string;
  courseName: string;
  rawSlots: string[];
  matchedSlots: string[];
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
    // Slots may be prefixed with "YYYY-MM-DD " — strip it before time comparison
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

// ── ForeUp API fetching ───────────────────────────────────────────────────────

const parseJsonSlots = async (response: Response): Promise<string[]> => {
  try {
    const payload = (await response.json()) as unknown;
    if (Array.isArray(payload)) {
      if (payload.every((item) => typeof item === "string")) return payload.map(String);

      const times = payload
        .filter((item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
        )
        .map((item) => {
          if (typeof item.time === "string") return item.time;
          if (typeof item.start_front === "number") {
            const v = String(item.start_front).padStart(12, "0");
            return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}`;
          }
          return "";
        })
        .filter(Boolean);
      if (times.length > 0) return times;
    }
    if (
      typeof payload === "object" &&
      payload !== null &&
      Array.isArray((payload as { slots?: unknown }).slots)
    ) {
      return ((payload as { slots: unknown[] }).slots).map(String);
    }
  } catch { /* ignore */ }
  return [];
};

const parseHtmlSlots = async (response: Response): Promise<string[]> => {
  const text = await response.text();
  return [...text.matchAll(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi)].map((m) => m[1]);
};

const fetchCourseSlots = async (
  course: CourseSource,
  dateStr: string,
  players: number,
  authHeaders: Record<string, string>,
  bookingClass: string
): Promise<string[]> => {
  try {
    const url = course.queryUrl
      .replace("{date}", dateStr)
      .replace("{players}", String(players))
      .replace("booking_class=0", `booking_class=${bookingClass}`);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        ...authHeaders,
      },
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

// ── Monitor ───────────────────────────────────────────────────────────────────

type ScanMode = "public" | "advantage";

// Public API shows 9 days ahead without auth
const PUBLIC_WINDOW_DAYS = 9;

// Random polling intervals
const PUBLIC_MIN_MS  =  5 * 60 * 1000;
const PUBLIC_MAX_MS  = 10 * 60 * 1000;
const ADVANTAGE_MIN_MS = 15 * 60 * 1000;
const ADVANTAGE_MAX_MS = 90 * 60 * 1000;

const randomDelay = (minMs: number, maxMs: number) =>
  Math.floor(Math.random() * (maxMs - minMs)) + minMs;

const getApiCallDelayMs = () => {
  const parsed = Number(process.env.API_CALL_DELAY_MS ?? 1000);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const initMonitor = (notificationService: NotificationService): TeeTimeMonitor => {
  const lookaheadDays = getLookaheadDays();
  const lastKnownSlots = new Map<string, Set<string>>();

  const state = {
    lastRunAt: null as Date | null,
    lastResult: [] as MonitorResult[],
    primeSlots: [] as MonitorResult[],
  };

  const runCheck = async (mode: ScanMode) => {
    const results: MonitorResult[] = [];
    const slotCache = new Map<string, string[]>();

    const authHeaders  = mode === "advantage" ? getAuthHeaders() : {};
    const bookingClass = mode === "advantage" ? getBookingClass() : "0";
    // Public API only returns slots within its 9-day window anyway
    const effectiveDays = mode === "public" ? PUBLIC_WINDOW_DAYS : getLookaheadDays();
    const apiDelay = getApiCallDelayMs();
    const tag = `[${mode}]`;

    // Compute the union of courseIds across all enabled profiles — only these are queried
    const profiles = getProfiles();
    const activeCourseIds = new Set(
      profiles.filter((p) => p.enabled).flatMap((p) => p.courseIds)
    );
    const activeCourseNames = [...activeCourseIds]
      .map((id) => getCourseSourceById(id)?.name ?? id)
      .join(", ");
    logger.info(`${tag} Scan started — querying ${activeCourseIds.size} course(s): ${activeCourseNames}`);

    for (const profile of profiles) {
      const profileName = profile.discordUsername;

      if (!profile.enabled) {
        for (const courseId of profile.courseIds) {
          const course = getCourseSourceById(courseId);
          results.push({
            profileId: profile.discordUserId, profileName,
            enabled: false, skipped: false,
            courseId, courseName: course?.name ?? "Unknown course",
            rawSlots: [], matchedSlots: [],
          });
        }
        continue;
      }

      const allowedDates = getLookaheadDates(profile, effectiveDays);
      if (allowedDates.length === 0) {
        logger.info(`${tag} No upcoming allowed dates for ${profileName} in ${effectiveDays}-day window`);
        for (const courseId of profile.courseIds) {
          const course = getCourseSourceById(courseId);
          results.push({
            profileId: profile.discordUserId, profileName,
            enabled: true, skipped: true,
            courseId, courseName: course?.name ?? "Unknown course",
            rawSlots: [], matchedSlots: [],
          });
        }
        continue;
      }

      for (const courseId of profile.courseIds) {
        const course = getCourseSourceById(courseId);
        if (!course) {
          logger.error(`${tag} Course not found for profile ${profileName}: ${courseId}`);
          results.push({
            profileId: profile.discordUserId, profileName,
            enabled: true, skipped: false,
            courseId, courseName: "Unknown course",
            rawSlots: [], matchedSlots: [],
          });
          continue;
        }

        const players = profile.players ?? 4;
        logger.info(`${tag} Fetching ${course.name} — ${allowedDates.length} date(s): ${allowedDates.join(", ")}`);
        const rawSlots: string[] = [];
        for (const dateStr of allowedDates) {
          const cacheKey = `${mode}:${course.id}:${dateStr}:${players}`;
          if (!slotCache.has(cacheKey)) {
            if (apiDelay > 0) await sleep(apiDelay);
            slotCache.set(cacheKey, await fetchCourseSlots(course, dateStr, players, authHeaders, bookingClass));
          }
          const [mm, dd, yyyy] = dateStr.split("-");
          const isoDate = `${yyyy}-${mm}-${dd}`;
          rawSlots.push(...slotCache.get(cacheKey)!.map((t) => {
            // ForeUp sometimes returns times already prefixed with a date ("2026-06-13 07:00").
            // Strip any existing date prefix and re-attach our isoDate for consistent formatting.
            const timePart = t.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
            return `${isoDate} ${timePart}`;
          }));
        }

        const bookedDates = new Set(profile.bookedDates ?? []);
        const matchedSlots = filterSlotsByTimeRange(rawSlots, profile.timeRange)
          .filter((s) => !bookedDates.has(s.slice(0, 10)));
        const trackKey = `${profile.discordUserId}:${course.id}`;
        const prevSlots = lastKnownSlots.get(trackKey) ?? new Set<string>();
        const newSlots = matchedSlots.filter((s) => !prevSlots.has(s));
        lastKnownSlots.set(trackKey, new Set(matchedSlots));

        if (matchedSlots.length > 0) {
          logger.info(`${tag} ${course.name}: ${matchedSlots.length} slot(s) in window — ${formatSlotsForLog(matchedSlots)}`);
        } else {
          logger.info(`${tag} ${course.name}: no slots in time window`);
        }
        if (newSlots.length > 0) {
          logger.info(`${tag} ${course.name}: ${newSlots.length} new slot(s) → notifying ${profileName}`);
        }

        results.push({
          profileId: profile.discordUserId, profileName,
          enabled: true, skipped: false,
          courseId: course.id, courseName: course.name,
          rawSlots, matchedSlots,
        });

        if (newSlots.length > 0) {
          await notificationService.notifyPrimeSlots(profile, course, newSlots);
        }
      }
    }

    state.lastRunAt = new Date();
    state.lastResult = results;
    state.primeSlots = results.filter((r) => r.matchedSlots.length > 0);
    const withSlots = state.primeSlots.length;
    const total = results.filter((r) => r.enabled && !r.skipped).length;
    logger.info(`${tag} Scan complete — ${withSlots}/${total} course(s) have slots in window`);
  };

  let publicTimer: ReturnType<typeof setTimeout> | null = null;
  let advantageTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePublic = () => {
    const delay = randomDelay(PUBLIC_MIN_MS, PUBLIC_MAX_MS);
    publicTimer = setTimeout(async () => {
      await runCheck("public");
      schedulePublic();
    }, delay);
  };

  const scheduleAdvantage = () => {
    const delay = randomDelay(ADVANTAGE_MIN_MS, ADVANTAGE_MAX_MS);
    advantageTimer = setTimeout(async () => {
      await runCheck("advantage");
      scheduleAdvantage();
    }, delay);
  };

  const start = async () => {
    await runCheck("public");
    await runCheck("advantage");

    schedulePublic();
    scheduleAdvantage();

    logger.info(
      `Monitoring started: public every 5–10 min (anonymous), advantage every 15–90 min (auth), ` +
      `${lookaheadDays}-day lookahead, ${getApiCallDelayMs()}ms between calls`
    );
  };

  const stop = () => {
    if (publicTimer) { clearTimeout(publicTimer); publicTimer = null; }
    if (advantageTimer) { clearTimeout(advantageTimer); advantageTimer = null; }
  };

  return {
    start, stop,
    get lastRunAt() { return state.lastRunAt; },
    get lastResult() { return state.lastResult; },
    get primeSlots() { return state.primeSlots; },
    get notifiedSlots() { return [...lastKnownSlots.values()].flatMap((s) => [...s]); },
    lookaheadDays,
  };
};

export { parseJsonSlots };
