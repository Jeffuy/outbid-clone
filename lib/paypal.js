import "server-only";
import { siteConfig } from "@/config/site";

const baseUrl = process.env.PAYPAL_ENV === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

let cachedToken;
let tokenExpiresAt = 0;

export class PayPalError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new PayPalError("PayPal is not configured", 503);

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PayPalError("Could not connect to PayPal", response.status);
  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + Math.max(30, Number(data.expires_in) - 60) * 1000;
  return cachedToken;
}

async function paypalFetch(path, options = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
    signal: options.signal || AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new PayPalError(data?.message || "PayPal request failed", response.status);
  return data;
}

export async function createPayPalOrder(chargeAmountCents, paymentId) {
  const origin = siteConfig.siteUrl.replace(/\/$/, "");
  return paypalFetch("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": paymentId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        custom_id: paymentId,
        amount: { currency_code: "USD", value: (chargeAmountCents / 100).toFixed(2) },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "LinkClimb",
            landing_page: "GUEST_CHECKOUT",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${origin}/payment/success`,
            cancel_url: `${origin}/payment/cancel`,
          },
        },
      },
    }),
  });
}

export function capturePayPalOrder(orderId, paymentId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `c-${paymentId.replaceAll("-", "")}` },
    body: "{}",
  });
}

export function getPayPalOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

export async function verifyPayPalWebhook(headers, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new PayPalError("PayPal webhook is not configured", 503);
  const fields = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (fields.some((field) => !headers.get(field))) return false;
  const result = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  return result.verification_status === "SUCCESS";
}
