"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export default function PaymentCapture({ orderId }) {
  const started = useRef(false);
  const [state, setState] = useState({ status: "loading", message: "Confirming your payment…" });

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;
    fetch("/api/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.completed !== true) throw new Error(result.error || "We could not confirm the payment.");
        const chargeAmountCents = Number(result.analytics?.chargeAmountCents);
        const targetTotalCents = Number(result.analytics?.targetTotalCents);
        const hostname = result.analytics?.hostname;
        if (
          typeof result.paymentId === "string" && result.paymentId &&
          typeof hostname === "string" && hostname &&
          Number.isSafeInteger(chargeAmountCents) && chargeAmountCents > 0 &&
          Number.isSafeInteger(targetTotalCents) && targetTotalCents >= chargeAmountCents
        ) {
          const chargeUsd = chargeAmountCents / 100;
          trackEvent("purchase", {
            transaction_id: result.paymentId,
            currency: "USD",
            value: chargeUsd,
            listing_id: result.listingId,
            target_bid_usd: targetTotalCents / 100,
            items: [{
              item_id: hostname,
              item_name: hostname,
              item_category: "paid_listing",
              price: chargeUsd,
              quantity: 1,
            }],
          });
        }
        setState({ status: "done", message: "Payment complete. Your listing is live." });
      })
      .catch((error) => setState({ status: "error", message: error.message }));
  }, [orderId]);

  if (!orderId) return <div className="notice"><h1>Missing payment</h1><p>PayPal did not return an order reference.</p><Link href="/">Back to the board</Link></div>;
  return (
    <div className="notice" aria-live="polite">
      <h1>{state.status === "done" ? "You’re on the board" : state.status === "error" ? "Payment needs attention" : "Finalizing bid"}</h1>
      <p>{state.message}</p>
      {state.status !== "loading" && <Link href="/">Back to the board</Link>}
    </div>
  );
}
