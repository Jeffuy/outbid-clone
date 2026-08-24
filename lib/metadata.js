import "server-only";
import { assertPublicDestination } from "@/lib/urls";

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

function decode(value = "") {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag, name) {
  return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] || "";
}

function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = attr(tag, "name") || attr(tag, "property");
    if (name.toLowerCase() === key.toLowerCase()) return decode(attr(tag, "content"));
  }
  return "";
}

async function safeFetchPage(startUrl) {
  let current = new URL(startUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicDestination(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankBoardBot/1.0)" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid redirect");
      current = new URL(location, current);
      if (!['http:', 'https:'].includes(current.protocol)) throw new Error("Invalid redirect");
      continue;
    }
    if (!response.ok) throw new Error("Metadata request failed");
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) throw new Error("Not HTML");

    const reader = response.body?.getReader();
    if (!reader) return { html: "", finalUrl: current };
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value.subarray(0, Math.max(0, MAX_BYTES - (size - value.byteLength))));
    }
    reader.cancel().catch(() => {});
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), finalUrl: current };
  }
  throw new Error("Too many redirects");
}

export async function fetchWebsiteMetadata(displayUrl, fallbackHost) {
  const fallback = {
    title: fallbackHost,
    description: null,
    faviconUrl: new URL("/favicon.ico", displayUrl).toString(),
  };
  try {
    const { html, finalUrl } = await safeFetchPage(displayUrl);
    const title = meta(html, "og:title") || decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || fallbackHost;
    const description = meta(html, "og:description") || meta(html, "description") || null;
    const links = html.match(/<link\b[^>]*>/gi) || [];
    const iconTag = links.find((tag) => /(?:^|\s)icon(?:\s|$)/i.test(attr(tag, "rel")));
    const iconHref = iconTag ? attr(iconTag, "href") : "";
    let faviconUrl = new URL("/favicon.ico", finalUrl).toString();
    if (iconHref) {
      try {
        const candidate = new URL(iconHref, finalUrl);
        if (!['http:', 'https:'].includes(candidate.protocol)) throw new Error("Invalid icon protocol");
        await assertPublicDestination(candidate);
        faviconUrl = candidate.toString();
      } catch {
        // Keep the same-origin fallback when a discovered icon is unsafe.
      }
    }
    return {
      title: title.slice(0, 180),
      description: description?.slice(0, 500) || null,
      faviconUrl,
    };
  } catch (error) {
    console.info("Metadata unavailable", { host: fallbackHost, reason: error.message });
    return fallback;
  }
}
