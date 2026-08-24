import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd",
  "buff.ly", "cutt.ly", "shorturl.at", "rebrand.ly", "tiny.one",
]);

function isPrivateIp(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (ip === "::1" || ip === "::" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("::ffff:")) return isPrivateIp(ip.slice(7));
  if (!isIP(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  return (
    parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] >= 224)
  );
}

export function normalizeUrl(input) {
  if (typeof input !== "string" || input.length > 2048) throw new Error("Enter a valid public URL.");
  let url;
  try {
    url = new URL(input.trim());
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
  const url = typeof urlLike === "string" ? new URL(urlLike) : urlLike;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private destinations are not allowed.");
    return;
  }
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("That website could not be resolved.");
  }
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("Private destinations are not allowed.");
  }
}

export async function validateSubmittedUrl(input) {
  const normalized = normalizeUrl(input);
  await assertPublicDestination(normalized.displayUrl);
  return normalized;
}
