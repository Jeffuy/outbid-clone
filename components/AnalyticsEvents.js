"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

export function TrackEventOnMount({ name, params }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackEvent(name, params);
  }, [name, params]);

  return null;
}

export function TrackedAnchor({ eventName, eventParams, onClick, ...props }) {
  function handleClick(event) {
    trackEvent(eventName, eventParams);
    onClick?.(event);
  }

  return <a {...props} onClick={handleClick} />;
}

export function TrackedLink({ eventName, eventParams, onClick, ...props }) {
  function handleClick(event) {
    trackEvent(eventName, eventParams);
    onClick?.(event);
  }

  return <Link {...props} onClick={handleClick} />;
}
