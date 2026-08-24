"use client";

import { useState } from "react";

export default function SafeFavicon({ host }) {
  const [failed, setFailed] = useState(false);
  const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  return (
    <span className="favicon" aria-hidden="true">
      ◎
      {!failed && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  );
}
