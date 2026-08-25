import { notFound } from "next/navigation";
import { TrackEventOnMount, TrackedAnchor, TrackedLink } from "@/components/AnalyticsEvents";
import CopyButton from "@/components/CopyButton";
import SafeFavicon from "@/components/SafeFavicon";
import { siteConfig } from "@/config/site";
import { formatMoney, formatNumber } from "@/lib/format";
import { getListing } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found", robots: { index: false, follow: false } };
  const title = `${listing.host} | #${listing.overall_rank} on ${siteConfig.siteName}`;
  const description = `${listing.host} is currently ranked #${listing.overall_rank} with a bid of ${formatMoney(listing.bid_total_cents)} on ${siteConfig.siteName}.`;
  const image = `/product/${listing.id}/opengraph-image`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/product/${listing.id}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/product/${listing.id}`,
      images: [{ url: image, width: 1200, height: 630, alt: `${listing.host} leaderboard position` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const nextBid = Number(listing.bid_total_cents) + 100;
  const currentBidUsd = Number(listing.bid_total_cents) / 100;
  const targetBidUsd = nextBid / 100;
  return (
    <article className="content-page">
      <TrackEventOnMount
        name="view_item"
        params={{
          currency: "USD",
          value: currentBidUsd,
          rank: listing.overall_rank,
          items: [{
            item_id: listing.id,
            item_name: listing.host,
            item_category: "ranked_listing",
            price: currentBidUsd,
            quantity: 1,
          }],
        }}
      />
      <div className="product-head">
        <SafeFavicon host={listing.host} />
        <div><h1>{listing.title || listing.host}</h1><span>{listing.host}</span></div>
      </div>
      {listing.description && <p className="product-description">{listing.description}</p>}
      <div className="product-metrics">
        <div className="metric"><strong>{formatMoney(listing.bid_total_cents)}</strong><span>Spent / Current bid</span></div>
        <div className="metric"><strong>#{listing.overall_rank}</strong><span>Overall · of {formatNumber(listing.active_count)} on the board</span></div>
        <div className="metric"><strong>{formatNumber(listing.click_count)}</strong><span>Outbound clicks</span></div>
      </div>
      <div className="actions">
        <TrackedAnchor
          className="button"
          href={`/go/${listing.id}`}
          target="_blank"
          rel="sponsored nofollow noopener"
          eventName="listing_visit"
          eventParams={{ listing_id: listing.id, hostname: listing.host, rank: listing.overall_rank, source: "product" }}
        >
          Visit product
        </TrackedAnchor>
        <TrackedLink
          className="button"
          href={`/?amount=${targetBidUsd}#bid`}
          eventName="outbid_click"
          eventParams={{
            source: "product",
            listing_id: listing.id,
            hostname: listing.host,
            rank: listing.overall_rank,
            current_bid_usd: currentBidUsd,
            target_bid_usd: targetBidUsd,
          }}
        >
          Outbid for {formatMoney(nextBid)}
        </TrackedLink>
        <CopyButton listingId={listing.id} />
      </div>
      <dl className="details">
        <dt>First listed</dt><dd>{new Date(listing.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}</dd>
        <dt>Last bid</dt><dd>{new Date(listing.last_bid_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</dd>
        <dt>Website</dt><dd>{listing.host}</dd>
      </dl>
    </article>
  );
}
