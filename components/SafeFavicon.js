"use client";

import { useState } from "react";

export default function SafeFavicon({ host }) {
  const [provider, setProvider] = useState(0);
  const sources = [
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${host}`)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
  ];
  const letter = host.replace(/^www\./i, "").match(/[a-z0-9]/i)?.[0]?.toUpperCase() || "?";

  return (
    <span className="favicon" aria-hidden="true">
      {provider < sources.length ? (
        <img
          src={sources[provider]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setProvider((current) => current + 1)}
        />
      ) : (
        <span className="favicon-letter">{letter}</span>
      )}
    </span>
  );
}
