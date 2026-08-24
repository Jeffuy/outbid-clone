import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request) {
  const supabase = getSupabase();
  if (!supabase) return new NextResponse(null, { status: 204 });
  const visitorId = request.cookies.get("visitor_id")?.value || randomUUID();
  const { error } = await supabase.rpc("record_visit", { visitor_uuid: visitorId, count_page_view: true });
  if (error) {
    console.error("Visit tracking failed", { code: error.code });
    return new NextResponse(null, { status: 503 });
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set("visitor_id", visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
