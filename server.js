const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    if (requestUrl.pathname === "/api/product") {
      await handleProductApi(requestUrl, res);
      return;
    }
    if (requestUrl.pathname === "/api/fetch-html" && req.method === "GET") {
      const targetUrl = requestUrl.searchParams.get("url");
      if (!targetUrl) {
        sendJson(res, 400, { error: "Missing url parameter" });
        return;
      }
      try {
        const fetchRes = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9"
          }
        });
        if (!fetchRes.ok) {
          throw new Error(`Proxy fetch failed: ${fetchRes.status} ${fetchRes.statusText}`);
        }
        const text = await fetchRes.text();
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(text);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
      return;
    }
    if (requestUrl.pathname === "/api/download" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const csv = params.get("csv") || "";
        const filename = params.get("filename") || "catalog.csv";
        
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Access-Control-Allow-Origin": "*"
        });
        res.end(csv);
      });
      return;
    }
    if (requestUrl.pathname === "/api/download-test-get" && req.method === "GET") {
      const filename = requestUrl.searchParams.get("filename") || "test_get.csv";
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*"
      });
      res.end("Column1,Column2\nValue1,Value2");
      return;
    }
    if (requestUrl.pathname === "/api/squarespace/sync") {
      await handleSquarespaceSync(req, res);
      return;
    }

    await serveStatic(requestUrl, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`CSV builder running at http://127.0.0.1:${PORT}/`);
});

async function handleProductApi(requestUrl, res) {
  const source = requestUrl.searchParams.get("url");
  if (!source) {
    sendJson(res, 400, { error: "Missing url" });
    return;
  }

  let productUrl;
  try {
    productUrl = new URL(source);
  } catch (error) {
    sendJson(res, 400, { error: "Invalid url" });
    return;
  }

  // ===== SQUARESPACE DETECTION =====
  const isSquarespace = productUrl.pathname.includes("/shop/p/") ||
    productUrl.hostname.includes("squarespace.com") ||
    productUrl.hostname.includes("sqsp.net");

  if (isSquarespace) {
    try {
      const htmlRes = await fetch(productUrl.href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml"
        }
      });
      if (!htmlRes.ok) throw new Error(`Squarespace page returned status ${htmlRes.status}`);
      const html = await htmlRes.text();

      // Extract Static.SQUARESPACE_CONTEXT
      const ctxMatch = html.match(/Static\.SQUARESPACE_CONTEXT\s*=\s*(\{.+?\});?\s*<\/script>/s);
      if (!ctxMatch) throw new Error("Could not find SQUARESPACE_CONTEXT in page HTML");
      const ctx = JSON.parse(ctxMatch[1]);

      const itemTitle = ctx.website?.fullSiteTitle?.split("\u2014")?.[0]?.trim() ||
        ctx.item?.title || "Squarespace Product";
      const cleanTitle = itemTitle.replace(/[\u2014\u2013]/g, "-").trim();

      const descMatch = html.match(/<meta\s+(?:name|property)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i);
      const description = descMatch ? descMatch[1] : "";

      const sqProduct = ctx.product || {};
      const sqVariants = sqProduct.variants || [];
      const sqAttrNames = sqProduct.variantAttributeNames || ["Title"];

      const normalizeImg = (url) => {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        return url;
      };

      const allImageUrls = [];
      const seenImgs = new Set();

      const variants = sqVariants.map((v, i) => {
        const priceRaw = v.price?.value || 0;
        const salePriceRaw = v.salePrice?.value || 0;
        const onSale = v.onSale === true && salePriceRaw > 0 && salePriceRaw < priceRaw;
        const price = priceRaw / 100;
        const salePrice = salePriceRaw > 0 ? salePriceRaw / 100 : null;

        const attrs = v.attributes || {};
        const option1 = attrs[sqAttrNames[0]] || Object.values(attrs)[0] || "Default Title";
        const option2 = sqAttrNames[1] ? (attrs[sqAttrNames[1]] || "") : "";
        const option3 = sqAttrNames[2] ? (attrs[sqAttrNames[2]] || "") : "";
        const variantTitle = Object.values(attrs).join(" / ") || "Default Title";

        const imgUrl = normalizeImg(v.mainImage?.url || "");
        if (imgUrl && !seenImgs.has(imgUrl)) {
          seenImgs.add(imgUrl);
          allImageUrls.push(imgUrl);
        }

        const stock = v.stock?.unlimited ? 99 : (v.stock?.quantity ?? 0);

        return {
          id: v.id || `sq-${i}`,
          title: variantTitle,
          sku: v.sku || "",
          price: onSale ? price : price,
          compareAtPrice: onSale ? salePrice : null,
          onSale: onSale ? "Yes" : "No",
          stock,
          weight: v.shippingWeight?.value ? Number(v.shippingWeight.value) : 0,
          option1,
          option2,
          option3,
          featuredImage: imgUrl
        };
      });

      const cdnRegex = /https:\/\/images\.squarespace-cdn\.com\/[^"'\s]+(?:jpg|jpeg|png|webp)/gi;
      let imgMatch;
      while ((imgMatch = cdnRegex.exec(html)) !== null) {
        const raw = imgMatch[0].split("?")[0];
        if (!seenImgs.has(raw)) {
          seenImgs.add(raw);
          allImageUrls.push(raw);
        }
      }

      const options = sqAttrNames.map(name => ({
        name,
        values: [...new Set(sqVariants.map(v => v.attributes?.[name]).filter(Boolean))]
      }));
      if (options.length === 0) options.push({ name: "Title", values: ["Default Title"] });

      const textLower = html.toLowerCase();
      let vatStatus = "VAT Included (Assumed)";
      if (["ex vat", "excl vat", "ex. vat", "excluding vat", "+ vat", "+ 20% vat"].some(kw => textLower.includes(kw))) {
        vatStatus = "VAT Excluded";
      } else if (["inc vat", "incl vat", "including vat"].some(kw => textLower.includes(kw))) {
        vatStatus = "VAT Included";
      }

      const handle = productUrl.pathname.split("/").filter(Boolean).pop() || "squarespace-product";

      sendJson(res, 200, {
        sourceUrl: productUrl.href,
        handle,
        title: decodeHtmlEntities(cleanTitle),
        description: decodeHtmlEntities(description),
        images: allImageUrls.slice(0, 36),
        featuredImage: allImageUrls[0] || "",
        options,
        variants: variants.length > 0 ? variants : [{ id: "default", title: "Default Title", sku: "", price: 0, compareAtPrice: null, onSale: "No", stock: 99, weight: 0, option1: "Default Title" }],
        vatStatus
      });
      return;
    } catch (sqErr) {
      console.error("[SQUARESPACE SCRAPER ERROR]", sqErr.message);
      sendJson(res, 500, { error: `Squarespace scraping failed: ${sqErr.message}` });
      return;
    }
  }

  const handle = extractProductHandle(productUrl);
  if (!handle) {
    sendJson(res, 400, { error: "Could not find product handle in URL" });
    return;
  }

  const currency = requestUrl.searchParams.get("currency") || "GBP";

  // Detect if Shopify product URL by constructing the .js endpoint
  const jsonUrl = `${productUrl.origin}/products/${handle}.js?currency=${currency}`;
  
  let product;
  let html = "";
  try {
    product = await fetchShopifyProduct(jsonUrl);
    try {
      const targetHtmlUrl = productUrl.href + (productUrl.href.includes("?") ? "&" : "?") + `currency=${currency}`;
      const htmlResponse = await fetch(targetHtmlUrl, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (htmlResponse.ok) {
        html = await htmlResponse.text();
      }
    } catch (htmlErr) {
      console.log(`Failed to fetch HTML for VAT detection on ${productUrl.href}:`, htmlErr.message);
    }
  } catch (error) {
    console.log(`Shopify fetch failed for ${jsonUrl}, falling back to general HTML scraper:`, error.message);
    try {
      const fallbackResult = await fetchHtmlFallbackWithHtml(productUrl.href);
      product = fallbackResult.product;
      html = fallbackResult.html;
    } catch (fallbackError) {
      sendJson(res, 500, { error: `Failed to scrape page: ${fallbackError.message}` });
      return;
    }
  }

  const vatStatus = detectVatStatus(html);

  sendJson(res, 200, {
    sourceUrl: productUrl.href,
    handle,
    title: product.title || "",
    description: product.description || "",
    images: unique(product.images || []).slice(0, 36), // Increase max candidate count to 36
    featuredImage: (product.images || [])[0] || "",
    options: product.options || [{ name: "Title", values: ["Default Title"] }],
    variants: product.variants || [],
    vatStatus: vatStatus
  });
}

function extractProductHandle(productUrl) {
  const parts = productUrl.pathname.split("/").filter(Boolean);
  const productIndex = parts.lastIndexOf("products");
  if (productIndex >= 0 && parts[productIndex + 1]) {
    return parts[productIndex + 1].split("?")[0];
  }
  const lastPart = parts[parts.length - 1] || "";
  return lastPart.split("?")[0] || "";
}

async function fetchShopifyProduct(jsonUrl) {
  const response = await fetch(jsonUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`Product JSON failed: ${response.status}`);
  }

  const product = await response.json();
  const rawImages = [
    product.featured_image,
    ...(Array.isArray(product.images) ? product.images : [])
  ];

  // Map the brand / vendor prefix pattern
  const vendorName = product.vendor || "Shopify";
  const rawTitle = product.title || "";
  const formattedTitle = vendorName && !rawTitle.startsWith(vendorName) 
    ? `${vendorName} | ${rawTitle}` 
    : rawTitle;

  return {
    title: formattedTitle,
    description: stripHtml(product.description || product.body_html || ""),
    images: rawImages.map(normalizeImage).filter(Boolean),
    options: Array.isArray(product.options)
      ? product.options.map((opt) => ({
          name: opt.name,
          values: opt.values || []
        }))
      : [{ name: "Title", values: ["Default Title"] }],
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant) => {
          const rawPrice = typeof variant.price === "number" ? variant.price / 100 : Number(variant.price || 0) / 100;
          const rawComparePrice = variant.compare_at_price 
            ? (typeof variant.compare_at_price === "number" ? variant.compare_at_price / 100 : Number(variant.compare_at_price) / 100) 
            : null;

          const onSale = rawComparePrice && rawComparePrice > rawPrice ? "Yes" : "No";

          return {
            id: variant.id,
            title: variant.title,
            sku: variant.sku || "",
            price: onSale === "Yes" ? rawComparePrice : rawPrice, // Price is original, Sale Price is lower
            compareAtPrice: onSale === "Yes" ? rawPrice : null, // Store sale price here (or we mapping it in app.js)
            onSale: onSale,
            stock: typeof variant.inventory_quantity === "number" ? variant.inventory_quantity : (variant.available ? 99 : 0),
            weight: variant.weight ? Number(variant.weight) / 1000 : 0, // grams to kg
            option1: variant.option1 || null,
            option2: variant.option2 || null,
            option3: variant.option3 || null,
            featuredImage: variant.featured_image ? normalizeImage(variant.featured_image) : ""
          };
        })
      : []
  };
}

async function fetchHtmlFallbackInternal(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  const html = await response.text();

  // ===== WOOCOMMERCE DETECTION =====
  const isWooCommerce = html.includes("woocommerce") &&
    (html.includes("variations_form") || html.includes("product_variations") ||
     html.includes("wc-add-to-cart") || /generator.*WooCommerce/i.test(html));

  if (isWooCommerce) {
    console.log("[WOOCOMMERCE] Detected WooCommerce product page");

    // 1. Parse JSON-LD schema.org Product block
    let ldTitle = "", ldDescription = "", ldSku = "", ldPrice = 0, ldImage = "";
    const ldScripts = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const s of ldScripts) {
      try {
        const obj = JSON.parse(s[1]);
        const items = Array.isArray(obj["@graph"]) ? obj["@graph"] : [obj];
        for (const item of items) {
          if (item["@type"] === "Product") {
            ldTitle = item.name || "";
            ldDescription = item.description || "";
            ldSku = item.sku || "";
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

    // 2. Try data-product_variations for full variant list (WooCommerce variable products)
    const varDataMatch = html.match(/data-product_variations="([^"]+)"/) || html.match(/data-product_variations='([^']+)'/);
    let wcVariants = [];
    const allImages = new Set();
    if (ldImage) allImages.add(ldImage.split("?")[0]);

    if (varDataMatch) {
      try {
        const decoded = decodeHtmlEntities(varDataMatch[1]);
        const varJson = JSON.parse(decoded);
        wcVariants = varJson.map((v, i) => {
          const price = parseFloat(v.display_price || v.display_regular_price || 0);
          const regularPrice = parseFloat(v.display_regular_price || price);
          const onSale = v.display_price < v.display_regular_price ? "Yes" : "No";
          const imgUrl = (v.image?.url || v.image?.src || "").split("?")[0];
          if (imgUrl) allImages.add(imgUrl);
          const attrs = v.attributes || {};
          const attrValues = Object.values(attrs).map(val => decodeHtmlEntities(String(val)));
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
            option3: attrValues[2] || "",
            featuredImage: imgUrl
          };
        });
      } catch (e) {
        console.warn("[WOOCOMMERCE] data-product_variations parse failed:", e.message);
      }
    }

    // 3. Also extract any additional woocommerce product images from HTML
    const wcImgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/gi;
    let imgM;
    while ((imgM = wcImgRegex.exec(html)) !== null) {
      const raw = imgM[0].split("?")[0];
      const lower = raw.toLowerCase();
      if (
        (raw.includes("/wp-content/") || raw.includes("/uploads/") || raw.includes("/products/") || raw.includes("/files/")) &&
        !lower.includes("logo") &&
        !lower.includes("icon") &&
        !lower.includes("badge") &&
        !lower.includes("avatar") &&
        !lower.includes("tracker") &&
        !lower.includes("banner") &&
        !lower.includes("loading") &&
        !lower.includes("star") &&
        !lower.includes("arrow") &&
        !lower.includes("button")
      ) {
        allImages.add(raw);
      }
    }

    // 4. Build options from variant attributes
    const attrNames = [];
    const varDataMatch2 = html.match(/data-product_variations="([^"]+)"/) || html.match(/data-product_variations='([^']+)'/);
    if (varDataMatch2) {
      try {
        const decoded2 = decodeHtmlEntities(varDataMatch2[1]);
        const varJson = JSON.parse(decoded2);
        const firstVar = varJson[0];
        if (firstVar?.attributes) {
          for (const key of Object.keys(firstVar.attributes)) {
            const cleanName = key.replace(/^attribute_pa_/, "").replace(/_/g, " ");
            attrNames.push(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
          }
        }
      } catch {}
    }
    const options = attrNames.length > 0
      ? attrNames.map((name, idx) => ({
          name: decodeHtmlEntities(name),
          values: [...new Set(wcVariants.map(v => [v.option1, v.option2, v.option3][idx]).filter(Boolean))].map(decodeHtmlEntities)
        }))
      : [{ name: "Title", values: ["Default Title"] }];

    // 5. Fallback single variant if no variation data found
    if (wcVariants.length === 0) {
      wcVariants = [{ id: "wc-default", title: "Default Title", sku: ldSku, price: ldPrice, compareAtPrice: null, onSale: "No", stock: 99, weight: 0, option1: "Default Title", option2: "", option3: "", featuredImage: ldImage }];
    }

    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
    const finalTitle = decodeHtmlEntities(ldTitle || (titleMatch ? titleMatch[1] : "WooCommerce Product"));

    const textLower = html.toLowerCase();
    let vatStatus = "VAT Included (Assumed)";
    if (["ex vat", "excl. vat", "excluding vat", "+ vat"].some(k => textLower.includes(k))) vatStatus = "VAT Excluded";
    else if (["inc vat", "incl. vat", "including vat"].some(k => textLower.includes(k))) vatStatus = "VAT Included";

    const imageList = Array.from(allImages).slice(0, 36);
    return {
      product: {
        title: finalTitle,
        description: decodeHtmlEntities(ldDescription),
        images: imageList,
        featuredImage: imageList[0] || "",
        options,
        variants: wcVariants,
        vatStatus
      },
      html
    };
  }

  let rawTitle = matchContent(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i) 
    || matchContent(html, /<title>([^<]+)/i);
  let description = matchContent(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']+)/i)
    || matchContent(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)/i);
  const ogImage = matchContent(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)
    || matchContent(html, /<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)/i);
  
  // Extract all page image elements to support "more images" requirement
  const bodyImagesMatch = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
  const contentImages = bodyImagesMatch
    .map(normalizeImage)
    .filter(Boolean)
    .filter((img) => {
      const lower = img.toLowerCase();
      // Filter out utility SVGs, gifs, icons, logos, trackers
      return !lower.includes("logo") && 
             !lower.includes("icon") && 
             !lower.includes("badge") && 
             !lower.includes("avatar") && 
             !lower.includes("tracker") && 
             !lower.endsWith(".svg") && 
             !lower.endsWith(".gif");
    });

  let priceStr = matchContent(html, /<meta\s+property=["']og:price:amount["']\s+content=["']([^"']+)/i)
    || matchContent(html, /<meta\s+property=["']product:price:amount["']\s+content=["']([^"']+)/i)
    || matchContent(html, /"price"\s*:\s*"?([\d.,]+)"?/i);
  
  let price = priceStr ? parseFloat(priceStr.replace(/,/g, "")) : 0;

  // Extract brand
  let brand = matchContent(html, /<meta\s+property=["']product:brand["']\s+content=["']([^"']+)/i)
    || matchContent(html, /<meta\s+name=["']twitter:brand["']\s+content=["']([^"']+)/i)
    || matchContent(html, /<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)/i);

  // Parse structured schema graphs
  let parsedJsonLd = null;
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
  let match;
  const images = [ogImage, ...contentImages];
  let variants = [];
  let options = [];

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"] === "http://schema.org/Product") {
          parsedJsonLd = item;
          break;
        }
        if (item["@graph"] && Array.isArray(item["@graph"])) {
          const productInGraph = item["@graph"].find(g => g["@type"] === "Product");
          if (productInGraph) {
            parsedJsonLd = productInGraph;
            break;
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  if (parsedJsonLd) {
    const pTitle = parsedJsonLd.name || parsedJsonLd.title;
    const pDesc = parsedJsonLd.description;
    const pImages = Array.isArray(parsedJsonLd.image) ? parsedJsonLd.image : (parsedJsonLd.image ? [parsedJsonLd.image] : []);
    
    if (parsedJsonLd.brand) {
      const pBrand = typeof parsedJsonLd.brand === "string" 
        ? parsedJsonLd.brand 
        : (parsedJsonLd.brand.name || (parsedJsonLd.brand["@type"] === "Brand" && parsedJsonLd.brand.name));
      if (pBrand) brand = pBrand;
    }

    if (pTitle && !rawTitle) rawTitle = pTitle;
    if (pDesc && !description) description = pDesc;
    if (pImages.length) images.push(...pImages);

    if (parsedJsonLd.offers) {
      const offersList = Array.isArray(parsedJsonLd.offers) 
        ? parsedJsonLd.offers 
        : (parsedJsonLd.offers.offers ? parsedJsonLd.offers.offers : [parsedJsonLd.offers]);
      
      let offerIndex = 1;
      for (const offer of offersList) {
        if (offer["@type"] === "Offer" || offer["@type"] === "http://schema.org/Offer") {
          const oPrice = parseFloat(String(offer.price || "").replace(/,/g, ""));
          const oSku = offer.sku || offer.mpn || "";
          if (!isNaN(oPrice)) {
            variants.push({
              id: offer.url || `v-${offerIndex++}`,
              title: offer.name || `Variant ${offerIndex}`,
              sku: oSku,
              price: oPrice,
              compareAtPrice: null,
              onSale: "No",
              stock: 99,
              weight: 0,
              option1: offer.name || `Variant ${offerIndex}`,
              option2: null,
              option3: null,
              featuredImage: ""
            });
          }
        }
      }
    }
  }

  if (variants.length) {
    options = [{ name: "Title", values: variants.map(v => v.option1) }];
  } else {
    options = [{ name: "Title", values: ["Default Title"] }];
    variants = [{
      id: "default",
      title: "Default Title",
      sku: "",
      price: price || 0,
      compareAtPrice: null,
      onSale: "No",
      stock: 99,
      weight: 0,
      option1: "Default Title",
      option2: null,
      option3: null,
      featuredImage: ""
    }];
  }

  // Prefix naming pattern mapping: Brand | Product Name
  const formattedTitle = brand && !rawTitle.startsWith(brand) 
    ? `${brand} | ${rawTitle}` 
    : rawTitle;

  const product = {
    title: formattedTitle || "Scraped Product",
    description: stripHtml(description || ""),
    images: unique(images.map(normalizeImage).filter(Boolean)),
    options: options,
    variants: variants
  };

  return { product, html };
}

async function fetchHtmlFallbackWithHtml(url) {
  return await fetchHtmlFallbackInternal(url);
}

async function fetchHtmlFallback(url) {
  const res = await fetchHtmlFallbackInternal(url);
  return res.product;
}

function detectVatStatus(html) {
  if (!html) return "Unknown (HTML not loaded)";
  
  const lowerHtml = html.toLowerCase();
  
  // 1. Explicit Excl. VAT
  const exclKeywords = [
    "excl. vat", "excl vat", "excluding vat", "exclusive of vat", "vat excluded", 
    "plus vat", "ex. vat", "ex vat", "moms ekskl.", "ekskl. moms", "zzgl. mwst.", 
    "excl. moms", "excl moms", "ohne mwst", "ohne mwst.", "ex. moms", "ex moms"
  ];
  for (const kw of exclKeywords) {
    if (lowerHtml.includes(kw)) {
      return "VAT Excluded (" + kw + ")";
    }
  }

  // 2. Explicit Incl. VAT
  const inclKeywords = [
    "incl. vat", "incl vat", "including vat", "inclusive of vat", "vat included", 
    "prices include vat", "inc. vat", "inc vat", "moms incl.", "inkl. moms", 
    "moms inkluderet", "inkl. mwst.", "inkl mwst", "mwst. inkl.", "momsen ingår",
    "inkl. moms", "inkl moms", "inklusive moms", "tax included", "taxes included",
    "incl. tax", "incl tax", "inclusive of tax", "prices include tax", "moms ingår"
  ];
  for (const kw of inclKeywords) {
    if (lowerHtml.includes(kw)) {
      return "VAT Included (" + kw + ")";
    }
  }

  return "VAT Included (Assumed - No VAT mention)";
}

function normalizeImage(image) {
  const raw = typeof image === "string" ? image : image?.src || image?.url;
  if (!raw) return "";
  const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const imageUrl = new URL(absolute);
    imageUrl.search = "";
    return imageUrl.href;
  } catch (error) {
    return "";
  }
}

function stripHtml(value) {
  return decodeEntities(String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&bull;/g, '•')
    .replace(/&#8226;/g, '•')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');
}

function decodeEntities(value) {
  return decodeHtmlEntities(value);
}

function matchContent(html, regex) {
  const match = html.match(regex);
  return match ? decodeEntities(match[1].trim()) : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function serveStatic(requestUrl, res) {
  const safePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.resolve(ROOT, `.${safePath}`);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { 
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end("Not Found");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function handleSquarespaceSync(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  // Parse body
  let body;
  try {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const data = Buffer.concat(buffers).toString();
    body = JSON.parse(data);
  } catch (err) {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { apiKey, productSkus, colorImages } = body;
  if (!apiKey || !productSkus || !colorImages) {
    sendJson(res, 400, { error: "Missing required parameters (apiKey, productSkus, colorImages)" });
    return;
  }

  try {
    console.log(`Starting Squarespace Sync with API Key. Sku count: ${productSkus.length}`);
    
    // 1. Fetch all products from Squarespace
    const sqspProducts = await fetchSquarespaceProducts(apiKey);
    console.log(`Successfully fetched ${sqspProducts.length} products from Squarespace.`);
    
    // 2. Find the product containing our SKUs
    let targetProduct = null;
    const ourSkuSet = new Set(productSkus.map(s => String(s).trim().toUpperCase()));
    
    for (const prod of sqspProducts) {
      const hasSku = (prod.variants || []).some(v => ourSkuSet.has(String(v.sku).trim().toUpperCase()));
      if (hasSku) {
        targetProduct = prod;
        break;
      }
    }

    if (!targetProduct) {
      sendJson(res, 404, { 
        error: "These product SKUs are not registered in Squarespace yet. Please import the downloaded CSV into Squarespace first before clicking the sync button!" 
      });
      return;
    }

    const productId = targetProduct.id;
    const sqspVariants = targetProduct.variants || [];
    const sqspImages = targetProduct.images || [];
    console.log(`Matched product: ${targetProduct.name}. Variants: ${sqspVariants.length}. Images: ${sqspImages.length}`);

    // Set streaming headers
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff"
    });

    const sendEvent = (obj) => {
      res.write(JSON.stringify(obj) + "\n");
    };

    const totalVariants = sqspVariants.length;
    sendEvent({ status: "start", total: totalVariants });

    // 3. Perform the mapping
    const results = [];
    for (let i = 0; i < totalVariants; i++) {
      const variant = sqspVariants[i];
      const vSkuUpper = String(variant.sku).trim().toUpperCase();
      
      // Find matching color and local image URL
      const localVarData = colorImages.find(item => String(item.sku).trim().toUpperCase() === vSkuUpper);
      if (!localVarData) {
        results.push({ sku: variant.sku, status: "no_local_data_matched" });
        sendEvent({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "skipped_no_local" });
        continue;
      }

      const localImgUrl = localVarData.url;
      const colorIndex = localVarData.colorIndex;

      // Find the corresponding Squarespace image ID
      const imageId = findSquarespaceImageId(sqspImages, localImgUrl, colorIndex);
      
      if (imageId) {
        // Associate image with variant!
        await associateVariantImage(apiKey, productId, variant.id, imageId);
        results.push({ sku: variant.sku, status: "success", imageId });
        sendEvent({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "success" });
      } else {
        results.push({ sku: variant.sku, status: "no_image_matched" });
        sendEvent({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "skipped_no_image" });
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    console.log(`Sync completed. Successfully linked ${successCount} variants.`);
    
    sendEvent({ status: "complete", count: successCount, details: results });
    res.end();
  } catch (err) {
    console.error("Squarespace Sync Error:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || "Failed to sync variant images" });
    } else {
      res.write(JSON.stringify({ error: err.message || "Failed to sync variant images" }) + "\n");
      res.end();
    }
  }
}

async function fetchSquarespaceProducts(apiKey) {
  let products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    let url = "https://api.squarespace.com/v2/commerce/products";
    if (cursor) {
      url += `?cursor=${encodeURIComponent(cursor)}`;
    }

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "ShopShuttle/1.0",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Squarespace API Error: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    products = products.concat(data.products || []);
    
    cursor = data.pagination?.nextPageCursor || null;
    hasNext = !!(data.pagination?.hasNextPage && cursor);
  }

  return products;
}

async function associateVariantImage(apiKey, productId, variantId, imageId) {
  const url = `https://api.squarespace.com/v2/commerce/products/${productId}/variants/${variantId}/image`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": "ShopShuttle/1.0",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ imageId })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to associate image for variant ${variantId}: ${response.statusText} - ${text}`);
  }
}

function findSquarespaceImageId(sqspImages, localImgUrl, colorIndex) {
  if (!localImgUrl) return null;
  
  // 1. Try to match by filename substring
  const localFilename = localImgUrl.split('/').pop().split('?')[0].toLowerCase();
  if (localFilename && localFilename.length > 3) {
    const matched = sqspImages.find(img => {
      const sqspUrl = (img.url || "").toLowerCase();
      return sqspUrl.includes(localFilename);
    });
    if (matched) return matched.id;
  }
  
  // 2. Fallback to index-based matching
  if (colorIndex >= 0 && colorIndex < sqspImages.length) {
    return sqspImages[colorIndex].id;
  }
  
  return null;
}
