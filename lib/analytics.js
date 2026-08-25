"use client";

import { sendGAEvent } from "@next/third-parties/google";

const enabled = Boolean(process.env.NEXT_PUBLIC_GA_ID);
const allowedEvents = new Set([
  "begin_checkout",
  "bid_submit",
  "checkout_cancel",
  "checkout_error",
  "listing_details_click",
  "listing_visit",
  "outbid_click",
  "purchase",
  "share",
  "view_item",
  "web_vital",
]);
const allowedKeys = new Set([
  "content_type",
  "currency",
  "current_bid_usd",
  "hostname",
  "item_id",
  "items",
  "listing_id",
  "method",
  "metric_id",
  "metric_name",
  "metric_value",
  "rank",
  "rating",
  "reason",
  "source",
  "target_bid_usd",
  "transaction_id",
  "value",
]);

function safeString(value) {
  if (typeof value !== "string" || value.length > 253) return undefined;
  const unwrapped = value.replace(/^\[|\]$/g, "");
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(unwrapped);
  const isIpv6 = unwrapped.includes(":") && /^[0-9a-f:.]+$/i.test(unwrapped);
  if (isIpv4 || isIpv6) return undefined;
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : undefined;
}

function safeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeItems(items) {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, 10).map((item) => {
    const clean = {};
    for (const key of ["item_id", "item_name", "item_category"]) {
      const value = safeString(item?.[key]);
      if (value !== undefined) clean[key] = value;
    }
    for (const key of ["price", "quantity"]) {
      const value = safeNumber(item?.[key]);
      if (value !== undefined) clean[key] = value;
    }
    return clean;
  }).filter((item) => Object.keys(item).length > 0);
}

function safeParams(params) {
  const clean = {};
  for (const [key, rawValue] of Object.entries(params || {})) {
    if (!allowedKeys.has(key)) continue;
    const value = key === "items"
      ? safeItems(rawValue)
      : typeof rawValue === "number"
        ? safeNumber(rawValue)
        : safeString(rawValue);
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export function trackEvent(name, params = {}) {
  if (!enabled || typeof window === "undefined" || !allowedEvents.has(name)) return;
  try {
    sendGAEvent("event", name, safeParams(params));
  } catch {
    // Analytics is best-effort and must never affect product behavior.
  }
}

export function setAnalyticsConsent(granted) {
  if (!enabled || typeof window === "undefined") return;
  try {
    window.gtag?.("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  } catch {
    // Consent updates must remain failure-safe for a future banner.
  }
}
