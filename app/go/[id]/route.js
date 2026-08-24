import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkRateLimit, hashIdentity, isValidUuid, requestIdentity } from "@/lib/rate-limit";

export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/", _request.url), 302);
  const rateLimit = await checkRateLimit(_request, { scope: "go", limit: 60, windowSeconds: 60, subject: id });
  if (rateLimit === false) {
    return new NextResponse("Too many requests", { status: 429 });
  }
  const visitorId = _request.cookies.get("visitor_id")?.value;
  const identity = isValidUuid(visitorId) ? `visitor:${visitorId}` : `ip:${requestIdentity(_request)}`;
  const { data, error } = await supabase.rpc("track_listing_click", {
    listing_uuid: id,
    identity_hash: hashIdentity(identity),
  });
  const result = Array.isArray(data) ? data[0] : data;
  if (error) {
    console.error("Click tracking failed", { code: error.code });
    const fallback = await supabase.from("listings").select("url").eq("id", id).eq("status", "active").maybeSingle();
    if (fallback.data?.url) return NextResponse.redirect(fallback.data.url, 302);
  }
  if (!result?.destination_url) return NextResponse.redirect(new URL("/", _request.url), 302);
  return NextResponse.redirect(result.destination_url, 302);
}
