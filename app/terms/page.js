import { siteConfig } from "@/config/site";

export const metadata = { title: "Terms", description: "Basic terms for using the leaderboard." };

export default function TermsPage() {
  return (
    <article className="content-page">
      <h1>Terms</h1>
      <p className="lede">By submitting a link or making a payment, you agree to these terms and the <a href="/rules">board rules</a>.</p>
      <h2>Paid placement</h2>
      <p>Payment purchases a visible bid total. Placement can change at any time and is not a promise of traffic, sales, endorsement, SEO value, or permanent rank.</p>
      <h2>Your link</h2>
      <p>You must have the right to submit the URL and must not submit unlawful, harmful, deceptive, infringing, or adult content. Listings may be blocked for safety or compliance.</p>
      <h2>Payments and availability</h2>
      <p>Payments are processed by PayPal. The service is provided as available; temporary outages or metadata errors may occur.</p>
      <h2>Operator</h2>
      <p>{siteConfig.operatorName}<br />{siteConfig.operatorAddress}<br /><a href={`mailto:${siteConfig.contactEmail}`}>{siteConfig.contactEmail}</a></p>
    </article>
  );
}
