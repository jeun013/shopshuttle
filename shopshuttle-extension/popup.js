/**
 * ShopShuttle Clipper - Popup Script
 * Coordinates tab querying, content script injection, scraping, and storage synchronization.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statusText = document.getElementById("statusText");
  const previewBox = document.getElementById("previewBox");
  const previewThumb = document.getElementById("previewThumb");
  const previewTitle = document.getElementById("previewTitle");
  const previewPrice = document.getElementById("previewPrice");
  const badgeVariants = document.getElementById("badgeVariants");
  const badgeImages = document.getElementById("badgeImages");
  
  const clipBtn = document.getElementById("clipBtn");
  const openBtn = document.getElementById("openBtn");

  let currentTab = null;
  let scrapedProduct = null;

  // 1. Get the current active tab details
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      statusText.textContent = "Please browse an e-commerce product page (Shopify, Squarespace, or WooCommerce).";
      clipBtn.disabled = true;
      return;
    }

    statusText.textContent = "Analyzing e-commerce listing...";
    
    // Inject the content script dynamically to ensure it runs
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-script.js"]
    });

    // Send scraping message to the content script safely
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "scrapeProduct" });
      if (response && response.success) {
        scrapedProduct = response.product;
        displayScrapedProduct(scrapedProduct);
      } else {
        statusText.textContent = `Scraping error: ${response?.error || "Unknown error occurred"}`;
      }
    } catch (msgErr) {
      statusText.textContent = "Failed to scrape page. Please reload the page and try again.";
      console.warn("Scraping connection failed:", msgErr.message);
    }

  } catch (err) {
    statusText.textContent = `Error initializing clipper: ${err.message}`;
    console.error("Clipper init error:", err);
  }

  // Display the scraped product preview
  function displayScrapedProduct(p) {
    statusText.textContent = "Product successfully analyzed!";
    statusText.style.color = "var(--accent-primary)";
    
    previewBox.style.display = "block";
    previewThumb.src = p.featuredImage || "";
    previewTitle.textContent = p.title || "Unknown Product";
    
    const priceVal = p.variants ? p.variants[0].price : p.price || 0;
    const currencySym = p.currency || "$";
    previewPrice.textContent = `${currencySym}${Number(priceVal).toFixed(2)}`;

    const variantCount = p.variants ? p.variants.length : 1;
    badgeVariants.textContent = `${variantCount} variants`;
    badgeImages.textContent = `${p.images ? p.images.length : 0} images`;

    clipBtn.disabled = false;
  }

  // 2. Click-to-Clip Product Action
  clipBtn.addEventListener("click", async () => {
    if (!scrapedProduct) return;

    clipBtn.disabled = true;
    clipBtn.textContent = "Saving to Clipboard...";

    try {
      // Fetch existing clipped list from chrome.storage.local
      const result = await chrome.storage.local.get("clipped_products");
      let list = result.clipped_products || [];

      // Avoid duplicate urls in clipboard
      const exists = list.some(item => item.sourceUrl === scrapedProduct.sourceUrl);
      if (!exists) {
        list.push(scrapedProduct);
        await chrome.storage.local.set({ clipped_products: list });
      }

      clipBtn.textContent = "Clipped Successfully! ⚡";
      clipBtn.style.backgroundColor = "#10b981"; // Success Green

      // Attempt to immediately sync with the ShopShuttle web app tab if it's already open!
      const allTabs = await chrome.tabs.query({});
      const allWebTabs = allTabs.filter(t => t.url && (
        t.url.includes("universal-uploader.pages.dev") || 
        t.url.includes("localhost:8788") || 
        t.url.includes("127.0.0.1:8788")
      ));

      if (allWebTabs.length > 0) {
        let syncedCount = 0;
        // Send import trigger to the opened ShopShuttle pages safely
        for (const t of allWebTabs) {
          try {
            await chrome.tabs.sendMessage(t.id, { action: "syncClippedList", products: list });
            syncedCount++;
          } catch (syncErr) {
            console.warn(`Sync failed for tab ${t.id}:`, syncErr.message);
          }
        }
        
        if (syncedCount > 0) {
          statusText.textContent = "Clipped and synced with open ShopShuttle Tab! 🚀";
        } else {
          statusText.textContent = "Saved locally. Reload the ShopShuttle Tab to sync! 🔄";
        }
      } else {
        statusText.textContent = "Saved locally. Open the ShopShuttle Web App to sync!";
      }

    } catch (e) {
      clipBtn.disabled = false;
      clipBtn.textContent = "⚡ Clip to ShopShuttle";
      statusText.textContent = `Clip failed: ${e.message}`;
    }
  });

  // 3. Open ShopShuttle Web App Page Button Click
  openBtn.addEventListener("click", async () => {
    // Check if ShopShuttle is already open in any tab
    const allTabs = await chrome.tabs.query({});
    const tabs = allTabs.filter(t => t.url && t.url.includes("universal-uploader.pages.dev"));
    
    if (tabs.length > 0) {
      // Focus on existing tab
      await chrome.tabs.update(tabs[0].id, { active: true });
      await chrome.windows.update(tabs[0].windowId, { drawAttention: true });
    } else {
      // Open new tab with ShopShuttle live URL
      await chrome.tabs.create({ url: "https://universal-uploader.pages.dev/" });
    }
    
    window.close(); // Close the popup
  });
});
