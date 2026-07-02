// Minimal IPv4/CIDR helpers shared between the frontend (search query
// detection) and the import script (gateway/subnet rule checks).

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipToInt(ip: string): number | null {
  const m = IPV4_RE.exec(ip.trim());
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export function isValidIpv4(ip: string): boolean {
  return ipToInt(ip) !== null;
}

const CIDR_RE = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/;

function parseCidr(value: string): { ip: string; prefixLength: number } | null {
  const m = CIDR_RE.exec(value.trim());
  if (!m) return null;
  const prefixLength = Number(m[2]);
  if (prefixLength < 0 || prefixLength > 32) return null;
  if (ipToInt(m[1]) === null) return null;
  return { ip: m[1], prefixLength };
}

export function isValidCidr(value: string): boolean {
  return parseCidr(value) !== null;
}

function maskFor(prefixLength: number): number {
  return prefixLength === 0 ? 0 : (~0 << (32 - prefixLength)) >>> 0;
}

function intToIp(value: number): string {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");
}

/** True if `ip` falls within `cidr` (e.g. "10.0.0.1" in "10.0.0.0/30"). */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const ipInt = ipToInt(ip);
  const net = parseCidr(cidr);
  if (ipInt === null || net === null) return false;
  const netInt = ipToInt(net.ip);
  if (netInt === null) return false;
  const mask = maskFor(net.prefixLength);
  return ((ipInt & mask) >>> 0) === ((netInt & mask) >>> 0);
}

/** Normalizes a CIDR to its network base address (clears host bits), e.g.
 * "10.250.60.137/30" -> "10.250.60.136/30". Postgres `cidr`/`inet` casts
 * reject values with bits set to the right of the mask, so any CIDR sent to
 * the DB (RPC arg or `network` equality) must be normalized first. Returns
 * null for input that isn't a valid CIDR. */
export function cidrToNetwork(value: string): string | null {
  const net = parseCidr(value);
  if (net === null) return null;
  const ipInt = ipToInt(net.ip);
  if (ipInt === null) return null;
  const base = (ipInt & maskFor(net.prefixLength)) >>> 0;
  return `${intToIp(base)}/${net.prefixLength}`;
}
