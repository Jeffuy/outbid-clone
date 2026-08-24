export const metadata = { title: "Rules", description: "How the pay-to-rank leaderboard works." };

export default function RulesPage() {
  return (
    <article className="content-page">
      <h1>Rules</h1>
      <p className="lede">This is a pay-to-rank board. The visible bid total—and nothing else—sets placement.</p>
      <ul>
        <li>New bids start at $1 and use whole US dollars.</li>
        <li>Higher totals rank above lower totals. Equal totals are ordered by when each total was reached; the earlier listing stays above.</li>
        <li>An existing URL pays only the difference between its current total and its new target.</li>
        <li>Rank is never permanent. Another bidder can outbid a listing at any time.</li>
        <li>Rankings change only after payment is completed. Checkout buys the selected bid total, not a guaranteed position.</li>
        <li>Outbound click counters are public.</li>
        <li>Query strings, tracking parameters, and URL fragments are removed for duplicate checking.</li>
        <li>Illegal, deceptive, malicious, or NSFW links may be blocked or removed without refund where permitted by law.</li>
        <li>Paid placement is not an endorsement and must not be marketed as guaranteed SEO or PageRank benefit.</li>
      </ul>
    </article>
  );
}
