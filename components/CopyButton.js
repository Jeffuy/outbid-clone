"use client";

import { useState } from "react";

export default function CopyButton() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return <button className="button secondary" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>;
}
