import { siteConfig } from "@/config/site";
import { formatMoney } from "@/lib/format";

export function BrandMark({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#151813" stroke="#d6a538" strokeWidth="1.5" />
      <path d="m13 45 13-13 9 9 16-18" fill="none" stroke="#f6f7f2" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M41 23h10v10" fill="none" stroke="#d6a538" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="45" r="4" fill="#d6a538" />
      <circle cx="26" cy="32" r="4" fill="#d6a538" />
    </svg>
  );
}

function configuredDomain() {
  try {
    return new URL(siteConfig.siteUrl).hostname;
  } catch {
    return "linkclimb.lol";
  }
}

function LeaderRow({ rank, host, amount, featured }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      width: "100%",
      height: 70,
      padding: "0 24px",
      border: featured ? "2px solid #d6a538" : "1px solid #3c4239",
      borderRadius: 14,
      background: featured ? "#20221c" : "#191c17",
      color: "#f6f7f2",
    }}>
      <div style={{ display: "flex", width: 70, color: featured ? "#d6a538" : "#aeb7a9", fontSize: 27, fontWeight: 800 }}>#{rank}</div>
      <div style={{ display: "flex", flex: 1, fontSize: 27, fontWeight: 700 }}>{host}</div>
      <div style={{ display: "flex", color: featured ? "#d6a538" : "#f6f7f2", fontSize: 29, fontWeight: 900 }}>{amount}</div>
    </div>
  );
}

export default function SocialCard({ listing = null }) {
  const domain = configuredDomain();
  const hostSize = listing ? Math.max(40, 64 - Math.max(0, listing.host.length - 18)) : 64;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "56px 64px 48px",
      background: "#151813",
      color: "#f6f7f2",
      fontFamily: "Arial, Helvetica, sans-serif",
      position: "relative",
    }}>
      <div style={{ display: "flex", position: "absolute", top: 0, right: 82, width: 8, height: 630, background: "#275c3b" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <BrandMark size={72} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 900, letterSpacing: "0.08em" }}>{siteConfig.siteName.toUpperCase()}</div>
          <div style={{ display: "flex", color: "#aeb7a9", fontSize: 18 }}>THE OPEN PAY-TO-RANK BOARD</div>
        </div>
      </div>

      {listing ? (
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", paddingBottom: 4 }}>
          <div style={{ display: "flex", maxWidth: 930, color: "#f6f7f2", fontSize: hostSize, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{listing.host}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 34, marginTop: 36 }}>
            <div style={{ display: "flex", color: "#d6a538", fontSize: 92, fontWeight: 900, lineHeight: 1 }}>#{listing.overall_rank}</div>
            <div style={{ display: "flex", flexDirection: "column", paddingBottom: 7 }}>
              <div style={{ display: "flex", color: "#8f9a8b", fontSize: 19, textTransform: "uppercase", letterSpacing: "0.08em" }}>Current bid</div>
              <div style={{ display: "flex", fontSize: 42, fontWeight: 900 }}>{formatMoney(listing.bid_total_cents)}</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 62 }}>
          <div style={{ display: "flex", flex: 1, flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 65, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1 }}>{siteConfig.socialHeadline}</div>
            <div style={{ display: "flex", marginTop: 10, color: "#d6a538", fontSize: 39, fontWeight: 800 }}>{siteConfig.socialSubheadline}</div>
          </div>
          <div style={{ display: "flex", width: 520, flexDirection: "column", gap: 11 }}>
            <LeaderRow rank="1" host="yoursite.com" amount="$42" featured />
            <LeaderRow rank="2" host="example.com" amount="$31" />
            <LeaderRow rank="3" host="startup.com" amount="$18" />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", paddingTop: 18, borderTop: "1px solid #343a31", color: "#8f9a8b", fontSize: 18 }}>
        <div style={{ display: "flex" }}>Visible bids. Transparent ranking.</div>
        <div style={{ display: "flex", paddingRight: 48 }}>{domain}</div>
      </div>
    </div>
  );
}
