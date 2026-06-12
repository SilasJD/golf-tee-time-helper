import express from "express";
import type { TeeTimeMonitor } from "../services/teeTimeMonitor.js";

export const healthRouter = express.Router();
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", uptimeSeconds: process.uptime() });
});

export const statusRouter = (monitor: TeeTimeMonitor) => {
  const router = express.Router();
  router.get("/", (_req, res) => {
    res.json({
      lastRun: monitor.lastRunAt?.toISOString() ?? null,
      polling: { publicEvery: "5–10 min (anonymous)", advantageEvery: "15–90 min (auth)" },
      lookaheadDays: monitor.lookaheadDays,
      primeSlots: monitor.primeSlots,
      notifiedSlots: monitor.notifiedSlots,
      lastResult: monitor.lastResult,
    });
  });
  return router;
};
