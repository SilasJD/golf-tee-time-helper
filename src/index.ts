import express from "express";
import dotenv from "dotenv";
import { initMonitor } from "./services/teeTimeMonitor.js";
import { createNotificationService } from "./services/notificationService.js";
import { initDiscordBot } from "./services/discordBot.js";
import { healthRouter, statusRouter } from "./routes/status.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

const discordClient = initDiscordBot();
const notificationService = createNotificationService(discordClient);
const monitor = initMonitor(notificationService);

// Initialize Discord bot for profile management

app.use(express.json());
app.use("/health", healthRouter);
app.use("/status", statusRouter(monitor));

app.listen(port, async () => {
  console.log(`Golf tee-time helper listening on http://localhost:${port}`);
  await monitor.start();
});
