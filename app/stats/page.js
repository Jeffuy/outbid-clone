import Link from "next/link";
import { formatMoney, formatNumber } from "@/lib/format";
import { getPublicStats, getStatsLeaders } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live stats", description: "Public traffic, payment, and leaderboard totals." };

const metrics = [
  ["Visitors since launch", "visitors_since_launch", "number"],
  ["Online now", "online_now", "number"],
  ["Visitors today", "visitors_today", "number"],
  ["Page views", "page_views", "number"],
  ["Outbound clicks", "outbound_clicks", "number"],
  ["Total raised", "total_raised_cents", "money"],
  ["Completed bids", "completed_bids", "number"],
  ["Active listings", "active_listings", "number"],
];

function Leaders({ rows, value }) {
  if (!rows.length) return <p>No listings yet.</p>;
  return (
    <ol className="leader-list">
      {rows.map((listing, index) => (
        <li key={listing.id}>
          <span>#{index + 1}</span>
          <Link href={`/product/${listing.id}`}>{listing.title || listing.host}</Link>
          <strong>{value === "clicks" ? `${formatNumber(listing.click_count)} clicks` : formatMoney(listing.bid_total_cents)}</strong>
        </li>
      ))}
    </ol>
  );
}

export default async function StatsPage() {
  const [stats, leaders] = await Promise.all([getPublicStats(), getStatsLeaders()]);
  return (
    <article className="content-page">
      <h1>Live stats</h1>
      <p className="lede">Traffic, clicks, payments, and listings—public by default.</p>
      <div className="stats-grid">
        {metrics.map(([label, key, type]) => (
          <div className="stat" key={key}>
            <strong>{type === "money" ? formatMoney(stats[key]) : formatNumber(stats[key])}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <h2>Top 10 by clicks</h2>
      <Leaders rows={leaders.byClicks} value="clicks" />
      <h2>Top 10 by current bid</h2>
      <Leaders rows={leaders.byBid} value="bid" />
    </article>
  );
}
