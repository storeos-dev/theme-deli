import {
  cartIdKey,
  newCartId,
  readConfig,
  readCookie,
  writeCookie,
} from "./config.js";

const SYNC_MS = 400;

function sameLine(item, productId, variantId, offerId) {
  return (
    item.productId === productId &&
    (item.variantId || undefined) === (variantId || undefined) &&
    (item.offerId || undefined) === (offerId || undefined)
  );
}

function lineKey(item) {
  return `${item.productId}-${item.variantId || ""}-${item.offerId || ""}`;
}

export function createCartStore() {
  const config = readConfig();
  let syncTimer = 0;
  let skipNextSync = false;
  let previousCount = 0;

  return {
    ready: false,
    open: false,
    cartId: "",
    lineItems: [],
    currency: config.currency,

    get totalItems() {
      return this.lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    },

    get subTotalAmount() {
      return this.lineItems.reduce((sum, item) => {
        if (item.offerId) return sum;
        return sum + (Number(item.product?.unitPrice) || 0) * (item.quantity || 0);
      }, 0);
    },

    formatMoney(amount) {
      try {
        return new Intl.NumberFormat("en-BD", {
          style: "currency",
          currency: this.currency || "BDT",
          currencyDisplay: "narrowSymbol",
          maximumFractionDigits: 0,
        }).format(Number(amount) || 0);
      } catch {
        return String(amount ?? 0);
      }
    },

    imageUrl(item) {
      const image = item?.product?.image;
      if (!image) return "";
      if (typeof image.external === "string" && image.external) return image.external;
      if (typeof image.key === "string" && image.key) {
        if (/^https?:\/\//.test(image.key)) return image.key;
        return `${config.cdnBase}/${image.key.replace(/^\//, "")}`;
      }
      return "";
    },

    setOpen(value) {
      this.open = Boolean(value);
      document.body.classList.toggle("overflow-hidden", this.open);
    },

    rememberCartId(id) {
      this.cartId = id;
      if (!config.tenant || !id) return;
      const key = cartIdKey(config.tenant);
      writeCookie(key, id);
      try {
        localStorage.setItem(key, id);
      } catch {
        /* ignore */
      }
    },

    api(path, init = {}) {
      const headers = new Headers(init.headers || {});
      if (config.tenant) headers.set("x-tenant", config.tenant);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      headers.set("Accept", "application/json");
      const url = `${config.apiBase}${path}`;
      return fetch(url, { ...init, headers });
    },

    async hydrate() {
      if (!config.tenant) {
        this.ready = true;
        return;
      }
      const key = cartIdKey(config.tenant);
      const params = new URLSearchParams(window.location.search);
      const fromLink = params.get("c")?.trim();
      const stored =
        fromLink ||
        readCookie(key) ||
        (() => {
          try {
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        })() ||
        newCartId();
      this.rememberCartId(stored);
      if (fromLink) {
        params.delete("c");
        const next = params.toString();
        const path = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", path);
      }

      try {
        const res = await this.api(
          `/api/v1/carts/${encodeURIComponent(this.cartId)}`,
        );
        if (res.ok) {
          const remote = await res.json();
          if (Array.isArray(remote?.lineItems) && remote.lineItems.length) {
            this.lineItems = remote.lineItems;
            previousCount = remote.lineItems.length;
          }
        }
      } catch {
        /* offline / unbound storefront — keep empty until add */
      } finally {
        this.ready = true;
      }
    },

    scheduleSync() {
      if (!this.ready || !config.tenant) return;
      if (skipNextSync) {
        skipNextSync = false;
        previousCount = this.lineItems.length;
        return;
      }
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        void this.sync();
      }, SYNC_MS);
    },

    async sync() {
      if (!config.tenant || !this.cartId) return;
      if (this.lineItems.length === 0) {
        if (previousCount > 0) {
          const oldId = this.cartId;
          this.rememberCartId(newCartId());
          try {
            await this.api(`/api/v1/carts/${encodeURIComponent(oldId)}`, {
              method: "DELETE",
            });
          } catch {
            /* ignore */
          }
        }
        previousCount = 0;
        return;
      }
      previousCount = this.lineItems.length;
      try {
        await this.api("/api/v1/carts", {
          method: "POST",
          body: JSON.stringify({
            cartId: this.cartId,
            lineItems: this.lineItems,
          }),
        });
      } catch {
        /* ignore transient failures */
      }
    },

    addItem(payload, options = {}) {
      const openDrawer = options.openDrawer !== false;
      const next = [...this.lineItems];
      const index = next.findIndex((item) =>
        sameLine(item, payload.productId, payload.variantId, payload.offerId),
      );
      if (index >= 0) {
        next[index] = {
          ...next[index],
          quantity: next[index].quantity + (payload.quantity || 1),
        };
      } else {
        next.push({ ...payload, quantity: payload.quantity || 1 });
      }
      this.lineItems = next;
      this.scheduleSync();
      if (openDrawer) this.setOpen(true);
    },

    removeItem(productId, variantId, offerId) {
      this.lineItems = this.lineItems.filter(
        (item) => !sameLine(item, productId, variantId, offerId),
      );
      this.scheduleSync();
    },

    adjustQuantity(productId, quantity, variantId, offerId) {
      if (quantity <= 0) {
        this.removeItem(productId, variantId, offerId);
        return;
      }
      this.lineItems = this.lineItems.map((item) =>
        sameLine(item, productId, variantId, offerId)
          ? { ...item, quantity }
          : item,
      );
      this.scheduleSync();
    },

    clearCart() {
      this.lineItems = [];
      this.scheduleSync();
    },

    lineKey,
  };
}
