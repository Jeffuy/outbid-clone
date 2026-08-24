import { NextResponse } from "next/server";
import { captureAndComplete, PaymentFlowError, VERIFYING_MESSAGE } from "@/lib/payments";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const rateLimit = await checkRateLimit(request, { scope: "capture", limit: 20, windowSeconds: 600 });
    if (rateLimit === null) return NextResponse.json({ error: "Payment verification is temporarily unavailable." }, { status: 503 });
    if (!rateLimit) {
      return NextResponse.json({ error: "Too many payment checks. Please try again later." }, { status: 429 });
    }
    const { orderId } = await request.json();
    const result = await captureAndComplete(orderId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Capture failed", { name: error.name, status: error.status });
    const message = error instanceof PaymentFlowError ? error.publicMessage : VERIFYING_MESSAGE;
    const status = error instanceof PaymentFlowError ? error.status : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
