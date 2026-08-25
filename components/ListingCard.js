import { TrackedAnchor, TrackedLink } from "@/components/AnalyticsEvents";
import { formatMoney, formatNumber, timeAgo } from "@/lib/format";
import SafeFavicon from "@/components/SafeFavicon";

export default function ListingCard({ listing, rank }) {
  const premium = rank <= 3;
  const target = Number(listing.bid_total_cents) / 100 + 1;
  const claimHref = `/?amount=${target}#bid`;
  const goHref = `/go/${listing.id}`;
  const outboundProps = { target: "_blank", rel: "sponsored nofollow noopener" };
  const visitParams = {
    listing_id: listing.id,
    hostname: listing.host,
    rank,
    source: "leaderboard",
  };
  const outbidParams = {
    ...visitParams,
    current_bid_usd: Number(listing.bid_total_cents) / 100,
    target_bid_usd: target,
  };

  return (
    <article className={`listing ${premium ? `top top-${rank}` : ""}`}>
      <span className="rank">#{rank}</span>
      <div className="identity">
        <TrackedAnchor className="favicon-link" href={goHref} aria-label={`Visit ${listing.host}`} eventName="listing_visit" eventParams={visitParams} {...outboundProps}>
          <SafeFavicon host={listing.host} />
        </TrackedAnchor>
        <div className="listing-copy">
          <h2 className="listing-title">
            <TrackedAnchor className="site-outbound-link" href={goHref} eventName="listing_visit" eventParams={visitParams} {...outboundProps}>
              {listing.title || listing.host}
            </TrackedAnchor>
          </h2>
          {listing.description && <p className="description">{listing.description}</p>}
          <p className="meta">
            {timeAgo(listing.last_bid_at)} ·{" "}
            <TrackedAnchor className="hostname-link" href={goHref} eventName="listing_visit" eventParams={visitParams} {...outboundProps}>{listing.host}</TrackedAnchor> ·{" "}
            {formatNumber(listing.click_count)} clicks ·{" "}
            <TrackedLink className="detail-link" href={`/product/${listing.id}`} eventName="listing_details_click" eventParams={{ listing_id: listing.id, hostname: listing.host, rank }}>see details</TrackedLink>
          </p>
        </div>
      </div>
      <div className="listing-action">
        <strong className="bid-total">{formatMoney(listing.bid_total_cents)}</strong>
        <TrackedLink className="claim-link" href={claimHref} eventName="outbid_click" eventParams={outbidParams}>Outbid for {formatMoney(Number(listing.bid_total_cents) + 100)}</TrackedLink>
      </div>
    </article>
  );
}
