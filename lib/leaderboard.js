import "server-only";
import { getSupabase } from "@/lib/supabase";

export const PAGE_SIZE = 50;

const listingFields = "id,url,normalized_url,host,title,description,favicon_url,bid_total_cents,click_count,created_at,last_bid_at,bid_reached_at";

export async function getLeaderboard(page = 1) {
  const supabase = getSupabase();
  if (!supabase) return { listings: [], count: 0, page: 1, pages: 1 };

  const safePage = Math.max(1, Number.isInteger(page) ? page : 1);
  const from = (safePage - 1) * PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("listings")
    .select(listingFields, { count: "exact" })
    .eq("status", "active")
    .order("bid_total_cents", { ascending: false })
    .order("bid_reached_at", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    console.error("Leaderboard query failed", { code: error.code });
    return { listings: [], count: 0, page: 1, pages: 1, unavailable: true };
  }
  const pages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
  if (safePage > pages) return getLeaderboard(pages);
  return { listings: data || [], count: count || 0, page: Math.min(safePage, pages), pages };
}

export async function getTopBidCents() {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { data } = await supabase
    .from("listings")
    .select("bid_total_cents")
    .eq("status", "active")
    .order("bid_total_cents", { ascending: false })
    .order("bid_reached_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return Number(data?.bid_total_cents || 0);
}

export async function getLatestActivity() {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_recent_activity");
  if (error) {
    console.error("Activity query failed", { code: error.code });
    return [];
  }
  return data || [];
}

export async function getPublicStats() {
  const supabase = getSupabase();
  const empty = {
    online_now: 0,
    visitors_since_launch: 0,
    visitors_today: 0,
    page_views: 0,
    outbound_clicks: 0,
    total_raised_cents: 0,
    completed_bids: 0,
    active_listings: 0,
  };
  if (!supabase) return empty;
  const { data, error } = await supabase.rpc("get_public_stats");
  if (error) {
    console.error("Stats query failed", { code: error.code });
    return empty;
  }
  return { ...empty, ...(Array.isArray(data) ? data[0] : data) };
}

export async function getListing(id) {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_listing_with_rank", { listing_uuid: id });
  if (error) return null;
  return Array.isArray(data) ? data[0] || null : data;
}

export async function getStatsLeaders() {
  const supabase = getSupabase();
  if (!supabase) return { byClicks: [], byBid: [] };
  const base = () => supabase.from("listings").select("id,host,title,bid_total_cents,click_count").eq("status", "active");
  const [clicks, bids] = await Promise.all([
    base().order("click_count", { ascending: false }).order("bid_total_cents", { ascending: false }).limit(10),
    base().order("bid_total_cents", { ascending: false }).order("bid_reached_at", { ascending: true }).limit(10),
  ]);
  return { byClicks: clicks.data || [], byBid: bids.data || [] };
}
