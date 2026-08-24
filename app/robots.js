import { siteConfig } from "@/config/site";

export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/payment/"] },
    sitemap: `${siteConfig.siteUrl.replace(/\/$/, "")}/sitemap.xml`,
  };
}
