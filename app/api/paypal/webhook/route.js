import { NextResponse } from "next/server";
import { completeWebhookOrder } from "@/lib/payments";
import { verifyPayPalWebhook } from "@/lib/paypal";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const event = await request.json();
    const verified = await verifyPayPalWebhook(request.headers, event);
    if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return NextResponse.json({ received: true });

    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId) return NextResponse.json({ received: true });
    await completeWebhookOrder(orderId);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handling failed", { name: error.name, status: error.status });
    return NextResponse.json({ error: "Webhook could not be handled" }, { status: 500 });
  }
}
