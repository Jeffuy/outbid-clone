import Link from "next/link";

export const metadata = { title: "Payment cancelled", robots: { index: false, follow: false } };

export default function PaymentCancelPage() {
  return <div className="notice"><h1>Payment cancelled</h1><p>No ranking changes were made.</p><Link href="/">Back to the board</Link></div>;
}
