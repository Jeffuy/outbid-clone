import { siteConfig } from "@/config/site";

export const metadata = { title: "Privacy", description: "What data the leaderboard records and why." };

export default function PrivacyPage() {
  return (
    <article className="content-page">
      <h1>Privacy</h1>
      <p className="lede">We collect only the data needed to run the public board, measure its traffic, and process bids.</p>
      <h2>Anonymous traffic data</h2>
      <p>We set an anonymous visitor UUID cookie. We store that ID with first-seen time, last-seen time, and a page-view count. A lightweight heartbeat updates last-seen time so the public online count can be estimated.</p>
      <h2>Public counters</h2>
      <p>Outbound visits pass through our redirect route, which increments the listing’s public click counter.</p>
      <h2>Payments and storage</h2>
      <p>PayPal processes payment details. We store PayPal order and capture references, bid amounts, payment status, submitted URLs, and timestamps in Supabase. We do not receive or store payment card details.</p>
      <h2>Contact</h2>
      <p>Questions can be sent to <a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a>. Operator: {siteConfig.operatorName}, {siteConfig.operatorAddress}.</p>
    </article>
  );
}
