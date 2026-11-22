/** Checkout helpers + Alpine form — mirrors React theme order-flow behaviour. */

const ALL_PROVIDERS = ["BKASH", "SSLCOMMERZ"];

const SHIPPING_FIELDS = [
  { name: "addressLine", label: "Address line" },
  { name: "area", label: "Area" },
  { name: "division", label: "Division" },
  { name: "district", label: "District" },
  { name: "upazila", label: "Upazila" },
  { name: "postalCode", label: "Postal code" },
];

function asMode(value, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    normalized === "required" ||
    normalized === "optional" ||
    normalized === "hidden"
  ) {
    return normalized;
  }
  return fallback;
}

function asOptionalText(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function asCheckoutInputType(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["text", "email", "tel", "number", "textarea", "select"].includes(
    normalized,
  )
    ? normalized
    : "text";
}

function asCheckoutCustomFields(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const key = asOptionalText(item.key);
      if (!key) return null;
      return {
        key,
        label: asOptionalText(item.label) || key,
        mode: asMode(item.mode, "optional"),
        inputType: asCheckoutInputType(item.inputType),
        options: asStringList(item.options),
        placeholder: asOptionalText(item.placeholder),
        defaultValue: asOptionalText(item.defaultValue),
      };
    })
    .filter(Boolean);
}

function asOnlineProviders(value) {
  if (!Array.isArray(value)) return [];
  return ALL_PROVIDERS.filter((provider) => value.includes(provider));
}

export function resolveOrderFlow(tenant) {
  const raw = tenant?.orderFlow;
  const enableCod = raw?.payments?.enableCod ?? true;
  const enableOnline = raw?.payments?.enableOnline ?? false;
  const enabledOnlineProviders = asOnlineProviders(
    raw?.payments?.enabledOnlineProviders,
  );
  const configuredDefault = ALL_PROVIDERS.includes(
    String(raw?.payments?.defaultOnlineProvider ?? ""),
  )
    ? raw.payments.defaultOnlineProvider
    : undefined;
  const defaultOnlineProvider =
    configuredDefault && enabledOnlineProviders.includes(configuredDefault)
      ? configuredDefault
      : enabledOnlineProviders.length === 1
        ? enabledOnlineProviders[0]
        : undefined;

  return {
    checkoutMode: raw?.checkoutMode === "auth_required" ? "auth_required" : "guest",
    payments: {
      enableCod: enableCod || !enableOnline,
      enableOnline,
      defaultMethod:
        raw?.payments?.defaultMethod === "ONLINE" && enableOnline
          ? "ONLINE"
          : enableCod
            ? "COD"
            : "ONLINE",
      enabledOnlineProviders,
      defaultOnlineProvider,
      allowCustomerProviderSelection:
        raw?.payments?.allowCustomerProviderSelection ?? true,
    },
    fields: {
      name: "required",
      phone: "required",
      email: asMode(raw?.fields?.email, "optional"),
      shippingAddress: asMode(raw?.fields?.shippingAddress, "required"),
      deliveryArea: asMode(raw?.fields?.deliveryArea, "required"),
      notes: asMode(raw?.fields?.notes, "optional"),
      shippingAddressFields: {
        addressLine: asMode(
          raw?.fields?.shippingAddressFields?.addressLine,
          "required",
        ),
        area: asMode(raw?.fields?.shippingAddressFields?.area, "hidden"),
        division: asMode(
          raw?.fields?.shippingAddressFields?.division,
          "hidden",
        ),
        district: asMode(
          raw?.fields?.shippingAddressFields?.district,
          "hidden",
        ),
        upazila: asMode(raw?.fields?.shippingAddressFields?.upazila, "hidden"),
        postalCode: asMode(
          raw?.fields?.shippingAddressFields?.postalCode,
          "hidden",
        ),
      },
      customFields: asCheckoutCustomFields(raw?.fields?.customFields),
    },
  };
}

function sameLabel(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

export function findDeliveryRegion(area, charges) {
  const normalized = area?.trim().toLowerCase() ?? "";
  return (charges?.deliveryRegions ?? []).find((region) =>
    sameLabel(region.label, normalized),
  );
}

export function getDeliverySubAreas(area, charges) {
  return (findDeliveryRegion(area, charges)?.subAreas ?? [])
    .map((sub) => String(sub.label ?? "").trim())
    .filter(Boolean);
}

export function getDeliveryCharge(area, charges, subArea) {
  const regions = charges?.deliveryRegions ?? [];
  const region = findDeliveryRegion(area, charges) ?? regions[0];
  if (!region) return 0;
  const normalizedSub = subArea?.trim().toLowerCase() ?? "";
  const match = normalizedSub
    ? (region.subAreas ?? []).find((item) => sameLabel(item.label, normalizedSub))
    : undefined;
  if (match?.charge != null && Number.isFinite(Number(match.charge))) {
    return Math.max(0, Number(match.charge));
  }
  return Number(region.charge) || 0;
}

export function paymentProviderLabel(provider) {
  if (provider === "BKASH") return "bKash";
  if (provider === "SSLCOMMERZ") return "SSLCommerz";
  return provider || "";
}

export function fieldVisible(mode) {
  return mode !== "hidden";
}

export function fieldRequired(mode) {
  return mode === "required";
}

function apiErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.message === "string" && payload.message) return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.error === "string" && payload.error) return payload.error;
  return fallback;
}

export function createCheckoutForm() {
  return {
    tenantReady: false,
    tenantError: null,
    orderFlow: null,
    charges: null,
    name: "",
    phone: "",
    email: "",
    shipping: {
      addressLine: "",
      area: "",
      division: "",
      district: "",
      upazila: "",
      postalCode: "",
    },
    deliveryArea: "",
    deliverySubArea: "",
    notes: "",
    customValues: {},
    paymentMethod: "COD",
    paymentProvider: null,
    couponOpen: false,
    couponCode: "",
    couponApplied: null,
    couponError: null,
    pending: false,
    error: null,

    get fields() {
      return this.orderFlow?.fields ?? {};
    },

    get payments() {
      return this.orderFlow?.payments ?? {};
    },

    get areas() {
      return (this.charges?.deliveryRegions ?? [])
        .map((region) => String(region.label ?? "").trim())
        .filter(Boolean);
    },

    get selectedArea() {
      if (this.deliveryArea && this.areas.includes(this.deliveryArea)) {
        return this.deliveryArea;
      }
      return this.areas[0] || "";
    },

    get subAreas() {
      return getDeliverySubAreas(this.selectedArea, this.charges);
    },

    get deliveryCharge() {
      return getDeliveryCharge(
        this.selectedArea,
        this.charges,
        this.deliverySubArea,
      );
    },

    get regionDeliveryCharge() {
      return getDeliveryCharge(this.selectedArea, this.charges, null);
    },

    get discountAmount() {
      return Number(this.couponApplied?.amount) || 0;
    },

    get totalAmount() {
      const cart = window.Alpine?.store?.("cart");
      const subtotal = Number(cart?.subTotalAmount) || 0;
      return Math.max(0, subtotal + this.deliveryCharge - this.discountAmount);
    },

    get shippingFieldConfigs() {
      const modes = this.fields.shippingAddressFields || {};
      return SHIPPING_FIELDS.map((field) => ({
        ...field,
        mode: modes[field.name] || "hidden",
      })).filter((field) => field.name !== "division" && fieldVisible(field.mode));
    },

    get visibleCustomFields() {
      return (this.fields.customFields || []).filter(
        (field) => field.mode !== "hidden",
      );
    },

    get hiddenCustomFields() {
      return (this.fields.customFields || []).filter(
        (field) => field.mode === "hidden",
      );
    },

    get placeLabel() {
      return this.paymentMethod === "ONLINE"
        ? "Continue to payment"
        : "Place COD order";
    },

    visible(mode) {
      return fieldVisible(mode);
    },

    required(mode) {
      return fieldRequired(mode);
    },

    providerLabel(provider) {
      return paymentProviderLabel(provider);
    },

    /** Delivery charge shown on an area card: a price, or `freeLabel` at zero. */
    areaChargeLabel(area, freeLabel) {
      const charge = getDeliveryCharge(area, this.charges, null);
      if (!charge) return freeLabel;
      const cart = window.Alpine?.store?.("cart");
      return cart?.formatMoney?.(charge) ?? String(charge);
    },

    subAreaOptionLabel(subArea) {
      const charge = getDeliveryCharge(this.selectedArea, this.charges, subArea);
      if (charge !== this.regionDeliveryCharge) {
        const cart = window.Alpine?.store?.("cart");
        const money = cart?.formatMoney?.(charge) ?? charge;
        return `${subArea} (${money})`;
      }
      return subArea;
    },

    async init() {
      const cart = window.Alpine.store("cart");
      try {
        const res = await cart.api("/api/v1/tenant");
        if (!res.ok) throw new Error("Could not load store checkout settings.");
        const tenant = await res.json();
        this.charges = tenant?.charges ?? null;
        this.orderFlow = resolveOrderFlow(tenant);
        this.paymentMethod = this.orderFlow.payments.defaultMethod || "COD";
        this.paymentProvider =
          this.orderFlow.payments.defaultOnlineProvider ||
          this.orderFlow.payments.enabledOnlineProviders?.[0] ||
          null;
        this.deliveryArea = this.areas[0] || "";
        for (const field of this.orderFlow.fields.customFields || []) {
          this.customValues[field.key] = field.defaultValue || "";
        }
      } catch (error) {
        this.tenantError =
          error instanceof Error
            ? error.message
            : "Could not load store checkout settings.";
      } finally {
        this.tenantReady = true;
      }
    },

    onDeliveryAreaChange() {
      this.deliverySubArea = "";
    },

    async applyCoupon() {
      const cart = window.Alpine.store("cart");
      const code = this.couponCode.trim();
      this.couponError = null;
      if (!code) {
        this.couponApplied = null;
        return;
      }
      try {
        const res = await cart.api("/api/v1/orders/coupons/verify", {
          method: "POST",
          body: JSON.stringify({
            code,
            lineItems: cart.lineItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || undefined,
              quantity: item.quantity,
            })),
            deliveryArea: this.selectedArea || undefined,
            deliverySubArea: this.deliverySubArea || undefined,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload?.valid) {
          this.couponApplied = null;
          this.couponError =
            payload?.message || "Coupon could not be applied.";
          return;
        }
        this.couponApplied = {
          code: payload.couponCode || code,
          amount: Number(payload.discountAmount) || 0,
        };
        this.couponCode = this.couponApplied.code;
        this.couponError = null;
      } catch {
        this.couponApplied = null;
        this.couponError = "Coupon could not be applied.";
      }
    },

    clearCoupon() {
      this.couponApplied = null;
      this.couponCode = "";
      this.couponError = null;
      this.couponOpen = false;
    },

    async submit() {
      const cart = window.Alpine.store("cart");
      this.error = null;
      if (!cart?.ready) {
        this.error = "Cart is still loading.";
        return;
      }
      if (!cart.lineItems.length) {
        this.error = "Your cart is empty.";
        return;
      }
      if (!this.orderFlow) {
        this.error = this.tenantError || "Checkout is not ready.";
        return;
      }

      const fields = this.fields;
      if (fieldRequired(fields.name) && !this.name.trim()) {
        this.error = "Name is required.";
        return;
      }
      if (fieldRequired(fields.phone) && !this.phone.trim()) {
        this.error = "Phone is required.";
        return;
      }
      if (fieldRequired(fields.email) && !this.email.trim()) {
        this.error = "Email is required.";
        return;
      }

      const shippingParts = {};
      for (const field of this.shippingFieldConfigs) {
        const value = String(this.shipping[field.name] || "").trim();
        if (field.mode === "required" && !value) {
          this.error = `${field.label} is required.`;
          return;
        }
        if (value) shippingParts[field.name] = value;
      }

      const caption =
        [
          shippingParts.addressLine,
          shippingParts.area,
          shippingParts.district,
          shippingParts.upazila,
          shippingParts.division,
          shippingParts.postalCode,
        ]
          .filter(Boolean)
          .join(", ") || Object.values(shippingParts).filter(Boolean).join(", ");

      if (fieldVisible(fields.shippingAddress) && fieldRequired(fields.shippingAddress) && !caption) {
        this.error = "Enter a shipping address.";
        return;
      }

      if (fieldVisible(fields.deliveryArea) && fieldRequired(fields.deliveryArea)) {
        if (!this.selectedArea) {
          this.error = "Select a delivery area.";
          return;
        }
        if (this.subAreas.length > 0 && !this.deliverySubArea) {
          this.error = "Select your area within the delivery region.";
          return;
        }
      }

      for (const field of this.visibleCustomFields) {
        const value = String(this.customValues[field.key] || "").trim();
        if (field.mode === "required" && !value) {
          this.error = `${field.label} is required.`;
          return;
        }
      }

      const method = this.paymentMethod;
      const enableCod = this.payments.enableCod;
      const enableOnline = this.payments.enableOnline;
      if (method === "COD" && !enableCod) {
        this.error = "Cash on delivery is not available.";
        return;
      }
      if (method === "ONLINE" && !enableOnline) {
        this.error = "Online payment is not available.";
        return;
      }
      if (
        method === "ONLINE" &&
        !(this.payments.enabledOnlineProviders || []).length
      ) {
        this.error = "No online payment provider is configured.";
        return;
      }

      const customFields = [
        ...this.hiddenCustomFields.map((field) => ({
          key: field.key,
          value: field.defaultValue || "",
        })),
        ...this.visibleCustomFields
          .map((field) => ({
            key: field.key,
            value: String(this.customValues[field.key] || "").trim(),
          }))
          .filter((field) => field.value),
      ];

      this.pending = true;
      try {
        await cart.sync();
        const res = await cart.api("/api/v1/orders", {
          method: "POST",
          body: JSON.stringify({
            cartId: cart.cartId,
            customer: {
              name: this.name.trim() || undefined,
              phoneNumber: this.phone.trim() || undefined,
              email: this.email.trim() || undefined,
            },
            lineItems: cart.lineItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId || undefined,
              quantity: item.quantity,
            })),
            shippingAddress: { caption },
            paymentMethod: method,
            paymentProvider:
              method === "ONLINE" ? this.paymentProvider || undefined : undefined,
            deliveryArea: this.selectedArea || undefined,
            deliverySubArea: this.deliverySubArea || undefined,
            notes: this.notes.trim() || undefined,
            customFields: customFields.length ? customFields : undefined,
            couponCode: this.couponApplied?.code || undefined,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.error = apiErrorMessage(payload, "Could not place the order.");
          return;
        }
        const order = payload?.order || payload;
        const id = order?.invoiceUID || order?._id;
        const paymentUrl = payload?.payment?.url;
        cart.clearCart();
        if (paymentUrl) {
          window.location.assign(paymentUrl);
          return;
        }
        if (id) {
          window.location.assign(
            `/order-confirmation/${encodeURIComponent(id)}`,
          );
          return;
        }
        window.location.assign("/");
      } catch {
        this.error = "Could not place the order.";
      } finally {
        this.pending = false;
      }
    },
  };
}
