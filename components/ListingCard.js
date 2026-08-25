import Link from "next/link";
import { formatMoney, formatNumber, timeAgo } from "@/lib/format";
import SafeFavicon from "@/components/SafeFavicon";

export default function ListingCard({ listing, rank }) {
  const premium = rank <= 3;
  const target = Number(listing.bid_total_cents) / 100 + 1;
  const claimHref = `/?amount=${target}#bid`;
  const goHref = `/go/${listing.id}`;
  const outboundProps = { target: "_blank", rel: "sponsored nofollow noopener" };

  return (
    <article className={`listing ${premium ? `top top-${rank}` : ""}`}>
      <span className="rank">#{rank}</span>
      <div className="identity">
        <a className="favicon-link" href={goHref} aria-label={`Visit ${listing.host}`} {...outboundProps}>
          <SafeFavicon host={listing.host} />
        </a>
        <div className="listing-copy">
          <h2 className="listing-title">
            <a className="site-outbound-link" href={goHref} {...outboundProps}>
              {listing.title || listing.host}
            </a>
          </h2>
          {listing.description && <p className="description">{listing.description}</p>}
          <p className="meta">
            {timeAgo(listing.last_bid_at)} ·{" "}
            <a className="hostname-link" href={goHref} {...outboundProps}>{listing.host}</a> ·{" "}
            {formatNumber(listing.click_count)} clicks ·{" "}
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
