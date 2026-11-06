import Alpine from "alpinejs";
import { createCartStore } from "./cart.js";
import { createCheckoutForm } from "./checkout.js";
import { createProductForm } from "./product.js";

document.addEventListener("alpine:init", () => {
  Alpine.store("cart", createCartStore());
  Alpine.data("ritualCheckout", createCheckoutForm);
  Alpine.data("ProductData", createProductForm);
});

window.Alpine = Alpine;
Alpine.start();

queueMicrotask(() => {
  const cart = Alpine.store("cart");
  if (cart && typeof cart.hydrate === "function") cart.hydrate();
});
