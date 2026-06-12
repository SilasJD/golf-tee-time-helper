import {
  Client,
  IntentsBitField,
  Partials,
  Message,
  ChannelType,
} from "discord.js";
import fetch from "node-fetch";
import {
  addOrUpdateProfile,
  addBookedDates,
  getCourseSources,
  getProfileByDiscordId,
  type ProfileConfig,
} from "./profileStore.js";
import { getCourseSourceById } from "./courseSources.js";
import { fetchCourseWeather, getHourWeather } from "./weatherService.js";

// ── Course aliases ────────────────────────────────────────────────────────────

const COURSE_ALIASES: Record<string, string> = {
  // Baltimore County
  b1: "diamond-ridge-woodlands",
  dr: "diamond-ridge-woodlands",
  "diamond ridge": "diamond-ridge-woodlands",
  diamond: "diamond-ridge-woodlands",
  b2: "fox-hollow-golf-course",
  fh: "fox-hollow-golf-course",
  "fox hollow": "fox-hollow-golf-course",
  fox: "fox-hollow-golf-course",
  b3: "greystone-golf-course",
  gs: "greystone-golf-course",
  greystone: "greystone-golf-course",
  b4: "rocky-point-golf-course",
  rp: "rocky-point-golf-course",
  "rocky point": "rocky-point-golf-course",
  rocky: "rocky-point-golf-course",
  // Howard County
  h1: "fairway-hills-golf-club",
  "fairway hills": "fairway-hills-golf-club",
  fairway: "fairway-hills-golf-club",
  // Frederick County
  f1: "pb-dye-golf-club",
  "pb dye": "pb-dye-golf-club",
  pbd: "pb-dye-golf-club",
  dye: "pb-dye-golf-club",
  // Harford County
  a1: "bulle-rock-golf-course",
  "bulle rock": "bulle-rock-golf-course",
  bulle: "bulle-rock-golf-course",
  // Calvert County
  c1: "chesapeake-hills-golf-course",
  "chesapeake hills": "chesapeake-hills-golf-course",
  chesapeake: "chesapeake-hills-golf-course",
  // Franklin County, PA
  p1: "penn-national-founders",
  "penn founders": "penn-national-founders",
  founders: "penn-national-founders",
  p2: "penn-national-iron-forge",
  "penn iron": "penn-national-iron-forge",
  "iron forge": "penn-national-iron-forge",
  iron: "penn-national-iron-forge",
  penn: "penn-national-founders",
};

const ALL_COURSE_IDS = [
  "diamond-ridge-woodlands",
  "fox-hollow-golf-course",
  "greystone-golf-course",
  "rocky-point-golf-course",
  "fairway-hills-golf-club",
  "pb-dye-golf-club",
  "bulle-rock-golf-course",
  "chesapeake-hills-golf-course",
  "penn-national-founders",
  "penn-national-iron-forge",
];

const ALL_DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const WEEKENDS = ["Saturday", "Sunday"];

const DEFAULT_DAYS = WEEKENDS;
const DEFAULT_TIME_RANGE: [string, string] = ["06:00", "10:00"];
const DEFAULT_PLAYERS = 4;

const DAY_MAP: Record<string, string> = {
  mon: "Monday", monday: "Monday",
  tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
  wed: "Wednesday", wednesday: "Wednesday",
  thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
  fri: "Friday", friday: "Friday",
  sat: "Saturday", saturday: "Saturday",
  sun: "Sunday", sunday: "Sunday",
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
  if (lower === "all" || lower === "everyday" || lower === "every day" || lower === "all days") return ALL_DAYS;

  const tokens = lower.split(/[\s,]+/).filter(Boolean);
  const resolved = tokens.map((t) => DAY_MAP[t]).filter((d): d is string => Boolean(d));
  return resolved.length > 0 ? [...new Set(resolved)] : null;
};

export const parseTimeInput = (input: string): [string, string] | null => {
  const lower = input.trim().toLowerCase();

  if (lower === "early" || lower === "early morning") return ["06:00", "09:00"];
  if (lower === "morning") return ["09:00", "12:00"];
  if (lower === "afternoon") return ["12:00", "16:00"];
  if (lower === "all day" || lower === "all" || lower === "anytime") return ["06:00", "20:00"];

  const rangeMatch = lower.match(
    /^(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)$/
  );
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
  const resolved = tokens
    .map((t) => COURSE_ALIASES[t])
    .filter((id): id is string => Boolean(id));

  const unique = [...new Set(resolved)];
  return unique.length > 0 ? unique : null;
};

export const parseMentions = (input: string): string[] =>
  [...input.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]);

// Resolves plain usernames (or real @mentions) to Discord user IDs by searching
// guild members via REST — works without the GuildMembers privileged intent.
const resolvePartnersFromUsernames = async (
  input: string,
  client: Client
): Promise<{ resolved: string[]; unresolved: string[] }> => {
  const mentioned = parseMentions(input);
  if (mentioned.length > 0) return { resolved: mentioned, unresolved: [] };

  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.replace(/^@/, ""))
    .filter(Boolean);

  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const token of tokens) {
    let found = false;
    for (const guild of client.guilds.cache.values()) {
      try {
        const results = await guild.members.search({ query: token, limit: 5 });
        const match = results.find(
          (m) =>
            m.user.username.toLowerCase() === token.toLowerCase() ||
            m.displayName.toLowerCase() === token.toLowerCase()
        );
        if (match) {
          resolved.push(match.user.id);
          found = true;
          break;
        }
      } catch { /* skip guild on error */ }
    }
    if (!found) unresolved.push(token);
  }

  return { resolved, unresolved };
};

export const parseBookedDate = (input: string): string | null => {
  const trimmed = input.trim();
  const now = new Date();
  const year = now.getFullYear();

  // "2026-06-28"
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // "Jun 28" / "June 28"
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

  // "06-28" / "06/28"
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
  if (day === 6) {
    const sun = new Date(d); sun.setDate(d.getDate() + 1);
    return [iso, isoDate(sun)];
  }
  if (day === 0) {
    const sat = new Date(d); sat.setDate(d.getDate() - 1);
    return [isoDate(sat), iso];
  }
  // Weekday — return nearest upcoming Sat+Sun
  const sat = new Date(d); sat.setDate(d.getDate() + (6 - day));
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  return [isoDate(sat), isoDate(sun)];
};

// ── Preferences conversation ──────────────────────────────────────────────────

type ConversationStep = "days" | "time" | "players" | "courses";

interface ConversationState {
  step: ConversationStep;
  draft: {
    daysOfWeek?: string[];
    timeRange?: [string, string];
    players?: number;
    courseIds?: string[];
  };
}

const conversations = new Map<string, ConversationState>();

const hint = (current: string | undefined) =>
  current ? ` *(current: ${current})*` : "";

const stepQuestion = (step: ConversationStep, draft: ConversationState["draft"]): string => {
  if (step === "days") {
    return [
      `**Step 1/4 — Days**${hint(draft.daysOfWeek?.join(", "))}`,
      "Which days should I monitor?\n",
      "• `weekends` — Sat & Sun *(default)*",
      "• `weekdays` — Mon through Fri",
      "• `all` — every day",
      "• or list days: `Mon Wed Sat`",
    ].join("\n");
  }
  if (step === "time") {
    const cur = draft.timeRange ? `${draft.timeRange[0]}–${draft.timeRange[1]}` : undefined;
    return [
      `**Step 2/4 — Time Window**${hint(cur)}`,
      "What time window?\n",
      "• `early` — 6am to 9am *(default)*",
      "• `morning` — 9am to noon",
      "• `all day` — 6am to 8pm",
      "• or custom: `7am-10am`",
    ].join("\n");
  }
  if (step === "players") {
    return [
      `**Step 3/4 — Players**${hint(draft.players?.toString())}`,
      "How many players?\n",
      "• `4` — Foursome *(default)*",
      "• `3` — Threesome",
      "• `2` — Twosome",
      "• `1` — Single",
    ].join("\n");
  }
  return [
    `**Step 4/4 — Courses**${hint(draft.courseIds ? "selected" : undefined)}`,
    "Which courses? Reply `all` or list codes.\n",
    "**Baltimore County** — `DR` `FH` `GS` `RP`",
    "**Howard County** — `H1` (Fairway Hills)",
    "**Frederick County** — `F1` (P.B. Dye)",
    "**Harford County** — `A1` (Bulle Rock)",
    "**Calvert County** — `C1` (Chesapeake Hills)",
    "**Franklin County, PA** — `P1` (Founders) `P2` (Iron Forge)\n",
    "Example: `DR RP H1`",
  ].join("\n");
};

const confirmationMessage = (p: ProfileConfig): string => {
  const courses = getCourseSources();
  const courseNames = p.courseIds
    .map((id) => courses.find((c) => c.id === id)?.name ?? id)
    .join(", ");
  return [
    "✅ **You're all set!**\n",
    `📅 **Days:** ${p.daysOfWeek.join(", ")}`,
    `⏰ **Time:** ${p.timeRange[0]} – ${p.timeRange[1]}`,
    `👥 **Players:** ${p.players}`,
    `⛳ **Courses:** ${courseNames}\n`,
    "I'll DM you as soon as matching tee times open up.\n",
    "> Type `preferences` to update your settings",
    "> Type `booked` to confirm a booking and tag who you're playing with",
    "> Type `disable` to pause alerts",
  ].join("\n");
};

const startFlow = async (userId: string, client: Client, existing?: ProfileConfig) => {
  const state: ConversationState = {
    step: "days",
    draft: existing
      ? {
          daysOfWeek: existing.daysOfWeek,
          timeRange: existing.timeRange,
          players: existing.players ?? DEFAULT_PLAYERS,
          courseIds: existing.courseIds,
        }
      : {
          daysOfWeek: DEFAULT_DAYS,
          timeRange: DEFAULT_TIME_RANGE,
          players: DEFAULT_PLAYERS,
          courseIds: ALL_COURSE_IDS,
        },
  };
  conversations.set(userId, state);
  const user = await client.users.fetch(userId);
  const intro = existing ? "Let's update your preferences.\n\n" : "👋 Let's set up your tee time alerts!\n\n";
  await user.send(intro + stepQuestion("days", state.draft));
};

const handleConversationStep = async (
  message: Message,
  state: ConversationState,
  client: Client
): Promise<void> => {
  const userId = message.author.id;
  const input = message.content.trim();

  if (["cancel", "exit"].includes(input.toLowerCase())) {
    conversations.delete(userId);
    await message.reply("Setup cancelled. Type `register` to start again or `preferences` to update.");
    return;
  }

  if (state.step === "days") {
    const days = parseDaysInput(input);
    if (!days) {
      await message.reply(`I didn't understand that.\n\n${stepQuestion("days", state.draft)}`);
      return;
    }
    state.draft.daysOfWeek = days;
    state.step = "time";
    conversations.set(userId, state);
    await message.reply(stepQuestion("time", state.draft));

  } else if (state.step === "time") {
    const time = parseTimeInput(input);
    if (!time) {
      await message.reply(`I didn't understand that.\n\n${stepQuestion("time", state.draft)}`);
      return;
    }
    state.draft.timeRange = time;
    state.step = "players";
    conversations.set(userId, state);
    await message.reply(stepQuestion("players", state.draft));

  } else if (state.step === "players") {
    const players = parsePlayersInput(input);
    if (!players) {
      await message.reply(`Please enter a number between 1 and 4.\n\n${stepQuestion("players", state.draft)}`);
      return;
    }
    state.draft.players = players;
    state.step = "courses";
    conversations.set(userId, state);
    await message.reply(stepQuestion("courses", state.draft));

  } else if (state.step === "courses") {
    const courseIds = parseCoursesInput(input);
    if (!courseIds) {
      await message.reply(`I didn't recognise those course codes.\n\n${stepQuestion("courses", state.draft)}`);
      return;
    }
    state.draft.courseIds = courseIds;
    conversations.delete(userId);

    const existing = getProfileByDiscordId(userId);
    const profile: ProfileConfig = {
      discordUserId: userId,
      discordUsername: message.author.username,
      enabled: true,
      daysOfWeek: state.draft.daysOfWeek!,
      timeRange: state.draft.timeRange!,
      players: state.draft.players ?? DEFAULT_PLAYERS,
      courseIds,
      golfPartners: existing?.golfPartners ?? [],
      bookedDates: existing?.bookedDates ?? [],
    };
    addOrUpdateProfile(profile);
    await message.reply(confirmationMessage(profile));
  }
};

// ── Booking conversation ──────────────────────────────────────────────────────

type BookingStep = "date" | "course" | "time" | "partners";

interface BookingState {
  step: BookingStep;
  draft: { date?: string; courseId?: string; time?: string; partners?: string[] };
}

const bookingConversations = new Map<string, BookingState>();

const bookingStepQuestion = (step: BookingStep): string => {
  if (step === "date") return "📅 What date did you book? (e.g. `Jun 28`, `06-28`, or `2026-06-28`)";
  if (step === "course") {
    return [
      "⛳ Which course? Use a code:\n",
      "• `DR` — Diamond Ridge  • `RP` — Rocky Point",
      "• `FH` — Fox Hollow  • `GS` — Greystone",
      "• `H1` — Fairway Hills  • `F1` — P.B. Dye",
      "• `A1` — Bulle Rock  • `C1` — Chesapeake Hills",
      "• `P1` — Penn National Founders  • `P2` — Iron Forge",
    ].join("\n");
  }
  if (step === "time") return "⏰ What time was your tee time? (e.g. `7:40 AM`)";
  return "🤝 Who are you playing with? Type their Discord usernames separated by spaces — or `skip` if none.\n*(e.g. `sjdunigan purplerain6071`)*";
};

const handleBookingStep = async (
  message: Message,
  state: BookingState,
  client: Client
): Promise<void> => {
  const userId = message.author.id;
  const input = message.content.trim();

  if (["cancel", "exit"].includes(input.toLowerCase())) {
    bookingConversations.delete(userId);
    await message.reply("Booking cancelled.");
    return;
  }

  if (state.step === "date") {
    const date = parseBookedDate(input);
    if (!date) {
      await message.reply(`I didn't understand that date.\n\n${bookingStepQuestion("date")}`);
      return;
    }
    state.draft.date = date;
    state.step = "course";
    bookingConversations.set(userId, state);
    await message.reply(bookingStepQuestion("course"));

  } else if (state.step === "course") {
    const courseId = COURSE_ALIASES[input.trim().toLowerCase()];
    if (!courseId) {
      await message.reply(`I didn't recognise that code.\n\n${bookingStepQuestion("course")}`);
      return;
    }
    state.draft.courseId = courseId;
    state.step = "time";
    bookingConversations.set(userId, state);
    await message.reply(bookingStepQuestion("time"));

  } else if (state.step === "time") {
    state.draft.time = input;
    state.step = "partners";
    bookingConversations.set(userId, state);
    await message.reply(bookingStepQuestion("partners"));

  } else if (state.step === "partners") {
    const lower = input.toLowerCase();
    let partners: string[];

    if (lower === "skip" || lower === "none" || lower === "no") {
      partners = [];
    } else {
      const { resolved, unresolved } = await resolvePartnersFromUsernames(input, client);
      if (resolved.length === 0) {
        await message.reply(
          `Couldn't find any of those usernames in the server. Double-check the spelling and try again, or type \`skip\` to continue without tagging anyone.`
        );
        return;
      }
      if (unresolved.length > 0) {
        await message.reply(`⚠️ Couldn't find: **${unresolved.join(", ")}** — continuing with the rest.`);
      }
      partners = resolved;
    }

    state.draft.partners = partners;
    bookingConversations.delete(userId);

    const { date, courseId, time } = state.draft as Required<Pick<BookingState["draft"], "date" | "courseId" | "time">>;
    const weekendDates = getWeekendDates(date);
    addBookedDates(userId, weekendDates);

    // Persist partners on the profile for future reference
    const profile = getProfileByDiscordId(userId);
    if (profile) {
      profile.golfPartners = partners;
      addOrUpdateProfile(profile);
    }

    const course = getCourseSourceById(courseId);
    const d = new Date(`${date}T12:00:00`);
    const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

    await message.reply(
      `✅ Got it! Alerts paused for the weekend of **${dateLabel}**.` +
      (partners.length > 0 ? " Letting your group know... 📣" : "")
    );

    if (course) {
      await sendBookingAnnouncement(client, message.author.username, partners, course, date, time);
    }
  }
};

const sendBookingAnnouncement = async (
  client: Client,
  bookerName: string,
  partnerIds: string[],
  course: ReturnType<typeof getCourseSourceById> & object,
  date: string,
  time: string
): Promise<void> => {
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

  const partnerMentions = partnerIds.map((id) => `<@${id}>`).join(" ");

  const msg = [
    `🏌️ **${bookerName}** booked a tee time — you're on!\n`,
    `⛳ **${course.name}**`,
    `📅 ${dateLabel} · ${time}${weatherLine}`,
    `📍 [Directions](${mapsUrl})`,
    partnerMentions ? `\n${partnerMentions} — see you on the course! ⛳` : "",
  ].filter(Boolean).join("\n");

  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg, username: "Golf Bot" }),
      });
    } catch { /* ignore webhook failure */ }
  }

  for (const partnerId of partnerIds) {
    try {
      const user = await client.users.fetch(partnerId);
      await user.send(msg);
    } catch { /* partner may have DMs closed */ }
  }
};

// ── Bot init ──────────────────────────────────────────────────────────────────

export const initDiscordBot = (client?: Client): Client | null => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.log("[discord] Bot token not configured");
    return null;
  }

  const bot = client ?? new Client({
    intents: [
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.DirectMessages,
      IntentsBitField.Flags.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  bot.on("ready", () => {
    console.log(`[discord] Bot logged in as ${bot.user?.tag}`);
  });

  bot.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const isDM = message.channel.type === ChannelType.DM;
    const isMentioned = message.mentions.has(bot.user!);
    if (!isDM && !isMentioned) return;

    const userId = message.author.id;
    const rawInput = message.content.replace(/<@!?\d+>/g, "").trim();

    // Exit clears any active conversation immediately
    if (isDM && rawInput.toLowerCase() === "exit") {
      const hadConversation = conversations.has(userId) || bookingConversations.has(userId);
      conversations.delete(userId);
      bookingConversations.delete(userId);
      await message.reply(hadConversation
        ? "Cancelled. Type `register`, `preferences`, or `booked` to start again."
        : "No active setup to exit.");
      return;
    }

    // Route active conversations
    if (isDM && bookingConversations.has(userId)) {
      await handleBookingStep(message, bookingConversations.get(userId)!, bot);
      return;
    }
    if (isDM && conversations.has(userId)) {
      await handleConversationStep(message, conversations.get(userId)!, bot);
      return;
    }

    const command = rawInput.toLowerCase().split(/\s+/)[0];

    try {
      if (command === "register" || command === "preferences") {
        if (!isDM) await message.reply("Check your DMs! 👋");
        const existing = getProfileByDiscordId(userId);
        await startFlow(userId, bot, existing ?? undefined);

      } else if (command === "booked") {
        if (!isDM) await message.reply("Check your DMs! 👋");
        const state: BookingState = { step: "date", draft: {} };
        bookingConversations.set(userId, state);
        const user = await bot.users.fetch(userId);
        await user.send(`🏌️ Let's record your booking!\n\n${bookingStepQuestion("date")}`);

      } else if (command === "disable") {
        const profile = getProfileByDiscordId(userId);
        if (!profile) {
          const msg = "You don't have a profile yet. DM me `register` to get started.";
          isDM ? await message.reply(msg) : await message.author.send(msg);
          return;
        }
        profile.enabled = false;
        addOrUpdateProfile(profile);
        const reply = "⏸️ Alerts paused. DM me `enable` to resume.";
        isDM ? await message.reply(reply) : (await message.reply("Done! 👋"), await message.author.send(reply));

      } else if (command === "enable") {
        const profile = getProfileByDiscordId(userId);
        if (!profile) {
          const msg = "You don't have a profile yet. DM me `register` to get started.";
          isDM ? await message.reply(msg) : await message.author.send(msg);
          return;
        }
        profile.enabled = true;
        addOrUpdateProfile(profile);
        const courses = getCourseSources();
        const courseNames = profile.courseIds
          .map((id) => courses.find((c) => c.id === id)?.name ?? id)
          .join(", ");
        const reply = [
          "▶️ **Alerts resumed!**\n",
          `📅 **Days:** ${profile.daysOfWeek.join(", ")}`,
          `⏰ **Time:** ${profile.timeRange[0]} – ${profile.timeRange[1]}`,
          `👥 **Players:** ${profile.players ?? 4}`,
          `⛳ **Courses:** ${courseNames}`,
        ].join("\n");
        isDM ? await message.reply(reply) : (await message.reply("Done! 👋"), await message.author.send(reply));

      } else {
        await message.reply([
          "**Commands:**",
          "• `register` — set up tee time alerts",
          "• `preferences` — update your settings",
          "• `booked` — confirm a booking and notify your group",
          "• `disable` / `enable` — pause or resume alerts",
          "• `exit` — cancel any active setup",
        ].join("\n"));
      }
    } catch (err) {
      console.error("[discord] Error:", err);
    }
  });

  bot.login(token);
  return bot;
};
