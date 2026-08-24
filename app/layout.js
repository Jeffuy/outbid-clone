import "@/app/globals.css";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import VisitorTracker from "@/components/VisitorTracker";

export const metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: { default: siteConfig.siteName, template: `%s · ${siteConfig.siteName}` },
  description: siteConfig.siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: siteConfig.siteName,
    title: siteConfig.siteName,
    description: siteConfig.siteDescription,
    url: "/",
  },
  twitter: { card: "summary", title: siteConfig.siteName, description: siteConfig.siteDescription },
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
