import {
  Client,
  IntentsBitField,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  REST,
  Routes,
  type Interaction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import fetch from "node-fetch";
import {
  addOrUpdateProfile,
  addBookedDates,
  removeBookedDates,
  getCourseSources,
  getProfileByDiscordId,
  type ProfileConfig,
} from "./profileStore.js";
import { getCourseSourceById } from "./courseSources.js";
import { fetchCourseWeather, getHourWeather } from "./weatherService.js";
import { checkCourseOnDemand } from "./teeTimeMonitor.js";

// ── Course display maps ───────────────────────────────────────────────────────

const COURSE_CODE_DISPLAY: Record<string, string> = {
  "diamond-ridge-woodlands": "B1",
  "fox-hollow-golf-course": "B2",
  "greystone-golf-course": "B3",
  "rocky-point-golf-course": "B4",
  "fairway-hills-golf-club": "H1",
  "pb-dye-golf-club": "F1",
  "bulle-rock-golf-course": "A1",
  "chesapeake-hills-golf-course": "C1",
  "penn-national-founders": "P1",
  "penn-national-iron-forge": "P2",
  "raspberry-falls": "V1",
  "east-potomac-golf-links": "DC1",
  "langston-golf-course": "DC2",
  "rock-creek-golf-course": "DC3",
  "laurel-hill-golf-club": "FC1",
  "twin-lakes-oaks": "FC2",
  "twin-lakes-lakes": "FC3",
  "jefferson-district-golf": "FC4",
  "greendale-golf-course": "FC5",
  "burke-lake-golf-center": "FC6",
  "oakmont-golf-center": "FC7",
  "pinecrest-golf-course-va": "FC8",
  "algonkian-golf-course": "NP1",
  "brambleton-golf-course": "NP2",
  "pohick-bay-golf-course": "NP3",
  "westminster-national-golf": "CA1",
};

const COURSE_ALIASES: Record<string, string> = {
  b1: "diamond-ridge-woodlands", dr: "diamond-ridge-woodlands",
  "diamond ridge": "diamond-ridge-woodlands", diamond: "diamond-ridge-woodlands",
  b2: "fox-hollow-golf-course", fh: "fox-hollow-golf-course",
  "fox hollow": "fox-hollow-golf-course", fox: "fox-hollow-golf-course",
  b3: "greystone-golf-course", gs: "greystone-golf-course", greystone: "greystone-golf-course",
  b4: "rocky-point-golf-course", rp: "rocky-point-golf-course",
  "rocky point": "rocky-point-golf-course", rocky: "rocky-point-golf-course",
  h1: "fairway-hills-golf-club", "fairway hills": "fairway-hills-golf-club", fairway: "fairway-hills-golf-club",
  f1: "pb-dye-golf-club", "pb dye": "pb-dye-golf-club", pbd: "pb-dye-golf-club", dye: "pb-dye-golf-club",
  a1: "bulle-rock-golf-course", "bulle rock": "bulle-rock-golf-course", bulle: "bulle-rock-golf-course",
  c1: "chesapeake-hills-golf-course", "chesapeake hills": "chesapeake-hills-golf-course", chesapeake: "chesapeake-hills-golf-course",
  p1: "penn-national-founders", "penn founders": "penn-national-founders", founders: "penn-national-founders",
  p2: "penn-national-iron-forge", "penn iron": "penn-national-iron-forge",
  "iron forge": "penn-national-iron-forge", iron: "penn-national-iron-forge", penn: "penn-national-founders",
  v1: "raspberry-falls", "raspberry falls": "raspberry-falls", raspberry: "raspberry-falls",
  dc1: "east-potomac-golf-links", "east potomac": "east-potomac-golf-links",
  "hains point": "east-potomac-golf-links", eastpotomac: "east-potomac-golf-links",
  dc2: "langston-golf-course", langston: "langston-golf-course",
  dc3: "rock-creek-golf-course", "rock creek": "rock-creek-golf-course", rockcreek: "rock-creek-golf-course",
  fc1: "laurel-hill-golf-club", "laurel hill": "laurel-hill-golf-club", lh: "laurel-hill-golf-club", laurel: "laurel-hill-golf-club",
  fc2: "twin-lakes-oaks", "twin lakes oaks": "twin-lakes-oaks", oaks: "twin-lakes-oaks",
  fc3: "twin-lakes-lakes", "twin lakes lakes": "twin-lakes-lakes", lakes: "twin-lakes-lakes",
  fc4: "jefferson-district-golf", jefferson: "jefferson-district-golf", "jefferson district": "jefferson-district-golf",
  fc5: "greendale-golf-course", greendale: "greendale-golf-course",
  fc6: "burke-lake-golf-center", "burke lake": "burke-lake-golf-center", burke: "burke-lake-golf-center",
  fc7: "oakmont-golf-center", oakmont: "oakmont-golf-center",
  fc8: "pinecrest-golf-course-va", pinecrest: "pinecrest-golf-course-va",
  np1: "algonkian-golf-course", algonkian: "algonkian-golf-course",
  np2: "brambleton-golf-course", brambleton: "brambleton-golf-course",
  np3: "pohick-bay-golf-course", "pohick bay": "pohick-bay-golf-course", pohick: "pohick-bay-golf-course",
  ca1: "westminster-national-golf", westminster: "westminster-national-golf",
  "westminster national": "westminster-national-golf",
};

const ALL_COURSE_IDS = [
  "diamond-ridge-woodlands", "fox-hollow-golf-course", "greystone-golf-course",
  "rocky-point-golf-course", "fairway-hills-golf-club", "pb-dye-golf-club",
  "bulle-rock-golf-course", "chesapeake-hills-golf-course", "penn-national-founders",
  "penn-national-iron-forge", "raspberry-falls", "east-potomac-golf-links",
  "langston-golf-course", "rock-creek-golf-course", "laurel-hill-golf-club",
  "twin-lakes-oaks", "twin-lakes-lakes", "jefferson-district-golf",
  "greendale-golf-course", "burke-lake-golf-center", "oakmont-golf-center",
  "pinecrest-golf-course-va", "algonkian-golf-course", "brambleton-golf-course",
  "pohick-bay-golf-course", "westminster-national-golf",
];

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKENDS = ["Saturday", "Sunday"];
const DEFAULT_TIME_RANGE: [string, string] = ["06:00", "10:00"];
const DEFAULT_PLAYERS = 4;

const DAY_MAP: Record<string, string> = {
  mon: "Monday", monday: "Monday", tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", wednesday: "Wednesday", thu: "Thursday", thur: "Thursday",
  thurs: "Thursday", thursday: "Thursday", fri: "Friday", friday: "Friday",
  sat: "Saturday", saturday: "Saturday", sun: "Sunday", sunday: "Sunday",
};

// ── Parsing helpers ───────────────────────────────────────────────────────────

export const parsePlayersInput = (input: string): number | null => {
  const n = parseInt(input.trim(), 10);
  return n >= 1 && n <= 4 ? n : null;
};

export const parseDaysInput = (input: string): string[] | null => {
  const lower = input.trim().toLowerCase();
  if (lower === "weekdays" || lower === "weekday") return WEEKDAYS;
  if (lower === "weekends" || lower === "weekend") return WEEKENDS;
  if (["all", "everyday", "every day", "all days"].includes(lower)) return ALL_DAYS;
  const tokens = lower.split(/[\s,]+/).filter(Boolean);
  const resolved = tokens.map((t) => DAY_MAP[t]).filter((d): d is string => Boolean(d));
  return resolved.length > 0 ? [...new Set(resolved)] : null;
};

export const parseTimeInput = (input: string): [string, string] | null => {
  const lower = input.trim().toLowerCase();
  if (lower === "early" || lower === "early morning") return ["06:00", "09:00"];
  if (lower === "morning") return ["09:00", "12:00"];
  if (lower === "afternoon") return ["12:00", "16:00"];
  if (["all day", "all", "anytime"].includes(lower)) return ["06:00", "20:00"];
  const rangeMatch = lower.match(/^(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)$/);
  if (rangeMatch) {
    const parseHHMM = (t: string): string | null => {
      const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
      if (!m) return null;
      let h = parseInt(m[1]);
      const min = m[2] ? parseInt(m[2]) : 0;
      if (m[3] === "pm" && h !== 12) h += 12;
      if (m[3] === "am" && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    };
    const start = parseHHMM(rangeMatch[1]);
    const end = parseHHMM(rangeMatch[2]);
    if (start && end) return [start, end];
  }
  return null;
};

export const parseCoursesInput = (input: string): string[] | null => {
  const lower = input.trim().toLowerCase();
  if (lower === "all") return ALL_COURSE_IDS;
  const tokens = lower.split(/[\s,]+/).filter(Boolean);
  const resolved = tokens.map((t) => COURSE_ALIASES[t]).filter((id): id is string => Boolean(id));
  const unique = [...new Set(resolved)];
  return unique.length > 0 ? unique : null;
};

export const parseMentions = (input: string): string[] =>
  [...input.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]);

export const parseBookedDate = (input: string): string | null => {
  const trimmed = input.trim();
  const now = new Date();
  const year = now.getFullYear();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const monthDay = trimmed.match(/^([a-z]+)\s+(\d{1,2})$/i);
  if (monthDay) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const mIdx = months.findIndex((m) => monthDay[1].toLowerCase().startsWith(m));
    if (mIdx >= 0) {
      const d = new Date(year, mIdx, parseInt(monthDay[2]));
      if (d < now) d.setFullYear(year + 1);
      return isoDate(d);
    }
  }
  const mmdd = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (mmdd) {
    const d = new Date(year, parseInt(mmdd[1]) - 1, parseInt(mmdd[2]));
    if (d < now) d.setFullYear(year + 1);
    return isoDate(d);
  }
  return null;
};

const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getWeekendDates = (iso: string): string[] => {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  if (day === 6) { const sun = new Date(d); sun.setDate(d.getDate() + 1); return [iso, isoDate(sun)]; }
  if (day === 0) { const sat = new Date(d); sat.setDate(d.getDate() - 1); return [isoDate(sat), iso]; }
  const sat = new Date(d); sat.setDate(d.getDate() + (6 - day));
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  return [isoDate(sat), isoDate(sun)];
};

// ── Course select menu options ────────────────────────────────────────────────

const MD_DC_OPTIONS = [
  { label: "[B1] Diamond Ridge",          value: "diamond-ridge-woodlands",    description: "Baltimore County" },
  { label: "[B2] Fox Hollow",             value: "fox-hollow-golf-course",     description: "Baltimore County" },
  { label: "[B3] Greystone",              value: "greystone-golf-course",      description: "Baltimore County" },
  { label: "[B4] Rocky Point",            value: "rocky-point-golf-course",    description: "Baltimore County" },
  { label: "[H1] Fairway Hills",          value: "fairway-hills-golf-club",    description: "Howard County" },
  { label: "[F1] P.B. Dye",              value: "pb-dye-golf-club",           description: "Frederick County" },
  { label: "[A1] Bulle Rock",             value: "bulle-rock-golf-course",     description: "Harford County" },
  { label: "[C1] Chesapeake Hills",       value: "chesapeake-hills-golf-course", description: "Calvert County" },
  { label: "[P1] Penn National Founders", value: "penn-national-founders",     description: "Franklin County, PA" },
  { label: "[P2] Penn National Iron Forge",value: "penn-national-iron-forge",  description: "Franklin County, PA" },
  { label: "[DC1] East Potomac",          value: "east-potomac-golf-links",    description: "DC Municipal" },
  { label: "[DC2] Langston",              value: "langston-golf-course",       description: "DC Municipal" },
  { label: "[DC3] Rock Creek",            value: "rock-creek-golf-course",     description: "DC Municipal" },
  { label: "[CA1] Westminster National",  value: "westminster-national-golf",  description: "Carroll County" },
];

const VA_OPTIONS = [
  { label: "[V1] Raspberry Falls",        value: "raspberry-falls",            description: "Loudoun County" },
  { label: "[FC1] Laurel Hill",           value: "laurel-hill-golf-club",      description: "Fairfax County" },
  { label: "[FC2] Twin Lakes — Oaks",     value: "twin-lakes-oaks",            description: "Fairfax County" },
  { label: "[FC3] Twin Lakes — Lakes",    value: "twin-lakes-lakes",           description: "Fairfax County" },
  { label: "[FC4] Jefferson District",    value: "jefferson-district-golf",    description: "Fairfax County" },
  { label: "[FC5] Greendale",             value: "greendale-golf-course",      description: "Fairfax County" },
  { label: "[FC6] Burke Lake",            value: "burke-lake-golf-center",     description: "Fairfax County" },
  { label: "[FC7] Oakmont",               value: "oakmont-golf-center",        description: "Fairfax County" },
  { label: "[FC8] Pinecrest",             value: "pinecrest-golf-course-va",   description: "Fairfax County" },
  { label: "[NP1] Algonkian",             value: "algonkian-golf-course",      description: "NOVA Parks" },
  { label: "[NP2] Brambleton",            value: "brambleton-golf-course",     description: "NOVA Parks" },
  { label: "[NP3] Pohick Bay",            value: "pohick-bay-golf-course",     description: "NOVA Parks" },
];

const ALL_MD_IDS = MD_DC_OPTIONS.map((o) => o.value);
const ALL_VA_IDS  = VA_OPTIONS.map((o) => o.value);

// ── Multi-step registration state ─────────────────────────────────────────────

interface PendingReg { mdCourses: string[]; vaCourses: string[] }
const pendingRegistrations = new Map<string, PendingReg>();

// ── Open Seat state ───────────────────────────────────────────────────────────

interface OpenSeatData {
  bookerId: string;
  bookerName: string;
  courseId: string;
  courseName: string;
  date: string;
  time: string;
  openSpots: number;
  channelId: string;
}

const openSeatPosts = new Map<string, OpenSeatData>();   // messageId → data
const pendingOpenSeats = new Map<string, OpenSeatData>(); // tempKey → data (pre-post)

// ── UI builders ───────────────────────────────────────────────────────────────

const buildStatusText = (p: ProfileConfig): string => {
  const courses = getCourseSources();
  const courseNames = p.courseIds.map((id) => courses.find((c) => c.id === id)?.name ?? id).join(", ");
  const rainLine = p.rainThreshold != null
    ? `🌧️ **Rain filter:** skip if >${p.rainThreshold}% rain chance`
    : `🌧️ **Rain filter:** off`;
  const today = new Date().toISOString().slice(0, 10);
  const upcomingBooked = (p.bookedDates ?? [])
    .filter((d) => d >= today).sort()
    .map((d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
    .join(", ");
  return [
    `${p.enabled ? "▶️" : "⏸️"} **Status: ${p.enabled ? "Active" : "Paused"}**\n`,
    `📅 **Days:** ${p.daysOfWeek.join(", ")}`,
    `⏰ **Time:** ${p.timeRange[0]} – ${p.timeRange[1]}`,
    `👥 **Players:** ${p.players}`,
    `⛳ **Courses:** ${courseNames}`,
    rainLine,
    upcomingBooked ? `📵 **Skipping alerts for:** ${upcomingBooked}` : `📵 **No upcoming skipped dates**`,
  ].join("\n");
};

const buildToggleRow = (enabled: boolean): ActionRowBuilder<ButtonBuilder> =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("toggle_monitoring")
      .setLabel(enabled ? "⏸️ Pause Monitoring" : "▶️ Resume Monitoring")
      .setStyle(enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

const buildCourseSelectMenus = (selectedMd: string[], selectedVa: string[]) => {
  const total = selectedMd.length + selectedVa.length;
  const content = total > 0
    ? `**Step 1 of 2 — Choose Courses** *(${total} selected)*\nAdjust your selection, then click **Next →**`
    : "**Step 1 of 2 — Choose Courses**\nSelect the courses you want to monitor, then click **Next →**";
  const components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("reg_md_courses")
        .setPlaceholder("Maryland & DC courses")
        .setMinValues(0)
        .setMaxValues(MD_DC_OPTIONS.length)
        .addOptions(MD_DC_OPTIONS.map((o) => ({ ...o, default: selectedMd.includes(o.value) })))
    ),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("reg_va_courses")
        .setPlaceholder("Virginia courses")
        .setMinValues(0)
        .setMaxValues(VA_OPTIONS.length)
        .addOptions(VA_OPTIONS.map((o) => ({ ...o, default: selectedVa.includes(o.value) })))
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("reg_all").setLabel("⭐ Select All Courses").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("reg_next").setLabel("Next: Preferences →").setStyle(ButtonStyle.Primary),
    ),
  ] as unknown as ActionRowBuilder<ButtonBuilder>[];
  return { content, components };
};

const buildPreferencesModal = (existing?: ProfileConfig): ModalBuilder =>
  new ModalBuilder()
    .setCustomId("register_modal")
    .setTitle("Tee Time Preferences — Step 2 of 2")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("days").setLabel("Days to monitor")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("weekends / weekdays / all / Mon Wed Sat")
          .setValue(existing?.daysOfWeek?.join(", ") ?? "Saturday, Sunday").setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("time").setLabel("Time window")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("7am-10am  ·  early  ·  morning  ·  all day")
          .setValue(existing ? `${existing.timeRange[0]}-${existing.timeRange[1]}` : "06:00-10:00").setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("players").setLabel("Players in your group")
          .setStyle(TextInputStyle.Short).setPlaceholder("1 / 2 / 3 / 4")
          .setValue(String(existing?.players ?? DEFAULT_PLAYERS)).setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rain").setLabel(`Rain threshold % — or "skip" to disable`)
          .setStyle(TextInputStyle.Short).setPlaceholder("40 / skip")
          .setValue(existing?.rainThreshold != null ? String(existing.rainThreshold) : "skip").setRequired(false)
      ),
    );

const buildBookingModal = (prefill?: { courseCode?: string; isoDate?: string }): ModalBuilder => {
  let prefillDate = "";
  if (prefill?.isoDate) {
    const d = new Date(`${prefill.isoDate}T12:00:00`);
    prefillDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return new ModalBuilder()
    .setCustomId("booked_modal")
    .setTitle("Record a Booking")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("date").setLabel("Date")
          .setStyle(TextInputStyle.Short).setPlaceholder("Jun 28  ·  06-28  ·  2026-06-28")
          .setValue(prefillDate).setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("course").setLabel("Course code")
          .setStyle(TextInputStyle.Short).setPlaceholder("B3  ·  DR  ·  DC1  ·  FC1")
          .setValue(prefill?.courseCode ?? "").setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("time").setLabel("Tee time")
          .setStyle(TextInputStyle.Short).setPlaceholder("7:40 AM").setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("partners").setLabel("Playing partners (@mention or leave blank)")
          .setStyle(TextInputStyle.Short).setPlaceholder("@john @mike — or leave blank").setRequired(false)
      ),
    );
};

// ── Open seat posting ─────────────────────────────────────────────────────────

const postOpenSeatAnnouncement = async (client: Client, data: OpenSeatData): Promise<void> => {
  try {
    const channel = await client.channels.fetch(data.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    const d = new Date(`${data.date}T12:00:00`);
    const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const filled = 4 - data.openSpots;
    const spotWord = data.openSpots === 1 ? "spot" : "spots";

    // Post with a placeholder customId, then edit with real message ID
    const msg = await channel.send({
      content:
        `🏌️ **Open Seat** — **${data.bookerName}** has a tee time at **${data.courseName}**\n` +
        `📅 ${dateLabel} · ${data.time}\n` +
        `👥 ${filled} of 4 confirmed — **${data.openSpots} ${spotWord} open**`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`_`).setLabel("🏌️ Claim a Spot").setStyle(ButtonStyle.Primary)
        ),
      ],
    });

    await msg.edit({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`claim_spot|${msg.id}`).setLabel("🏌️ Claim a Spot").setStyle(ButtonStyle.Primary)
        ),
      ],
    });
    openSeatPosts.set(msg.id, data);
  } catch (err) {
    console.error("[discord] Failed to post open seat announcement", err);
  }
};

// ── Booking announcement ──────────────────────────────────────────────────────

const sendBookingAnnouncement = async (
  bookerId: string,
  bookerName: string,
  partnerMentions: string[],
  course: NonNullable<ReturnType<typeof getCourseSourceById>>,
  date: string,
  time: string
): Promise<void> => {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return;
  const d = new Date(`${date}T12:00:00`);
  const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const mapsUrl = course.lat != null && course.lon != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.name)}`;
  let weatherLine = "";
  if (course.lat != null && course.lon != null) {
    try {
      const forecasts = await fetchCourseWeather(course.id, course.lat, course.lon);
      const w = getHourWeather(forecasts, date, time);
      if (w) weatherLine = `\n🌤️ ${w.condition} ${w.tempF}°F · ${w.precipPct}% rain`;
    } catch { /* weather is optional */ }
  }
  const partnerLine = partnerMentions.length > 0 ? `\n${partnerMentions.join(" ")} — see you on the course! ⛳` : "";
  const msg = [
    `🏌️ <@${bookerId}> **booked a tee time!**`,
    `⛳ **${course.name}**`,
    `📅 ${dateLabel} · ${time}${weatherLine}`,
    `📍 [Directions](${mapsUrl})${partnerLine}`,
  ].join("\n");
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg, username: "Golf Bot" }),
    });
  } catch (err) {
    console.error("[discord] Booking announcement failed", err);
  }
};

// ── Slash command definitions ─────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { name: "register",    description: "Set up your tee time alerts" },
  { name: "preferences", description: "Update your alert preferences" },
  {
    name: "check",
    description: "Check available tee times at a course right now",
    options: [
      { name: "course", description: "Course code (e.g. B3, DR, DC1)", type: 3, required: true },
      { name: "date",   description: "Date to check (e.g. Jun 28) — defaults to this weekend", type: 3, required: false },
    ],
  },
  { name: "status",   description: "View your current alert profile" },
  { name: "booked",   description: "Record a booking and notify your group" },
  { name: "enable",   description: "Resume tee time alerts" },
  { name: "disable",  description: "Pause tee time alerts" },
  { name: "help",    description: "Show all commands and how to get started" },
  { name: "courses", description: "List all supported courses and their codes" },
];

const WELCOME_TEXT = [
  "👋 **Welcome to the Golf Tee Time Helper!**\n",
  "I monitor public golf courses around DC/MD/VA and alert you the moment a slot opens that matches your group.\n",
  "**Get started in two steps:**",
  "1️⃣  Use `/register` to tell me your days, times, courses, and group size",
  "2️⃣  Watch **#tee-time-alerts** — I'll tag you whenever a matching slot opens\n",
  "**All commands:**",
  "`/register` — set up your alerts *(start here)*",
  "`/preferences` — update your settings anytime",
  "`/check B3` — scan any course on demand right now",
  "`/status` — view your profile with a pause/resume button",
  "`/booked` — record a booking, notify your group, and post an open seat if you need a 4th",
  "`/enable` / `/disable` — pause or resume alerts",
  "`/courses` — see all supported courses and their codes",
  "`/help` — show this guide\n",
  "**Channels:**",
  "📢 **#tee-time-alerts** — bot posts here when slots open (you'll be tagged)",
  "🏌️ **#open-seats** — post an open spot in your round and let others claim it",
].join("\n");

// ── Slash command handler ─────────────────────────────────────────────────────

const handleSlashCommand = async (interaction: ChatInputCommandInteraction): Promise<void> => {
  const userId = interaction.user.id;
  const { commandName } = interaction;

  if (commandName === "register" || commandName === "preferences") {
    const existing = getProfileByDiscordId(userId);
    const existingIds = existing?.courseIds ?? [];
    pendingRegistrations.set(userId, {
      mdCourses: existingIds.filter((id) => ALL_MD_IDS.includes(id)),
      vaCourses: existingIds.filter((id) => ALL_VA_IDS.includes(id)),
    });
    const pending = pendingRegistrations.get(userId)!;
    const step1 = buildCourseSelectMenus(pending.mdCourses, pending.vaCourses);
    if (existing) {
      step1.content = `**Step 1 of 2 — Choose Courses**\n*Current: ${existingIds.map((id) => COURSE_CODE_DISPLAY[id] ?? id).join(", ")}*\n\nUpdate below, then click **Next →**`;
    }
    await interaction.reply({ ...step1, ephemeral: true });
    return;
  }

  if (commandName === "booked") {
    await interaction.showModal(buildBookingModal());
    return;
  }

  if (commandName === "status") {
    const profile = getProfileByDiscordId(userId);
    if (!profile) {
      await interaction.reply({ content: "No profile found. Use `/register` to get started.", ephemeral: true });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const futureBooked = (profile.bookedDates ?? []).filter((d) => d >= today);
    const rows: ActionRowBuilder<ButtonBuilder>[] = [buildToggleRow(profile.enabled)];
    if (futureBooked.length > 0) {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("clear_skipped_dates")
            .setLabel("🗑️ Clear Skipped Dates")
            .setStyle(ButtonStyle.Danger)
        )
      );
    }
    await interaction.reply({ content: buildStatusText(profile), components: rows, ephemeral: true });
    return;
  }

  if (commandName === "enable" || commandName === "disable") {
    const profile = getProfileByDiscordId(userId);
    if (!profile) {
      await interaction.reply({ content: "No profile found. Use `/register` to get started.", ephemeral: true });
      return;
    }
    profile.enabled = commandName === "enable";
    addOrUpdateProfile(profile);
    await interaction.reply({ content: profile.enabled ? "▶️ Alerts resumed!" : "⏸️ Alerts paused.", ephemeral: true });
    return;
  }

  if (commandName === "help") {
    await interaction.reply({ content: WELCOME_TEXT, ephemeral: true });
    return;
  }

  if (commandName === "courses") {
    await interaction.reply({
      content: [
        "⛳ **Supported Courses** — use these codes in `/register` or `/check`\n",
        "**Baltimore County**",
        "`B1` Diamond Ridge  `B2` Fox Hollow  `B3` Greystone  `B4` Rocky Point",
        "**Howard County**",
        "`H1` Fairway Hills",
        "**Frederick County**",
        "`F1` P.B. Dye",
        "**Harford County**",
        "`A1` Bulle Rock",
        "**Calvert County**",
        "`C1` Chesapeake Hills",
        "**Franklin County, PA**",
        "`P1` Penn National (Founders)  `P2` Penn National (Iron Forge)",
        "**Loudoun County, VA**",
        "`V1` Raspberry Falls",
        "**DC Municipal**",
        "`DC1` East Potomac  `DC2` Langston  `DC3` Rock Creek",
        "**Fairfax County, VA**",
        "`FC1` Laurel Hill  `FC2` Twin Lakes Oaks  `FC3` Twin Lakes Lakes",
        "`FC4` Jefferson District  `FC5` Greendale  `FC6` Burke Lake",
        "`FC7` Oakmont  `FC8` Pinecrest",
        "**NOVA Parks, VA**",
        "`NP1` Algonkian  `NP2` Brambleton  `NP3` Pohick Bay",
        "**Carroll County, MD**",
        "`CA1` Westminster National\n",
        "Type `all` in `/register` to watch every course, or list specific codes: `B3 FC1 DC1`",
      ].join("\n"),
      ephemeral: true,
    });
    return;
  }

  if (commandName === "check") {
    const alias = interaction.options.getString("course", true).toLowerCase();
    const dateInput = interaction.options.getString("date");
    const courseId = COURSE_ALIASES[alias];
    if (!courseId) {
      await interaction.reply({ content: `Unknown course code \`${alias}\`. Try \`B3\`, \`DR\`, \`DC1\`, etc.`, ephemeral: true });
      return;
    }
    const course = getCourseSourceById(courseId);
    if (!course) { await interaction.reply({ content: "Course not found.", ephemeral: true }); return; }

    const profile = getProfileByDiscordId(userId);
    const players = profile?.players ?? DEFAULT_PLAYERS;
    const timeRange = profile?.timeRange ?? DEFAULT_TIME_RANGE;

    let isoDates: string[];
    if (dateInput) {
      const parsed = parseBookedDate(dateInput);
      if (!parsed) {
        await interaction.reply({ content: `Couldn't parse that date. Try \`Jun 28\` or \`2026-06-28\`.`, ephemeral: true });
        return;
      }
      isoDates = [parsed];
    } else {
      isoDates = getWeekendDates(isoDate(new Date()));
    }

    await interaction.deferReply({ ephemeral: true });

    const [result, forecasts] = await Promise.all([
      checkCourseOnDemand(course, isoDates, players, timeRange),
      course.lat != null && course.lon != null
        ? fetchCourseWeather(course.id, course.lat, course.lon)
        : Promise.resolve(new Map()),
    ]);
    const { slots, priceMap } = result;

    if (slots.length === 0) {
      await interaction.editReply(`No slots in your window (${timeRange[0]}–${timeRange[1]}) at **${course.name}** for those dates.`);
      return;
    }

    const byDate = new Map<string, string[]>();
    for (const s of slots) byDate.set(s.slice(0, 10), [...(byDate.get(s.slice(0, 10)) ?? []), s.slice(11)]);

    const lines = [...byDate.entries()].map(([d, times]) => {
      const label = new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const w = getHourWeather(forecasts, d, times[0]);
      const weatherStr = w ? ` · ${w.condition} ${w.tempF}°F · ${w.precipPct}% rain` : "";
      const timeLines = times.map((t) => {
        const p = priceMap.get(`${d} ${t}`);
        const priceStr = p?.green != null
          ? p.cart != null ? ` ($${Math.round(p.green)} + $${Math.round(p.cart)} cart)`
            : p.cartIncluded ? ` ($${Math.round(p.green)} w/cart)` : ` ($${Math.round(p.green)} walking)`
          : "";
        return `${t}${priceStr}`;
      }).join(", ");
      return `**${label}**${weatherStr}: ${timeLines}`;
    }).join("\n");

    const bookButtons = [...byDate.keys()].slice(0, 5).map((d) => {
      const label = new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return new ButtonBuilder()
        .setCustomId(`book|${courseId}|${d}`)
        .setLabel(`Mark ${label} Booked`)
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);
    });

    await interaction.editReply({
      content: `⛳ **${course.name}** — ${slots.length} slot(s) in your window:\n${lines}`,
      components: bookButtons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...bookButtons)] : [],
    });
  }
};

// ── Select menu handler ───────────────────────────────────────────────────────

const handleSelectMenu = async (interaction: StringSelectMenuInteraction): Promise<void> => {
  const userId = interaction.user.id;
  const { customId, values } = interaction;

  if (customId === "reg_md_courses" || customId === "reg_va_courses") {
    const pending = pendingRegistrations.get(userId) ?? { mdCourses: [], vaCourses: [] };
    if (customId === "reg_md_courses") pending.mdCourses = values;
    else pending.vaCourses = values;
    pendingRegistrations.set(userId, pending);
    const step1 = buildCourseSelectMenus(pending.mdCourses, pending.vaCourses);
    await interaction.update(step1);
  }
};

// ── Modal submit handler ──────────────────────────────────────────────────────

const handleModalSubmit = async (interaction: ModalSubmitInteraction, client: Client): Promise<void> => {
  const userId = interaction.user.id;

  if (interaction.customId === "register_modal") {
    const pending = pendingRegistrations.get(userId);
    const courseIds = [...(pending?.mdCourses ?? []), ...(pending?.vaCourses ?? [])];

    if (courseIds.length === 0) {
      await interaction.reply({ content: "❌ No courses selected — please run `/register` again and pick at least one course.", ephemeral: true });
      return;
    }

    const daysRaw    = interaction.fields.getTextInputValue("days");
    const timeRaw    = interaction.fields.getTextInputValue("time");
    const playersRaw = interaction.fields.getTextInputValue("players");
    const rainRaw    = interaction.fields.getTextInputValue("rain").trim().toLowerCase();

    const days    = parseDaysInput(daysRaw);
    const time    = parseTimeInput(timeRaw);
    const players = parsePlayersInput(playersRaw);

    const errors: string[] = [];
    if (!days)    errors.push(`• Couldn't parse days: \`${daysRaw}\``);
    if (!time)    errors.push(`• Couldn't parse time window: \`${timeRaw}\``);
    if (!players) errors.push(`• Players must be 1–4`);

    if (errors.length > 0) {
      await interaction.reply({ content: `❌ **Fix these and try again:**\n${errors.join("\n")}`, ephemeral: true });
      return;
    }

    let rainThreshold: number | undefined;
    if (rainRaw && !["skip", "none", "off", ""].includes(rainRaw)) {
      const n = parseInt(rainRaw, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) rainThreshold = n;
    }

    const existing = getProfileByDiscordId(userId);
    const profile: ProfileConfig = {
      discordUserId: userId,
      discordUsername: interaction.user.username,
      enabled: true,
      daysOfWeek: days!,
      timeRange: time!,
      players: players!,
      courseIds,
      rainThreshold,
      golfPartners: existing?.golfPartners ?? [],
      bookedDates: existing?.bookedDates ?? [],
    };
    addOrUpdateProfile(profile);
    pendingRegistrations.delete(userId);

    const courses = getCourseSources();
    const courseNames = profile.courseIds.map((id) => courses.find((c) => c.id === id)?.name ?? id).join(", ");
    const rainLine = profile.rainThreshold != null
      ? `🌧️ **Rain filter:** skip if >${profile.rainThreshold}% rain chance`
      : `🌧️ **Rain filter:** off`;

    await interaction.reply({
      content: [
        existing ? "✅ **Preferences updated!**\n" : "✅ **You're all set!**\n",
        `📅 **Days:** ${profile.daysOfWeek.join(", ")}`,
        `⏰ **Time:** ${profile.timeRange[0]} – ${profile.timeRange[1]}`,
        `👥 **Players:** ${profile.players}`,
        `⛳ **Courses:** ${courseNames}`,
        rainLine,
        "\nI'll tag you in **#tee-time-alerts** when matching slots open up.",
      ].join("\n"),
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === "booked_modal") {
    const dateRaw     = interaction.fields.getTextInputValue("date");
    const courseRaw   = interaction.fields.getTextInputValue("course").trim().toLowerCase();
    const timeRaw     = interaction.fields.getTextInputValue("time").trim();
    const partnersRaw = interaction.fields.getTextInputValue("partners").trim();

    const date = parseBookedDate(dateRaw);
    if (!date) {
      await interaction.reply({ content: `❌ Couldn't parse date \`${dateRaw}\`. Try \`Jun 28\` or \`2026-06-28\`.`, ephemeral: true });
      return;
    }

    const courseId = COURSE_ALIASES[courseRaw];
    if (!courseId) {
      await interaction.reply({ content: `❌ Unknown course code \`${courseRaw}\`. Try \`B3\`, \`DR\`, \`DC1\`, etc.`, ephemeral: true });
      return;
    }

    const course = getCourseSourceById(courseId);
    addBookedDates(userId, getWeekendDates(date));

    const partnerIds = parseMentions(partnersRaw);
    const profile = getProfileByDiscordId(userId);
    if (profile) { profile.golfPartners = partnerIds; addOrUpdateProfile(profile); }

    await interaction.deferReply({ ephemeral: true });

    if (course) {
      const partnerMentions = partnerIds.length > 0
        ? partnerIds.map((id) => `<@${id}>`)
        : partnersRaw ? [partnersRaw] : [];
      await sendBookingAnnouncement(userId, interaction.user.username, partnerMentions, course, date, timeRaw);
    }

    const d = new Date(`${date}T12:00:00`);
    const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const openSpots = 4 - (1 + partnerIds.length);
    const openSeatChannelId = process.env.OPEN_SEAT_CHANNEL_ID;

    if (openSpots > 0 && openSeatChannelId && course) {
      const key = `${userId}_${Date.now()}`;
      pendingOpenSeats.set(key, {
        bookerId: userId, bookerName: interaction.user.username,
        courseId, courseName: course.name, date, time: timeRaw,
        openSpots, channelId: openSeatChannelId,
      });
      const spotWord = openSpots === 1 ? "spot" : "spots";
      await interaction.editReply({
        content: `✅ Booking recorded! Alerts paused for the weekend of **${dateLabel}**.\n\nYou've got ${1 + partnerIds.length} players — want to open the remaining **${openSpots} ${spotWord}** to the server?`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`post_open_seat|${key}`).setLabel(`📣 Post Open ${openSpots === 1 ? "Spot" : "Spots"}`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`skip_open_seat|${key}`).setLabel("No thanks").setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    } else {
      await interaction.editReply(`✅ Booking recorded! Alerts paused for the weekend of **${dateLabel}**.`);
    }
  }
};

// ── Button handler ────────────────────────────────────────────────────────────

const handleButton = async (interaction: ButtonInteraction, client: Client): Promise<void> => {
  const userId = interaction.user.id;
  const { customId } = interaction;

  if (customId === "reg_all") {
    pendingRegistrations.set(userId, { mdCourses: ALL_MD_IDS, vaCourses: ALL_VA_IDS });
    const step1 = buildCourseSelectMenus(ALL_MD_IDS, ALL_VA_IDS);
    step1.content = `**Step 1 of 2 — Choose Courses** *(${ALL_MD_IDS.length + ALL_VA_IDS.length} selected — all courses)*\nClick **Next →** to continue`;
    await interaction.update(step1);
    return;
  }

  if (customId === "reg_next") {
    const pending = pendingRegistrations.get(userId);
    const courseIds = [...(pending?.mdCourses ?? []), ...(pending?.vaCourses ?? [])];
    if (courseIds.length === 0) {
      const step1 = buildCourseSelectMenus([], []);
      step1.content = "❌ **Please select at least one course** before continuing.\n\n**Step 1 of 2 — Choose Courses**\nSelect the courses you want to monitor, then click **Next →**";
      await interaction.update(step1);
      return;
    }
    const existing = getProfileByDiscordId(userId);
    await interaction.showModal(buildPreferencesModal(existing ?? undefined));
    return;
  }

  if (customId === "clear_skipped_dates") {
    const profile = getProfileByDiscordId(userId);
    if (!profile) { await interaction.reply({ content: "Profile not found.", ephemeral: true }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const toRemove = (profile.bookedDates ?? []).filter((d) => d >= today);
    removeBookedDates(userId, toRemove);
    profile.bookedDates = (profile.bookedDates ?? []).filter((d) => d < today);
    await interaction.update({ content: buildStatusText(profile), components: [buildToggleRow(profile.enabled)] });
    return;
  }

  if (customId === "toggle_monitoring") {
    const profile = getProfileByDiscordId(userId);
    if (!profile) { await interaction.reply({ content: "Profile not found.", ephemeral: true }); return; }
    profile.enabled = !profile.enabled;
    addOrUpdateProfile(profile);
    await interaction.update({ content: buildStatusText(profile), components: [buildToggleRow(profile.enabled)] });
    return;
  }

  if (customId.startsWith("book|")) {
    const [, courseId, isoDateStr] = customId.split("|");
    await interaction.showModal(buildBookingModal({ courseCode: COURSE_CODE_DISPLAY[courseId] ?? "", isoDate: isoDateStr }));
    return;
  }

  if (customId.startsWith("post_open_seat|")) {
    const key = customId.slice("post_open_seat|".length);
    const data = pendingOpenSeats.get(key);
    pendingOpenSeats.delete(key);
    if (!data) { await interaction.reply({ content: "This offer has expired.", ephemeral: true }); return; }
    await postOpenSeatAnnouncement(client, data);
    await interaction.update({ content: "✅ Open seat posted to **#open-seats**!", components: [] });
    return;
  }

  if (customId.startsWith("skip_open_seat|")) {
    pendingOpenSeats.delete(customId.slice("skip_open_seat|".length));
    await interaction.update({ content: "No problem — booking confirmed.", components: [] });
    return;
  }

  if (customId.startsWith("claim_spot|")) {
    const msgId = customId.slice("claim_spot|".length);
    const data = openSeatPosts.get(msgId);
    if (!data) { await interaction.reply({ content: "This slot is no longer available.", ephemeral: true }); return; }
    if (data.bookerId === userId) { await interaction.reply({ content: "That's your own tee time!", ephemeral: true }); return; }
    const d = new Date(`${data.date}T12:00:00`);
    const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    await interaction.reply({
      content: `⛳ You're requesting a spot in **${data.bookerName}**'s round:\n**${data.courseName}** · ${dateLabel} · ${data.time}\n\nConfirm?`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`confirm_claim|${msgId}`).setLabel("Yes, I'm in!").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`cancel_claim|${msgId}`).setLabel("Never mind").setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (customId.startsWith("confirm_claim|")) {
    const msgId = customId.slice("confirm_claim|".length);
    const data = openSeatPosts.get(msgId);
    if (!data) { await interaction.update({ content: "This slot is no longer available.", components: [] }); return; }
    const claimerName = interaction.user.username;
    try {
      const channel = await client.channels.fetch(data.channelId);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const post = await channel.messages.fetch(msgId);
        await post.edit({
          content: post.content + `\n\n⏳ <@${userId}> wants this spot — <@${data.bookerId}>, approve or pass:`,
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`approve_claim|${userId}|${msgId}`).setLabel("✅ Approve").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`pass_claim|${userId}|${msgId}`).setLabel("❌ Pass").setStyle(ButtonStyle.Danger),
            ),
          ],
        });
      }
    } catch { /* post may be gone */ }
    await interaction.update({ content: `✅ Request sent to **${data.bookerName}**! Watch **#open-seats** for confirmation.`, components: [] });
    return;
  }

  if (customId.startsWith("cancel_claim|")) {
    await interaction.update({ content: "No problem — maybe next time!", components: [] });
    return;
  }

  if (customId.startsWith("approve_claim|")) {
    const [, claimerId, msgId] = customId.split("|");
    const data = openSeatPosts.get(msgId);
    if (!data) { await interaction.reply({ content: "Booking data not found.", ephemeral: true }); return; }
    const d = new Date(`${data.date}T12:00:00`);
    const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const course = getCourseSourceById(data.courseId);
    const mapsUrl = course?.lat != null && course?.lon != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.courseName)}`;
    try {
      const channel = await client.channels.fetch(data.channelId);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        const post = await channel.messages.fetch(msgId);
        await post.edit({
          content:
            `✅ **Filled!** — **${data.courseName}** · ${dateLabel} · ${data.time}\n` +
            `<@${data.bookerId}> confirmed <@${claimerId}> for the spot. 📍 [Directions](${mapsUrl})`,
          components: [],
        });
      }
    } catch { /* ignore */ }
    openSeatPosts.delete(msgId);
    await interaction.update({ content: `✅ Confirmed! <@${claimerId}> is your 4th.`, components: [] });
    return;
  }

  if (customId.startsWith("pass_claim|")) {
    const [, , msgId] = customId.split("|");
    const data = openSeatPosts.get(msgId);
    if (data) {
      try {
        const channel = await client.channels.fetch(data.channelId);
        if (channel?.isTextBased() && !channel.isDMBased()) {
          const post = await channel.messages.fetch(msgId);
          const d = new Date(`${data.date}T12:00:00`);
          const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
          await post.edit({
            content:
              `🏌️ **Open Seat** — **${data.bookerName}** has a tee time at **${data.courseName}**\n` +
              `📅 ${dateLabel} · ${data.time}\n` +
              `👥 ${4 - data.openSpots} of 4 confirmed — **${data.openSpots} ${data.openSpots === 1 ? "spot" : "spots"} open**`,
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`claim_spot|${msgId}`).setLabel("🏌️ Claim a Spot").setStyle(ButtonStyle.Primary)
              ),
            ],
          });
        }
      } catch { /* ignore */ }
    }
    await interaction.update({ content: "Passed — the spot is still open.", components: [] });
    return;
  }
};

// ── Bot init ──────────────────────────────────────────────────────────────────

export const initDiscordBot = (client?: Client): Client | null => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.log("[discord] Bot token not configured"); return null; }

  const bot = client ?? new Client({
    intents: [IntentsBitField.Flags.Guilds],
    partials: [Partials.Channel],
  });

  bot.on("clientReady", async () => {
    console.log(`[discord] Bot logged in as ${bot.user?.tag}`);
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) { console.log("[discord] DISCORD_GUILD_ID not set — skipping slash command registration"); return; }
    try {
      const rest = new REST().setToken(token);
      await rest.put(Routes.applicationGuildCommands(bot.user!.id, guildId), { body: SLASH_COMMANDS });
      console.log("[discord] Slash commands registered");
    } catch (err) {
      console.error("[discord] Failed to register slash commands", err);
    }
  });

  bot.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) await handleSlashCommand(interaction);
      else if (interaction.isModalSubmit()) await handleModalSubmit(interaction, bot);
      else if (interaction.isButton()) await handleButton(interaction, bot);
      else if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction);
    } catch (err) {
      console.error("[discord] Interaction error:", err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong — try again.", ephemeral: true }).catch(() => {});
      }
    }
  });

  bot.login(token);
  return bot;
};
