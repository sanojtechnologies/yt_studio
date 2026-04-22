/**
 * Timezone helpers. Kept in its own module so both `lib/stats.ts` and
 * `lib/heatmap.ts` share the same bucketing logic (and the same test
 * fixtures). Pure — no DOM, no globals beyond the standard `Intl`.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Return the weekday (0..6, Sun..Sat) and hour (0..23) of the given
 * `date` as observed in `timeZone`. Uses `Intl.DateTimeFormat` so DST
 * transitions and half-hour offsets (Kolkata, Kathmandu, Newfoundland,
 * ...) are handled correctly.
 *
 * Shortcut: when `timeZone` is `"UTC"` we use the native getters directly.
 * This is ~50× faster than `formatToParts` and matters on 50-video pages
 * that re-bucket every render during dashboard hydration.
 */
export function localDayHour(
  date: Date,
  timeZone: string = "UTC"
): { day: number; hour: number } {
  if (timeZone === "UTC") {
    return { day: date.getUTCDay(), hour: date.getUTCHours() };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hourRaw = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  // `hour12: false` can surface "24" for midnight on some engines; clamp.
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return { day: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

/**
 * The browser's current IANA timezone, or `"UTC"` when `Intl` is
 * unavailable / the environment hides the resolved zone.
 */
export function getBrowserTimeZone(): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Compact, user-visible timezone label (e.g. `IST`, `PDT`, `UTC+05:30`).
 * Falls back to the IANA id when no short name is available.
 */
export function formatTimeZoneLabel(
  date: Date = new Date(),
  timeZone: string = "UTC"
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    const label = parts.find((part) => part.type === "timeZoneName")?.value;
    return label && label.length > 0 ? label : timeZone;
  } catch {
    return timeZone;
  }
}
