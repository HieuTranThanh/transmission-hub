import { describe, it, expect } from "vitest";
import { ilikePattern, orFilterValue } from "./search-utils";

describe("ilikePattern", () => {
  it("wraps value in % for ILIKE", () => {
    expect(ilikePattern("test")).toBe("%test%");
  });

  it("escapes underscore", () => {
    expect(ilikePattern("my_var")).toBe("%my\\_var%");
  });

  it("strips dangerous characters", () => {
    const result = ilikePattern("a,b(c)d%e");
    expect(result).not.toContain(",");
    expect(result).not.toContain("(");
    expect(result).not.toContain(")");
  });

  it("trims input", () => {
    expect(ilikePattern("  hello  ")).toBe("%hello%");
  });
});

describe("orFilterValue", () => {
  it("double-quotes simple value", () => {
    expect(orFilterValue("hello")).toBe('"hello"');
  });

  it("escapes embedded quotes", () => {
    expect(orFilterValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("escapes backslashes", () => {
    expect(orFilterValue("a\\b")).toBe('"a\\\\b"');
  });
});
