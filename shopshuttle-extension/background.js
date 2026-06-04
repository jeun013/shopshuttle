/**
 * ShopShuttle Clipper - Background Service Worker
 * Satisfies Manifest V3 background process requirements and handles installation onboarding.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("ShopShuttle Clipper Extension v1.0.0 installed successfully!");
  
  // Clear any leftover clipboard items on fresh installation
  chrome.storage.local.remove("clipped_products");
});
