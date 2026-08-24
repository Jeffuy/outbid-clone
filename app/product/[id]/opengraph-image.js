import { ImageResponse } from "next/og";
import SocialCard from "@/components/SocialCard";
import { getListing } from "@/lib/leaderboard";

export const alt = "Leaderboard position and current bid";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function ProductOpenGraphImage({ params }) {
  const { id } = await params;
  let listing = null;
  try {
    listing = await getListing(id);
  } catch {
    // The default card is a safe fallback when listing data is unavailable.
  }
  return new ImageResponse(<SocialCard listing={listing} />, size);
}
