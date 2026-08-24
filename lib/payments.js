import "server-only";
import { capturePayPalOrder, getPayPalOrder, PayPalError } from "@/lib/paypal";
import { getListingMetadata } from "@/lib/metadata";
import { requireSupabase } from "@/lib/supabase";

export const STALE_BID_MESSAGE = "The bid changed while you were checking out. You were not charged. Please try again with the updated amount.";
export const VERIFYING_MESSAGE = "Your payment is being verified. Do not submit another payment.";

export class PaymentFlowError extends Error {
  constructor(code, publicMessage, status = 400) {
    super(code);
    this.code = code;
    this.publicMessage = publicMessage;
    this.status = status;
  }
}

function completedCapture(order) {
  for (const unit of order?.purchase_units || []) {
    const capture = unit?.payments?.captures?.find((item) => item.status === "COMPLETED");
    if (capture) return { capture, unit };
  }
  return null;
}

async function releaseLease(supabase, paymentId) {
  const { error } = await supabase.rpc("release_capture_lease", { payment_uuid: paymentId });
  if (error) console.error("Capture lease release failed", { code: error.code, paymentId });
}

export async function completeVerifiedOrder(order) {
  const found = completedCapture(order);
  if (order?.status !== "COMPLETED" || !found) {
    throw new PaymentFlowError("payment_not_completed", VERIFYING_MESSAGE, 409);
  }

  const { capture, unit } = found;
  const paymentId = capture.custom_id || unit.custom_id;
  const supabase = requireSupabase();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,listing_id,status,submitted_url,normalized_url,base_total_cents,target_total_cents,charge_amount_cents,paypal_order_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment || payment.paypal_order_id !== order.id) {
    throw new PaymentFlowError("payment_record_missing", VERIFYING_MESSAGE, 409);
  }
  if (payment.status === "completed") {
    return { completed: true, paymentId: payment.id, listingId: payment.listing_id };
  }
  if (payment.status !== "pending") {
    throw new PaymentFlowError("payment_not_pending", VERIFYING_MESSAGE, 409);
  }

  const capturedCents = Math.round(Number(capture.amount?.value) * 100);
  if (
    capture.amount?.currency_code !== "USD" ||
    !Number.isSafeInteger(capturedCents) ||
    capturedCents !== Number(payment.charge_amount_cents) ||
    Number(payment.charge_amount_cents) !== Number(payment.target_total_cents) - Number(payment.base_total_cents)
  ) {
    throw new PaymentFlowError("payment_amount_mismatch", VERIFYING_MESSAGE, 409);
  }

  const host = new URL(payment.normalized_url).hostname;
  const metadata = getListingMetadata(host);
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
    throw new PaymentFlowError("completion_uncertain", VERIFYING_MESSAGE, 409);
  }
  return { completed: true, paymentId: payment.id, listingId: data };
}

export async function captureAndComplete(orderId) {
  if (typeof orderId !== "string" || !/^[a-z0-9]{8,64}$/i.test(orderId)) {
    throw new PaymentFlowError("invalid_order", "Missing or invalid PayPal order.");
  }

  const supabase = requireSupabase();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,status")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (paymentError || !payment) throw new PaymentFlowError("payment_record_missing", "Payment record was not found.", 404);
  if (payment.status === "completed") return { completed: true, paymentId: payment.id };
  if (payment.status !== "pending") {
    const message = payment.status === "stale" || payment.status === "expired" ? STALE_BID_MESSAGE : "This payment can no longer be captured.";
    throw new PaymentFlowError("payment_not_pending", message, 409);
  }

  const { data: lease, error: leaseError } = await supabase.rpc("acquire_capture_lease", {
    payment_uuid: payment.id,
    expected_order_id: orderId,
  });
  if (leaseError) {
    console.error("Capture lease acquisition failed", { code: leaseError.code, paymentId: payment.id });
    throw new PaymentFlowError("lease_unavailable", "Payment capture is temporarily unavailable. Please try again.", 503);
  }
  if (lease === "completed") return { completed: true, paymentId: payment.id };
  if (["stale", "expired"].includes(lease)) throw new PaymentFlowError("stale_bid", STALE_BID_MESSAGE, 409);
  if (lease === "busy") throw new PaymentFlowError("capture_busy", "Another checkout is being processed for this URL. Please try again shortly.", 409);
  if (lease !== "acquired") throw new PaymentFlowError("payment_not_pending", "This payment can no longer be captured.", 409);

  let order;
  try {
    order = await capturePayPalOrder(orderId, payment.id);
  } catch (captureError) {
    try {
      order = await getPayPalOrder(orderId);
    } catch {
      throw new PaymentFlowError("capture_uncertain", VERIFYING_MESSAGE, 409);
    }

    if (!completedCapture(order)) {
      const definitiveFailure = captureError instanceof PayPalError && captureError.status >= 400 && captureError.status < 500 && ![409, 422].includes(captureError.status);
      if (definitiveFailure) {
        await releaseLease(supabase, payment.id);
        throw new PaymentFlowError("capture_rejected", "PayPal did not complete the payment. You were not charged.", 400);
      }
      throw new PaymentFlowError("capture_uncertain", VERIFYING_MESSAGE, 409);
    }
  }

  return completeVerifiedOrder(order);
}

export async function completeWebhookOrder(orderId) {
  const order = await getPayPalOrder(orderId);
  return completeVerifiedOrder(order);
}
