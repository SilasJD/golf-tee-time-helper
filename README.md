# Golf Tee Time Helper

A personal Discord bot that monitors Maryland and Pennsylvania public golf courses for cancelled tee times and notifies you the moment a prime slot reopens.

Built around the [ForeUp](https://foreupsoftware.com) booking platform used by most Maryland county courses and Penn National.

## How It Works

The bot polls ForeUp's public API on a randomised schedule — every 5–10 minutes anonymously for the standard 9-day window, and every 15–90 minutes using your Advantage Card JWT for the extended 16-day window. When a slot that was previously unavailable reappears (a cancellation), you get a Discord DM with the time, weather forecast, and a direct booking link.

## Features

- **Cancellation detection** — tracks slot availability scan-to-scan; notifies only when a slot reappears after being gone
- **Per-user profiles** — each Discord user sets their own days, time window, player count, and course list
- **Weather forecasts** — each notification includes the temperature and precipitation chance at tee time (Open-Meteo API, no key needed)
- **Google Maps directions** — one-click link to the course in every notification
- **Booking confirmation** — `booked` command pauses alerts for that weekend and sends an announcement + DMs to your golf partners
- **Two-tier polling** — anonymous public calls (5–10 min) + authenticated Advantage Card calls (15–90 min)
- **Only queries selected courses** — if no profile wants a course, it's never called

## Courses

| Code | Course | Location |
|------|--------|----------|
| `DR` / `B1` | Diamond Ridge & The Woodlands | Windsor Mill, MD |
| `FH` / `B2` | Fox Hollow Golf Course | Timonium, MD |
| `GS` / `B3` | Greystone Golf Course | White Hall, MD |
| `RP` / `B4` | Rocky Point Golf Course | Essex, MD |
| `H1` | Fairway Hills Golf Club | Columbia, MD |
| `F1` | The Club at P.B. Dye | Ijamsville, MD |
| `A1` | Bulle Rock Golf Course | Havre de Grace, MD |
| `C1` | Chesapeake Hills Golf Course | Lusby, MD |
| `P1` | Penn National — Founders Course | Fayetteville, PA |
| `P2` | Penn National — Iron Forge Course | Fayetteville, PA |

All four Baltimore County courses (DR/FH/GS/RP) support the Baltimore County Advantage Card extended booking window.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see [Environment Variables](#environment-variables) below).

### 3. Configure profiles

```bash
cp src/config/profiles.example.json src/config/profiles.json
```

You can edit this file manually, or let users self-register through the Discord bot with the `register` command.

### 4. Run

```bash
# Development (hot reload)
npm run dev

# Production
npm run build
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_BOT_TOKEN` | — | **Required.** Discord bot token from the Developer Portal |
| `NOTIFICATION_WEBHOOK_URL` | — | **Required.** Discord webhook URL for channel notifications |
| `FOREUP_JWT` | — | ForeUp JWT for Advantage Card extended window. Log into a ForeUp course site and copy the `x-authorization: Bearer <token>` header from a booking API request. Expires periodically. |
| `FOREUP_BOOKING_CLASS` | `35` | Booking class for the Advantage Card window (Baltimore County = `35`) |
| `PORT` | `4000` | HTTP port for the status API |
| `LOOKAHEAD_DAYS` | `17` | Days ahead to scan (17 = full Advantage window; 9 = public only) |
| `API_CALL_DELAY_MS` | `1000` | Delay between ForeUp API calls to avoid rate limiting |

## Discord Bot Commands

All commands work in DMs or by @mentioning the bot in a server channel.

| Command | Description |
|---------|-------------|
| `register` | Create your profile (guided 4-step setup) |
| `preferences` | Update your existing settings |
| `booked` | Record a booking — pauses alerts for that weekend and notifies your golf partners |
| `enable` | Resume tee time alerts |
| `disable` | Pause tee time alerts |
| `exit` | Cancel any active setup flow |

### Registration flow

The bot walks you through four steps via DM:

1. **Days** — `weekends`, `weekdays`, `all`, or a list like `Sat Sun`
2. **Time window** — `early` (6–9am), `morning` (9am–noon), `all day`, or a custom range like `7am-10am`
3. **Players** — `1` through `4`
4. **Courses** — `all`, or a list of codes like `DR RP A1`

### Booking confirmation flow

When you type `booked`, the bot asks:

1. **Date** — `Jun 28`, `06-28`, or `2026-06-28`
2. **Course** — any course code (e.g. `DR`, `P1`)
3. **Time** — e.g. `7:40 AM`
4. **Partners** — Discord usernames of who you're playing with (e.g. `sjdunigan purplerain6071`), or `skip`

After confirmation, alerts are paused for that full weekend and an announcement is posted to the webhook channel + DMs sent to each partner with weather, course details, and a Maps link.

## Profile Schema

`src/config/profiles.json` is gitignored (contains personal Discord IDs). Use `profiles.example.json` as the starting point.

```json
{
  "discordUserId": "YOUR_DISCORD_USER_ID",
  "discordUsername": "your_username",
  "enabled": true,
  "daysOfWeek": ["Saturday", "Sunday"],
  "timeRange": ["07:00", "10:30"],
  "players": 4,
  "courseIds": ["diamond-ridge-woodlands", "rocky-point-golf-course"],
  "golfPartners": [],
  "bookedDates": []
}
```

| Field | Description |
|-------|-------------|
| `discordUserId` | Your Discord user ID (right-click your name → Copy User ID) |
| `enabled` | Whether monitoring is active for this profile |
| `courseIds` | Course IDs to watch (use the full `id` from the courses array) |
| `timeRange` | `[start, end]` in `HH:MM` 24-hour format |
| `daysOfWeek` | Full day names: `"Saturday"`, `"Sunday"`, etc. |
| `players` | Party size used when querying availability |
| `golfPartners` | Discord user IDs to notify when you confirm a booking |
| `bookedDates` | ISO dates (`YYYY-MM-DD`) currently paused — managed automatically by the `booked` command |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health and uptime |
| `GET /status` | Active profiles, courses being monitored, polling schedule |

## Project Structure

```
src/
├── index.ts                    # Express server + monitor startup
├── config/
│   ├── profiles.json           # Live config — gitignored, contains personal data
│   └── profiles.example.json  # Safe template to commit and share
├── services/
│   ├── teeTimeMonitor.ts       # Polling, cancellation detection, scheduling
│   ├── courseSources.ts        # Course definition types and loader
│   ├── profileStore.ts         # Profile read/write (file-backed)
│   ├── notificationService.ts  # Discord DM + webhook notifications
│   ├── weatherService.ts       # Open-Meteo hourly forecasts (no API key)
│   └── discordBot.ts           # Bot commands, registration, booking flow
├── routes/
│   └── status.ts               # /health and /status endpoints
└── utils/
    └── logger.ts               # Structured logging

docs/
└── tier2-courses.md            # TeeItUp platform research (DC courses, Westminster National)
```

## Tier 2 Courses (Not Yet Implemented)

DC municipal courses (East Potomac, Langston, Rock Creek) and Westminster National use the **TeeItUp** platform. See `docs/tier2-courses.md` for research notes and implementation guidance.
