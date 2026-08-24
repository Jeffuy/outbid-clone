import Link from "next/link";
import { formatMoney, formatNumber, timeAgo } from "@/lib/format";

function Favicon({ listing }) {
  return (
    <span className="favicon" aria-hidden="true">
      ◎
      {listing.favicon_url && <img src={listing.favicon_url} alt="" loading="lazy" />}
    </span>
  );
}

export default function ListingCard({ listing, rank }) {
  const premium = rank <= 3;
  const target = Number(listing.bid_total_cents) / 100 + 1;
  const claimHref = `/?url=${encodeURIComponent(listing.url)}&amount=${target}#bid`;
  return (
    <article className={`listing ${premium ? `top top-${rank}` : ""}`}>
      <span className="rank">#{rank}</span>
      <div className="identity">
        <Favicon listing={listing} />
        <div className="listing-copy">
          <h2 className="listing-title">{listing.title || listing.host}</h2>
          {listing.description && <p className="description">{listing.description}</p>}
          <p className="meta">
            {timeAgo(listing.last_bid_at)} · {listing.host} · {formatNumber(listing.click_count)} clicks ·{" "}
            <Link className="detail-link" href={`/product/${listing.id}`}>see details</Link>
          </p>
        </div>
      </div>
      <div className="listing-action">
        <strong className="bid-total">{formatMoney(listing.bid_total_cents)}</strong>
        <Link className="claim-link" href={claimHref}>Outbid for {formatMoney(Number(listing.bid_total_cents) + 100)}</Link>
      </div>
    </article>
  );
}
