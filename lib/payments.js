import "server-only";
import { capturePayPalOrder, getPayPalOrder, PayPalError } from "@/lib/paypal";
import { fetchWebsiteMetadata } from "@/lib/metadata";
import { requireSupabase } from "@/lib/supabase";

function completedCapture(order) {
  for (const unit of order?.purchase_units || []) {
    const capture = unit?.payments?.captures?.find((item) => item.status === "COMPLETED");
    if (capture) return { capture, unit };
  }
  return null;
}

export async function completeVerifiedOrder(order) {
  const found = completedCapture(order);
  if (order?.status !== "COMPLETED" || !found) throw new Error("Payment was not completed.");

  const { capture, unit } = found;
  const paymentId = capture.custom_id || unit.custom_id;
  const supabase = requireSupabase();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,status,submitted_url,normalized_url,target_total_cents,charge_amount_cents,paypal_order_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment || payment.paypal_order_id !== order.id) throw new Error("Payment record was not found.");
  if (payment.status === "completed") return { completed: true, paymentId: payment.id };

  const capturedCents = Math.round(Number(capture.amount?.value) * 100);
  if (
    capture.amount?.currency_code !== "USD" ||
    !Number.isSafeInteger(capturedCents) ||
    capturedCents !== Number(payment.charge_amount_cents)
  ) throw new Error("Payment amount did not match.");

  const host = new URL(payment.normalized_url).hostname;
  const metadata = await fetchWebsiteMetadata(payment.submitted_url, host);
  const { data, error } = await supabase.rpc("complete_payment", {
    payment_uuid: payment.id,
    expected_order_id: order.id,
    capture_id: capture.id,
    listing_url: payment.submitted_url,
    listing_host: host,
    listing_title: metadata.title,
    listing_description: metadata.description,
    listing_favicon_url: metadata.faviconUrl,
  });
  if (error) {
    console.error("Payment completion failed", { code: error.code, paymentId: payment.id });
    throw new Error("Payment could not be applied.");
  }
  return { completed: true, paymentId: payment.id, listingId: data };
}

export async function captureAndComplete(orderId) {
  if (!orderId || typeof orderId !== "string") throw new Error("Missing PayPal order.");
  const supabase = requireSupabase();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,status,normalized_url,target_total_cents")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (paymentError || !payment) throw new Error("Payment record was not found.");
  if (payment.status === "completed") return { completed: true, paymentId: payment.id };
  if (payment.status !== "pending") throw new Error("Payment is not pending.");

  const { data: listing } = await supabase
    .from("listings")
    .select("bid_total_cents")
    .eq("normalized_url", payment.normalized_url)
    .maybeSingle();
  if (listing && Number(listing.bid_total_cents) >= Number(payment.target_total_cents)) {
    await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id).eq("status", "pending");
    throw new Error("That bid target is stale. No payment was captured.");
  }

  let order;
  try {
    order = await capturePayPalOrder(orderId);
  } catch (error) {
    if (!(error instanceof PayPalError) || ![409, 422].includes(error.status)) throw error;
    order = await getPayPalOrder(orderId);
  }
  return completeVerifiedOrder(order);
}

export async function completeWebhookOrder(orderId) {
  const order = await getPayPalOrder(orderId);
  return completeVerifiedOrder(order);
}
