const DEFAULT_CDN = "https://cdn.storeos.dev";

export function readConfig() {
  const el = document.getElementById("storeos-config");
  let parsed = {};
  try {
    parsed = el ? JSON.parse(el.textContent || "{}") : {};
  } catch {
    parsed = {};
  }
  const tenant =
    parsed.tenant ||
    document.body?.id?.replace(/^storeos-shop-/, "") ||
    "";
  return {
    tenant,
    currency: parsed.currency || "BDT",
    apiBase: (parsed.apiBase || "").replace(/\/$/, ""),
    cdnBase: (parsed.cdnBase || DEFAULT_CDN).replace(/\/$/, ""),
  };
}

export function cartIdKey(tenant) {
  return `storeos__cid_${tenant}`;
}

export function readCookie(name) {
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function writeCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function newCartId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cart_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
