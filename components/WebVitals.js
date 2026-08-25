"use client";

import { useReportWebVitals } from "next/web-vitals";
import { trackEvent } from "@/lib/analytics";

export default function WebVitals() {
  useReportWebVitals((metric) => {
    const metricValue = metric.name === "CLS"
      ? Math.round(metric.value * 1000)
      : Math.round(metric.value);

    trackEvent("web_vital", {
      metric_name: metric.name,
      metric_value: metricValue,
      metric_id: metric.id,
      rating: metric.rating,
    });
  });

  return null;
}
