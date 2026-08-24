import { NextResponse } from "next/server";
import { captureAndComplete } from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { orderId } = await request.json();
    const result = await captureAndComplete(orderId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Capture failed", { name: error.name, status: error.status });
    const stale = error.message?.includes("stale");
    return NextResponse.json({ error: stale ? error.message : "We could not confirm the payment. If PayPal charged you, contact the operator." }, { status: 400 });
  }
}
