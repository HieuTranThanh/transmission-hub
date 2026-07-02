import { describe, it, expect } from "vitest";
import { nextSortState, compareValues } from "./DataTable";

describe("nextSortState", () => {
  it("starts with ascending", () => {
    expect(nextSortState(null, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("toggles from asc to desc", () => {
    expect(nextSortState({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
  });

  it("toggles from desc to null", () => {
    expect(nextSortState({ key: "name", dir: "desc" }, "name")).toBeNull();
  });

  it("resets to asc when switching columns", () => {
    expect(nextSortState({ key: "name", dir: "desc" }, "age")).toEqual({ key: "age", dir: "asc" });
  });
});

describe("compareValues", () => {
  it("sorts numbers numerically", () => {
    expect(compareValues(1, 2)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(5, 5)).toBe(0);
  });

  it("sorts strings with locale comparison", () => {
    expect(compareValues("apple", "banana")).toBeLessThan(0);
    expect(compareValues("banana", "apple")).toBeGreaterThan(0);
  });

  it("sorts null/empty last", () => {
    expect(compareValues(null, "a")).toBe(1);
    expect(compareValues("a", null)).toBe(-1);
    expect(compareValues(null, null)).toBe(0);
    expect(compareValues(undefined, "a")).toBe(1);
    expect(compareValues("", "a")).toBe(1);
  });

  it("handles numeric strings", () => {
    expect(compareValues("2", "10")).toBeLessThan(0);
  });
});
