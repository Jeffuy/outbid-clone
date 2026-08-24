"use client";

import { useEffect } from "react";

export default function VisitorTracker() {
  useEffect(() => {
    fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => {});
    const timer = setInterval(() => {
      fetch("/api/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    }, 60_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
