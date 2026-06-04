/**
 * ShopShuttle Clipper Content Script
 * Runs in the context of the active e-commerce page.
 * Extracts product metadata from Shopify, Squarespace, and WooCommerce structures.
 */

// Listener to handle scrape requests from the extension popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scrapeProduct") {
    (async () => {
      try {
        const product = await scrapeProductData();
        sendResponse({ success: true, product });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

async function scrapeProductData() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  // 1. SHOPIFY DETECTION & SCRAPING
  const isShopify = !!(
    window.Shopify ||
    document.querySelector('link[href*="cdn.shopify.com"]') ||
    document.querySelector('script[id="shopify-features"]')
  );

  if (isShopify) {
    console.log("[ShopShuttle] Shopify detected. Fetching product JSON...");
    try {
      // Fetch public JSON endpoint
      const handle = pathname.split("/").filter(Boolean).pop() || "product";
      const cleanPath = pathname.endsWith(".js") ? pathname : `${pathname}.js`;
      const res = await fetch(cleanPath);
      if (!res.ok) throw new Error(`Shopify JSON endpoint returned status ${res.status}`);
      const json = await res.json();
      
      const cleanImg = (img) => {
        if (!img) return "";
        let src = typeof img === "string" ? img : img.src || "";
        if (src.startsWith("//")) src = "https:" + src;
        return src.split("?")[0];
      };

      const images = (json.images || []).map(cleanImg).filter(Boolean);
      const variants = (json.variants || []).map((v) => {
        const price = Number(v.price) / 100;
        const comparePrice = v.compare_at_price ? Number(v.compare_at_price) / 100 : null;
        const onSale = comparePrice && comparePrice > price ? "Yes" : "No";
        return {
          id: v.id,
          title: v.title,
          sku: v.sku || "",
          price: onSale === "Yes" ? comparePrice : price,
          compareAtPrice: onSale === "Yes" ? price : null,
          onSale,
          stock: v.available ? 99 : 0,
          weight: v.weight ? Number(v.weight) / 1000 : 0,
          option1: v.option1 || "",
          option2: v.option2 || "",
          option3: v.option3 || "",
          featuredImage: v.featured_image ? cleanImg(v.featured_image.src || v.featured_image) : ""
        };
      });

      return {
        sourceUrl: url,
        handle,
        title: json.title || document.title,
        description: json.description || "",
        currency: document.querySelector('meta[property="og:price:currency"]')?.content || "USD",
        images,
        featuredImage: cleanImg(json.featured_image || images[0]),
        options: json.options || [{ name: "Title", values: ["Default Title"] }],
        variants: variants.length ? variants : null,
        tags: Array.isArray(json.tags) ? json.tags.join(", ") : (json.tags || ""),
        category: json.type || "",
        vatStatus: document.body.innerText.toLowerCase().includes("vat") ? "VAT Included" : "VAT Included (Assumed)"
      };
    } catch (e) {
      console.warn("[ShopShuttle] Shopify direct JSON fetch failed, falling back to meta...", e.message);
    }
  }

  // 2. SQUARESPACE DETECTION & SCRAPING
  let sqspContext = null;
  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const content = script.textContent;
    if (content && content.includes("Static.SQUARESPACE_CONTEXT")) {
      const match = content.match(/Static\.SQUARESPACE_CONTEXT\s*=\s*(\{.+?\});?/s);
      if (match) {
        try {
          sqspContext = JSON.parse(match[1]);
          break;
        } catch {}
      }
    }
  }

  if (sqspContext && sqspContext.product) {
    console.log("[ShopShuttle] Squarespace detected via Context. Scraping...");
    const p = sqspContext.product;
    const item = sqspContext.item || {};
    const handle = pathname.split("/").filter(Boolean).pop() || "squarespace-product";
    
    const allImages = [];
    const seenImgs = new Set();
    const sqVariants = p.variants || [];
    const attrNames = p.variantAttributeNames || ["Title"];

    const normalizeImg = (u) => {
      if (!u) return "";
      return u.startsWith("//") ? "https:" + u : u;
    };

    const variants = sqVariants.map((v, i) => {
      const priceRaw = v.price?.value || 0;
      const salePriceRaw = v.salePrice?.value || 0;
      const onSale = v.onSale === true && salePriceRaw > 0 && salePriceRaw < priceRaw;
      const price = priceRaw / 100;
      const salePrice = salePriceRaw > 0 ? salePriceRaw / 100 : null;

      const attrs = v.attributes || {};
      const option1 = attrs[attrNames[0]] || Object.values(attrs)[0] || "Default Title";
      const option2 = attrNames[1] ? (attrs[attrNames[1]] || "") : "";
      const option3 = attrNames[2] ? (attrs[attrNames[2]] || "") : "";

      const imgUrl = normalizeImg(v.mainImage?.url || "");
      if (imgUrl && !seenImgs.has(imgUrl)) {
        seenImgs.add(imgUrl);
        allImages.push(imgUrl);
      }

      return {
        id: v.id || `sq-${i}`,
        title: Object.values(attrs).join(" / ") || "Default Title",
        sku: v.sku || "",
        price: onSale ? price : price,
        compareAtPrice: onSale ? salePrice : null,
        onSale: onSale ? "Yes" : "No",
        stock: v.stock?.unlimited ? 99 : (v.stock?.quantity || 0),
        weight: v.shippingWeight?.value ? Number(v.shippingWeight.value) : 0,
        option1,
        option2,
        option3,
        featuredImage: imgUrl
      };
    });

    // Scrape cdn images from DOM too
    document.querySelectorAll('img[src*="images.squarespace-cdn.com"]').forEach(img => {
      const src = img.src.split("?")[0];
      if (src && !seenImgs.has(src)) {
        seenImgs.add(src);
        allImages.push(src);
      }
    });

    const options = attrNames.map(name => ({
      name,
      values: [...new Set(sqVariants.map(v => v.attributes?.[name]).filter(Boolean))]
    }));

    return {
      sourceUrl: url,
      handle,
      title: item.title || document.title,
      description: document.querySelector('meta[property="og:description"]')?.content || "",
      currency: document.querySelector('meta[property="og:price:currency"]')?.content || "USD",
      images: allImages.slice(0, 36),
      featuredImage: allImages[0] || "",
      options: options.length ? options : [{ name: "Title", values: ["Default Title"] }],
      variants: variants.length ? variants : null,
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
      category: Array.isArray(item.categories) ? item.categories.join(", ") : "",
      vatStatus: document.body.innerText.toLowerCase().includes("ex vat") ? "VAT Excluded" : "VAT Included"
    };
  }

  // 3. WOOCOMMERCE DETECTION & SCRAPING
  const isWoo = !!(
    document.querySelector('.woocommerce') || 
    document.querySelector('link[href*="woocommerce"]') ||
    document.querySelector('script[id*="woocommerce"]')
  );

  if (isWoo) {
    console.log("[ShopShuttle] WooCommerce detected. Scraping...");
    
    // Parse JSON-LD Product blocks
    let ldTitle = "", ldDescription = "", ldSku = "", ldPrice = 0, ldImage = "", ldCategory = "";
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const obj = JSON.parse(script.textContent.trim());
        const items = Array.isArray(obj["@graph"]) ? obj["@graph"] : [obj];
        for (const item of items) {
          if (item["@type"] === "Product") {
            ldTitle = item.name || "";
            ldDescription = item.description || "";
            ldSku = item.sku || "";
            ldCategory = item.category || "";
            let rawImg = Array.isArray(item.image) ? item.image[0] : (item.image || "");
            ldImage = (rawImg && typeof rawImg === "object") ? (rawImg.url || "") : (rawImg || "");
            if (item.offers) {
              const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              ldPrice = parseFloat(offer?.price || 0);
            }
            break;
          }
        }
      } catch {}
    }

    const handle = pathname.split("/").filter(Boolean).pop() || "woo-product";
    const allImages = new Set();
    if (ldImage) allImages.add(ldImage.split("?")[0]);

    // Gather WooCommerce page images
    document.querySelectorAll('.woocommerce-product-gallery__image img, .wp-post-image').forEach(img => {
      const src = (img.getAttribute('data-large_image') || img.getAttribute('data-src') || img.src || "").split("?")[0];
      if (src && !src.includes("logo") && !src.includes("icon")) {
        allImages.add(src);
      }
    });

    // Check variations form
    const varForm = document.querySelector('form.variations_form');
    let variants = null;
    let options = [{ name: "Title", values: ["Default Title"] }];

    if (varForm) {
      const varAttr = varForm.getAttribute('data-product_variations');
      if (varAttr) {
        try {
          const varJson = JSON.parse(varAttr);
          variants = varJson.map((v, i) => {
            const price = parseFloat(v.display_price || v.display_regular_price || 0);
            const regularPrice = parseFloat(v.display_regular_price || price);
            const onSale = v.display_price < v.display_regular_price ? "Yes" : "No";
            const imgUrl = (v.image?.url || v.image?.src || "").split("?")[0];
            if (imgUrl) allImages.add(imgUrl);
            const attrs = v.attributes || {};
            const attrValues = Object.values(attrs);

            return {
              id: v.variation_id || `wc-${i}`,
              title: attrValues.join(" / ") || `Variation ${i + 1}`,
              sku: v.sku || ldSku || "",
              price: onSale === "Yes" ? regularPrice : price,
              compareAtPrice: onSale === "Yes" ? price : null,
              onSale,
              stock: v.max_qty ?? (v.is_in_stock ? 99 : 0),
              weight: parseFloat(v.weight || 0),
              option1: attrValues[0] || "Default Title",
              option2: attrValues[1] || "",
              option3: attrValues[2] || ""
            };
          });

          // Build Options Names
          const firstVar = varJson[0];
          if (firstVar && firstVar.attributes) {
            options = Object.keys(firstVar.attributes).map((key, idx) => {
              const cleanName = key.replace(/^attribute_pa_/, "").replace(/_/g, " ");
              return {
                name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
                values: [...new Set(variants.map(v => [v.option1, v.option2, v.option3][idx]).filter(Boolean))]
              };
            });
          }
        } catch {}
      }
    }

    const imageList = Array.from(allImages).slice(0, 36);

    return {
      sourceUrl: url,
      handle,
      title: ldTitle || document.querySelector('.product_title')?.textContent?.trim() || document.title,
      description: ldDescription || document.querySelector('.woocommerce-product-details__short-description')?.textContent?.trim() || "",
      currency: document.querySelector('.woocommerce-Price-currencySymbol')?.textContent || "USD",
      images: imageList,
      featuredImage: imageList[0] || "",
      options,
      variants,
      tags: document.querySelector('.tagged_as')?.textContent?.replace(/Tags?:/i, "").trim() || "",
      category: ldCategory || document.querySelector('.posted_in')?.textContent?.replace(/Categories?:/i, "").trim() || "",
      vatStatus: document.body.innerText.toLowerCase().includes("ex vat") ? "VAT Excluded" : "VAT Included"
    };
  }

  // 4. GENERAL WEB PAGE FALLBACK (CRAWLS STANDARD METADATA)
  console.log("[ShopShuttle] Generic page fallback scraping...");
  
  // Try to find JSON-LD Product block in the DOM
  let ldProduct = null;
  const ldScripts = document.querySelectorAll('script[type*="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const obj = JSON.parse(script.textContent.trim());
      const items = Array.isArray(obj["@graph"]) ? obj["@graph"] : [obj];
      for (const item of items) {
        if (item["@type"]?.toLowerCase() === "product") {
          ldProduct = item;
          break;
        }
      }
    } catch {}
    if (ldProduct) break;
  }

  let ldTitle = "";
  let ldDesc = "";
  let ldSku = "";
  let ldPrice = 0;
  let ldCurrency = "";
  let ldFeaturedImg = "";

  if (ldProduct) {
    ldTitle = ldProduct.name || "";
    ldDesc = ldProduct.description || "";
    ldSku = ldProduct.sku || "";
    
    let rawImg = Array.isArray(ldProduct.image) ? ldProduct.image[0] : (ldProduct.image || "");
    ldFeaturedImg = (rawImg && typeof rawImg === "object") ? (rawImg.url || "") : (rawImg || "");
    if (ldFeaturedImg) {
      ldFeaturedImg = ldFeaturedImg.split("?")[0];
      if (ldFeaturedImg.startsWith("//")) ldFeaturedImg = "https:" + ldFeaturedImg;
    }

    if (ldProduct.offers) {
      const offer = Array.isArray(ldProduct.offers) ? ldProduct.offers[0] : ldProduct.offers;
      ldPrice = parseFloat(String(offer?.price || "0").replace(/,/g, ""));
      ldCurrency = offer?.priceCurrency || "";
    }
  }

  const pageTitle = ldTitle || document.querySelector('meta[property="og:title"]')?.content || document.title;
  const pageDesc = ldDesc || document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="description"]')?.content || "";
  const pageImg = ldFeaturedImg || document.querySelector('meta[property="og:image"]')?.content || "";
  const priceStr = document.querySelector('meta[property="og:price:amount"]')?.content || document.querySelector('meta[property="product:price:amount"]')?.content || "0";
  const finalPrice = ldPrice || parseFloat(priceStr.replace(/,/g, "")) || 0;
  const finalCurrency = ldCurrency || document.querySelector('meta[property="og:price:currency"]')?.content || "USD";

  const imgs = new Set();
  if (pageImg) imgs.add(pageImg.split("?")[0]);
  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-large_image') || img.getAttribute('data-lazy-src');
    if (!src) return;
    const cleanSrc = src.split("?")[0];
    const lowerSrc = cleanSrc.toLowerCase();
    if (
      (lowerSrc.includes("/products/") || lowerSrc.includes("/files/") || lowerSrc.includes("/uploads/") || lowerSrc.includes("/media/") || lowerSrc.includes("adis.ws") || lowerSrc.includes("cloudfront") || lowerSrc.includes("cloudinary") || lowerSrc.includes("wpshirts")) &&
      !lowerSrc.includes("logo") &&
      !lowerSrc.includes("icon") &&
      !lowerSrc.includes("badge") &&
      !lowerSrc.includes("avatar") &&
      !lowerSrc.includes("tracker") &&
      !lowerSrc.includes("banner") &&
      !lowerSrc.includes("pixel") &&
      !lowerSrc.includes("loading")
    ) {
      imgs.add(cleanSrc);
    }
  });

  const imageList = Array.from(imgs).slice(0, 36);

  return {
    sourceUrl: url,
    handle: pathname.split("/").filter(Boolean).pop() || "product",
    title: pageTitle,
    description: pageDesc,
    currency: finalCurrency,
    images: imageList,
    featuredImage: imageList[0] || "",
    options: [{ name: "Title", values: ["Default Title"] }],
    variants: [{
      id: "scraped",
      title: "Default Title",
      sku: ldSku || "",
      price: finalPrice,
      compareAtPrice: null,
      onSale: "No",
      stock: 99,
      weight: 0,
      option1: "Default Title"
    }],
    tags: "",
    category: "",
    vatStatus: "VAT Included (Assumed)"
  };
}
