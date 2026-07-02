import { describe, it, expect } from "vitest";
import { formatDateTime, formatNumber, valueOrDash, todayStamp, batchDelta } from "./format";

describe("formatDateTime", () => {
  it("formats a valid ISO date string", () => {
    const result = formatDateTime("2024-01-15T10:30:00Z");
    expect(result).toContain("2024");
    expect(result).not.toBe("—");
  });

  it("returns dash for null/undefined", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
  });

  it("returns original string for invalid date", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatNumber", () => {
  it("formats numbers with locale separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(0)).toBe("0");
  });

  it("returns dash for null/undefined", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });
});

describe("valueOrDash", () => {
  it("returns the value as string", () => {
    expect(valueOrDash("hello")).toBe("hello");
    expect(valueOrDash(42)).toBe("42");
  });

  it("returns dash for empty values", () => {
    expect(valueOrDash(null)).toBe("—");
    expect(valueOrDash(undefined)).toBe("—");
    expect(valueOrDash("")).toBe("—");
  });
});

describe("todayStamp", () => {
  it("returns YYYY-MM-DD format", () => {
    const stamp = todayStamp();
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("batchDelta", () => {
  it("returns null when no previous batch", () => {
    expect(batchDelta(false, 10, 5)).toBeNull();
    expect(batchDelta(false, 10, 0)).toBeNull();
  });

  it("computes delta when previous batch exists", () => {
    expect(batchDelta(true, 10, 5)).toBe(5);
    expect(batchDelta(true, 3, 7)).toBe(-4);
    expect(batchDelta(true, 5, 5)).toBe(0);
  });

  it("returns null when values are null/undefined", () => {
    expect(batchDelta(true, null, 5)).toBeNull();
    expect(batchDelta(true, 10, null)).toBeNull();
    expect(batchDelta(true, undefined, 5)).toBeNull();
  });
});
