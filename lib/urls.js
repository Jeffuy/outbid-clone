import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
  "buff.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "tiny.one",
]);

const BLOCKED_IPV4 = new BlockList();
const BLOCKED_IPV6 = new BlockList();
const PUBLIC_SPECIAL_IPV6 = new BlockList();
for (const address of ["2001:1::1", "2001:1::2", "2001:1::3"]) {
  PUBLIC_SPECIAL_IPV6.addAddress(address, "ipv6");
}
for (const [network, prefix] of [
  ["2001:3::", 32],
  ["2001:4:112::", 48],
  ["2001:20::", 28],
  ["2001:30::", 28],
]) {
  PUBLIC_SPECIAL_IPV6.addSubnet(network, prefix, "ipv6");
}
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  BLOCKED_IPV4.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["100:0:0:1::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
}

function isPrivateIp(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (!family) return false;
  if (family === 4) return BLOCKED_IPV4.check(ip, "ipv4");
  if (PUBLIC_SPECIAL_IPV6.check(ip, "ipv6")) return false;
  return BLOCKED_IPV6.check(ip, "ipv6");
}

export function normalizeUrl(input) {
  if (typeof input !== "string") throw new Error("Enter a valid public URL.");

  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) throw new Error("Enter a valid public URL.");

  const explicitHttp = /^https?:\/\//i.test(trimmed);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !explicitHttp) {
    throw new Error("Only public http:// or https:// URLs are allowed.");
  }

  let url;
  try {
    url = new URL(explicitHttp ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Enter a valid public URL.");
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only public http:// or https:// URLs are allowed.");
  }
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!url.hostname || url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
    throw new Error("Local or private URLs are not allowed.");
  }
  if (SHORTENERS.has(url.hostname.replace(/^www\./, ""))) throw new Error("Link shorteners are not allowed.");
  url.hash = "";
  url.search = "";
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");

  const displayUrl = url.toString();
  const key = new URL(displayUrl);
  key.hostname = key.hostname.replace(/^www\./, "");
  return { displayUrl, normalizedUrl: key.toString(), host: key.hostname };
}

export async function assertPublicDestination(urlLike) {
  await resolvePublicAddresses(urlLike);
}

export async function resolvePublicAddresses(urlLike) {
  const url = typeof urlLike === "string" ? new URL(urlLike) : urlLike;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const family = isIP(hostname);
  if (family) {
    if (isPrivateIp(hostname)) throw new Error("Private destinations are not allowed.");
    return [{ address: hostname, family }];
  }
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("That website could not be resolved.");
  }
  const publicAddresses = addresses.filter(({ address }) => !isPrivateIp(address));
  if (!publicAddresses.length) {
    throw new Error("Private destinations are not allowed.");
  }
  return publicAddresses.map(({ address, family: addressFamily }) => ({ address, family: addressFamily }));
}

export async function validateSubmittedUrl(input) {
  const normalized = normalizeUrl(input);
  await assertPublicDestination(normalized.displayUrl);
  return normalized;
}
