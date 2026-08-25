import "server-only";
import http from "node:http";
import https from "node:https";
import { normalizeUrl, resolvePublicAddresses } from "@/lib/urls";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 4_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "RankPayMetadataBot/1.0 (+https://rankpay.lol)";

function abortError() {
  const error = new Error("Metadata request timed out.");
  error.name = "AbortError";
  return error;
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function requestPage(url, addresses, signal) {
  const client = url.protocol === "https:" ? https : http;
  const pinned = addresses.find(({ family }) => family === 4) || addresses[0];

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };
    const request = client.request(url, {
      method: "GET",
      agent: false,
      signal,
      lookup(hostname, options, callback) {
        const expected = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
        if (hostname.replace(/^\[|\]$/g, "").toLowerCase() !== expected) {
          callback(new Error("Unexpected DNS lookup."));
          return;
        }
        if (typeof options === "object" && options.all) {
          callback(null, [{ address: pinned.address, family: pinned.family }]);
          return;
        }
        callback(null, pinned.address, pinned.family);
      },
      headers: {
        Accept: "text/html, application/xhtml+xml;q=0.9",
        "Accept-Encoding": "identity",
        Connection: "close",
        "User-Agent": USER_AGENT,
      },
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers.location;
        response.resume();
        finish(resolve, { status, location });
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        finish(reject, new Error("Metadata response was not successful."));
        return;
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!/^(text\/html|application\/xhtml\+xml)(?:\s*;|$)/.test(contentType)) {
        response.resume();
        finish(reject, new Error("Metadata response was not HTML."));
        return;
      }
      const contentEncoding = String(response.headers["content-encoding"] || "identity").toLowerCase();
      if (contentEncoding !== "identity") {
        response.resume();
        finish(reject, new Error("Compressed metadata is not accepted."));
        return;
      }
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
        response.resume();
        finish(reject, new Error("Metadata response was too large."));
        return;
      }

      const chunks = [];
      let received = 0;
      response.on("data", (chunk) => {
        if (settled) return;
        received += chunk.length;
        if (received > MAX_BYTES) {
          response.destroy();
          finish(reject, new Error("Metadata response was too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => finish(resolve, {
        status,
        contentType,
        body: Buffer.concat(chunks, received),
      }));
      response.on("error", (error) => finish(reject, error));
    });
    request.on("error", (error) => finish(reject, error));
    request.end();
  });
}

async function fetchHtml(url, signal, redirectCount = 0) {
  if (signal.aborted) throw abortError();
  const normalized = normalizeUrl(url.toString());
  const currentUrl = new URL(normalized.displayUrl);
  const addresses = await withAbort(resolvePublicAddresses(currentUrl), signal);
  const response = await requestPage(currentUrl, addresses, signal);

  if (REDIRECT_STATUSES.has(response.status)) {
    if (!response.location || redirectCount >= MAX_REDIRECTS) throw new Error("Metadata redirect was rejected.");
    const redirectUrl = new URL(response.location, currentUrl);
    return fetchHtml(redirectUrl, signal, redirectCount + 1);
  }

  const charset = response.contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1] || "utf-8";
  const safeCharset = /^(utf-?8|us-ascii|iso-8859-1|windows-1252)$/i.test(charset) ? charset : "utf-8";
  return new TextDecoder(safeCharset).decode(response.body);
}

const ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
};

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const number = code[1]?.toLowerCase() === "x"
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      if (!Number.isInteger(number) || number < 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) return "";
      return String.fromCodePoint(number);
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function cleanText(value, maxRawLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxRawLength) return null;
  let text = decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/u.test(text)) return null;
  text = text.normalize("NFC").replace(/\s+/gu, " ").trim();
  return text || null;
}

function trimDescription(value) {
  const text = cleanText(value, 4_096);
  if (!text) return null;
  const characters = [...text];
  const words = text.split(" ");
  if (characters.length <= 160 && words.length <= 22) return text;

  const kept = [];
  for (const word of words.slice(0, 22)) {
    const candidate = [...kept, word].join(" ");
    if ([...candidate].length > 159) break;
    kept.push(word);
  }
  return kept.length ? `${kept.join(" ")}…` : null;
}

function trimTitle(value, hostname) {
  let text = cleanText(value, 1_024);
  if (!text) return hostname;
  const parts = text.split(/\s+[|–—-]\s+/u);
  if (parts.length === 2 && parts[0].localeCompare(parts[1], undefined, { sensitivity: "accent" }) === 0) {
    text = parts[0];
  }
  if ([...text].length <= 80) return text;
  const prefix = [...text].slice(0, 79).join("");
  const boundary = prefix.lastIndexOf(" ");
  return `${(boundary >= 20 ? prefix.slice(0, boundary) : prefix).trimEnd()}…`;
}

function metaValues(html) {
  const values = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = {};
    const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let match;
    while ((match = pattern.exec(tag))) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }
    const key = (attributes.property || attributes.name || "").toLowerCase();
    if (key && attributes.content && !values.has(key)) values.set(key, attributes.content);
  }
  return values;
}

function extractMetadata(html, hostname) {
  const values = metaValues(html);
  const rawTitle = values.get("og:title")
    || values.get("twitter:title")
    || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawDescription = values.get("og:description")
    || values.get("description")
    || values.get("twitter:description");
  return {
    title: trimTitle(rawTitle, hostname),
    description: trimDescription(rawDescription),
  };
}

export async function getListingMetadata(urlLike) {
  let hostname;
  try {
    const normalized = normalizeUrl(urlLike);
    hostname = normalized.host;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const html = await fetchHtml(new URL(normalized.displayUrl), controller.signal);
      return extractMetadata(html, hostname);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { title: hostname || "Website", description: null };
  }
}
