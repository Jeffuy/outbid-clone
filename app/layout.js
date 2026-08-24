import "@/app/globals.css";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import VisitorTracker from "@/components/VisitorTracker";

export const metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: { default: siteConfig.siteTitle, template: `%s | ${siteConfig.siteName}` },
  description: siteConfig.socialDescription,
  alternates: { canonical: siteConfig.siteUrl },
  openGraph: {
    type: "website",
    siteName: siteConfig.siteName,
    title: siteConfig.siteTitle,
    description: siteConfig.socialDescription,
    url: siteConfig.siteUrl,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: `${siteConfig.siteName} leaderboard` }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.siteTitle,
    description: siteConfig.socialDescription,
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <VisitorTracker />
        <div className="shell">
          <header className="site-header">
            <Link href="/" className="brand">{siteConfig.siteName}</Link>
            <nav className="nav" aria-label="Main navigation">
              <Link href="/stats">Stats</Link>
              <Link href="/rules">Rules</Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <span>{siteConfig.siteDescription}</span>
            <nav className="nav" aria-label="Legal navigation">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
