import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request) {
  const visitorId = request.cookies.get("visitor_id")?.value;
  const supabase = getSupabase();
  if (!visitorId || !supabase) return new NextResponse(null, { status: 204 });
  const { error } = await supabase.rpc("record_visit", { visitor_uuid: visitorId, count_page_view: false });
  if (error) console.error("Heartbeat failed", { code: error.code });
  return new NextResponse(null, { status: 204 });
}
