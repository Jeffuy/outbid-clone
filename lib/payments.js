import "server-only";
import { capturePayPalOrder, getPayPalOrder, PayPalError } from "@/lib/paypal";
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

function completedResult(payment, listingId = payment?.listing_id) {
  const result = {
    completed: true,
    paymentId: payment?.id,
    listingId: listingId || null,
  };
  try {
    const hostname = new URL(payment.normalized_url).hostname;
    const chargeAmountCents = Number(payment.charge_amount_cents);
    const targetTotalCents = Number(payment.target_total_cents);
    if (
      hostname &&
      Number.isSafeInteger(chargeAmountCents) &&
      chargeAmountCents > 0 &&
      Number.isSafeInteger(targetTotalCents) &&
      targetTotalCents >= chargeAmountCents
    ) {
      result.analytics = { hostname, chargeAmountCents, targetTotalCents };
    }
  } catch {
    // Analytics data must never affect a completed payment response.
  }
  return result;
}

async function refreshedCompletedResult(supabase, paymentId) {
  try {
    const { data } = await supabase
      .from("payments")
      .select("id,listing_id,normalized_url,target_total_cents,charge_amount_cents")
      .eq("id", paymentId)
      .maybeSingle();
    if (data) return completedResult(data);
  } catch {
    // The financial operation is already complete; analytics enrichment is optional.
  }
  return { completed: true, paymentId, listingId: null };
}

async function markDefinitiveFailure(supabase, paymentId, orderId) {
  const { data, error } = await supabase.rpc("fail_payment_capture", {
    payment_uuid: paymentId,
    expected_order_id: orderId,
  });
  if (error) {
    console.error("Payment failure transition failed", { code: error.code, paymentId });
    throw new PaymentFlowError("failure_state_uncertain", VERIFYING_MESSAGE, 409);
  }
  return data;
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
    return completedResult(payment);
  }
  if (payment.status !== "capturing") {
    throw new PaymentFlowError("payment_not_capturing", VERIFYING_MESSAGE, 409);
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
  const { data, error } = await supabase.rpc("complete_payment", {
    payment_uuid: payment.id,
    expected_order_id: order.id,
    capture_id: capture.id,
    listing_url: payment.submitted_url,
    listing_host: host,
  });
  if (error) {
    console.error("Payment completion failed", { code: error.code, paymentId: payment.id });
    throw new PaymentFlowError("completion_uncertain", VERIFYING_MESSAGE, 409);
  }
  return completedResult(payment, data);
}

async function captureCapturingPayment(supabase, payment, orderId) {
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
        const state = await markDefinitiveFailure(supabase, payment.id, orderId);
        if (state === "completed") return refreshedCompletedResult(supabase, payment.id);
        if (state !== "failed") throw new PaymentFlowError("failure_state_uncertain", VERIFYING_MESSAGE, 409);
        throw new PaymentFlowError("capture_rejected", "PayPal did not complete the payment. You were not charged.", 400);
      }
      throw new PaymentFlowError("capture_uncertain", VERIFYING_MESSAGE, 409);
    }
  }
  return completeVerifiedOrder(order);
}

async function reconcileCapturingPayment(supabase, payment, orderId) {
  let order;
  try {
    order = await getPayPalOrder(orderId);
  } catch {
    throw new PaymentFlowError("capture_uncertain", VERIFYING_MESSAGE, 409);
  }
  if (completedCapture(order)) return completeVerifiedOrder(order);
  if (order.status === "APPROVED") return captureCapturingPayment(supabase, payment, orderId);
  if (order.status === "VOIDED") {
    const state = await markDefinitiveFailure(supabase, payment.id, orderId);
    if (state === "completed") return refreshedCompletedResult(supabase, payment.id);
    if (state !== "failed") throw new PaymentFlowError("failure_state_uncertain", VERIFYING_MESSAGE, 409);
    throw new PaymentFlowError("capture_rejected", "PayPal did not complete the payment. You were not charged.", 400);
  }
  throw new PaymentFlowError("capture_uncertain", VERIFYING_MESSAGE, 409);
}

export async function captureAndComplete(orderId) {
  if (typeof orderId !== "string" || !/^[a-z0-9]{8,64}$/i.test(orderId)) {
    throw new PaymentFlowError("invalid_order", "Missing or invalid PayPal order.");
  }

  const supabase = requireSupabase();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id,listing_id,status,normalized_url,target_total_cents,charge_amount_cents")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (paymentError || !payment) throw new PaymentFlowError("payment_record_missing", "Payment record was not found.", 404);
  if (payment.status === "completed") return completedResult(payment);
  if (payment.status === "capturing") return reconcileCapturingPayment(supabase, payment, orderId);
  if (["stale", "expired"].includes(payment.status)) throw new PaymentFlowError("stale_bid", STALE_BID_MESSAGE, 409);
  if (payment.status !== "pending") throw new PaymentFlowError("payment_not_pending", "This payment can no longer be captured.", 409);

  const { data: transition, error: transitionError } = await supabase.rpc("begin_payment_capture", {
    payment_uuid: payment.id,
    expected_order_id: orderId,
  });
  if (transitionError) {
    console.error("Capture transition failed", { code: transitionError.code, paymentId: payment.id });
    throw new PaymentFlowError("capture_unavailable", "Payment capture is temporarily unavailable. Please try again.", 503);
  }
  if (transition === "completed") return refreshedCompletedResult(supabase, payment.id);
  if (transition === "capturing") return reconcileCapturingPayment(supabase, payment, orderId);
  if (["stale", "expired"].includes(transition)) throw new PaymentFlowError("stale_bid", STALE_BID_MESSAGE, 409);
  if (transition === "blocked") throw new PaymentFlowError("capture_blocked", "A payment for this URL is still being verified. Please try again shortly.", 409);
  if (transition !== "acquired") throw new PaymentFlowError("payment_not_pending", "This payment can no longer be captured.", 409);

  return captureCapturingPayment(supabase, payment, orderId);
}

export async function completeWebhookOrder(orderId) {
  const order = await getPayPalOrder(orderId);
  return completeVerifiedOrder(order);
}
