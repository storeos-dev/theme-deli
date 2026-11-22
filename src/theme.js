import Alpine from "alpinejs";
import {
  createCustomerStore,
  createLogin,
  createOrders,
  createProfile,
  createTrackOrder,
  createWishlistStore,
  formatDate,
  lineImage,
  lineName,
  lineUnitPrice,
} from "./account.js";
import { createCartStore } from "./cart.js";
import { createCheckoutForm } from "./checkout.js";
import { createProductForm, createQuickAdd } from "./product.js";
import { createSearchSuggest } from "./search.js";

document.addEventListener("alpine:init", () => {
  Alpine.store("cart", createCartStore());
  Alpine.store("customer", createCustomerStore());
  Alpine.store("wishlist", createWishlistStore());
  Alpine.data("ritualCheckout", createCheckoutForm);
  Alpine.data("ProductData", createProductForm);
  Alpine.data("deliQuickAdd", createQuickAdd);
  Alpine.data("deliSearch", createSearchSuggest);
  Alpine.data("deliLogin", createLogin);
  Alpine.data("deliOrders", createOrders);
  Alpine.data("deliProfile", createProfile);
  Alpine.data("deliTrackOrder", createTrackOrder);
  Alpine.magic("deli", () => ({ formatDate, lineImage, lineName, lineUnitPrice }));
});

window.Alpine = Alpine;
Alpine.start();

queueMicrotask(() => {
  const cart = Alpine.store("cart");
  if (cart && typeof cart.hydrate === "function") cart.hydrate();
  void Alpine.store("customer").load();
});
