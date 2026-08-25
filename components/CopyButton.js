"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

export default function CopyButton({ listingId }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    trackEvent("share", {
      method: "copy_link",
      content_type: "listing",
      item_id: listingId,
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return <button className="button secondary" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>;
}
