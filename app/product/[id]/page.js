import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/CopyButton";
import SafeFavicon from "@/components/SafeFavicon";
import { siteConfig } from "@/config/site";
import { formatMoney, formatNumber } from "@/lib/format";
import { getListing } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found" };
  const title = listing.title || listing.host;
  const description = listing.description || `${title} is ranked #${listing.overall_rank} on ${siteConfig.siteName}.`;
  return {
    title,
    description,
    alternates: { canonical: `/product/${listing.id}` },
    openGraph: { title, description, url: `/product/${listing.id}`, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function ProductPage({ params }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();
  const nextBid = Number(listing.bid_total_cents) + 100;
  return (
    <article className="content-page">
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
        <a className="button" href={`/go/${listing.id}`} rel="sponsored nofollow">Visit product</a>
        <Link className="button" href={`/?amount=${nextBid / 100}#bid`}>Outbid for {formatMoney(nextBid)}</Link>
        <CopyButton />
      </div>
      <dl className="details">
        <dt>First listed</dt><dd>{new Date(listing.created_at).toLocaleDateString("en-US", { dateStyle: "long" })}</dd>
        <dt>Last bid</dt><dd>{new Date(listing.last_bid_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</dd>
        <dt>Website</dt><dd>{listing.host}</dd>
      </dl>
    </article>
  );
}
