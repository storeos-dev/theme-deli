import { readConfig } from "./config.js";

const MIN_CHARS = 2;
const LIMIT = 6;
const DEBOUNCE_MS = 220;

/**
 * Header search with live product suggestions.
 * Reads the storefront REST catalog: GET /api/v1/products?search=&limit=
 */
export function createSearchSuggest() {
  const config = readConfig();
  let timer = 0;
  let controller = null;

  return {
    q: "",
    open: false,
    loading: false,
    results: [],
    total: 0,
    active: -1,

    init() {
      this.q = this.$el.dataset.initial || "";
    },

    get searchUrl() {
      return `/search?q=${encodeURIComponent(this.q.trim())}`;
    },

    get showPanel() {
      return this.open && this.q.trim().length >= MIN_CHARS;
    },

    imageUrl(node) {
      const img = node?.thumbnail || node?.gallery?.[0];
      if (!img) return "";
      if (typeof img.external === "string" && img.external) return img.external;
      if (typeof img.key === "string" && img.key) {
        if (/^https?:\/\//.test(img.key)) return img.key;
        return `${config.cdnBase}/${img.key.replace(/^\//, "")}`;
      }
      return "";
    },

    money(amount) {
      return this.$store.cart?.formatMoney
        ? this.$store.cart.formatMoney(amount)
        : String(amount ?? "");
    },

    onInput() {
      this.open = true;
      this.active = -1;
      window.clearTimeout(timer);
      const term = this.q.trim();
      if (term.length < MIN_CHARS) {
        this.results = [];
        this.total = 0;
        this.loading = false;
        return;
      }
      this.loading = true;
      timer = window.setTimeout(() => void this.fetch(term), DEBOUNCE_MS);
    },

    async fetch(term) {
      controller?.abort();
      controller = new AbortController();
      try {
        const headers = { Accept: "application/json" };
        if (config.tenant) headers["x-tenant"] = config.tenant;
        const params = new URLSearchParams({ search: term, limit: String(LIMIT) });
        const res = await fetch(`${config.apiBase}/api/v1/products?${params}`, {
          headers,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (term !== this.q.trim()) return;
        this.results = (data.nodes || []).map((node) => ({
          id: node._id,
          title: node.title,
          url: `/products/${node.handle}`,
          image: this.imageUrl(node),
          price: node.price,
          inStock: node.isInStock !== false,
        }));
        this.total = data.meta?.totalCount ?? this.results.length;
      } catch (err) {
        if (err?.name === "AbortError") return;
        this.results = [];
        this.total = 0;
      } finally {
        if (term === this.q.trim()) this.loading = false;
      }
    },

    move(step) {
      if (!this.showPanel) return;
      const count = this.results.length + 1; // + "see all" row
      this.active = (this.active + step + count) % count;
    },

    submit(event) {
      if (this.showPanel && this.active >= 0 && this.active < this.results.length) {
        event.preventDefault();
        window.location.assign(this.results[this.active].url);
        return;
      }
      if (!this.q.trim()) event.preventDefault();
    },

    close() {
      this.open = false;
      this.active = -1;
    },
  };
}
