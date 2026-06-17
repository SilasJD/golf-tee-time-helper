import fetch from "node-fetch";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from "discord.js";
import type { ProfileConfig } from "./profileStore.js";
import type { CourseSource } from "./courseSources.js";
import type { PriceMap } from "./teeTimeMonitor.js";
import {
  fetchCourseWeather,
  getHourWeather,
  type HourlyForecast,
} from "./weatherService.js";

export interface NotificationService {
  notifyPrimeSlots(
    profile: ProfileConfig,
    course: CourseSource,
    slots: string[],
    priceMap?: PriceMap
  ): Promise<void>;
}

const filterSlotsByRain = (
  slots: string[],
  forecasts: Map<string, HourlyForecast>,
  threshold: number
): string[] => {
  const byDate = new Map<string, string[]>();
  for (const slot of slots) {
    const date = slot.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), slot]);
  }
  return [...byDate.entries()]
    .filter(([date, dateSlots]) => {
      const w = getHourWeather(forecasts, date, dateSlots[0].slice(11));
      return w == null || w.precipPct <= threshold;
    })
    .flatMap(([, dateSlots]) => dateSlots);
};

const formatPrice = (priceMap: PriceMap | undefined, slotKey: string): string => {
  if (!priceMap) return "";
  const p = priceMap.get(slotKey);
  if (!p || p.green == null) return "";
  const green = `$${Math.round(p.green)}`;
  if (p.cart != null) return ` (${green} + $${Math.round(p.cart)} cart)`;
  if (p.cartIncluded) return ` (${green} w/cart)`;
  return ` (${green} walking)`;
};

const formatSlotsByDate = (
  slots: string[],
  course: CourseSource,
  players: number,
  forecasts: Map<string, HourlyForecast>,
  priceMap?: PriceMap
): string => {
  const byDate = new Map<string, string[]>();
  for (const slot of slots) {
    const spaceIdx = slot.indexOf(" ");
    const [datePart, timePart] =
      spaceIdx > 0
        ? [slot.slice(0, spaceIdx), slot.slice(spaceIdx + 1)]
        : ["", slot];
    const key = datePart || "upcoming";
    byDate.set(key, [...(byDate.get(key) ?? []), timePart]);
  }

  return [...byDate.entries()]
    .map(([date, times]) => {
      if (!date || date === "upcoming") return times.join(", ");

      const d = new Date(`${date}T12:00:00`);
      const label = d.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      });
      const [yyyy, mm, dd] = date.split("-");
      const linkDate = course.platform === "teeitup" ? `${yyyy}-${mm}-${dd}` : `${mm}-${dd}-${yyyy}`;
      const link = course.bookingUrl.replace("{date}", linkDate);

      const weather = getHourWeather(forecasts, date, times[0]);
      const weatherStr = weather
        ? ` · ${weather.condition} ${weather.tempF}°F · ${weather.precipPct}% rain`
        : "";

      const timeLines = times
        .map((t) => `${t}${formatPrice(priceMap, `${date} ${t}`)}`)
        .join(", ");

      return `**${label}**${weatherStr}\n${timeLines} — [View tee times](${link})`;
    })
    .join("\n\n");
};

const buildBookButtons = (
  slots: string[],
  courseId: string
): ActionRowBuilder<ButtonBuilder> | null => {
  const uniqueDates = [...new Set(slots.map((s) => s.slice(0, 10)))].slice(0, 5);
  if (uniqueDates.length === 0) return null;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    uniqueDates.map((date) => {
      const d = new Date(`${date}T12:00:00`);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return new ButtonBuilder()
        .setCustomId(`book|${courseId}|${date}`)
        .setLabel(`Mark ${label} as Booked`)
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);
    })
  );
  return row;
};

export const createNotificationService = (
  discordClient: Client | null
): NotificationService => ({
  async notifyPrimeSlots(profile, course, slots, priceMap) {
    const players = profile.players ?? 4;

    const forecasts =
      course.lat != null && course.lon != null
        ? await fetchCourseWeather(course.id, course.lat, course.lon)
        : new Map<string, HourlyForecast>();

    // Apply rain threshold filter per date
    const threshold = profile.rainThreshold;
    const activeSlots =
      threshold != null && forecasts.size > 0
        ? filterSlotsByRain(slots, forecasts, threshold)
        : slots;

    if (activeSlots.length === 0) {
      console.log(`[notification] All slots suppressed by rain threshold (${threshold}%) for ${course.name}`);
      return;
    }

    const slotLines = formatSlotsByDate(activeSlots, course, players, forecasts, priceMap);
    const mapsUrl = course.lat != null && course.lon != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.name + " " + course.city)}`;
    const messageText = `⛳ **${course.name}** *(${players} players)* · [Directions](${mapsUrl})\n\n${slotLines}`;
    console.log("[notification]", messageText.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        const mention = profile.discordUserId ? `<@${profile.discordUserId}>` : `**${profile.discordUsername}**`;
        const channelMessage = `📣 ${mention} — new slots matched\n${messageText}`;
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: channelMessage, username: "Golf Tee Time Alert" }),
        });
        console.log("[notification] Webhook posted");
      } catch (err) {
        console.error("[notification] Webhook failed:", err);
      }
    }
  },
});
