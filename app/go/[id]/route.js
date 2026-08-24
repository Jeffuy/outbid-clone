import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.redirect(new URL("/", _request.url), 302);
  const { data, error } = await supabase.rpc("increment_listing_click", { listing_uuid: id });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.destination_url) return NextResponse.redirect(new URL("/", _request.url), 302);
  return NextResponse.redirect(result.destination_url, 302);
}
