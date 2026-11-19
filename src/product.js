/** Alpine product purchase form — boot data from `script[data-product]`. */

function readBoot(root) {
  const el = root?.querySelector?.("script[data-product]");
  if (!el) return {};
  try {
    return JSON.parse(el.textContent || "{}");
  } catch {
    return {};
  }
}

export function createProductForm() {
  return {
    image: "",
    price: "",
    compare: "",
    unitPrice: 0,
    variantId: null,
    variantTitle: "",
    available: true,
    quantity: 1,
    justAdded: false,
    productId: "",
    title: "",
    labels: {
      soldOut: "Sold out",
      added: "Added",
      addToCart: "Add to cart",
      buyNow: "Buy now",
    },

    init() {
      const boot = readBoot(this.$el);
      this.image = boot.image || "";
      this.price = boot.price || "";
      this.compare = boot.compare || "";
      this.unitPrice = Number(boot.unitPrice) || 0;
      this.variantId = boot.variantId ?? null;
      this.variantTitle = boot.variantTitle || "";
      this.available = boot.available !== false;
      this.productId = boot.productId || "";
      this.title = boot.title || "";
      if (boot.labels && typeof boot.labels === "object") {
        this.labels = { ...this.labels, ...boot.labels };
      }
    },

    get inCart() {
      const variantId = this.variantId || undefined;
      return (this.$store.cart.lineItems || []).some(
        (item) =>
          item.productId === this.productId &&
          (item.variantId || undefined) === variantId &&
          !item.offerId,
      );
    },

    get addLabel() {
      if (!this.available) return this.labels.soldOut;
      if (this.justAdded || this.inCart) return this.labels.added;
      return this.labels.addToCart;
    },

    pickVariant(el) {
      const opt = el.selectedOptions[0];
      if (!opt) return;
      this.price = opt.dataset.price || this.price;
      this.compare = opt.dataset.compare || "";
      this.unitPrice = Number(opt.dataset.unitPrice || this.unitPrice);
      this.variantId = opt.value || null;
      this.variantTitle = opt.dataset.title || "";
      this.available = opt.dataset.available === "true";
      this.justAdded = false;
    },

    setQuantity(next) {
      this.quantity = Math.min(99, Math.max(1, Number(next) || 1));
    },

    cartPayload() {
      return {
        productId: this.productId,
        variantId: this.variantId || undefined,
        quantity: this.quantity,
        product: {
          name: this.title,
          variantName: this.variantTitle || undefined,
          unitPrice: this.unitPrice,
          image: { external: this.image || undefined },
        },
      };
    },

    addToCart() {
      if (!this.available) return;
      this.$store.cart.addItem(this.cartPayload(), { openDrawer: true });
      this.justAdded = true;
      window.setTimeout(() => {
        this.justAdded = false;
      }, 1800);
    },

    buyNow() {
      if (!this.available) return;
      this.$store.cart.addItem(this.cartPayload(), { openDrawer: false });
      window.location.assign("/checkout");
    },
  };
}

/**
 * Deli product card "Add to Bag" — reads `data-*` on the root, then shows a
 * − qty + stepper once the product is in the cart (Shwapno-style).
 */
export function createQuickAdd() {
  return {
    productId: "",
    variantId: undefined,
    title: "",
    image: "",
    unitPrice: 0,

    init() {
      const d = this.$el.dataset;
      this.productId = d.productId || "";
      this.variantId = d.variantId || undefined;
      this.title = d.title || "";
      this.image = d.image || "";
      this.unitPrice = Number(d.unitPrice) || 0;
    },

    get line() {
      return (this.$store.cart.lineItems || []).find(
        (item) =>
          item.productId === this.productId &&
          (item.variantId || undefined) === this.variantId &&
          !item.offerId,
      );
    },

    get qty() {
      return this.line?.quantity || 0;
    },

    add() {
      this.$store.cart.addItem(
        {
          productId: this.productId,
          variantId: this.variantId,
          quantity: 1,
          product: {
            name: this.title,
            unitPrice: this.unitPrice,
            image: { external: this.image || undefined },
          },
        },
        { openDrawer: false },
      );
    },

    change(delta) {
      this.$store.cart.adjustQuantity(
        this.productId,
        this.qty + delta,
        this.variantId,
        undefined,
      );
    },
  };
}
