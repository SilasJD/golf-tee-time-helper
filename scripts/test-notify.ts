/**
 * Fetches real tee times from Diamond Ridge and sends a test notification to the SilasJD profile.
 * Usage: npx tsx scripts/test-notify.ts
 */
import "dotenv/config";
import fetch from "node-fetch";
import { Client, IntentsBitField } from "discord.js";

const COURSE_ID = 20277;
const SCHEDULE_ID = 4169;
const COURSE_NAME = "Diamond Ridge & The Woodlands";

const PROFILE = {
  discordUserId: "152909999692054528",
  discordUsername: "dunnygan",
};

const fetchTeeTimes = async (dateStr: string): Promise<{ time: string; spots: number }[]> => {
  const url = `https://foreupsoftware.com/index.php/api/booking/times?time=all&date=${dateStr}&holes=all&players=0&booking_class=0&schedule_id=${SCHEDULE_ID}&course_id=${COURSE_ID}&schedule_ids[]=${SCHEDULE_ID}&api_key=no_limits`;
  console.log(`Fetching: ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { time: string; available_spots: number }[];
  return data.map((d) => ({ time: d.time, spots: d.available_spots }));
};

const formatSlots = (slots: { time: string; spots: number }[]) =>
  slots.map((s) => `${s.time} (${s.spots} spot${s.spots === 1 ? "" : "s"})`).join(", ");

const run = async () => {
  // Try today first, fall back to this Saturday
  const today = new Date();
  const saturdayOffset = (6 - today.getDay() + 7) % 7 || 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + saturdayOffset);

  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;

  let slots = await fetchTeeTimes(fmt(today));
  let dateUsed = today;
  if (slots.length === 0) {
    console.log("No slots today — checking Saturday...");
    slots = await fetchTeeTimes(fmt(saturday));
    dateUsed = saturday;
  }

  if (slots.length === 0) {
    console.log("No slots found on either date. Exiting.");
    process.exit(1);
  }

  console.log(`\nFound ${slots.length} tee times at ${COURSE_NAME} on ${fmt(dateUsed)}:`);
  slots.forEach((s) => console.log(`  ${s.time} — ${s.spots} spot(s)`));

  const primeSlots = slots.filter((s) => {
    const [, timePart] = s.time.split(" ");
    const [h] = timePart.split(":").map(Number);
    return h >= 6 && h < 12;
  });

  const displaySlots = (primeSlots.length > 0 ? primeSlots : slots).slice(0, 5);
  const message = `⛳ Prime tee times available at ${COURSE_NAME} on ${fmt(dateUsed)}:\n${formatSlots(displaySlots)}`;
  console.log(`\nNotification message:\n${message}\n`);

  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  // Send via webhook
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, username: "Golf Tee Time Alert" }),
    });
    console.log(`Webhook: ${res.ok ? "sent" : `failed (${res.status})`}`);
  } else {
    console.log("No NOTIFICATION_WEBHOOK_URL set — skipping webhook.");
  }

  // Send DM via bot
  if (botToken) {
    const client = new Client({
      intents: [IntentsBitField.Flags.DirectMessages],
    });
    await new Promise<void>((resolve, reject) => {
      client.once("ready", async () => {
        try {
          const user = await client.users.fetch(PROFILE.discordUserId);
          await user.send(`Hi ${PROFILE.discordUsername},\n${message}`);
          console.log(`DM sent to ${PROFILE.discordUsername}`);
        } catch (err) {
          console.error("DM failed:", err);
        } finally {
          client.destroy();
          resolve();
        }
      });
      client.login(botToken).catch(reject);
    });
  } else {
    console.log("No DISCORD_BOT_TOKEN set — skipping DM.");
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
