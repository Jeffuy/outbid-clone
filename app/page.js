import Link from "next/link";
import BidBox from "@/components/BidBox";
import ListingCard from "@/components/ListingCard";
import Pagination from "@/components/Pagination";
import { formatMoney, formatNumber, timeAgo } from "@/lib/format";
import { getLatestActivity, getLeaderboard, getPublicStats, getTopBidCents, PAGE_SIZE } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(params?.page || "1", 10) || 1);
  const [board, stats, activity, topBid] = await Promise.all([
    getLeaderboard(requestedPage),
    getPublicStats(),
    getLatestActivity(),
    getTopBidCents(),
  ]);
  const suggested = Math.min(999999, Math.floor(topBid / 100) + 1);
  const requestedAmount = Number.parseInt(params?.amount || "", 10);
  const initialAmount = Number.isInteger(requestedAmount) && requestedAmount >= 1 && requestedAmount <= 999999 ? requestedAmount : suggested;
  const offset = (board.page - 1) * PAGE_SIZE;
  const topThree = board.page === 1 ? board.listings.slice(0, 3) : [];
  const remaining = board.page === 1 ? board.listings.slice(3) : board.listings;

  return (
    <>
      <p className="stats-line">
        {formatNumber(stats.online_now)} online · {formatNumber(stats.visitors_since_launch)} visitors since launch ·{" "}
        <Link href="/stats">View live stats</Link>
      </p>
      <BidBox initialAmount={initialAmount} />
      <h2 className="section-heading">Leaderboard</h2>
      {board.unavailable ? (
        <div className="empty">The leaderboard is temporarily unavailable.</div>
      ) : board.count === 0 ? (
        <div className="empty">The board is empty. $1 takes #1.</div>
      ) : (
        <>
          <div className="board">
            {topThree.map((listing, index) => <ListingCard key={listing.id} listing={listing} rank={index + 1} />)}
          </div>
          {board.page === 1 && activity.length > 0 && (
            <section className="activity">
              <h2>Latest activity</h2>
              {activity.map((item) => (
                <p key={item.id}>
                  {item.host} at #{item.overall_rank} · {formatMoney(item.target_total_cents)} · {timeAgo(item.completed_at)}
                </p>
              ))}
            </section>
          )}
          <div className="board" style={{ marginTop: remaining.length ? 12 : 0 }}>
            {remaining.map((listing, index) => (
              <ListingCard key={listing.id} listing={listing} rank={offset + index + (board.page === 1 ? 4 : 1)} />
            ))}
          </div>
          <Pagination page={board.page} pages={board.pages} />
        </>
      )}
    </>
  );
}
