import "server-only";

export function getListingMetadata(host) {
  return { title: host, description: null, faviconUrl: null };
}
