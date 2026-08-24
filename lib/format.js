export function formatMoney(cents = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

export function formatNumber(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value));
}

export function timeAgo(value) {
  if (!value) return "just now";
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const units = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${label}${count === 1 ? "" : "s"} ago`;
    }
  }
  return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
}
