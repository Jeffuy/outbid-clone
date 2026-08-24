"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
        if (!response.ok) throw new Error(result.error || "We could not confirm the payment.");
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
