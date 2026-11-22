/**
 * Shopper pages: sign-in (phone OTP), account, orders, profile, wishlist and
 * order tracking. Everything loads in the browser from the storefront API at
 * `shop.api_url` (`apiBase` in #storeos-config).
 *
 * The sign-in token and wishlist use the same cookie / storage keys as the
 * StoreOS React pages, so a shopper stays signed in across both.
 */
import { readConfig, readCookie } from "./config.js";

const TOKEN_MAX_AGE = 60 * 60 * 24 * 30;

export const authCookie = (tenant) => `storeos__auth_${tenant}`;

function writeToken(tenant, token) {
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${authCookie(tenant)}=${token}; path=/; samesite=strict; max-age=${TOKEN_MAX_AGE}${secure}`;
}

function clearToken(tenant) {
  document.cookie = `${authCookie(tenant)}=; path=/; max-age=0`;
}

/** Readable message from an API error body. */
function errorText(body, fallback) {
  if (!body) return fallback;
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  return (typeof message === "string" && message) || body.error || fallback;
}

/** `fetch` against the storefront API with tenant + shopper token. */
export async function api(path, { method = "GET", body, query } = {}) {
  const config = readConfig();
  const headers = { Accept: "application/json" };
  if (config.tenant) headers["x-tenant"] = config.tenant;
  const token = readCookie(authCookie(config.tenant));
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  const res = await fetch(`${config.apiBase}/api/v1${path}${qs}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(errorText(data, `Request failed (${res.status})`));
    error.status = res.status;
    throw error;
  }
  return data;
}

/* ——— helpers shared by the templates ——————————————————————————————— */

export function fileUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (typeof image.external === "string" && image.external) return image.external;
  if (typeof image.key === "string" && image.key) {
    if (/^https?:\/\//.test(image.key)) return image.key;
    return `${readConfig().cdnBase}/${image.key.replace(/^\//, "")}`;
  }
  return "";
}

function record(value) {
  return value && typeof value === "object" ? value : {};
}

export function lineName(line) {
  const row = record(line);
  const product = record(row.item ?? row.product);
  return product.name || row.name || "Item";
}

export function lineImage(line) {
  const row = record(line);
  const product = record(row.item ?? row.product);
  return fileUrl(product.image ?? row.image);
}

export function lineUnitPrice(line) {
  const row = record(line);
  const product = record(row.item ?? row.product);
  const fromProduct = Number(product.unitPrice);
  if (Number.isFinite(fromProduct) && fromProduct > 0) return fromProduct;
  const fromRow = Number(row.unitPrice);
  return Number.isFinite(fromRow) ? fromRow : 0;
}

const STATUS = {
  PENDING: { label: "Order placed", tone: "bg-amber-100 text-amber-900" },
  PROCESSING: { label: "Processing", tone: "bg-sky-100 text-sky-900" },
  SHIPMENT_IN_PROGRESS: { label: "Packed", tone: "bg-violet-100 text-violet-900" },
  SHIPMENT_IN_TRANSIT: { label: "On the way", tone: "bg-orange-100 text-orange-900" },
  SHIPMENT_DELIVERED: { label: "Delivered", tone: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Cancelled", tone: "bg-red-100 text-red-900" },
};

/** Delivery progress shown on order tracking. */
export const TRACK_STEPS = [
  "PENDING",
  "PROCESSING",
  "SHIPMENT_IN_PROGRESS",
  "SHIPMENT_IN_TRANSIT",
  "SHIPMENT_DELIVERED",
];

export function statusLabel(status) {
  return STATUS[status]?.label ?? (status ? String(status).replaceAll("_", " ").toLowerCase() : "—");
}

export function statusTone(status) {
  return STATUS[status]?.tone ?? "bg-zinc-100 text-zinc-800";
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* ——— customer store ———————————————————————————————————————————— */

/** `$store.customer`: who is signed in. Loaded once per page. */
export function createCustomerStore() {
  const config = readConfig();
  return {
    ready: false,
    user: null,

    get signedIn() {
      return Boolean(this.user);
    },

    get firstName() {
      return (this.user?.name || "").trim().split(/\s+/)[0] || "";
    },

    async load() {
      if (!readCookie(authCookie(config.tenant))) {
        this.ready = true;
        return;
      }
      try {
        this.user = await api("/auth/me");
      } catch (error) {
        if (error.status === 401) clearToken(config.tenant);
        this.user = null;
      } finally {
        this.ready = true;
      }
    },

    signIn(token, user) {
      writeToken(config.tenant, token);
      this.user = user ?? null;
    },

    async signOut() {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch {
        /* the token is dropped below either way */
      }
      clearToken(config.tenant);
      this.user = null;
      window.location.assign("/");
    },

    /** Send anonymous shoppers to sign in, then back here. */
    requireSignIn() {
      if (this.ready && !this.user) {
        const back = `${location.pathname}${location.search}`;
        window.location.replace(`/account/login?redirectTo=${encodeURIComponent(back)}`);
        return false;
      }
      return Boolean(this.user);
    },
  };
}

/** Wait until `$store.customer` has loaded. */
function whenReady(component) {
  return new Promise((resolve) => {
    const store = component.$store.customer;
    if (store.ready) return resolve(store);
    const stop = component.$watch("$store.customer.ready", (ready) => {
      if (!ready) return;
      if (typeof stop === "function") stop();
      resolve(store);
    });
  });
}

function safeRedirect(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/account";
}

/* ——— pages ————————————————————————————————————————————————————— */

/** Phone OTP sign-in: number → code (+ name for new shoppers). */
export function createLogin() {
  return {
    step: "phone",
    phone: "",
    otp: "",
    name: "",
    isNew: false,
    loading: false,
    error: "",
    notice: "",
    resendIn: 0,
    timer: 0,

    async init() {
      const store = await whenReady(this);
      if (store.signedIn) window.location.replace(this.redirectTo());
    },

    redirectTo() {
      return safeRedirect(new URLSearchParams(location.search).get("redirectTo"));
    },

    countdown() {
      this.resendIn = 30;
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => {
        this.resendIn = Math.max(0, this.resendIn - 1);
        if (!this.resendIn) window.clearInterval(this.timer);
      }, 1000);
    },

    async sendCode() {
      const phoneNumber = this.phone.trim();
      if (!phoneNumber) {
        this.error = "Enter your phone number.";
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        const result = await api("/auth/otp/send", {
          method: "POST",
          body: { phoneNumber },
        });
        this.isNew = Boolean(result?.isNewCustomer);
        this.notice = this.isNew
          ? `We sent a code to ${phoneNumber}. It's your first time here, so we'll create your account.`
          : `We sent a code to ${phoneNumber}.`;
        this.step = "otp";
        this.countdown();
        this.$nextTick(() => this.$refs.otp?.focus());
      } catch (error) {
        this.error = error.message || "Could not send the code. Try again.";
      } finally {
        this.loading = false;
      }
    },

    async verify() {
      if (!this.otp.trim()) {
        this.error = "Enter the code we sent you.";
        return;
      }
      if (this.isNew && !this.name.trim()) {
        this.error = "Enter your name.";
        return;
      }
      this.loading = true;
      this.error = "";
      try {
        const result = await api("/auth/otp/verify", {
          method: "POST",
          body: {
            phoneNumber: this.phone.trim(),
            otp: this.otp.trim(),
            ...(this.name.trim() ? { name: this.name.trim() } : {}),
          },
        });
        this.$store.customer.signIn(result.accessToken, result.user);
        window.location.assign(this.redirectTo());
      } catch (error) {
        this.error = error.message || "Could not verify the code.";
        this.loading = false;
      }
    },

    changeNumber() {
      this.step = "phone";
      this.otp = "";
      this.error = "";
      this.notice = "";
    },
  };
}

/** Shopper's orders, newest first, with paging. */
export function createOrders({ limit = 10 } = {}) {
  return {
    loading: true,
    error: "",
    orders: [],
    page: 1,
    hasNext: false,
    total: 0,
    limit,

    async init() {
      const store = await whenReady(this);
      if (!store.requireSignIn()) return;
      await this.load(1);
    },

    async load(page) {
      this.loading = true;
      this.error = "";
      try {
        const result = await api("/orders", {
          query: { page: String(page), limit: String(this.limit) },
        });
        this.orders = result?.nodes ?? [];
        this.page = result?.meta?.currentPage ?? page;
        this.hasNext = Boolean(result?.meta?.hasNextPage);
        this.total = result?.meta?.totalCount ?? this.orders.length;
      } catch (error) {
        this.error = error.message || "Could not load your orders.";
      } finally {
        this.loading = false;
      }
    },

    itemCount(order) {
      return (order.lineItems ?? []).reduce((sum, line) => sum + (Number(line?.quantity) || 1), 0);
    },

    orderId(order) {
      return order.invoiceUID || order._id;
    },

    lineName,
    lineImage,
    lineUnitPrice,
    statusLabel,
    statusTone,
    formatDate,
  };
}

/** Name and phone; name is editable. */
export function createProfile() {
  return {
    loading: true,
    saving: false,
    saved: false,
    error: "",
    name: "",
    phone: "",
    email: "",

    async init() {
      const store = await whenReady(this);
      if (!store.requireSignIn()) return;
      this.name = store.user?.name ?? "";
      this.phone = store.user?.phoneNumber ?? "";
      this.email = store.user?.email ?? "";
      this.loading = false;
    },

    async save() {
      if (!this.name.trim()) {
        this.error = "Enter your name.";
        return;
      }
      this.saving = true;
      this.saved = false;
      this.error = "";
      try {
        const user = await api("/auth/profile", {
          method: "PATCH",
          body: { name: this.name.trim() },
        });
        this.$store.customer.user = { ...this.$store.customer.user, ...user };
        this.saved = true;
        window.setTimeout(() => (this.saved = false), 2500);
      } catch (error) {
        this.error = error.message || "Could not save your profile.";
      } finally {
        this.saving = false;
      }
    },
  };
}

/** Look up an order by number; works signed out too. */
export function createTrackOrder() {
  return {
    orderId: "",
    loading: false,
    error: "",
    order: null,
    notFound: false,
    steps: TRACK_STEPS,

    async init() {
      this.orderId = this.$el.dataset.orderId || "";
      if (this.orderId) await this.lookUp();
    },

    submit() {
      const id = this.orderId.trim();
      if (!id) {
        this.error = "Enter your order number.";
        return;
      }
      window.location.assign(`/track-order/${encodeURIComponent(id)}`);
    },

    async lookUp() {
      this.loading = true;
      this.error = "";
      this.notFound = false;
      try {
        this.order = await api(`/orders/${encodeURIComponent(this.orderId)}`);
      } catch (error) {
        if (error.status === 404) this.notFound = true;
        else this.error = error.message || "Could not look up that order.";
      } finally {
        this.loading = false;
      }
    },

    stepIndex() {
      return TRACK_STEPS.indexOf(this.order?.invoiceStatus);
    },

    get cancelled() {
      return this.order?.invoiceStatus === "REJECTED";
    },

    address() {
      const shipping = record(this.order?.shippingAddress);
      return shipping.caption || [shipping.address, shipping.area, shipping.city].filter(Boolean).join(", ");
    },

    lineName,
    lineImage,
    lineUnitPrice,
    statusLabel,
    statusTone,
    formatDate,
  };
}

/* ——— wishlist ——————————————————————————————————————————————————— */

/**
 * `$store.wishlist`: the signed-in shopper's saved products, stored in their
 * StoreOS account. Saving and removing go through the StoreOS wishlist helper
 * (`window.StoreOS.wishlist`, printed by `content_for_header`), so every heart
 * on the page stays in sync; full product details come from `/api/v1/wishlist`.
 */
export function createWishlistStore() {
  const known = new Map();
  return {
    ids: [],
    loaded: false,

    get items() {
      return this.ids.map((id) => known.get(id)).filter(Boolean);
    },

    init() {
      const helper = window.StoreOS?.wishlist;
      if (helper) this.apply({ productIds: helper.productIds(), signedIn: helper.signedIn(), ready: helper.ready() });
      document.addEventListener("storeos:wishlist", (event) => this.apply(event.detail));
    },

    apply({ productIds, signedIn, ready }) {
      this.ids = productIds.map(String);
      if (!signedIn || !ready || this.loaded) return;
      this.loaded = true;
      api("/wishlist")
        .then((res) => {
          for (const product of res?.nodes ?? []) known.set(String(product._id), product);
          this.ids = [...this.ids];
        })
        .catch(() => {
          this.loaded = false;
        });
    },

    has(id) {
      return this.ids.includes(String(id));
    },

    /** Save, or remove when saved. Signed-out shoppers go to sign-in. */
    toggle(product) {
      known.set(String(product._id), product);
      const helper = window.StoreOS?.wishlist;
      if (helper) return helper.toggle(product._id);
      location.assign(`/account/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`);
    },

    image(item) {
      return fileUrl(item.thumbnail ?? item.image);
    },

    url(item) {
      return item.handle ? `/products/${item.handle}` : "#";
    },
  };
}
