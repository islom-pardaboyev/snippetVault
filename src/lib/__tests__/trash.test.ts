import { describe, expect, it } from "vitest";
import { TRASH_DAYS, daysLeft, isExpired } from "../trash";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("trash retention", () => {
  it("keeps snippets for 30 days", () => {
    expect(TRASH_DAYS).toBe(30);
  });

  it("is not expired just after deletion or on day 29", () => {
    expect(isExpired(ago(0), NOW)).toBe(false);
    expect(isExpired(ago(29 * DAY), NOW)).toBe(false);
    expect(isExpired(ago(30 * DAY - 1), NOW)).toBe(false);
  });

  it("expires exactly when the 30 days are up, and after", () => {
    expect(isExpired(ago(30 * DAY), NOW)).toBe(true);
    expect(isExpired(ago(31 * DAY), NOW)).toBe(true);
    expect(isExpired(ago(400 * DAY), NOW)).toBe(true);
  });

  it("counts the days left, rounding a partial day up", () => {
    expect(daysLeft(ago(0), NOW)).toBe(30);
    expect(daysLeft(ago(1 * DAY), NOW)).toBe(29);
    expect(daysLeft(ago(29 * DAY + DAY / 2), NOW)).toBe(1);
    expect(daysLeft(ago(30 * DAY), NOW)).toBe(0);
    expect(daysLeft(ago(99 * DAY), NOW)).toBe(0);
  });

  it("treats an unreadable date as just deleted rather than deleting it", () => {
    expect(isExpired("not a date", NOW)).toBe(false);
    expect(isExpired("", NOW)).toBe(false);
    expect(daysLeft("not a date", NOW)).toBe(30);
  });
});
