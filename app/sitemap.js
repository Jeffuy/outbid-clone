import { siteConfig } from "@/config/site";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const origin = siteConfig.siteUrl.replace(/\/$/, "");
  const fixed = ["", "/stats", "/rules", "/terms", "/privacy"].map((path) => ({ url: `${origin}${path}`, changeFrequency: path === "" ? "hourly" : "monthly" }));
  const supabase = getSupabase();
  if (!supabase) return fixed;
  const { data } = await supabase.from("listings").select("id,updated_at").eq("status", "active").order("updated_at", { ascending: false }).limit(5000);
  return fixed.concat((data || []).map((listing) => ({
    url: `${origin}/product/${listing.id}`,
    lastModified: listing.updated_at,
    changeFrequency: "weekly",
  })));
}
