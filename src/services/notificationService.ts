import fetch from "node-fetch";
import type { Client } from "discord.js";
import type { ProfileConfig } from "./profileStore.js";
import type { CourseSource } from "./courseSources.js";
import {
  fetchCourseWeather,
  getHourWeather,
  type HourlyForecast,
} from "./weatherService.js";

export interface NotificationService {
  notifyPrimeSlots(
    profile: ProfileConfig,
    course: CourseSource,
    slots: string[]
  ): Promise<void>;
}

const formatSlotsByDate = (
  slots: string[],
  bookingUrl: string,
  players: number,
  forecasts: Map<string, HourlyForecast>
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
      const foreupDate = `${mm}-${dd}-${yyyy}`;
      const link = bookingUrl.replace("{date}", foreupDate);

      // Use weather at the earliest tee time that day
      const weather = getHourWeather(forecasts, date, times[0]);
      const weatherStr = weather
        ? ` · ${weather.condition} ${weather.tempF}°F · ${weather.precipPct}% rain`
        : "";

      return `**${label}**${weatherStr}\n${times.join(", ")} — [Book now](${link})`;
    })
    .join("\n\n");
};

export const createNotificationService = (
  discordClient: Client | null
): NotificationService => ({
  async notifyPrimeSlots(profile, course, slots) {
    const players = profile.players ?? 4;

    const forecasts =
      course.lat != null && course.lon != null
        ? await fetchCourseWeather(course.id, course.lat, course.lon)
        : new Map<string, HourlyForecast>();

    const slotLines = formatSlotsByDate(slots, course.bookingUrl, players, forecasts);
    const mapsUrl = course.lat != null && course.lon != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(course.name + " " + course.city)}`;
    const messageText = `⛳ **${course.name}** *(${players} players)* · [Directions](${mapsUrl})\n\n${slotLines}`;
    console.log("[notification]", messageText.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));

    if (profile.discordUserId && discordClient?.isReady()) {
      try {
        const user = await discordClient.users.fetch(profile.discordUserId);
        await user.send(`Hi ${profile.discordUsername},\n${messageText}`);
        console.log(`[notification] DM sent to ${profile.discordUsername}`);
      } catch (err) {
        console.error("[notification] Failed to send DM:", err);
      }
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: messageText, username: "Golf Tee Time Alert" }),
        });
        console.log("[notification] Webhook posted");
      } catch (err) {
        console.error("[notification] Webhook failed:", err);
      }
    }
  },
});
