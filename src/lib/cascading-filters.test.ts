import { describe, it, expect } from "vitest";
import { cascadingOptions } from "./cascading-filters";

interface FakeRow {
  color: string;
  size: string;
  brand: string | null;
}

const rows: FakeRow[] = [
  { color: "Red", size: "S", brand: "A" },
  { color: "Red", size: "M", brand: "B" },
  { color: "Blue", size: "S", brand: "A" },
  { color: "Blue", size: "L", brand: null },
  { color: "Green", size: "M", brand: "C" },
];

describe("cascadingOptions", () => {
  it("returns all values when no filter is active", () => {
    const selections = { color: [], size: [], brand: [] };
    const colors = cascadingOptions(rows, selections, "color");
    expect(colors).toEqual(["Blue", "Green", "Red"]);
  });

  it("restricts options based on other selections", () => {
    const selections = { color: ["Red"], size: [], brand: [] };
    const sizes = cascadingOptions(rows, selections, "size");
    expect(sizes).toEqual(["M", "S"]);
  });

  it("excludes null values", () => {
    const selections = { color: [], size: [], brand: [] };
    const brands = cascadingOptions(rows, selections, "brand");
    expect(brands).not.toContain(null);
    expect(brands).toEqual(["A", "B", "C"]);
  });

  it("treats all-selected as no filter", () => {
    const selections = { color: ["Red", "Blue", "Green"], size: [], brand: [] };
    const sizes = cascadingOptions(rows, selections, "size");
    expect(sizes).toEqual(["L", "M", "S"]);
  });

  it("narrows correctly with multiple active filters", () => {
    const selections = { color: ["Red"], size: ["S"], brand: [] };
    const brands = cascadingOptions(rows, selections, "brand");
    expect(brands).toEqual(["A"]);
  });
});
