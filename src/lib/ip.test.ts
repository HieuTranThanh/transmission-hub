import { describe, it, expect } from "vitest";
import { isValidIpv4, isValidCidr, isIpInCidr, cidrToNetwork } from "./ip";

describe("isValidIpv4", () => {
  it("accepts valid IPv4 addresses", () => {
    expect(isValidIpv4("10.0.0.1")).toBe(true);
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("0.0.0.0")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(isValidIpv4("")).toBe(false);
    expect(isValidIpv4("256.0.0.1")).toBe(false);
    expect(isValidIpv4("10.0.0")).toBe(false);
    expect(isValidIpv4("10.0.0.1.1")).toBe(false);
    expect(isValidIpv4("abc")).toBe(false);
    expect(isValidIpv4("10.0.0.1/24")).toBe(false);
  });

  it("trims whitespace", () => {
    expect(isValidIpv4(" 10.0.0.1 ")).toBe(true);
  });
});

describe("isValidCidr", () => {
  it("accepts valid CIDR notation", () => {
    expect(isValidCidr("10.0.0.0/24")).toBe(true);
    expect(isValidCidr("192.168.1.0/30")).toBe(true);
    expect(isValidCidr("10.0.0.1/32")).toBe(true);
    expect(isValidCidr("0.0.0.0/0")).toBe(true);
  });

  it("rejects invalid CIDR", () => {
    expect(isValidCidr("10.0.0.1")).toBe(false);
    expect(isValidCidr("10.0.0.0/33")).toBe(false);
    expect(isValidCidr("10.0.0.0/-1")).toBe(false);
    expect(isValidCidr("abc/24")).toBe(false);
    expect(isValidCidr("")).toBe(false);
  });
});

describe("isIpInCidr", () => {
  it("returns true when IP is in subnet", () => {
    expect(isIpInCidr("10.0.0.1", "10.0.0.0/24")).toBe(true);
    expect(isIpInCidr("10.250.60.137", "10.250.60.136/30")).toBe(true);
    expect(isIpInCidr("192.168.1.1", "192.168.1.1/32")).toBe(true);
  });

  it("returns false when IP is not in subnet", () => {
    expect(isIpInCidr("10.0.1.1", "10.0.0.0/24")).toBe(false);
    expect(isIpInCidr("10.250.60.140", "10.250.60.136/30")).toBe(false);
  });

  it("returns false for invalid inputs", () => {
    expect(isIpInCidr("invalid", "10.0.0.0/24")).toBe(false);
    expect(isIpInCidr("10.0.0.1", "invalid")).toBe(false);
  });
});

describe("cidrToNetwork", () => {
  it("normalizes CIDR to network base address", () => {
    expect(cidrToNetwork("10.250.60.137/30")).toBe("10.250.60.136/30");
    expect(cidrToNetwork("192.168.1.0/24")).toBe("192.168.1.0/24");
    expect(cidrToNetwork("10.0.0.1/32")).toBe("10.0.0.1/32");
    expect(cidrToNetwork("0.0.0.0/0")).toBe("0.0.0.0/0");
  });

  it("returns null for invalid input", () => {
    expect(cidrToNetwork("invalid")).toBeNull();
    expect(cidrToNetwork("")).toBeNull();
    expect(cidrToNetwork("10.0.0.1")).toBeNull();
  });
});
