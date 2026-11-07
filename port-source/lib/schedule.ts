/** Pure date math for the reminder timeline. Port of schedule.py.
 *
 * Dates are plain "YYYY-MM-DD" strings so there's no timezone drift —
 * a calendar day is a calendar day.
 */

import { config } from "./config";

export const LEADERSHIP_DETAILS = "leadership_details";
export const MARKETING_WARNING = "marketing_warning";
export const MARKETING_RELEASE = "marketing_release";

export const KINDS = [LEADERSHIP_DETAILS, MARKETING_WARNING, MARKETING_RELEASE] as const;
export type Kind = (typeof KINDS)[number];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Today's date in the club's timezone, as YYYY-MM-DD. */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export interface Timeline {
  eventDate: string;
  postDeadline: string;
  due: Record<Kind, string>;
}

export function buildTimeline(eventDate: string): Timeline {
  const s = config.schedule;
  const postDeadline = addDays(eventDate, -s.postLeadDays);
  return {
    eventDate,
    postDeadline,
    due: {
      [LEADERSHIP_DETAILS]: addDays(postDeadline, -s.leadershipLeadDays),
      [MARKETING_WARNING]: addDays(postDeadline, -s.marketingWarningDays),
      [MARKETING_RELEASE]: postDeadline,
    },
  };
}

/** Which reminders should have gone out by `today`, including the catch-up window. */
export function dueKinds(eventDate: string, today: string): Kind[] {
  const timeline = buildTimeline(eventDate);
  return KINDS.filter((kind) => {
    const lateBy = daysBetween(timeline.due[kind], today);
    return lateBy >= 0 && lateBy <= config.schedule.catchUpDays;
  });
}

export function daysUntil(target: string, today: string): string {
  const delta = daysBetween(today, target);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta < 0) return `${Math.abs(delta)} days ago`;
  return `in ${delta} days`;
}

export function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
