# Golf Tee Time Helper

A Node.js microservice that monitors Baltimore-area golf courses for available tee times and sends Discord notifications when prime slots open up.

## Features

- Polls configured ForeUp-based golf courses on a recurring schedule
- Filters results by time window and day of week per user profile
- Sends Discord DMs and/or webhook notifications when prime tee times are found
- Discord bot with commands for self-service profile management
- REST API for health checks and polling status

## Courses Monitored

| Code | Course | Location |
|------|--------|----------|
| B1 | Diamond Ridge / The Woodlands | Baltimore County |
| B2 | Fox Hollow Golf Course | Essex |
| B3 | Greystone Golf Course | Timonium |
| B4 | Rocky Point Golf Course | Windsor Mill |

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

3. Edit `src/config/profiles.json` to add user profiles (see [Configuration](#configuration)).

4. Run in development mode:

   ```bash
   npm run dev
   ```

5. Build and run for production:

   ```bash
   npm run build
   npm start
   ```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | HTTP server port |
| `POLL_INTERVAL_MINUTES` | `15` | How often to check course availability |
| `PRIME_START_HOUR` | `7` | Start of the prime tee time window (24h) |
| `PRIME_END_HOUR` | `11` | End of the prime tee time window (24h) |
| `NOTIFICATION_WEBHOOK_URL` | — | Discord webhook URL for channel notifications |
| `DISCORD_BOT_TOKEN` | — | Discord bot token for DM notifications and commands |

### Profile Configuration (`src/config/profiles.json`)

Each user profile supports:

```json
{
  "id": "unique-id",
  "name": "Display Name",
  "enabled": true,
  "courseIds": ["B1", "B3"],
  "timeRange": ["07:00", "11:00"],
  "daysOfWeek": ["Saturday", "Sunday"],
  "discordUserId": "123456789",
  "discordUsername": "username"
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Whether this profile is actively monitored |
| `courseIds` | Course codes to watch (e.g. `["B1", "B2"]`) |
| `timeRange` | Preferred tee time window as `[start, end]` in `HH:MM` format |
| `daysOfWeek` | Days to monitor — full names, abbreviations, or `"weekdays"`/`"weekends"` |
| `discordUserId` | Discord user ID for DM notifications |

## Discord Bot Commands

If `DISCORD_BOT_TOKEN` is set, the bot responds to these commands:

| Command | Description |
|---------|-------------|
| `!register` | Create a new profile for yourself |
| `!enable` / `!disable` | Toggle monitoring on/off |
| `!set-courses B1 B3` | Set which courses to watch |
| `!set-time 7:00AM 11:00AM` | Set preferred tee time window |
| `!set-days Saturday Sunday` | Set active monitoring days |
| `!show-profile` | Display your current settings |
| `!list-profiles` | List all registered profiles |
| `!get-courses` | List available courses and their codes |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health and uptime |
| `GET /status` | Last polling results and prime tee times found |

## Testing

```bash
npm test          # Run test suite once
npm run test:watch # Watch mode
```

## Project Structure

```
src/
├── index.ts                  # Express app + cron scheduler
├── config/
│   └── profiles.json         # Course and user profile configuration
├── services/
│   ├── teeTimeMonitor.ts     # Polling, filtering, and notification logic
│   ├── courseSources.ts      # Course definition loader
│   ├── profileStore.ts       # Profile persistence (file-based)
│   ├── notificationService.ts# Discord DM and webhook notifications
│   └── discordBot.ts         # Discord bot command handler
├── routes/
│   └── status.ts             # /health and /status endpoints
└── utils/
    └── logger.ts             # Logging utility

scripts/
└── extract-foreup-ids.js     # Utility to extract course IDs from ForeUp
```
