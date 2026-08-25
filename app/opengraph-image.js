import { ImageResponse } from "next/og";
import SocialCard from "@/components/SocialCard";
import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.siteName} — ${siteConfig.socialHeadline} ${siteConfig.socialSubheadline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<SocialCard />, size);
}
