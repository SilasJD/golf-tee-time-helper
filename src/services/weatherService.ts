import fetch from "node-fetch";

export interface HourlyForecast {
  tempF: number;
  precipPct: number;
  condition: string;
}

const WMO: Record<number, string> = {
  0: "☀️ Clear",
  1: "🌤️ Mostly clear",
  2: "⛅ Partly cloudy",
  3: "☁️ Overcast",
  45: "🌫️ Foggy", 48: "🌫️ Foggy",
  51: "🌦️ Drizzle", 53: "🌦️ Drizzle", 55: "🌧️ Drizzle",
  61: "🌧️ Light rain", 63: "🌧️ Rain", 65: "🌧️ Heavy rain",
  71: "🌨️ Snow", 73: "🌨️ Snow", 75: "🌨️ Heavy snow", 77: "🌨️ Snow grains",
  80: "🌦️ Showers", 81: "🌧️ Showers", 82: "⛈️ Heavy showers",
  85: "🌨️ Snow showers", 86: "🌨️ Heavy snow showers",
  95: "⛈️ Thunderstorm", 96: "⛈️ Thunderstorm", 99: "⛈️ Thunderstorm",
};

interface CacheEntry { data: Map<string, HourlyForecast>; fetchedAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export const fetchCourseWeather = async (
  courseId: string,
  lat: number,
  lon: number
): Promise<Map<string, HourlyForecast>> => {
  const cached = cache.get(courseId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation_probability,weathercode` +
      `&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16`;

    const resp = await fetch(url);
    if (!resp.ok) return new Map();

    const json = (await resp.json()) as {
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: (number | null)[];
        weathercode: number[];
      };
    };

    const data = new Map<string, HourlyForecast>();
    for (let i = 0; i < json.hourly.time.length; i++) {
      const code = json.hourly.weathercode[i];
      data.set(json.hourly.time[i], {
        tempF: Math.round(json.hourly.temperature_2m[i]),
        precipPct: json.hourly.precipitation_probability[i] ?? 0,
        condition: WMO[code] ?? "🌡️ Mixed",
      });
    }

    cache.set(courseId, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return new Map();
  }
};

export const getHourWeather = (
  forecasts: Map<string, HourlyForecast>,
  isoDate: string,
  timeStr: string
): HourlyForecast | null => {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const period = m[3]?.toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return forecasts.get(`${isoDate}T${String(h).padStart(2, "0")}:00`) ?? null;
};
