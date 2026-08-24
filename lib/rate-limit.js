import "server-only";
import { createHash } from "node:crypto";
import { getSupabase } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function requestIdentity(request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "unknown").slice(0, 128);
}

export function hashIdentity(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export async function checkRateLimit(request, { scope, limit, windowSeconds, subject = "" }) {
  const supabase = getSupabase();
  if (!supabase) return true;
  const identity = requestIdentity(request);
  const keyHash = hashIdentity(`${scope}|${identity}|${subject}`);
  const { data, error } = await supabase.rpc("check_rate_limit", {
    limit_key: keyHash,
    max_requests: limit,
    window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate limit check failed", { scope, code: error.code });
    return null;
  }
  return data === true;
}
