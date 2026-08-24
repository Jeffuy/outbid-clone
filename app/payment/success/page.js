import PaymentCapture from "@/components/PaymentCapture";

export const metadata = { title: "Payment result", robots: { index: false, follow: false } };

export default async function PaymentSuccessPage({ searchParams }) {
  const params = await searchParams;
  return <PaymentCapture orderId={params?.token || ""} />;
}
