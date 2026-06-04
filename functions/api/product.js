import { verifyClerkToken } from "./utils/auth.js";

function normalizeImage(url) {
  if (!url) return "";
  let src = typeof url === "string" ? url : (url.src || "");
  if (src.startsWith("//")) {
    src = "https:" + src;
  }
  return src.split("?")[0];
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

export async function onRequest(context) {
  const { request } = context;
  
  // Handle CORS preflight options request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }

  // Passcode authentication guard
  try {
    await verifyClerkToken(context);
  } catch (authErr) {
    return new Response(JSON.stringify({ error: `Authentication required: ${authErr.message}` }), {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("url");
  const currency = url.searchParams.get("currency") || "GBP";

  if (!source) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  let productUrl;
  try {
    productUrl = new URL(source);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid product URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  // ===== SQUARESPACE DETECTION =====
  // Squarespace shop URLs: /shop/p/<slug> or squarespace.com domain
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

      // Extract the embedded Static.SQUARESPACE_CONTEXT JSON blob
      const ctxMatch = html.match(/Static\.SQUARESPACE_CONTEXT\s*=\s*(\{.+?\});?\s*<\/script>/s);
      if (!ctxMatch) throw new Error("Could not find SQUARESPACE_CONTEXT in page HTML");
      const ctx = JSON.parse(ctxMatch[1]);

      const itemTitle = ctx.website?.fullSiteTitle?.split("\u2014")?.[0]?.trim() ||
        ctx.item?.title || "Squarespace Product";
      const cleanTitle = itemTitle.replace(/[\u2014\u2013]/g, "-").trim();

      // Extract og:description from HTML as description
      const descMatch = html.match(/<meta\s+(?:name|property)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i);
      const description = descMatch ? descMatch[1] : "";

      // Parse product variants from SQUARESPACE_CONTEXT
      const sqProduct = ctx.product || {};
      const sqVariants = sqProduct.variants || [];
      const sqAttrNames = sqProduct.variantAttributeNames || ["Title"];

      const normalizeImg = (url) => {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        return url;
      };

      // Collect all unique variant images (per-variant main images + any product-level images)
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

      // Also extract any additional images from the HTML (squarespace-cdn images)
      const cdnRegex = /https:\/\/images\.squarespace-cdn\.com\/[^"'\s]+(?:jpg|jpeg|png|webp)/gi;
      let imgMatch;
      while ((imgMatch = cdnRegex.exec(html)) !== null) {
        const raw = imgMatch[0].split("?")[0];
        if (!seenImgs.has(raw)) {
          seenImgs.add(raw);
          allImageUrls.push(raw);
        }
      }

      // Build Squarespace-style options
      const options = sqAttrNames.map(name => ({
        name,
        values: [...new Set(sqVariants.map(v => v.attributes?.[name]).filter(Boolean))]
      }));
      if (options.length === 0) options.push({ name: "Title", values: ["Default Title"] });

      // Extract Squarespace categories and tags
      const itemTags = Array.isArray(ctx.item?.tags) ? ctx.item.tags.join(", ") : "";
      const itemCategories = Array.isArray(ctx.item?.categories) ? ctx.item.categories.join(", ") : "";

      // Detect VAT from description/HTML
      const textLower = html.toLowerCase();
      let vatStatus = "VAT Included (Assumed)";
      if (["ex vat", "excl vat", "ex. vat", "excluding vat", "+ vat", "+ 20% vat"].some(kw => textLower.includes(kw))) {
        vatStatus = "VAT Excluded";
      } else if (["inc vat", "incl vat", "including vat"].some(kw => textLower.includes(kw))) {
        vatStatus = "VAT Included";
      }

      const handle = productUrl.pathname.split("/").filter(Boolean).pop() || "squarespace-product";

      return new Response(JSON.stringify({
        sourceUrl: productUrl.href,
        handle,
        title: cleanTitle,
        description,
        images: allImageUrls.slice(0, 36),
        featuredImage: allImageUrls[0] || "",
        options,
        tags: itemTags,
        category: itemCategories,
        variants: variants.length > 0 ? variants : [{ id: "default", title: "Default Title", sku: "", price: 0, compareAtPrice: null, onSale: "No", stock: 99, weight: 0, option1: "Default Title" }],
        vatStatus
      }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (sqErr) {
      console.error("[SQUARESPACE SCRAPER ERROR]", sqErr.message);
      return new Response(JSON.stringify({ error: `Squarespace scraping failed: ${sqErr.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
  // ===== END SQUARESPACE =====

  const parts = productUrl.pathname.split("/").filter(Boolean);
  const productIndex = parts.lastIndexOf("products");
  let handle = "";
  if (productIndex >= 0 && parts[productIndex + 1]) {
    handle = parts[productIndex + 1].split("?")[0];
  } else {
    handle = (parts[parts.length - 1] || "").split("?")[0];
  }

  if (!handle) {
    return new Response(JSON.stringify({ error: "Could not find product handle" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  const jsonUrl = `${productUrl.origin}/products/${handle}.js?currency=${currency}`;

  try {
    const shopifyRes = await fetch(jsonUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });

    if (!shopifyRes.ok) {
      throw new Error(`Shopify responded with status ${shopifyRes.status}`);
    }

    const product = await shopifyRes.json();
    
    // Quick fetch HTML to detect VAT
    let vatStatus = "VAT Included (Assumed - No VAT mention)";
    try {
      const targetHtmlUrl = productUrl.href + (productUrl.href.includes("?") ? "&" : "?") + `currency=${currency}`;
      const htmlRes = await fetch(targetHtmlUrl, {
        headers: {
          "Accept": "text/html",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const text = html.toLowerCase();
        
        const excludedKeywords = [
          "ex vat", "excl vat", "ex. vat", "excl. vat", "excluding vat", "ex. tax", "excluding tax", "excl. tax"
        ];
        const includedKeywords = [
          "inc vat", "incl vat", "inc. vat", "incl. vat", "including vat", "inc. tax", "including tax", "incl. tax", "moms incl", "moms inkl"
        ];

        if (excludedKeywords.some(kw => text.includes(kw))) {
          vatStatus = "VAT Excluded";
        } else if (includedKeywords.some(kw => text.includes(kw))) {
          vatStatus = "VAT Included";
        }
      }
    } catch (e) {
      console.log("HTML scrap failed:", e.message);
    }

    const uniqueImages = Array.from(new Set(product.images || [])).slice(0, 36);

    return new Response(JSON.stringify({
      sourceUrl: productUrl.href,
      handle,
      title: product.title || "",
      description: product.description || "",
      images: uniqueImages,
      featuredImage: (product.images || [])[0] || "",
      options: product.options || [{ name: "Title", values: ["Default Title"] }],
      tags: Array.isArray(product.tags) ? product.tags.join(", ") : (product.tags || ""),
      category: product.type || "",
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
              price: onSale === "Yes" ? rawComparePrice : rawPrice,
              compareAtPrice: onSale === "Yes" ? rawPrice : null,
              onSale: onSale,
              stock: typeof variant.inventory_quantity === "number" ? variant.inventory_quantity : (variant.available ? 99 : 0),
              weight: variant.weight ? Number(variant.weight) / 1000 : 0,
              option1: variant.option1 || null,
              option2: variant.option2 || null,
              option3: variant.option3 || null,
              featuredImage: variant.featured_image ? normalizeImage(variant.featured_image) : ""
            };
          })
        : [],
      vatStatus
    }), {
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    // Fall back to general HTML scraper if JSON fetch is blocked
    try {
      const htmlRes = await fetch(productUrl.href, {
        headers: {
          "Accept": "text/html",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
      if (!htmlRes.ok) throw new Error(`Scraper failed with status ${htmlRes.status}`);
      const html = await htmlRes.text();

      // ===== WOOCOMMERCE DETECTION =====
      const isWooCommerce = html.includes("woocommerce") &&
        (html.includes("variations_form") || html.includes("product_variations") ||
         html.includes("wc-add-to-cart") || /generator.*WooCommerce/i.test(html));

      if (isWooCommerce) {
        console.log("[WOOCOMMERCE] Detected WooCommerce product page");

        // 1. Parse JSON-LD schema.org Product block
        let ldTitle = "", ldDescription = "", ldSku = "", ldPrice = 0, ldImage = "", ldCategory = "";
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

        // Extract WooCommerce Category and Tags from HTML/JSON-LD
        let wcCategory = "";
        let wcTags = "";

        // A. Try JSON-LD first (often has the full path like "All > Skate > Downhill Freeride")
        if (ldCategory) {
          wcCategory = decodeHtmlEntities(ldCategory);
        }

        // B. Fallback/Supplement from posted_in HTML
        const catMatch = html.match(/class=["']posted_in["'][^>]*>([\s\S]*?)<\/span>/i);
        if (catMatch) {
          const catContent = catMatch[1];
          const links = [...catContent.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(m => decodeHtmlEntities(m[1].trim()));
          if (links.length > 0) {
            wcCategory = links.join(", ");
          } else if (!wcCategory) {
            const textOnly = catContent.replace(/<[^>]+>/g, "").replace(/Category:|Categories:/gi, "").trim();
            wcCategory = decodeHtmlEntities(textOnly);
          }
        }

        // C. Supplement tags from tagged_as HTML
        const tagsMatch = html.match(/class=["']tagged_as["'][^>]*>([\s\S]*?)<\/span>/i);
        if (tagsMatch) {
          const tagsContent = tagsMatch[1];
          const links = [...tagsContent.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(m => decodeHtmlEntities(m[1].trim()));
          if (links.length > 0) {
            wcTags = links.join(", ");
          } else {
            const textOnly = tagsContent.replace(/<[^>]+>/g, "").replace(/Tag:|Tags:/gi, "").trim();
            wcTags = decodeHtmlEntities(textOnly);
          }
        }

        // D. Fallback to product_cat- and product_tag- classes if still empty
        if (!wcCategory) {
          const classCats = [...html.matchAll(/product_cat-([a-zA-Z0-9-_]+)/g)]
            .map(m => m[1].replace(/-/g, " ").trim())
            .map(c => c.charAt(0).toUpperCase() + c.slice(1));
          const uniqueClassCats = [...new Set(classCats)];
          if (uniqueClassCats.length > 0) {
            wcCategory = uniqueClassCats.join(", ");
          }
        }

        if (!wcTags) {
          const classTags = [...html.matchAll(/product_tag-([a-zA-Z0-9-_]+)/g)]
            .map(m => m[1].replace(/-/g, " ").trim())
            .map(t => t.charAt(0).toUpperCase() + t.slice(1));
          const uniqueClassTags = [...new Set(classTags)];
          if (uniqueClassTags.length > 0) {
            wcTags = uniqueClassTags.join(", ");
          }
        }

        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
        const finalTitle = decodeHtmlEntities(ldTitle || (titleMatch ? titleMatch[1] : "WooCommerce Product"));

        const textLower = html.toLowerCase();
        let vatStatus = "VAT Included (Assumed)";
        if (["ex vat", "excl. vat", "excluding vat", "+ vat"].some(k => textLower.includes(k))) vatStatus = "VAT Excluded";
        else if (["inc vat", "incl. vat", "including vat"].some(k => textLower.includes(k))) vatStatus = "VAT Included";

        const imageList = Array.from(allImages).slice(0, 36);
        return new Response(JSON.stringify({
          sourceUrl: productUrl.href,
          handle,
          title: finalTitle,
          description: decodeHtmlEntities(ldDescription),
          images: imageList,
          featuredImage: imageList[0] || "",
          options,
          tags: wcTags,
          category: wcCategory,
          variants: wcVariants,
          vatStatus
        }), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });
      }
      // ===== END WOOCOMMERCE =====

      // Generic HTML fallback (non-WooCommerce, non-Shopify, non-Squarespace)
      
      // 1. Flexible meta tag extractor (handles single/double quotes, spaces, and attribute ordering)
      const extractMeta = (propName, htmlString) => {
        const regexes = [
          new RegExp(`<meta[^>]*property=["']${propName}["'][^>]*content=["']([^"']+)["']`, "i"),
          new RegExp(`<meta[^>]*name=["']${propName}["'][^>]*content=["']([^"']+)["']`, "i"),
          new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${propName}["']`, "i"),
          new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${propName}["']`, "i")
        ];
        for (const r of regexes) {
          const m = htmlString.match(r);
          if (m) return decodeHtmlEntities(m[1]);
        }
        return "";
      };

      // 2. Parse JSON-LD metadata if present
      let ldProduct = null;
      try {
        const ldScripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const s of ldScripts) {
          try {
            const obj = JSON.parse(s[1].trim());
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
      } catch (ldErr) {
        console.warn("JSON-LD parse in fallback failed:", ldErr.message);
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
          ldFeaturedImg = decodeHtmlEntities(ldFeaturedImg).split("?")[0];
          if (ldFeaturedImg.startsWith("//")) ldFeaturedImg = "https:" + ldFeaturedImg;
        }

        if (ldProduct.offers) {
          const offer = Array.isArray(ldProduct.offers) ? ldProduct.offers[0] : ldProduct.offers;
          ldPrice = parseFloat(String(offer?.price || "0").replace(/,/g, ""));
          ldCurrency = offer?.priceCurrency || "";
        }
      }

      const title = decodeHtmlEntities(ldTitle || extractMeta("og:title", html) || (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "Scraped Product")).trim();
      const description = decodeHtmlEntities(ldDesc || extractMeta("og:description", html) || extractMeta("description", html) || "");
      const ogImage = ldFeaturedImg || extractMeta("og:image", html);
      const priceVal = ldPrice || parseFloat(extractMeta("og:price:amount", html) || extractMeta("product:price:amount", html) || "0");

      // 3. Robust image extraction
      const allImages = new Set();
      if (ogImage) {
        let cleanOgImage = ogImage.split("?")[0];
        if (cleanOgImage.startsWith("//")) {
          cleanOgImage = "https:" + cleanOgImage;
        }
        allImages.add(cleanOgImage);
      }

      // Match standard HTTP/S image URL paths in HTML source
      const imgUrlsRegex = /(?:https?:)?\/\/[^"'\s<>#]+\.(?:jpg|jpeg|png|webp)/gi;
      let imgMatch;
      while ((imgMatch = imgUrlsRegex.exec(html)) !== null) {
        let rawUrl = decodeHtmlEntities(imgMatch[0]);
        rawUrl = rawUrl.replace(/\\u0026/g, "&").replace(/\\u002f/g, "/");
        if (rawUrl.startsWith("//")) {
          rawUrl = "https:" + rawUrl;
        }
        const cleanUrl = rawUrl.split("?")[0];
        const lowerUrl = cleanUrl.toLowerCase();
        
        // Filter tracking pixels, UI elements, icons
        if (
          !lowerUrl.includes("logo") &&
          !lowerUrl.includes("icon") &&
          !lowerUrl.includes("badge") &&
          !lowerUrl.includes("avatar") &&
          !lowerUrl.includes("tracker") &&
          !lowerUrl.includes("banner") &&
          !lowerUrl.includes("pixel") &&
          !lowerUrl.includes("loading") &&
          !lowerUrl.includes("star") &&
          !lowerUrl.includes("arrow") &&
          !lowerUrl.includes("button") &&
          !lowerUrl.includes("google-analytics") &&
          !lowerUrl.includes("facebook.com")
        ) {
          allImages.add(cleanUrl);
        }
      }

      const images = Array.from(allImages).slice(0, 36);

      return new Response(JSON.stringify({
        sourceUrl: productUrl.href,
        handle,
        title,
        description,
        images,
        featuredImage: images[0] || "",
        options: [{ name: "Title", values: ["Default Title"] }],
        tags: "",
        category: "",
        variants: [{ 
          id: "scraped", 
          title: "Default Title", 
          sku: ldSku || "", 
          price: priceVal, 
          compareAtPrice: null, 
          onSale: "No", 
          stock: 99, 
          weight: 0, 
          option1: "Default Title" 
        }],
        vatStatus: "VAT Included (Assumed)"
      }), {
        headers: { 
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (fallbackErr) {
      return new Response(JSON.stringify({ error: `Scraper failed: ${fallbackErr.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  }
}
