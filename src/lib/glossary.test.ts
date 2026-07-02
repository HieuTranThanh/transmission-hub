import { describe, it, expect } from "vitest";
import { SEVERITY_INFO, CONFIDENCE_INFO, STATUS_INFO, RULE_INFO, badgeInfo } from "./glossary";

describe("SEVERITY_INFO", () => {
  it("has entries for all severity levels", () => {
    const levels = ["Critical", "High", "Medium", "Low", "Info"] as const;
    for (const level of levels) {
      expect(SEVERITY_INFO[level]).toBeDefined();
      expect(SEVERITY_INFO[level].label).toBeTruthy();
      expect(SEVERITY_INFO[level].description).toBeTruthy();
    }
  });
});

describe("CONFIDENCE_INFO", () => {
  it("has entries for all confidence levels", () => {
    const levels = ["High", "Medium", "Low"] as const;
    for (const level of levels) {
      expect(CONFIDENCE_INFO[level]).toBeDefined();
      expect(CONFIDENCE_INFO[level].label).toBeTruthy();
    }
  });
});

describe("STATUS_INFO", () => {
  it("has entries for key status values", () => {
    const keys = ["active", "admin-down", "link-down", "up/no-peer", "failed", "established", "full"];
    for (const key of keys) {
      expect(STATUS_INFO[key]).toBeDefined();
      expect(STATUS_INFO[key].label).toBeTruthy();
    }
  });
});

describe("RULE_INFO", () => {
  it("has entries for all expected rule codes", () => {
    const codes = [
      "IP_DUP_ACTIVE_ACTIVE",
      "IP_DUP_ACTIVE_MIXED",
      "IP_DUP_INACTIVE",
      "NETWORK_OVERUSED",
      "GATEWAY_OUTSIDE_SUBNET",
      "STATUS_STATE_MISMATCH",
      "PREFIX_SERVICE_MISMATCH",
      "BGP_PEER_NOT_ESTABLISHED",
      "BGP_DEVICE_WARNING_ERROR",
      "BGP_HIGH_FLAPS",
      "BGP_LOW_ACTIVE_RATIO",
      "OSPF_NEIGHBOR_NOT_FULL",
      "OSPF_NEIGHBOR_DISAPPEARED",
      "OSPF_COLLECTION_ERROR",
    ];
    for (const code of codes) {
      expect(RULE_INFO[code]).toBeDefined();
      expect(RULE_INFO[code].label).toBeTruthy();
      expect(RULE_INFO[code].category).toBeTruthy();
    }
  });
});

describe("badgeInfo", () => {
  it("resolves status values case-insensitively", () => {
    expect(badgeInfo("Active")).toBeDefined();
    expect(badgeInfo("active")).toBeDefined();
    expect(badgeInfo("ACTIVE")).toBeDefined();
  });

  it("resolves confidence levels", () => {
    expect(badgeInfo("High")?.label).toBe(CONFIDENCE_INFO.High.label);
    expect(badgeInfo("Medium")?.label).toBe(CONFIDENCE_INFO.Medium.label);
    expect(badgeInfo("Low")?.label).toBe(CONFIDENCE_INFO.Low.label);
  });

  it("returns undefined for unknown values", () => {
    expect(badgeInfo("unknown-xyz")).toBeUndefined();
  });
});
