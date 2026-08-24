import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkRateLimit, isValidUuid } from "@/lib/rate-limit";

export async function POST(request) {
  const visitorId = request.cookies.get("visitor_id")?.value;
  if (!isValidUuid(visitorId)) return new NextResponse(null, { status: 204 });
  const rateLimit = await checkRateLimit(request, { scope: "heartbeat", limit: 20, windowSeconds: 600, subject: visitorId });
  if (rateLimit === null) return new NextResponse(null, { status: 204 });
  if (!rateLimit) {
    return new NextResponse(null, { status: 429 });
  }
  const supabase = getSupabase();
  if (!supabase) return new NextResponse(null, { status: 204 });
  const { error } = await supabase.rpc("record_visit", { visitor_uuid: visitorId, count_page_view: false });
  if (error) console.error("Heartbeat failed", { code: error.code });
  return new NextResponse(null, { status: 204 });
}
