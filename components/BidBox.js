"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

const MIN = 1;
const MAX = 999999;

function checkoutErrorReason(status, message) {
  if (status === 429) return "rate_limited";
  if (status === 409 && message?.startsWith("Choose a total")) return "stale_bid";
  if (status >= 500 || status === 409) return "payment_unavailable";
  if (status >= 400) return "invalid_url";
  return "unknown";
}

export default function BidBox({ initialAmount }) {
  const [amount, setAmount] = useState(Math.min(MAX, Math.max(MIN, Number(initialAmount) || MIN)));
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateAmount(value) {
    const next = Number(value);
    setAmount(Number.isFinite(next) ? Math.min(MAX, Math.max(MIN, Math.trunc(next))) : MIN);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    trackEvent("bid_submit", { target_bid_usd: amount });

    let result;
    let response;
    try {
      response = await fetch("/api/paypal/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, targetTotal: amount }),
      });
      result = await response.json();
      if (!response.ok || !result.approvalUrl) throw new Error(result.error || "Payment could not be started.");
    } catch (caught) {
      trackEvent("checkout_error", {
        reason: checkoutErrorReason(response?.status, result?.error),
      });
      setError(caught.message || "Payment could not be started.");
      setLoading(false);
      return;
    }

    const chargeUsd = Number(result.analytics?.chargeAmountCents) / 100;
    const targetBidUsd = Number(result.analytics?.targetTotalCents) / 100;
    const hostname = result.analytics?.hostname;
    trackEvent("begin_checkout", {
      currency: "USD",
      value: chargeUsd,
      target_bid_usd: targetBidUsd,
      hostname,
      items: [{
        item_id: hostname,
        item_name: hostname,
        item_category: "paid_listing",
        price: chargeUsd,
        quantity: 1,
      }],
    });
    window.location.assign(result.approvalUrl);
  }

  return (
    <section className="bid-box" id="bid" aria-labelledby="bid-heading">
      <h1 className="bid-title" id="bid-heading">Claim #1 for</h1>
      <form onSubmit={submit}>
        <div className="bid-controls">
          <button className="amount-button" type="button" onClick={() => updateAmount(amount - 1)} aria-label="Decrease bid">−</button>
          <label className="amount-wrap">
            <span aria-hidden="true">$</span>
            <input className="amount-input" type="number" min={MIN} max={MAX} step="1" value={amount} onChange={(event) => updateAmount(event.target.value)} aria-label="Target bid total in US dollars" required />
          </label>
          <button className="amount-button" type="button" onClick={() => updateAmount(amount + 1)} aria-label="Increase bid">+</button>
          <input
            className="url-input"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="example.com"
            aria-label="Your product URL"
            required
          />
          <button className="primary-button" type="submit" disabled={loading}>{loading ? "Opening PayPal…" : "Outbid"}</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
      <p className="bid-note"><strong>Bid higher. Climb higher.</strong>{" "}Paying less than the #1 price still puts you on the board wherever that bid can take you. You buy a bid total, not a permanent rank.</p>
    </section>
  );
}
