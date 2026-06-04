/**
 * ShopShuttle Clipper - Web Bridge Content Script
 * Injected ONLY into the ShopShuttle Web Application pages.
 * Handles background clipboard synchronization and communication between the page and extension storage.
 */

console.log("[ShopShuttle Bridge] Bridge injected. Syncing clipboard...");

// 1. Sync on page load
(async () => {
  try {
    const result = await chrome.storage.local.get("clipped_products");
    const products = result.clipped_products || [];
    
    if (products.length > 0) {
      console.log(`[ShopShuttle Bridge] Found ${products.length} clipped product(s). Syncing...`);
      
      // Give the page 1.5 seconds to fully initialize before sending data
      setTimeout(() => {
        window.postMessage({
          type: "SHOPSHUTTLE_EXTENSION_IMPORT",
          products: products
        }, "*");
        
        // Clear storage after successful import to avoid infinite loops or duplicates on next reload
        chrome.storage.local.remove("clipped_products");
        console.log("[ShopShuttle Bridge] Clipboard synchronized and cleared.");
      }, 1500);
    } else {
      console.log("[ShopShuttle Bridge] Clipboard is empty.");
    }
  } catch (err) {
    console.error("[ShopShuttle Bridge] Load-sync failed:", err);
  }
})();

// 2. Sync in real-time if ShopShuttle is already open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "syncClippedList" && message.products) {
    console.log(`[ShopShuttle Bridge] Real-time sync requested for ${message.products.length} products.`);
    
    window.postMessage({
      type: "SHOPSHUTTLE_EXTENSION_IMPORT",
      products: message.products
    }, "*");
    
    // Clear storage after sync
    chrome.storage.local.remove("clipped_products");
    sendResponse({ success: true });
    return true;
  }
});
