import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const ALLOWED_PORTS = new Set(["", "443"]);

function isBlockedIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  return a >= 224; // multicast and reserved
}

function isBlockedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]!; // drop any zone id
  if (addr === "::" || addr === "::1") return true;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (mapped) return isBlockedIPv4(mapped[1]!);

  const head = Number.parseInt(addr.split(":")[0] || "0", 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  return (head & 0xffc0) === 0xfe80; // fe80::/10 link local
}

/** True for loopback, private, link-local, and other non-public addresses. */
export function isBlockedAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIPv4(ip);
  if (version === 6) return isBlockedIPv6(ip);
  return true;
}

/**
 * Reject anything that could reach a non-public host, then return the parsed URL.
 * Resolves DNS because a public hostname may still point at a private address.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`not a valid URL: ${raw}`);
  }

  if (url.protocol !== "https:")
    throw new Error(`only https:// URLs are allowed, got ${url.protocol}//`);

  if (url.username || url.password)
    throw new Error("URLs with embedded credentials are not allowed");

  if (!ALLOWED_PORTS.has(url.port))
    throw new Error(`port ${url.port} is not allowed`);

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIP(host))
    throw new Error("IP-literal URLs are not allowed, use a hostname");

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`could not resolve ${host}`);
  }

  for (const { address } of addresses)
    if (isBlockedAddress(address))
      throw new Error(`${host} resolves to a non-public address (${address})`);

  return url;
}
