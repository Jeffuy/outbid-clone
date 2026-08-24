import { NextResponse } from "next/server";
import { createPayPalOrder } from "@/lib/paypal";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSupabase } from "@/lib/supabase";
import { validateSubmittedUrl } from "@/lib/urls";

export const runtime = "nodejs";

function publicError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  let paymentId;
  let supabase;
  try {
    const rateLimit = await checkRateLimit(request, { scope: "create-order", limit: 10, windowSeconds: 600 });
    if (rateLimit === null) return publicError("Checkout is temporarily unavailable. Please try again.", 503);
    if (!rateLimit) {
      return publicError("Too many checkout attempts. Please try again later.", 429);
    }
    const body = await request.json();
    if (!Number.isInteger(body.targetTotal)) return publicError("Bid total must be a whole US dollar amount.");
    if (body.targetTotal < 1 || body.targetTotal > 999999) return publicError("Bid total must be between $1 and $999,999.");

    const submitted = await validateSubmittedUrl(body.url);
    supabase = requireSupabase();
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("id,bid_total_cents,status")
      .eq("normalized_url", submitted.normalizedUrl)
      .maybeSingle();
    if (listingError) throw listingError;
    if (listing?.status === "blocked") return publicError("That URL cannot be listed.");

    const targetCents = body.targetTotal * 100;
    const currentCents = Number(listing?.bid_total_cents || 0);
    if (targetCents <= currentCents) {
      return publicError(`Choose a total of at least $${currentCents / 100 + 1} for this URL.`, 409);
    }
    const chargeCents = targetCents - currentCents;
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        listing_id: listing?.id || null,
        submitted_url: submitted.displayUrl,
        normalized_url: submitted.normalizedUrl,
        base_total_cents: currentCents,
        target_total_cents: targetCents,
        charge_amount_cents: chargeCents,
        status: "pending",
      })
      .select("id")
      .single();
    if (paymentError) throw paymentError;
    paymentId = payment.id;

    const order = await createPayPalOrder(chargeCents, payment.id);
    const approvalUrl = order.links?.find((link) => ["approve", "payer-action"].includes(link.rel))?.href;
    if (!order.id || !approvalUrl) throw new Error("PayPal did not provide an approval link");
    const { error: updateError } = await supabase.from("payments").update({ paypal_order_id: order.id }).eq("id", payment.id).eq("status", "pending");
    if (updateError) throw updateError;
    return NextResponse.json({ approvalUrl });
  } catch (error) {
    if (paymentId && supabase) await supabase.from("payments").update({ status: "failed" }).eq("id", paymentId).is("paypal_order_id", null);
    const message = error.message?.toLowerCase() || "";
    if (message.includes("private") || message.includes("public") || message.includes("url") || message.includes("resolved") || message.includes("shortener")) {
      return publicError(error.message);
    }
    console.error("Create order failed", { name: error.name, status: error.status });
    return publicError("Payment could not be started. Please try again.", 503);
  }
}
