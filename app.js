/* ==========================================================================
   ShopShuttle - Frontend Controller
   ========================================================================== */

// --- Constants & Configs ---
const CSV_COLUMNS = [
  "Product ID [Non Editable]",
  "Variant ID [Non Editable]",
  "Product Type [Non Editable]",
  "Product Page",
  "Product URL",
  "Title",
  "Description",
  "SKU",
  "GTIN",
  "MPN",
  "Option Name 1",
  "Option Value 1",
  "Option Name 2",
  "Option Value 2",
  "Option Name 3",
  "Option Value 3",
  "Option Name 4",
  "Option Value 4",
  "Option Name 5",
  "Option Value 5",
  "Option Name 6",
  "Option Value 6",
  "Price",
  "Sale Price",
  "On Sale",
  "Stock",
  "Categories",
  "Tags",
  "Weight",
  "Length",
  "Width",
  "Height",
  "Visible",
  "Hosted Image URLs"
];

const CSV_EXPORT_COLUMN_LABELS = {
  "Product ID [Non Editable]": "Product ID",
  "Variant ID [Non Editable]": "Variant ID",
  "Product Type [Non Editable]": "Product Type"
};

const PREVIEW_COLUMNS = [
  "Product Type [Non Editable]",
  "Product URL",
  "Title",
  "SKU",
  "Option Value 1",
  "Option Value 2",
  "Option Value 3",
  "Price",
  "Sale Price",
  "On Sale",
  "Stock",
  "Weight",
  "Hosted Image URLs",
  "Visible"
];

const VAT_RATE = 0.20; // 20% UK VAT

const COLORS = [
  { name: "Sand", hex: "#d1c1a3" },
  { name: "Dusty Rose", hex: "#c78984" },
  { name: "Black", hex: "#111111" },
  { name: "Pine Green", hex: "#2f5b4a" },
  { name: "Terracotta", hex: "#b85f3d" }
];

/*
 * Finds an image URL within a product's scraped/active image sets that matches a color name
 */
function findImageForColor(colorName, product) {
  if (!product || !colorName) return "";
  
  // Combine all possible product images to search
  const imagesToSearch = Array.from(new Set([
    ...(product.imageUrls || []),
    ...(product.allScrapedImages || [])
  ]));
  
  if (imagesToSearch.length === 0) return "";
  
  const name = colorName.toLowerCase().replace(/\s+/g, "");
  
  // 1. First try exact condensed name check
  for (const url of imagesToSearch) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes(name)) {
      return url;
    }
  }
  
  // 2. Second try tokenized word matching (highest overlapping score)
  // Split color name into separate words, ignoring generic words like 'birch', 'wood', 'finish'
  const colorWords = colorName.toLowerCase().split(/[\s_-]+/).filter(w => w && w !== "birch" && w !== "wood" && w !== "finish");
  if (colorWords.length > 0) {
    let bestMatch = "";
    let bestScore = 0;
    
    for (const url of imagesToSearch) {
      const lowerUrl = url.toLowerCase();
      let score = 0;
      
      colorWords.forEach(word => {
        if (lowerUrl.includes(word)) {
          score += 10;
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = url;
      }
    }
    
    if (bestMatch && bestScore > 0) {
      return bestMatch;
    }
  }
  
  // 3. Fallback spelling mappings for common colors
  for (const url of imagesToSearch) {
    const lowerUrl = url.toLowerCase();
    if (name === "dustyrose" && (lowerUrl.includes("dusty-rose") || lowerUrl.includes("dusty_rose") || lowerUrl.includes("rose"))) {
      return url;
    }
    if (name === "pinegreen" && (lowerUrl.includes("pine-green") || lowerUrl.includes("pine_green") || lowerUrl.includes("green"))) {
      return url;
    }
    if (name === "stainlesssteel" && (lowerUrl.includes("stainless") || lowerUrl.includes("steel"))) {
      return url;
    }
    if (name === "cobaltblue" && (lowerUrl.includes("cobalt") || lowerUrl.includes("blue"))) {
      return url;
    }
  }
  
  // Default to first image
  return imagesToSearch[0] || "";
}

/*
 * Finds a specific image URL matching multi-option configurations (Color, Size, Extra)
 */
function findImageForVariant(variant, product) {
  if (!product) return "";
  
  // 1. Prioritize looking up existing parsed Shopify variants (merchant-mapped clean studio renders)
  const variants = product.variants || [];
  const option1 = (variant.option1 || "").toLowerCase().trim();
  const option2 = (variant.option2 || "").toLowerCase().trim();
  
  if (option1) {
    // Extract only numerical size if preset vs Shopify options are in different orders
    const sizeNumMatch = option2.match(/\d+/);
    const sizeNum = sizeNumMatch ? sizeNumMatch[0] : "";
    
    const match = variants.find(sv => {
      const sv1 = String(sv.option1 || "").toLowerCase().trim();
      const sv2 = String(sv.option2 || "").toLowerCase().trim();
      const sv3 = String(sv.option3 || "").toLowerCase().trim();
      
      const colorMatches = sv1 === option1;
      let sizeMatches = false;
      if (sizeNum) {
        sizeMatches = sv2.includes(sizeNum) || sv3.includes(sizeNum);
      } else if (option2) {
        sizeMatches = sv2.includes(option2) || sv3.includes(option2);
      } else {
        sizeMatches = true;
      }
      
      return colorMatches && sizeMatches && sv.featuredImage && sv.featuredImage !== "none";
    });
    if (match) return match.featuredImage;
  }
  
  const imagesToSearch = Array.from(new Set([
    ...(product.imageUrls || []),
    ...(product.allScrapedImages || [])
  ]));
  
  if (imagesToSearch.length === 0) return "";
  
  const opt1 = (variant.option1 || "").toLowerCase().replace(/\s+/g, ""); // Color
  const opt2 = (variant.option2 || "").toLowerCase().replace(/\s+/g, ""); // Size (e.g. "90cm")
  const opt3 = (variant.option3 || "").toLowerCase().replace(/\s+/g, ""); // Extra (e.g. Slats)
  
  // Extract numerical size (e.g., "90 cm" -> "90", "140 cm" -> "140")
  const sizeNumMatch = (variant.option2 || "").match(/\d+/);
  const sizeNum = sizeNumMatch ? sizeNumMatch[0] : "";

  let bestMatch = "";
  let bestScore = -1;

  for (const url of imagesToSearch) {
    const lowerUrl = url.toLowerCase();
    let score = 0;

    // 1. Color must match
    let colorMatched = lowerUrl.includes(opt1);
    if (!colorMatched) {
      if (opt1 === "dustyrose" && (lowerUrl.includes("dusty-rose") || lowerUrl.includes("dusty_rose") || lowerUrl.includes("rose"))) colorMatched = true;
      if (opt1 === "pinegreen" && (lowerUrl.includes("pine-green") || lowerUrl.includes("pine_green") || lowerUrl.includes("green"))) colorMatched = true;
      if (opt1 === "stainlesssteel" && (lowerUrl.includes("stainless") || lowerUrl.includes("steel"))) colorMatched = true;
      if (opt1 === "cobaltblue" && (lowerUrl.includes("cobalt") || lowerUrl.includes("blue"))) colorMatched = true;
    }

    if (!colorMatched) continue; // Keep moving if color doesn't match

    score += 10; // Base score for color

    // 2. Size match (high weight)
    if (sizeNum && lowerUrl.includes(sizeNum)) {
      score += 20;
    } else if (opt2 && lowerUrl.includes(opt2)) {
      score += 15;
    }

    // 3. Option 3 / Extra matches (slats, side table, leg types)
    if (opt3) {
      if (lowerUrl.includes(opt3)) {
        score += 5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = url;
    }
  }

  return bestMatch || findImageForColor(variant.option1, product);
}




// --- Global Application State ---
const state = {
  products: [],
  activeProductId: null,
  theme: localStorage.getItem("theme") || "light",
  csvSearch: "",
  activeDrawerTab: "tab-details",
  priceUndoStack: [],
  selectedProductIds: new Set(), // v0.2.1 multi-select support
  activePlatform: "squarespace"  // Default active platform format
};



/* --------------------------------------------------------------------------
   Product Import & Crawling Logic
   -------------------------------------------------------------------------- */
function parseProductUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  const handle = parts[parts.length - 1] || "product";
  const variant = url.searchParams.get("variant") || "";
  
  // Every link defaults to "variants" (Actual Product Variants) for maximum universality.
  // The user can opt-into specialized Modified presets inside the Edit Drawer.
  const importMode = "variants";
  
  return { sourceUrl: url.href, handle, variant, importMode };
}

function addProduct(value) {
  let parsed;
  try {
    parsed = parseProductUrl(value);
  } catch (error) {
    showToast(`Skipping invalid link: ${value.slice(0, 32)}...`);
    return;
  }

  const exists = state.products.some((item) => item.sourceUrl === parsed.sourceUrl);
  if (exists) {
    showToast(`Already loaded: ${parsed.handle}`);
    return;
  }

  const newProduct = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...parsed,
    scrapingCurrency: document.getElementById("scrapingCurrency")?.value || "GBP",
    title: parsed.handle.replaceAll("-", " ").toUpperCase(),
    description: "Importing product description...",
    page: "shop",
    category: "",
    tags: "",
    imageStatus: "loading",
    imageUrls: [],
    allScrapedImages: [],
    featuredImage: "",
    options: [{ name: "Title", values: ["Default Title"] }],
    variants: [{ 
      id: "default", 
      title: "Default Title", 
      sku: "", 
      price: 0, 
      compareAtPrice: null, 
      onSale: "No", 
      stock: 99, 
      weight: 0, 
      option1: "Default Title" 
    }],
    vatStatus: "Analyzing..."
  };

  state.products.push(newProduct);
  render();
  enrichProduct(newProduct.id);
}

function removeProduct(id) {
  state.products = state.products.filter((item) => item.id !== id);
  if (state.activeProductId === id) {
    closeEditDrawer();
  }
  render();
  showToast("Product removed");
}

let clearConfirmTimeout = null;

function clearAllProducts() {
  if (state.products.length === 0) return;

  const btn = document.getElementById("clearAllBtn");
  if (!btn) return;
  
  if (!btn.classList.contains("confirming")) {
    // Enter confirmation state
    btn.classList.add("confirming");
    btn.textContent = "Confirm Clear?";
    btn.style.backgroundColor = "var(--danger)";
    btn.style.color = "#ffffff";
    btn.style.borderColor = "var(--danger)";
    
    clearConfirmTimeout = setTimeout(() => {
      resetClearBtnState();
    }, 3000); // Reset after 3 seconds
  } else {
    // Perform clear
    clearTimeout(clearConfirmTimeout);
    state.products = [];
    closeEditDrawer();
    render();
    showToast("Cleared all products");
    resetClearBtnState();
  }
}

function resetClearBtnState() {
  const btn = document.getElementById("clearAllBtn");
  if (!btn) return;
  btn.classList.remove("confirming");
  btn.textContent = "Clear All";
  btn.style.backgroundColor = "transparent";
  btn.style.color = "var(--danger)";
  btn.style.borderColor = "var(--danger)";
}

async function enrichProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  try {
    const currency = document.getElementById("scrapingCurrency")?.value || "DKK";
    let data;
    let responseOk = false;

    // 1. Attempt client-side direct fetch FIRST to bypass data-center IP blocks entirely!
    try {
      const productUrl = new URL(product.sourceUrl);
      const parts = productUrl.pathname.split("/").filter(Boolean);
      const productIndex = parts.lastIndexOf("products");
      let handle = "";
      if (productIndex >= 0 && parts[productIndex + 1]) {
        handle = parts[productIndex + 1].split("?")[0];
      } else {
        handle = (parts[parts.length - 1] || "").split("?")[0];
      }

      if (handle && (productUrl.hostname.includes("shopify") || productUrl.pathname.includes("/products/"))) {
        const directJsonUrl = `${productUrl.origin}/products/${handle}.js?currency=${currency}`;
        console.log("Attempting direct client-side Shopify fetch:", directJsonUrl);
        const directRes = await fetch(directJsonUrl);
        if (directRes.ok) {
          const shopifyData = await directRes.json();

          const cleanImage = (url) => {
            if (!url) return "";
            let src = typeof url === "string" ? url : (url.src || "");
            if (src.startsWith("//")) src = "https:" + src;
            return src.split("?")[0];
          };

          const uniqueImages = Array.from(new Set((shopifyData.images || []).map(cleanImage))).filter(Boolean).slice(0, 36);

          data = {
            sourceUrl: product.sourceUrl,
            handle,
            title: shopifyData.title || "",
            description: shopifyData.description || "",
            images: uniqueImages,
            featuredImage: cleanImage((shopifyData.images || [])[0]),
            options: shopifyData.options || [{ name: "Title", values: ["Default Title"] }],
            tags: Array.isArray(shopifyData.tags) ? shopifyData.tags.join(", ") : (shopifyData.tags || ""),
            category: shopifyData.type || "",
            variants: Array.isArray(shopifyData.variants)
              ? shopifyData.variants.map((variant) => {
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
                    featuredImage: variant.featured_image ? cleanImage(variant.featured_image) : ""
                  };
                })
              : [],
            vatStatus: "VAT Included (Assumed)"
          };
          responseOk = true;
          console.log("Direct client-side fetch successful!");
        }
      }
    } catch (directErr) {
      console.warn("Direct client-side fetch failed, falling back to server API:", directErr.message);
    }

    // 2. Fallback to server API scraper if direct fetch wasn't possible or failed
    if (!responseOk) {
      const response = await authenticatedFetch(`/api/product?url=${encodeURIComponent(product.sourceUrl)}&currency=${currency}`);
      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch details");
      }
    }

    const current = state.products.find((item) => item.id === productId);
    if (!current) return;

    current.scrapingCurrency = currency;
    current.title = data.title || current.title;
    current.description = generatePremiumDescription(current, data.description || "");
    current.allScrapedImages = Array.isArray(data.images) ? data.images : [];
    current.imageUrls = [...current.allScrapedImages];
    current.featuredImage = data.featuredImage || current.allScrapedImages[0] || "";
    current.imageStatus = current.allScrapedImages.length ? "loaded" : "empty";
    current.options = data.options || [{ name: "Title", values: ["Default Title"] }];
    
    current.variants = data.variants && data.variants.length ? data.variants.map(v => {
      let featImg = v.featuredImage || "";
      if (!featImg && v.featured_image) {
        featImg = typeof v.featured_image === 'string' ? v.featured_image : (v.featured_image.src || "");
      }
      const compareAtPrice = v.compareAtPrice !== undefined ? v.compareAtPrice : (v.compare_at_price || null);
      const price = v.price || 0;
      const onSale = v.onSale || ((compareAtPrice && Number(compareAtPrice) > Number(price)) ? "Yes" : "No");
      const stock = v.stock !== undefined ? v.stock : (v.available !== false ? 99 : 0);
      return {
        id: v.id,
        title: v.title,
        sku: v.sku || "",
        price: price,
        compareAtPrice: compareAtPrice,
        onSale: onSale,
        stock: stock,
        weight: v.weight || 0,
        option1: v.option1 || "",
        option2: v.option2 || "",
        option3: v.option3 || "",
        featuredImage: featImg
      };
    }) : [{
      id: "default",
      title: "Default Title",
      sku: "",
      price: 0,
      compareAtPrice: null,
      onSale: "No",
      stock: 99,
      weight: 0,
      option1: "Default Title"
    }];

    if (data.tags !== undefined) {
      current.tags = data.tags || "";
    }
    if (data.category !== undefined) {
      current.category = data.category || "";
    }

    // Set VAT Status detected from source page
    current.vatStatus = data.vatStatus || "Unknown (Please check manually)";

    // Auto-assign category based on product keywords ONLY if we don't have one from the source
    if (!current.category) {
      current.category = autoAssignCategory(current);
    }

    render();
    showToast(`Imported: ${current.title.slice(0, 24)}...`);
  } catch (error) {
    const current = state.products.find((item) => item.id === productId);
    if (!current) return;
    current.imageStatus = "error";
    current.imageError = error.message || "Failed to parse metadata";
    render();
    if (error.message && (error.message.includes("Authentication required") || error.message.includes("401"))) {
      showToast("Premium passcode required for Server Scraper fallback.");
      openPasscodeModal(0);
    } else {
      showToast(`Failed: ${current.handle}`);
    }
  }
}

function generatePremiumDescription(product, rawDesc) {
  const brandName = getBrandFromProduct(product);
  
  // Clean raw description
  const cleanDesc = stripHtml(rawDesc || "");
  
  // Try to find dimensions or use fallback for specific items
  let dims = extractDimensionsFromText(cleanDesc);
  if (!dims && brandName === "MOEBE" && product.handle.includes("bed")) {
    dims = "W90-180 x D200-220 x H29-44cm";
  }
  
  // Try to extract materials or use fallback ONLY for USM
  let materials = extractMaterialsFromText(cleanDesc);
  if (!materials && brandName === "USM") {
    materials = "Panels: Metal, powder coated\nStructure: Steel, chrome plated\nBall: Brass, chrome plated";
  }
  
  // Try to extract specifications or use fallback ONLY for USM
  let specs = extractSpecsFromText(cleanDesc);
  if (!specs && brandName === "USM") {
    specs = "2 x drop-down door";
  }
  
  const productionTime = "4 weeks"; // default fallback

  const parts = [];
  
  // 1. Tax rule (Common for all)
  parts.push("+ 20% VAT (for the UK customers only)\n");
  
  // 2. Brand name
  parts.push(`by ${brandName}\n`);
  
  // 3. Production time
  parts.push(`Production Time : ${productionTime}\n`);
  
  // 4. Dimensions (Include only if available)
  if (dims) {
    parts.push("Dimensions");
    parts.push(dims + "\n");
  }
  
  // 5. Material (Include only if available)
  if (materials) {
    parts.push("Material");
    parts.push(materials + "\n");
  }
  
  // 6. Specification (Include only if available)
  if (specs) {
    parts.push("Specification");
    parts.push(specs + "\n");
  }
  
  // 7. Shipping message
  parts.push(`We ship ${brandName} products worldwide.\n`);
  
  // 8. Shipping Cost details (Common)
  parts.push(`+ Shipping Cost
We offer worldwide shipping, and you can view the shipping costs for additional countries during the checkout process. Shipping rates for our primary destinations are as follows:

UK
Ireland
France
Denmark
United States
South Korea
Canada
Hong Kong
United Arab Emirates`);

  return parts.join("\n");
}

function stripHtml(html) {
  if (!html) return "";
  // Strip tag content
  let text = html.replace(/<[^>]*>/g, "\n");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return text;
}

function getBrandFromProduct(product) {
  const text = `${product.title} ${product.sourceUrl} ${product.tags}`.toLowerCase();
  if (text.includes("moebe")) return "MOEBE";
  if (text.includes("frama")) return "FRAMA";
  if (text.includes("usm")) return "USM";
  if (text.includes("hay")) return "HAY";
  if (text.includes("muuto")) return "MUUTO";
  if (text.includes("ferm living") || text.includes("ferm-living")) return "FERM LIVING";
  if (text.includes("normann")) return "NORMANN COPENHAGEN";
  if (text.includes("valerie objects") || text.includes("valerie-objects")) return "VALERIE OBJECTS";
  return "Brand Name";
}

function extractDimensionsFromText(text) {
  if (!text) return null;
  
  // Check for lines like "Dimensions: W152.3 x D37.3 x H74cm"
  const lines = text.split("\n");
  for (const line of lines) {
    if (/dimensions?/i.test(line) && /\d+/.test(line)) {
      return line.replace(/dimensions?:?/i, "").trim();
    }
  }

  // Look for any dimension format e.g. W152.3 x D37.3 x H74cm
  const regexes = [
    /([wW]\s*\d+(?:\.\d+)?\s*(?:x|[xX]|\*)\s*[dD]\s*\d+(?:\.\d+)?\s*(?:x|[xX]|\*)\s*[hH]\s*\d+(?:\.\d+)?\s*(?:cm|mm)?)/i,
    /(\d+(?:\.\d+)?\s*(?:x|[xX]|\*)\s*\d+(?:\.\d+)?\s*(?:x|[xX]|\*)\s*\d+(?:\.\d+)?\s*(?:cm|mm)?)/i
  ];
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

function extractMaterialsFromText(text) {
  if (!text) return null;
  const lines = text.split("\n");
  for (const line of lines) {
    if (/materials?/i.test(line) && line.length > 15) {
      return line.replace(/materials?:?/i, "").trim();
    }
  }
  return null;
}

function extractSpecsFromText(text) {
  if (!text) return null;
  const lines = text.split("\n");
  for (const line of lines) {
    if (/specifications?/i.test(line) && line.length > 15) {
      return line.replace(/specifications?:?/i, "").trim();
    }
  }
  return null;
}

/* --------------------------------------------------------------------------
   Auto Category Assignment
   Maps product data to existing Squarespace store categories:
   - /additional-sale      → sale / clearance items
   - /brand                → brand-named products
   - /furniture            → all furniture (default)
   - /valerie-objects      → Valerie Objects brand
   - /dining-desk-chairs   → chairs, dining, stools
   - /office               → office / desk furniture
   - /valerie-objects-furniture → Valerie Objects furniture
   -------------------------------------------------------------------------- */
function autoAssignCategory(product) {
  const text = [
    product.title || "",
    product.handle || "",
    product.tags || ""
  ].join(" ").toLowerCase();

  const cats = new Set();

  // Default: no hardcoded default category is assigned.

  // Brand detection → /brand
  const knownBrands = [
    "moebe", "frama", "valerie objects", "nemo", "hay", "muuto",
    "ferm living", "normann", "audo", "menu", "vitra",
    "fritz hansen", "carl hansen", "fredericia", "gubi",
    "louis poulsen", "le klint", "&tradition"
  ];
  for (const brand of knownBrands) {
    if (text.includes(brand)) {
      cats.add("/brand");
      break;
    }
  }

  // Valerie Objects specific categories
  if (text.includes("valerie objects") || text.includes("valerie-objects")) {
    cats.add("/valerie-objects");
    cats.add("/valerie-objects-furniture");
  }

  // Dining & desk chairs
  const chairKeywords = ["chair", "stool", "seating", "dining", "bar stool", "lounge chair", "armchair"];
  if (chairKeywords.some(kw => text.includes(kw))) {
    cats.add("/dining-desk-chairs");
  }

  // Office
  const officeKeywords = ["office", "desk", "shelving", "shelf", "storage", "cabinet", "drawer", "workspace", "bookcase", "bookshelf"];
  if (officeKeywords.some(kw => text.includes(kw))) {
    cats.add("/office");
  }

  // Additional Sale
  const saleKeywords = ["sale", "clearance", "outlet", "discount"];
  if (saleKeywords.some(kw => text.includes(kw))) {
    cats.add("/additional-sale");
  }

  return [...cats].join(", ");
}

function getVatAdjustedPrice(rawPrice, sourceVat, outputVat, product) {
  let price = Number(rawPrice || 0);
  if (!price) return 0;
  
  // Apply currency exchange conversion first
  if (product) {
    const fromCurrency = product.scrapingCurrency || document.getElementById("scrapingCurrency")?.value || "GBP";
    const toCurrency = document.getElementById("outputCurrency")?.value || "USD";
    const rate = getExchangeRate(fromCurrency, toCurrency);
    price = price * rate;
  }
  
  // 1. Calculate ex-VAT base price
  let basePrice = price;
  if (sourceVat === "incVat") {
    basePrice = price / (1 + VAT_RATE);
  }
  
  // 2. Calculate final output price
  if (outputVat === "incVat") {
    return basePrice * (1 + VAT_RATE);
  } else {
    return basePrice;
  }
}

/* --------------------------------------------------------------------------
   Dynamic Squarespace CSV Matrix Generator
   -------------------------------------------------------------------------- */
function selectedPriceKey() {
  return document.getElementById("priceSource").value; // exVat or incVat
}

function selectedVisibility() {
  return document.getElementById("visibility").value; // Yes or No
}

function selectedSkuPolicy() {
  return document.getElementById("skuPolicy")?.value || "auto";
}

/**
 * Resolve the SKU for a variant based on the user-selected SKU policy:
 *  - auto:   use source SKU if present, otherwise generate from handle + variantId
 *  - blank:  always output empty string (platform auto-assigns)
 *  - source: use source SKU only, blank if none
 */
function resolveSku(sourceSku, fallback) {
  const policy = selectedSkuPolicy();
  if (policy === "blank") return "";
  if (policy === "source") return sourceSku || "";
  // auto (default)
  return sourceSku || fallback || "";
}

function generateRows() {
  const priceKey = selectedPriceKey();
  const visibility = selectedVisibility();
  const rows = [];

  state.products.forEach((product) => {
    let first = true;

    const colorImagesOrdered = [];
    (product.variants || []).forEach(v => {
      let img = v.featuredImage || "";
      if (v.featuredImage === "none") {
        img = "";
      } else if (!img && v.option1) {
        img = findImageForVariant(v, product);
      }
      if (img) colorImagesOrdered.push(img);
    });

    const uniqueColorUrls = Array.from(new Set(colorImagesOrdered));
    const allUniqueImages = new Set([
      ...uniqueColorUrls,
      ...(product.imageUrls || [])
    ]);
    const mergedHostedImages = Array.from(allUniqueImages).join(" ");

    const activeOptions = product.options || [];
    const option1Name = activeOptions[0]?.name || "Title";
    const option2Name = activeOptions[1]?.name || "";
    const option3Name = activeOptions[2]?.name || "";

    (product.variants || []).forEach((variant) => {
      const rawPrice = Number(variant.price || 0);
      const rawComparePrice = variant.compareAtPrice ? Number(variant.compareAtPrice) : null;
      const isOnSale = variant.onSale === "Yes";

      const sourceVat = document.getElementById("sourceVat")?.value || "incVat";
      const priceToUse = getVatAdjustedPrice(rawPrice, sourceVat, priceKey, product);
      const compareToUse = rawComparePrice ? getVatAdjustedPrice(rawComparePrice, sourceVat, priceKey, product) : null;

      const hostedImages = first ? mergedHostedImages : "";
      let variantImg = variant.featuredImage || "";
      if (variantImg === "none") {
        variantImg = "";
      } else if (!variantImg && variant.option1) {
        variantImg = findImageForVariant(variant, product);
      }

      rows.push({
        "Product ID [Non Editable]": "",
        "Variant ID [Non Editable]": "",
        "Product Type [Non Editable]": first ? "PHYSICAL" : "",
        "Product Page": first ? product.page : "",
        "Product URL": first ? product.handle : "",
        "Title": first ? product.title : "",
        "Description": first ? product.description : "",
        "SKU": resolveSku(variant.sku, `${product.handle.toUpperCase()}-${String(variant.id || "").toUpperCase()}`),  
        "GTIN": "",
        "MPN": "",
        "Option Name 1": option1Name,
        "Option Value 1": variant.option1 || "Default Title",
        "Option Name 2": option2Name,
        "Option Value 2": variant.option2 || "",
        "Option Name 3": option3Name,
        "Option Value 3": variant.option3 || "",
        "Option Name 4": "",
        "Option Value 4": "",
        "Option Name 5": "",
        "Option Value 5": "",
        "Option Name 6": "",
        "Option Value 6": "",
        "Price": money(priceToUse),
        "Sale Price": isOnSale && compareToUse ? money(compareToUse) : "",
        "On Sale": isOnSale ? "Yes" : "No",
        "Stock": "Unlimited",
        "Categories": first ? product.category : "",
        "Tags": first ? product.tags : "",
        "Weight": variant.weight ? Number(variant.weight).toFixed(1) : "0.0",
        "Length": "0.0",
        "Width": "0.0",
        "Height": "0.0",
        "Visible": first ? visibility : "",
        "Hosted Image URLs": hostedImages,
        _variantImage: variantImg,
        _isMerged: variant.isMerged || false
      });
      first = false;
    });
  });

  return rows;
}

function money(value) {
  const num = Number(value || 0);
  const rounded = Math.round(num * 100) / 100;
  return rounded.toFixed(2);
}

function formatCurrency(value, currencyCode) {
  const num = Number(value || 0);
  const rounded = Math.round(num * 100) / 100;
  const currency = currencyCode || document.getElementById("outputCurrency")?.value || "USD";
  
  const symbols = {
    USD: "$",
    GBP: "£",
    EUR: "€",
    CAD: "C$",
    AUD: "A$",
    NZD: "NZ$",
    DKK: "kr"
  };
  
  const symbol = symbols[currency] || currency;
  
  if (currency === "DKK") {
    return `${rounded.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
  } else if (currency === "EUR") {
    return `€${rounded.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `${symbol}${rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function formatPounds(value) {
  const currency = document.getElementById("outputCurrency")?.value || "USD";
  return formatCurrency(value, currency);
}

function getExchangeRate(fromCurrency, toCurrency) {
  const manualInput = document.getElementById("customExchangeRate");
  if (manualInput && manualInput.value) {
    const customRate = parseFloat(manualInput.value);
    if (!isNaN(customRate) && customRate > 0) {
      return customRate;
    }
  }

  const baseRates = state.exchangeRates || {
    USD: 1.0,
    GBP: 0.80,
    EUR: 0.92,
    CAD: 1.36,
    AUD: 1.50,
    NZD: 1.63,
    DKK: 6.87
  };

  const fromRate = baseRates[fromCurrency] || 1.0;
  const toRate = baseRates[toCurrency] || 1.0;

  return toRate / fromRate;
}

async function fetchExchangeRates() {
  try {
    const cachedData = localStorage.getItem("exchangeRatesData");
    const cachedTime = localStorage.getItem("exchangeRatesTime");
    
    // Cache for 12 hours
    if (cachedData && cachedTime && (Date.now() - Number(cachedTime) < 12 * 60 * 60 * 1000)) {
      state.exchangeRates = JSON.parse(cachedData);
      updateExchangeRateUI();
      return;
    }

    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error("API response error");
    const data = await response.json();
    if (data && data.result === "success" && data.rates) {
      state.exchangeRates = data.rates;
      localStorage.setItem("exchangeRatesData", JSON.stringify(data.rates));
      localStorage.setItem("exchangeRatesTime", String(Date.now()));
      console.log("Live exchange rates fetched and cached:", data.rates);
    }
  } catch (err) {
    console.warn("Failed to fetch live exchange rates, using high-fidelity offline fallbacks:", err.message);
    state.exchangeRates = {
      USD: 1.0,
      GBP: 0.80,
      EUR: 0.92,
      CAD: 1.36,
      AUD: 1.50,
      NZD: 1.63,
      DKK: 6.87
    };
  }
  updateExchangeRateUI();
}

function updateExchangeRateUI() {
  const fromCurrency = document.getElementById("scrapingCurrency")?.value || "GBP";
  const toCurrency = document.getElementById("outputCurrency")?.value || "USD";
  const rate = getExchangeRate(fromCurrency, toCurrency);

  const rateTextEl = document.getElementById("rateStatusText");
  const dotEl = document.querySelector(".rate-status-dot");
  const manualInput = document.getElementById("customExchangeRate");

  if (rateTextEl) {
    const isOverride = manualInput && manualInput.value;
    const rateFormatted = rate.toFixed(4);
    
    if (isOverride) {
      rateTextEl.innerHTML = `<strong>1 ${fromCurrency} = ${rateFormatted} ${toCurrency}</strong> <span class="override-badge">Manual</span>`;
      dotEl?.classList.remove("green");
      dotEl?.classList.add("orange");
    } else {
      rateTextEl.innerHTML = `<strong>1 ${fromCurrency} = ${rateFormatted} ${toCurrency}</strong> <span class="live-badge">Live</span>`;
      dotEl?.classList.remove("orange");
      dotEl?.classList.add("green");
    }
  }
}

function initCurrencyRates() {
  fetchExchangeRates();

  document.getElementById("scrapingCurrency")?.addEventListener("change", () => {
    updateExchangeRateUI();
    renderPreviewTable();
    renderCatalogPreview();
  });

  document.getElementById("outputCurrency")?.addEventListener("change", () => {
    updateExchangeRateUI();
    renderPreviewTable();
    renderCatalogPreview();
  });

  document.getElementById("customExchangeRate")?.addEventListener("input", () => {
    updateExchangeRateUI();
    renderPreviewTable();
    renderCatalogPreview();
  });

  document.getElementById("clearOverrideBtn")?.addEventListener("click", () => {
    const manualInput = document.getElementById("customExchangeRate");
    if (manualInput) manualInput.value = "";
    updateExchangeRateUI();
    renderPreviewTable();
    renderCatalogPreview();
  });
}

/* --------------------------------------------------------------------------
   CSV Importer Utilities
   -------------------------------------------------------------------------- */
function csvEscape(value) {
  const text = String(value ?? "");
  // Squarespace wraps ALL values in double quotes in their CSV export
  return `"${text.replaceAll('"', '""')}"`;
}

function makeCsv(rows) {
  const headerLine = CSV_COLUMNS.map(col => csvEscape(CSV_EXPORT_COLUMN_LABELS[col] || col)).join(",");
  const lines = [headerLine];
  rows.forEach((rowData) => {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(rowData[column])).join(","));
  });
  return lines.join("\r\n");
}

/* --------------------------------------------------------------------------
   UI Render System
   -------------------------------------------------------------------------- */
function render() {
  renderProducts();
  renderCatalogPreview();
  renderPreviewTable();
  renderImageGuides();
  updatePremiumUI();
  updateActivePlatformUI();
}

function updateActivePlatformUI() {
  const platform = state.activePlatform || "squarespace";
  const btnSqsp = document.getElementById("downloadCsv");
  const btnShopify = document.getElementById("downloadShopifyCsv");
  const btnWoo = document.getElementById("downloadWooCommerceCsv");
  
  if (btnSqsp) btnSqsp.classList.toggle("active", platform === "squarespace");
  if (btnShopify) btnShopify.classList.toggle("active", platform === "shopify");
  if (btnWoo) btnWoo.classList.toggle("active", platform === "woocommerce");
}

function renderImageGuides() {
  const panel = document.getElementById("imageGuidePanel");
  const list = document.getElementById("imageGuideList");
  if (!panel || !list) return;

  const syncPanel = document.getElementById("sqspSyncPanel");
  if (state.products.length === 0 || state.activePlatform !== "squarespace") {
    panel.style.display = "none";
    if (syncPanel) syncPanel.style.display = "none";
    return;
  }

  // Find the active product or default to the first one
  const product = state.products.find(p => p.id === state.activeProductId) || state.products[0];
  if (!product) {
    panel.style.display = "none";
    if (syncPanel) syncPanel.style.display = "none";
    return;
  }

  if (syncPanel) syncPanel.style.display = "block";

  // Build the ordered colors list
  const colorImagesOrdered = [];
    (product.variants || []).forEach(v => {
      let img = v.featuredImage || "";
      if (v.featuredImage === "none") {
        img = "";
      } else if (!img && v.option1) {
        img = findImageForVariant(v, product);
      }
      if (img) {
        let label = v.option1;
        if (v.option2) label += ` / ${v.option2}`;
        if (v.option3) label += ` / ${v.option3}`;
        colorImagesOrdered.push({ name: label, url: img });
      }
    });

  const uniqueColorItems = [];
  const seenUrls = new Set();
  colorImagesOrdered.forEach(item => {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueColorItems.push(item);
    }
  });

  if (uniqueColorItems.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  list.innerHTML = uniqueColorItems.map((item, idx) => {
    return `
      <div class="image-guide-item" title="Click to copy image URL" data-url="${escapeHtml(item.url)}">
        <span class="image-guide-badge">${idx + 1}</span>
        <img class="image-guide-thumb" src="${escapeHtml(item.url)}" alt="">
        <div class="image-guide-info">
          <span class="image-guide-color">${escapeHtml(item.name)}</span>
          <span class="image-guide-url" style="max-width:140px;">${escapeHtml(item.url.split('/').pop().split('?')[0])}</span>
        </div>
      </div>
    `;
  }).join("");
}

// 1. Render Left sidebar imported products
function renderProducts() {
  const stack = document.getElementById("productStack");
  const count = document.getElementById("matchCount");
  count.textContent = `${state.products.length} product${state.products.length === 1 ? "" : "s"}`;

  if (!state.products.length) {
    stack.innerHTML = '<div class="empty-state">No links imported yet.</div>';
    if (typeof updateMergeActionPanel === "function") updateMergeActionPanel();
    return;
  }

  stack.innerHTML = state.products
    .map((product) => {
      const modeLabel = getImportModeLabel(product.importMode);
      const isMoebe = product.importMode.startsWith("moebe");
      const dotElements = isMoebe
        ? COLORS.map((color) => `<span class="swatch" title="${color.name}" style="background:${color.hex}"></span>`).join("")
        : `<span class="variant-count">${product.variants.length} Scraped Variants</span>`;

      let imageThumbHtml = "";
      if (product.imageStatus === "loading") {
        imageThumbHtml = `<div class="product-thumb-placeholder">...</div>`;
      } else if (product.imageStatus === "error") {
        imageThumbHtml = `<div class="product-thumb-placeholder" style="color:var(--danger)">!</div>`;
      } else if (product.featuredImage) {
        imageThumbHtml = `<img class="product-thumb" src="${escapeHtml(product.featuredImage)}" alt="">`;
      } else {
        imageThumbHtml = `<div class="product-thumb-placeholder">-</div>`;
      }

      const vatText = product.vatStatus || "Unknown (Please check manually)";
      const isIncl = vatText.includes("Included");
      const isExcl = vatText.includes("Excluded");
      const vatBadgeColor = isIncl ? "#e6f4ea" : (isExcl ? "#fce8e6" : "#f1f3f4");
      const vatTextColor = isIncl ? "#137333" : (isExcl ? "#c5221f" : "#5f6368");

      const isChecked = state.selectedProductIds.has(product.id) ? "checked" : "";
      const isSelectedClass = state.selectedProductIds.has(product.id) ? "is-selected" : "";

      if (product.isSyncing) {
        return `
          <article class="product-item ${isSelectedClass}" data-id="${product.id}" style="opacity: 0.8; animation: pulse 1.5s infinite ease-in-out;">
            <div class="product-select-wrapper">
              <input type="checkbox" class="product-select-checkbox" data-id="${product.id}" ${isChecked}>
            </div>
            <div class="product-thumb-container">
              <div class="product-thumb-placeholder" style="color:var(--accent-primary); font-size: 20px;">⏳</div>
            </div>
            <div class="product-top">
              <div class="product-details">
                <strong>✨ Extracting product data...</strong>
                <div style="margin-top: 6px; font-size: 11px; color: var(--ink-secondary);">
                  Reading HTML & parsing variants.<br>This will take only a few seconds. Please wait!
                </div>
              </div>
            </div>
          </article>
        `;
      }

      return `
        <article class="product-item ${isSelectedClass}" data-id="${product.id}">
          <div class="product-select-wrapper">
            <input type="checkbox" class="product-select-checkbox" data-id="${product.id}" ${isChecked}>
          </div>
          <div class="product-thumb-container">
            ${imageThumbHtml}
          </div>
          <div class="product-top">
            <div class="product-details">
              <strong>${escapeHtml(product.title)}</strong>
              <div class="meta-row">
                <span class="meta-badge ${isMoebe ? '' : 'custom-badge'}">${modeLabel}</span>
                <span>/ ${product.page}</span>
              </div>
              <span class="status-text">${imageMetaLabel(product)}</span>
              <div style="margin-top: 4px; font-size: 10px;">
                <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; background-color: ${vatBadgeColor}; color: ${vatTextColor}; font-weight: 500;">
                  VAT Status: ${escapeHtml(vatText)}
                </span>
              </div>
              <div class="swatches" style="margin-top: 6px;">${dotElements}</div>
            </div>
            <button class="remove-button" type="button" title="Remove" aria-label="Remove" data-remove="${product.id}">&times;</button>
          </div>
        </article>
      `;
    })
    .join("");

  if (typeof updateMergeActionPanel === "function") updateMergeActionPanel();
}

function getImportModeLabel(mode) {
  return "ACTUAL VARS";
}

function imageMetaLabel(product) {
  if (product.imageStatus === "loading") return "Crawling product info...";
  if (product.imageStatus === "loaded") return `${product.imageUrls.length} images included`;
  if (product.imageStatus === "empty") return "No product images found";
  if (product.imageStatus === "error") return "Crawl failed";
  return "";
}

// 2. Render active catalog info in the left pane
function renderCatalogPreview() {
  const list = document.getElementById("catalogList");
  const activeProducts = state.products;
  
  let catalogCount = 0;
  let html = "";

  activeProducts.forEach((product) => {
    catalogCount += product.variants.length;
    html += product.variants.slice(0, 5).map((variant) => `
      <div class="catalog-row" style="border-left: 3px solid var(--accent-primary)">
        <strong>${escapeHtml(product.title)} | ${escapeHtml(variant.title || "Default")}</strong>
        <small>SKU: ${escapeHtml(variant.sku || "-")} | Price: ${formatPounds(variant.price)}</small>
      </div>
    `).join("");

    if (product.variants.length > 5) {
      html += `<div class="catalog-row" style="text-align:center; padding: 6px; font-style: italic;">
        <small>+ ${product.variants.length - 5} more variant rows generated in CSV preview</small>
      </div>`;
    }
  });

  document.getElementById("catalogCount").textContent = `${catalogCount} row${catalogCount === 1 ? "" : "s"}`;
  
  if (!activeProducts.length) {
    list.innerHTML = '<div class="empty-state">Catalog structures will appear here once links are imported.</div>';
    return;
  }

  list.innerHTML = html;
}

// 3. Render Right Pane Live Table Preview with rounded image cells (Adapts to Active Platform Columns)
function renderPreviewTable() {
  let columnsToUse = PREVIEW_COLUMNS;
  let rows = [];
  
  if (state.activePlatform === "shopify") {
    columnsToUse = ["Handle", "Title", "Variant SKU", "Option1 Value", "Option2 Value", "Option3 Value", "Variant Price", "Variant Compare At Price", "Image Src", "Status"];
    rows = generateShopifyRows();
  } else if (state.activePlatform === "woocommerce") {
    columnsToUse = ["Type", "SKU", "Name", "Regular price", "Sale price", "Images", "Categories", "Tags"];
    rows = generateWooCommerceRows();
  } else {
    // squarespace (default)
    columnsToUse = PREVIEW_COLUMNS;
    rows = generateRows();
  }

  const thead = document.querySelector("#previewTable thead");
  const tbody = document.querySelector("#previewTable tbody");
  if (!thead || !tbody) return;
  
  thead.innerHTML = `<tr>${columnsToUse.map((column) => `<th>${column}</th>`).join("")}</tr>`;

  const query = state.csvSearch.toLowerCase().trim();
  const filteredRows = rows.filter((row) => {
    if (!query) return true;
    return (
      String(row["Title"] || row["Name"] || "").toLowerCase().includes(query) ||
      String(row["SKU"] || row["Variant SKU"] || "").toLowerCase().includes(query) ||
      String(row["Option Value 1"] || row["Option1 Value"] || row["Attribute 1 value(s)"] || "").toLowerCase().includes(query) ||
      String(row["Option Value 2"] || row["Option2 Value"] || row["Attribute 2 value(s)"] || "").toLowerCase().includes(query) ||
      String(row["Option Value 3"] || row["Option3 Value"] || row["Attribute 3 value(s)"] || "").toLowerCase().includes(query) ||
      String(row["Product URL"] || row["Handle"] || "").toLowerCase().includes(query)
    );
  });

  if (!filteredRows.length) {
    tbody.innerHTML = `<tr><td class="empty-state" colspan="${columnsToUse.length}" style="text-align:center; padding:40px;">No rows matching. Add a product or clear search query.</td></tr>`;
  } else {
    tbody.innerHTML = filteredRows
      .slice(0, 100)
      .map((rowData) => `
        <tr>
          ${columnsToUse.map((column) => {
            const val = rowData[column] || "";
            let cellContent = escapeHtml(val);
            
            if ((column === "Hosted Image URLs" || column === "Images" || column === "Image Src") && val) {
              const urls = val.split(/[\s,]+/).filter(Boolean);
              const imgTags = urls.slice(0, 5).map(u => `<img src="${escapeHtml(u)}" style="width:24px; height:24px; object-fit:cover; border:1px solid var(--border-color); margin-right:4px;" alt="">`).join("");
              const moreText = urls.length > 5 ? `<span style="font-size:10px; color:var(--ink-secondary); font-weight:700;">+${urls.length - 5}</span>` : "";
              cellContent = `<div style="display:flex; align-items:center; gap:2px;">${imgTags}${moreText}</div>`;
            } else if (column === "Option Value 1" || column === "Option1 Value" || column === "Attribute 1 value(s)") {
              const isVar = rowData["Type"] === "variation" || (rowData["Product Type [Non Editable]"] !== "PHYSICAL" && rowData["Product Type [Non Editable]"] !== undefined) || state.activePlatform === "shopify";
              const imgHtml = rowData._variantImage || (state.activePlatform === "shopify" && rowData["Variant Image"]) || (state.activePlatform === "woocommerce" && isVar && rowData["Images"] && !rowData["Images"].includes(",") ? rowData["Images"] : "")
                ? `<img src="${escapeHtml(rowData._variantImage || rowData["Variant Image"] || (rowData["Images"] && !rowData["Images"].includes(",") ? rowData["Images"] : ""))}" class="inline-swatch-img" alt="">` 
                : "";
              const badgeHtml = rowData._isMerged 
                ? `<span class="badge-merged" style="margin-left: 6px; font-size: 8px; padding: 1px 4px; line-height: 1;" title="Merged from separate product URL">Merged</span>` 
                : "";
              
              cellContent = `
                <div class="inline-swatch-wrapper" title="${(rowData._variantImage || rowData["Variant Image"]) ? 'Variant Specific Image' : ''}">
                  ${imgHtml}
                  <span>${escapeHtml(val)}</span>
                  ${badgeHtml}
                </div>
              `;
            } else if (column === "Price" || column === "Variant Price" || column === "Regular price") {
              cellContent = `<strong>${formatPounds(val)}</strong>`;
            } else if (column === "Sale Price" || column === "Variant Compare At Price" || column === "Sale price") {
              cellContent = val ? `<strong style="color:var(--accent-secondary)">${formatPounds(val)}</strong>` : "-";
            } else if (column === "On Sale") {
              cellContent = `<span class="meta-badge" style="background-color: ${val === 'Yes' ? 'var(--danger-light)' : 'var(--bg-app)'}; color: ${val === 'Yes' ? 'var(--danger)' : 'var(--ink-secondary)'};">${val}</span>`;
            } else if (column === "Stock" || column === "Variant Inventory Qty") {
              cellContent = val ? `<strong>${val} units</strong>` : "-";
            } else if (column === "Weight" || column === "Variant Grams" || column === "Weight (kg)") {
              const unit = state.activePlatform === "shopify" ? "g" : "kg";
              cellContent = val && Number(val) > 0 ? `<span>${val} ${unit}</span>` : "-";
            } else if (column === "Visible" || column === "Published") {
              const isVisible = val === "Yes" || val === "true" || val === "1" || val === "visible" || val === "Published";
              cellContent = `<span class="meta-badge" style="background-color: ${isVisible ? 'var(--accent-light)' : 'var(--danger-light)'}; color: ${isVisible ? 'var(--accent-primary)' : 'var(--danger)'};">${isVisible ? 'Yes' : 'No'}</span>`;
            }
            
            return `<td>${cellContent}</td>`;
          }).join("")}
        </tr>
      `)
      .join("");
  }

  renderSummaryRibbon(rows);
}

// 4. Render Top Ribbon Analytical Stats
function renderSummaryRibbon(allRows) {
  const summaryProducts = document.getElementById("summaryProducts");
  const summaryVariants = document.getElementById("summaryVariants");
  const summaryRange = document.getElementById("summaryRange");
  const summaryImages = document.getElementById("summaryImages");

  const productCount = state.products.length;
  summaryProducts.textContent = productCount;
  summaryVariants.textContent = allRows.length;

  const priceKey = state.activePlatform === "shopify" ? "Variant Price" : (state.activePlatform === "woocommerce" ? "Regular price" : "Price");
  const prices = allRows.map((item) => Number(item[priceKey])).filter(Number.isFinite);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  
  summaryRange.textContent = prices.length 
    ? `${formatPounds(minPrice)} - ${formatPounds(maxPrice)}` 
    : "-";

  const totalImageUrlsCount = state.products.reduce((acc, p) => acc + (p.imageUrls?.length || 0), 0);
  summaryImages.textContent = totalImageUrlsCount;
}

/* --------------------------------------------------------------------------
   Sliding Product Editor Drawer System
   -------------------------------------------------------------------------- */
function openEditDrawer(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  state.activeProductId = productId;
  
  document.getElementById("drawerProductTitle").textContent = product.title || "Edit Product";
  
  document.getElementById("editTitle").value = product.title || "";
  document.getElementById("editHandle").value = product.handle || "";
  document.getElementById("editPage").value = product.page || "shop";
  document.getElementById("editCategory").value = product.category || "";
  document.getElementById("editTags").value = product.tags || "";
  document.getElementById("editDescription").value = product.description || "";
  document.getElementById("editVatStatus").value = product.vatStatus || "Unknown (Please check manually)";
  
  const radios = document.getElementsByName("productImportMode");
  radios.forEach((radio) => {
    radio.checked = radio.value === product.importMode;
  });

  populateImagesTab(product);
  populateVariantsTab(product);

  document.getElementById("drawerOverlay").classList.add("active");
  document.getElementById("editDrawer").classList.add("active");
  
  switchDrawerTab("tab-details");
}

function closeEditDrawer() {
  state.activeProductId = null;
  document.getElementById("drawerOverlay").classList.remove("active");
  document.getElementById("editDrawer").classList.remove("active");
}

function switchDrawerTab(tabId) {
  state.activeDrawerTab = tabId;
  
  const tabButtons = document.querySelectorAll(".drawer-tabs .tab-link");
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });

  const tabContents = document.querySelectorAll(".drawer-body .tab-content");
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.getAttribute("id") === tabId);
  });
}

function populateImagesTab(product) {
  const grid = document.getElementById("imageGridEditor");
  const countSpan = document.getElementById("galleryCount");
  
  const scraped = product.allScrapedImages || [];
  countSpan.textContent = scraped.length;

  if (scraped.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1">No images scraped for this product URL. Paste custom images below.</div>`;
    return;
  }

  grid.innerHTML = scraped
    .map((imgUrl, idx) => {
      const isSelected = product.imageUrls.includes(imgUrl);
      const isFeatured = product.featuredImage === imgUrl;
      return `
        <div class="image-editor-card ${isSelected ? 'is-selected' : ''} ${isFeatured ? 'is-featured' : ''}" data-url="${escapeHtml(imgUrl)}">
          <img src="${escapeHtml(imgUrl)}" alt="Product Image ${idx + 1}" loading="lazy">
          <span class="select-checkbox"></span>
          <span class="image-badge">Featured</span>
        </div>
      `;
    })
    .join("");

  document.getElementById("customImageUrls").value = product.imageUrls
    .filter(url => !scraped.includes(url))
    .join("\n");
}

function populateVariantsTab(product) {
  const options = product.options || [];
  document.getElementById("optName1").value = options[0]?.name || "Title";
  document.getElementById("optName2").value = options[1]?.name || "";
  document.getElementById("optName3").value = options[2]?.name || "";

  renderVariantRowsTable(product);
}

function renderVariantRowsTable(product) {
  const tbody = document.querySelector("#variantEditorTable tbody");
  const variants = product.variants || [];

  state.priceUndoStack = [];

  if (variants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-state" style="text-align:center;">No variants created yet. Click "+ Add New Variant Row".</td></tr>`;
    return;
  }

  tbody.innerHTML = variants
    .map((v, idx) => {
      const onSaleSelected = v.onSale === "Yes";
      // Auto-assign image if not set yet for MOEBE presets or if we can find one matching the color
      // Auto-assign image if not set yet for MOEBE presets or if we can find one matching the color
      let displayImg = v.featuredImage || "";
      if (v.featuredImage === "none") {
        displayImg = "";
      } else if (!displayImg) {
        displayImg = findImageForColor(v.option1 || "", product);
      }

      return `
        <tr data-idx="${idx}" data-img="${escapeHtml(v.featuredImage || '')}" data-orig-price="${parseFloat(v.price || 0).toFixed(2)}">
          <td class="variant-img-cell">
            <button type="button" class="variant-thumb-btn" title="Click to choose variant image">
              ${displayImg ? `<img src="${escapeHtml(displayImg)}" class="variant-thumb-img" alt="">` : `<span class="variant-thumb-placeholder">📷</span>`}
            </button>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="text" class="v-opt1" value="${escapeHtml(v.option1 || '')}" placeholder="Value" style="flex: 1; min-width: 0;">
              ${v.isMerged ? `<span class="badge-merged" title="Merged from separate product URL" style="font-size: 8px; padding: 2px 4px; line-height: 1;">Merged</span>` : ""}
            </div>
          </td>
          <td><input type="text" class="v-opt2" value="${escapeHtml(v.option2 || '')}" placeholder="Value" ${product.options?.[1] ? '' : 'disabled'}></td>
          <td><input type="text" class="v-opt3" value="${escapeHtml(v.option3 || '')}" placeholder="Value" ${product.options?.[2] ? '' : 'disabled'}></td>
          <td><input type="text" class="v-sku" value="${escapeHtml(v.sku || '')}" placeholder="SKU"></td>
          <td><input type="number" step="0.01" class="v-price" value="${v.price || 0}" placeholder="Price"></td>
          <td><input type="number" step="0.01" class="v-compare" value="${v.compareAtPrice || ''}" placeholder="Sale Price"></td>
          <td>
            <select class="v-onsale" style="padding: 4px; font-size: 11px; min-height: 0;">
              <option value="No" ${onSaleSelected ? '' : 'selected'}>No</option>
              <option value="Yes" ${onSaleSelected ? 'selected' : ''}>Yes</option>
            </select>
          </td>
          <td><input type="number" class="v-stock" value="${typeof v.stock !== 'undefined' ? v.stock : 99}" placeholder="Stock"></td>
          <td><input type="number" step="0.01" class="v-weight" value="${v.weight || 0}" placeholder="kg"></td>
          <td style="text-align: center;">
            <button type="button" class="remove-button delete-v-row" style="margin: 0 auto;">&times;</button>
          </td>
        </tr>
      `;
    })
    .join("");

  // Render bulk price groups
  renderBulkPriceGroups();
}

function updatePriceInputStyle(priceInput, row) {
  const origVal = parseFloat(row.getAttribute("data-orig-price")) || 0;
  const currentVal = parseFloat(priceInput.value) || 0;
  if (Math.abs(currentVal - origVal) > 0.001) {
    priceInput.classList.add("is-modified");
    priceInput.style.backgroundColor = "#e6f0fa";
    priceInput.style.borderColor = "#0c6cf2";
    priceInput.style.color = "#0c6cf2";
    priceInput.style.fontWeight = "700";
  } else {
    priceInput.classList.remove("is-modified");
    priceInput.style.backgroundColor = "";
    priceInput.style.borderColor = "";
    priceInput.style.color = "";
    priceInput.style.fontWeight = "";
  }
}

function renderBulkPriceGroups() {
  const container = document.getElementById("bulkPriceGroupsContainer");
  const bulkSection = document.getElementById("bulkPriceSection");
  if (!container || !bulkSection) return;

  const rows = document.querySelectorAll("#variantEditorTable tbody tr");
  if (rows.length === 0) {
    bulkSection.style.display = "none";
    return;
  }

  // Update styles of all price input elements
  rows.forEach((row) => {
    const priceInput = row.querySelector(".v-price");
    if (priceInput) updatePriceInputStyle(priceInput, row);
  });

  // Group by original price, so the keys and ordering NEVER shuffles!
  const priceGroups = {};
  rows.forEach((row) => {
    const origPriceVal = parseFloat(row.getAttribute("data-orig-price")) || 0;
    const priceInput = row.querySelector(".v-price");
    if (!priceInput) return;
    const currentPriceVal = parseFloat(priceInput.value) || 0;

    const key = origPriceVal.toFixed(2);
    if (!priceGroups[key]) {
      priceGroups[key] = {
        origPrice: origPriceVal,
        currentPrices: new Set(),
        count: 0
      };
    }
    priceGroups[key].currentPrices.add(currentPriceVal.toFixed(2));
    priceGroups[key].count += 1;
  });

  const sortedKeys = Object.keys(priceGroups).sort((a, b) => parseFloat(a) - parseFloat(b));

  if (sortedKeys.length === 0) {
    bulkSection.style.display = "none";
    return;
  }

  bulkSection.style.display = "block";

  container.innerHTML = sortedKeys.map((key) => {
    const group = priceGroups[key];
    const currentPricesArr = Array.from(group.currentPrices);
    
    let priceDisplayHtml = "";
    if (currentPricesArr.length === 1 && Math.abs(parseFloat(currentPricesArr[0]) - group.origPrice) < 0.01) {
      // Unmodified
      priceDisplayHtml = `<strong>£${group.origPrice.toFixed(2)}</strong>`;
    } else if (currentPricesArr.length === 1) {
      // Modified uniformly
      priceDisplayHtml = `
        <span class="price-badge-modified" style="background: #e6f0fa; color: #0c6cf2; padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 3px; margin-right: 4px; display: inline-block;">Modified</span>
        <s style="color: var(--ink-secondary);">£${group.origPrice.toFixed(2)}</s> ➡️ <strong style="color: #0c6cf2;">£${parseFloat(currentPricesArr[0]).toFixed(2)}</strong>
      `;
    } else {
      // Split into multiple prices
      priceDisplayHtml = `
        <span class="price-badge-modified" style="background: #fff0f0; color: #d9383a; padding: 2px 6px; font-size: 9px; font-weight: 700; border-radius: 3px; margin-right: 4px; display: inline-block;">Split</span>
        <s style="color: var(--ink-secondary);">£${group.origPrice.toFixed(2)}</s> ➡️ <span style="font-weight: 600; color: var(--ink-primary);">${currentPricesArr.map(p => `£${parseFloat(p).toFixed(2)}`).join(", ")}</span>
      `;
    }

    return `
      <div class="bulk-price-group-item" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; background-color: var(--bg-app); border: 1px solid var(--border-color); border-radius: 4px;">
        <span style="font-size: 11px; font-weight: 500; color: var(--ink-primary); display: flex; align-items: center; gap: 6px;">
          ${priceDisplayHtml} <span style="color: var(--ink-secondary);">(${group.count} variants)</span>
        </span>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="number" step="0.01" class="group-price-input" data-original-price="${group.origPrice}" placeholder="New Price" style="width: 80px; padding: 4px 6px; font-size: 11px; border: 1px solid var(--border-color); border-radius: 3px; outline: none; text-align: right; background: var(--bg-soft); color: var(--ink-primary);">
          <button type="button" class="apply-group-price-btn" data-original-price="${group.origPrice}" style="padding: 4px 10px; font-size: 11px; font-weight: 600; background-color: var(--accent-primary); color: white; border: none; border-radius: 3px; cursor: pointer;">Apply</button>
        </div>
      </div>
    `;
  }).join("");

  // Add click listener to apply buttons
  container.querySelectorAll(".apply-group-price-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const origPriceFloat = parseFloat(btn.getAttribute("data-original-price"));
      const input = container.querySelector(`.group-price-input[data-original-price="${origPriceFloat}"]`);
      if (!input || !input.value) return;

      const newPriceFloat = Math.round(parseFloat(input.value) * 100) / 100;
      if (isNaN(newPriceFloat)) return;

      // Push to Undo stack before updating
      const previousState = Array.from(rows).map(row => row.querySelector(".v-price").value);
      state.priceUndoStack.push(previousState);

      // Update all inputs in the main table that match the original price
      let updatedCount = 0;
      rows.forEach((row) => {
        const origVal = parseFloat(row.getAttribute("data-orig-price")) || 0;
        if (Math.abs(origVal - origPriceFloat) < 0.01) {
          const priceInput = row.querySelector(".v-price");
          if (priceInput) {
            priceInput.value = newPriceFloat.toFixed(2);
            // Highlight flash animation
            priceInput.style.transition = "background-color 0.1s ease";
            priceInput.style.backgroundColor = "rgba(12, 108, 242, 0.2)";
            setTimeout(() => {
              priceInput.style.transition = "background-color 0.5s ease";
              updatePriceInputStyle(priceInput, row);
            }, 500);
            updatedCount += 1;
          }
        }
      });

      showToast(`Updated ${updatedCount} variants from £${origPriceFloat.toFixed(2)} to £${newPriceFloat.toFixed(2)}`);
      
      // Re-render bulk groups to reflect the new pricing distribution
      renderBulkPriceGroups();
    });
  });
}

let activeImagePicker = null;

function openVariantImagePicker(tr, button) {
  // If there's an existing active picker, remove it first
  if (activeImagePicker) {
    activeImagePicker.remove();
    activeImagePicker = null;
  }

  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  // Gather all unique images
  const images = Array.from(new Set([
    ...(product.imageUrls || []),
    ...(product.allScrapedImages || [])
  ])).filter(Boolean);

  const currentImg = tr.getAttribute("data-img") || "";
  const pickerCurrentImg = currentImg === "none" ? "" : currentImg;

  // Create popover container
  const popover = document.createElement("div");
  popover.className = "image-picker-popover";

  // Build grid items
  const gridHtml = images.map((url) => {
    const isActive = url === pickerCurrentImg;
    return `
      <div class="picker-item ${isActive ? 'active' : ''}" data-url="${escapeHtml(url)}">
        <img src="${escapeHtml(url)}" alt="">
      </div>
    `;
  }).join("");

  popover.innerHTML = `
    <div class="picker-header">
      <h5>Select Variant Image</h5>
      <span class="picker-close">&times;</span>
    </div>
    <div class="picker-body">
      ${images.length === 0 ? `
        <div style="font-size:11px; color:var(--ink-secondary); text-align:center; padding: 20px 0;">
          No images in gallery.<br>Add images in Tab 2 first!
        </div>
      ` : `
        <div class="picker-grid">
          ${gridHtml}
        </div>
      `}
      <div class="picker-actions">
        <button type="button" class="picker-btn remove">Clear Image</button>
      </div>
    </div>
  `;

  document.body.appendChild(popover);
  activeImagePicker = popover;

  // Position popover relative to button bounding rect
  const rect = button.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
  popover.style.left = `${Math.min(window.innerWidth - 300, rect.left + window.scrollX)}px`;

  // Bind close button
  popover.querySelector(".picker-close").addEventListener("click", () => {
    popover.remove();
    activeImagePicker = null;
  });

  // Bind clear button
  popover.querySelector(".remove").addEventListener("click", () => {
    tr.setAttribute("data-img", "none");
    button.innerHTML = `<span class="variant-thumb-placeholder">📷</span>`;
    popover.remove();
    activeImagePicker = null;
  });

  // Bind grid item selection
  popover.querySelectorAll(".picker-item").forEach((item) => {
    item.addEventListener("click", () => {
      const selectedUrl = item.getAttribute("data-url");
      tr.setAttribute("data-img", selectedUrl);
      button.innerHTML = `<img src="${escapeHtml(selectedUrl)}" class="variant-thumb-img" alt="">`;
      popover.remove();
      activeImagePicker = null;
    });
  });

  // Prevent click bubbling to avoid immediately triggering document dismiss click
  popover.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Global click listener to dismiss active image picker popovers when clicking outside
document.addEventListener("click", (event) => {
  if (activeImagePicker && !event.target.closest(".variant-thumb-btn")) {
    activeImagePicker.remove();
    activeImagePicker = null;
  }
}, true); // Use capture phase so it triggers reliably

function saveProductEditChanges() {
  if (!state.activeProductId) return;
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  product.title = document.getElementById("editTitle").value.trim() || product.title;
  product.handle = document.getElementById("editHandle").value.trim() || product.handle;
  product.page = document.getElementById("editPage").value.trim() || "shop";
  product.category = document.getElementById("editCategory").value.trim();
  product.tags = document.getElementById("editTags").value.trim();
  product.description = document.getElementById("editDescription").value;
  product.vatStatus = document.getElementById("editVatStatus").value.trim() || "Unknown (Please check manually)";

  const radios = document.getElementsByName("productImportMode");
  let selectedMode = "variants";
  radios.forEach((r) => {
    if (r.checked) selectedMode = r.value;
  });
  product.importMode = selectedMode;

  const selectedCards = document.querySelectorAll(".image-grid-editor .image-editor-card.is-selected");
  const selectedImages = [];
  selectedCards.forEach((card) => {
    selectedImages.push(card.getAttribute("data-url"));
  });

  const bulkText = document.getElementById("customImageUrls").value.trim();
  if (bulkText) {
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      if (!selectedImages.includes(line)) selectedImages.push(line);
    });
  }
  product.imageUrls = selectedImages;

  const opt1Name = document.getElementById("optName1").value.trim() || "Title";
  const opt2Name = document.getElementById("optName2").value.trim() || "";
  const opt3Name = document.getElementById("optName3").value.trim() || "";
  
  product.options = [{ name: opt1Name }];
  if (opt2Name) product.options.push({ name: opt2Name });
  if (opt3Name) product.options.push({ name: opt3Name });

  const variantRows = document.querySelectorAll("#variantEditorTable tbody tr");
  const updatedVariants = [];

  variantRows.forEach((row) => {
    const idx = row.getAttribute("data-idx");
    if (idx === null) return;
    
    const option1 = row.querySelector(".v-opt1").value.trim();
    const option2 = row.querySelector(".v-opt2").value.trim() || null;
    const option3 = row.querySelector(".v-opt3").value.trim() || null;
    const sku = row.querySelector(".v-sku").value.trim();
    const price = parseFloat(row.querySelector(".v-price").value) || 0;
    
    const compareVal = row.querySelector(".v-compare").value.trim();
    const compareAtPrice = compareVal ? parseFloat(compareVal) : null;
    const onSale = row.querySelector(".v-onsale").value;
    const stock = parseInt(row.querySelector(".v-stock").value) || 0;
    const weight = parseFloat(row.querySelector(".v-weight").value) || 0;
    const featuredImage = row.getAttribute("data-img") || "";

    updatedVariants.push({
      id: product.variants[idx]?.id || `var-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: [option1, option2, option3].filter(Boolean).join(" / "),
      sku,
      price,
      compareAtPrice,
      onSale,
      stock,
      weight,
      option1,
      option2,
      option3,
      featuredImage: featuredImage,
      isMerged: product.variants[idx]?.isMerged || false // Preserve merge state
    });
  });

  product.variants = updatedVariants;

  render();
  closeEditDrawer();
  showToast(`Applied: ${product.title}`);
}

/* --------------------------------------------------------------------------
   UI Core Event Handlers
   -------------------------------------------------------------------------- */

document.getElementById("productStack").addEventListener("click", (event) => {
  // 1. Remove button click handling
  const removeId = event.target?.closest(".remove-button")?.dataset?.remove;
  if (removeId) {
    if (state.selectedProductIds) state.selectedProductIds.delete(removeId);
    removeProduct(removeId);
    return;
  }

  // 2. Checkbox click handling
  const checkbox = event.target?.closest(".product-select-checkbox");
  if (checkbox) {
    const id = checkbox.getAttribute("data-id");
    if (checkbox.checked) {
      state.selectedProductIds.add(id);
    } else {
      state.selectedProductIds.delete(id);
    }
    
    // Toggle active visual class instantly
    const card = checkbox.closest(".product-item");
    if (card) {
      card.classList.toggle("is-selected", checkbox.checked);
    }
    
    if (typeof updateMergeActionPanel === "function") updateMergeActionPanel();
    return;
  }

  // 3. Skip drawer open if clicked within selection wrapper but not the checkbox directly
  if (event.target?.closest(".product-select-wrapper")) {
    return;
  }

  // 4. Edit drawer open on card body click
  const card = event.target.closest(".product-item");
  if (card) {
    const productId = card.getAttribute("data-id");
    openEditDrawer(productId);
  }
});

// Import link textarea parser (Lite Version: Enforce 1 URL limit)
document.getElementById("linkForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const textarea = document.getElementById("productUrl");
  const value = textarea.value.trim();
  if (!value) return;

  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast("Please enter a product URL");
    return;
  }

  if (lines.length > 1) {
    showToast("Lite Version: Only 1 link can be parsed at a time in the free version.");
  }

  const targetLine = lines[0];
  try {
    new URL(targetLine);
    addProduct(targetLine);
  } catch (e) {
    showToast(`Invalid product link: ${targetLine.slice(0, 24)}...`);
  }

  textarea.value = "";
});

// Drawer close buttons
document.getElementById("closeDrawer").addEventListener("click", closeEditDrawer);
document.getElementById("cancelEdit").addEventListener("click", closeEditDrawer);
document.getElementById("drawerOverlay").addEventListener("click", closeEditDrawer);

// Clear All button
document.getElementById("clearAllBtn").addEventListener("click", clearAllProducts);

// Options dynamic updates re-renders
document.getElementById("priceSource").addEventListener("change", render);
document.getElementById("sourceVat").addEventListener("change", render);
document.getElementById("visibility").addEventListener("change", render);
document.getElementById("skuPolicy")?.addEventListener("change", render);

// Search client filter inside Right Table
document.getElementById("csvSearch").addEventListener("input", (event) => {
  state.csvSearch = event.target.value;
  renderPreviewTable();
});

// Switch Tab inside Drawer
document.querySelectorAll(".drawer-tabs .tab-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchDrawerTab(btn.getAttribute("data-tab"));
  });
});

// Batch download all checked images as a ZIP file
// Helper to pad image to 1:1 aspect ratio on Canvas
function processImage(blob, mode) {
  if (mode === "original") return Promise.resolve(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.src = url;
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const width = img.width;
      const height = img.height;
      const size = Math.max(width, height);
      
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      
      const ctx = canvas.getContext("2d");
      
      // Determine background color
      let bgColor = "#FFFFFF";
      if (mode === "square-auto") {
        // Draw the image offscreen temporarily to read corner pixels
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(img, 0, 0);
        
        // Sample top-left corner pixel color
        try {
          const pixel = tempCtx.getImageData(0, 0, 1, 1).data;
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];
          const a = pixel[3] / 255;
          bgColor = `rgba(${r}, ${g}, ${b}, ${a})`;
        } catch (e) {
          console.warn("Could not read corner pixel for background color:", e.message);
          bgColor = "#FFFFFF"; // Fallback to white if canvas is tainted by CORS
        }
      }
      
      // Fill canvas background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);
      
      // Center the image inside the square
      const dx = (size - width) / 2;
      const dy = (size - height) / 2;
      ctx.drawImage(img, dx, dy, width, height);
      
      // Convert to blob
      canvas.toBlob((resultBlob) => {
        if (resultBlob) {
          resolve(resultBlob);
        } else {
          reject(new Error("Canvas conversion to Blob failed."));
        }
      }, blob.type || "image/jpeg", 0.95);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image into canvas helper."));
    };
  });
}

// Helper to trigger staggered download
function triggerFileDownload(blob, filename, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
        resolve();
      }, 1000);
    }, delay);
  });
}

// Batch download all checked images as a ZIP file or individual files
document.getElementById("downloadAllImagesBtn").addEventListener("click", async () => {
  const activeProduct = state.products.find(p => p.id === state.activeProductId);
  if (!activeProduct) {
    showToast("No active product selected");
    return;
  }

  // Read current option selections from toolbelt
  const resizeMode = document.getElementById("imageResizeMode")?.value || "original";
  const downloadType = document.getElementById("imageDownloadType")?.value || "zip";

  // Get selected images from DOM (in case the user hasn't clicked "Save" yet)
  const selectedCards = document.querySelectorAll(".image-grid-editor .image-editor-card.is-selected");
  let imagesToDownload = Array.from(selectedCards).map(card => card.getAttribute("data-url")).filter(Boolean);

  // Also include custom images entered in textarea
  const customText = document.getElementById("customImageUrls")?.value || "";
  const customUrls = customText.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
  imagesToDownload = [...imagesToDownload, ...customUrls];

  // Fallback: If no images selected at all, download all extracted images
  if (imagesToDownload.length === 0) {
    const allCards = document.querySelectorAll(".image-grid-editor .image-editor-card");
    imagesToDownload = Array.from(allCards).map(card => card.getAttribute("data-url")).filter(Boolean);
  }

  if (imagesToDownload.length === 0) {
    showToast("No images available to download");
    return;
  }

  const btn = document.getElementById("downloadAllImagesBtn");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = "0.7";
  btn.innerHTML = `<span>⏳</span> Processing...`;

  try {
    // 1. Load JSZip dynamically if it is not present AND zip download is selected
    if (downloadType === "zip" && !window.JSZip) {
      showToast("Loading ZIP engine...");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load ZIP library from CDN."));
        document.head.appendChild(script);
      });
    }

    let zip = null;
    let imgFolder = null;
    let folderName = "";

    if (downloadType === "zip") {
      zip = new JSZip();
      folderName = activeProduct.handle || "product-images";
      imgFolder = zip.folder(folderName);
    }

    showToast(`Downloading/processing ${imagesToDownload.length} images...`);

    let successfulCount = 0;

    // Fetch and compress/download each image in parallel or staggered order
    const downloadPromises = imagesToDownload.map(async (url, index) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        let blob = await res.blob();
        
        // Apply aspect ratio padding if requested
        if (resizeMode !== "original") {
          try {
            blob = await processImage(blob, resizeMode);
          } catch (e) {
            console.warn(`Canvas resizing failed for ${url}:`, e.message);
          }
        }
        
        let ext = "jpg";
        const pathPart = url.split("?")[0];
        const match = pathPart.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
        if (match) {
          ext = match[1].toLowerCase();
        }
        
        const filename = `${activeProduct.handle || "image"}_${index + 1}.${ext}`;
        
        if (downloadType === "zip") {
          imgFolder.file(filename, blob);
          successfulCount++;
        } else {
          // Staggered individual file downloads (250ms spacing)
          await triggerFileDownload(blob, filename, index * 250);
          successfulCount++;
        }
      } catch (err) {
        console.warn(`Failed to process image ${url}:`, err.message);
      }
    });

    await Promise.all(downloadPromises);

    if (downloadType === "zip") {
      const filesAdded = Object.keys(zip.files).filter(key => key !== `${folderName}/`);
      if (filesAdded.length === 0) {
        throw new Error("Unable to download any images due to connection or CORS restrictions.");
      }

      showToast("Generating ZIP archive...");
      const content = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(content);
      
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${activeProduct.handle || "product"}-images.zip`;
      document.body.appendChild(a);
      a.click();
      
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast("ZIP download started! 🚀");
    } else {
      if (successfulCount === 0) {
        throw new Error("No images could be downloaded due to connection or CORS restrictions.");
      }
      showToast(`Triggered ${successfulCount} image downloads! 🚀`);
    }
  } catch (err) {
    console.error("Image Download error:", err);
    showToast(`Download failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.innerHTML = originalHtml;
  }
});

// Click image card inside Drawer Image Gallery
document.getElementById("imageGridEditor").addEventListener("click", (event) => {
  const card = event.target.closest(".image-editor-card");
  if (!card) return;

  const url = card.getAttribute("data-url");
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  const isSelected = card.classList.contains("is-selected");
  if (isSelected) {
    card.classList.remove("is-selected");
    if (product.featuredImage === url) {
      card.classList.remove("is-featured");
      product.featuredImage = "";
    }
  } else {
    card.classList.add("is-selected");
    const featuredCard = document.querySelector(".image-grid-editor .image-editor-card.is-featured");
    if (!featuredCard) {
      card.classList.add("is-featured");
      product.featuredImage = url;
    }
  }
});

// Double click image inside Drawer to set as Featured Image
document.getElementById("imageGridEditor").addEventListener("dblclick", (event) => {
  const card = event.target.closest(".image-editor-card");
  if (!card) return;

  const url = card.getAttribute("data-url");
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  document.querySelectorAll(".image-grid-editor .image-editor-card").forEach((c) => {
    c.classList.remove("is-featured");
  });

  card.classList.add("is-selected"); 
  card.classList.add("is-featured");
  product.featuredImage = url;
  showToast("Designated as Primary Featured Image");
});

function handleOptionNamesInputUpdate() {
  const opt2 = document.getElementById("optName2").value.trim();
  const opt3 = document.getElementById("optName3").value.trim();

  document.querySelectorAll("#variantEditorTable tbody tr").forEach((row) => {
    row.querySelector(".v-opt2").disabled = !opt2;
    row.querySelector(".v-opt3").disabled = !opt3;
  });
}
document.getElementById("optName2").addEventListener("input", handleOptionNamesInputUpdate);
document.getElementById("optName3").addEventListener("input", handleOptionNamesInputUpdate);

document.getElementById("rebuildVariantsBtn").addEventListener("click", () => {
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  const opt1Name = document.getElementById("optName1").value.trim() || "Title";
  const opt2Name = document.getElementById("optName2").value.trim();
  const opt3Name = document.getElementById("optName3").value.trim();

  const val1Str = prompt(`Enter comma-separated values for Option 1 ("${opt1Name}"):`, "Default");
  if (val1Str === null) return;
  const val1 = val1Str.split(",").map(v => v.trim()).filter(Boolean);
  if (val1.length === 0) {
    showToast("Option 1 must have at least one value.");
    return;
  }

  let val2 = [""];
  if (opt2Name) {
    const val2Str = prompt(`Enter comma-separated values for Option 2 ("${opt2Name}"):`, "");
    if (val2Str !== null) {
      const splitVal = val2Str.split(",").map(v => v.trim()).filter(Boolean);
      if (splitVal.length > 0) {
        val2 = splitVal;
      }
    }
  }

  let val3 = [""];
  if (opt3Name) {
    const val3Str = prompt(`Enter comma-separated values for Option 3 ("${opt3Name}"):`, "");
    if (val3Str !== null) {
      const splitVal = val3Str.split(",").map(v => v.trim()).filter(Boolean);
      if (splitVal.length > 0) {
        val3 = splitVal;
      }
    }
  }

  const tempVariants = [];
  val1.forEach(v1 => {
    val2.forEach(v2 => {
      val3.forEach(v3 => {
        const titleParts = [v1];
        if (opt2Name && v2) titleParts.push(v2);
        if (opt3Name && v3) titleParts.push(v3);
        const title = titleParts.join(" / ");
        
        tempVariants.push({
          id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          sku: "",
          price: 0,
          compareAtPrice: null,
          onSale: "No",
          stock: 99,
          weight: 0,
          option1: v1,
          option2: opt2Name ? v2 : null,
          option3: opt3Name ? v3 : null,
          featuredImage: ""
        });
      });
    });
  });

  product.variants = tempVariants;
  product.options = [{ name: opt1Name, values: val1 }];
  if (opt2Name) product.options.push({ name: opt2Name, values: val2 });
  if (opt3Name) product.options.push({ name: opt3Name, values: val3 });

  renderVariantRowsTable(product);
  showToast(`Re-built ${tempVariants.length} variant rows`);
});

document.getElementById("addVariantRowBtn").addEventListener("click", () => {
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  const opt2Active = !!document.getElementById("optName2").value.trim();
  const opt3Active = !!document.getElementById("optName3").value.trim();

  const newIdx = product.variants.length;

  product.variants.push({
    id: `var-new-${Date.now()}-${newIdx}`,
    title: "New Variant",
    sku: "",
    price: 0,
    compareAtPrice: null,
    onSale: "No",
    stock: 99,
    weight: 0,
    option1: "Default",
    option2: opt2Active ? "Default" : null,
    option3: opt3Active ? "Default" : null,
    featuredImage: ""
  });

  renderVariantRowsTable(product);
  
  const container = document.querySelector(".variant-table-container");
  container.scrollTop = container.scrollHeight;
});

document.getElementById("variantEditorTable").addEventListener("click", (event) => {
  const thumbBtn = event.target.closest(".variant-thumb-btn");
  if (thumbBtn) {
    event.stopPropagation();
    const tr = thumbBtn.closest("tr");
    openVariantImagePicker(tr, thumbBtn);
    return;
  }

  const btn = event.target.closest(".delete-v-row");
  if (!btn) return;

  const tr = btn.closest("tr");
  const idx = parseInt(tr.getAttribute("data-idx"));
  
  const product = state.products.find((p) => p.id === state.activeProductId);
  if (!product) return;

  product.variants.splice(idx, 1);
  renderVariantRowsTable(product);
});

document.getElementById("variantEditorTable").addEventListener("input", (event) => {
  if (event.target.classList.contains("v-price")) {
    renderBulkPriceGroups();
  }
});

document.getElementById("applyGlobalFormulaBtn").addEventListener("click", () => {
  if (!requirePremium()) return;
  const formulaInput = document.getElementById("globalFormulaInput");
  if (!formulaInput) return;

  const formulaRaw = formulaInput.value.trim();
  if (!formulaRaw) {
    showToast("Please enter a formula first (e.g. [price]*1.2)");
    return;
  }

  // Normalize: Convert unbracketed price/rrp tokens to [price] safely
  let formulaNormalized = formulaRaw
    .toLowerCase()
    .replace(/(?<!\[)price(?!\])/g, "[price]")
    .replace(/(?<!\[)rrp(?!\])/g, "[price]");

  // Security check: only allow [price], [rrp], numbers, and basic math operators
  const validPattern = /^[0-9+\-*/().\s\[\]p|r|i|c|e]+$/;
  if (!validPattern.test(formulaNormalized)) {
    showToast("Invalid characters. Only use numbers, operators (+ - * /), parentheses, or [price]");
    return;
  }

  // Convert both [price] and [rrp] into mathematical variable 'x'
  const formula = formulaNormalized.replace(/\[price\]/g, "x").replace(/\[rrp\]/g, "x");
  if (!formula.includes("x")) {
    showToast("Your formula must contain [price] as the variable.");
    return;
  }

  const rows = document.querySelectorAll("#variantEditorTable tbody tr");
  let updatedCount = 0;
  let hasError = false;
  let formulaErrorMessage = "";

  // Push to Undo stack before updating
  const previousState = Array.from(rows).map(row => row.querySelector(".v-price").value);
  state.priceUndoStack.push(previousState);

  rows.forEach((row) => {
    const priceInput = row.querySelector(".v-price");
    if (!priceInput) return;

    const currentPrice = parseFloat(priceInput.value) || 0;
    
    // Evaluate the formula for this row
    try {
      // Safely replace x with the number in the clean expression
      const expr = formula.replace(/x/g, String(currentPrice));
      const result = new Function(`return (${expr})`)();
      
      if (typeof result === "number" && !isNaN(result) && isFinite(result)) {
        // Round to 2 decimal places (1 pence)
        const roundedResult = Math.round(result * 100) / 100;
        priceInput.value = roundedResult.toFixed(2);
        
        // Add highlight flash animation
        priceInput.style.transition = "background-color 0.1s ease";
        priceInput.style.backgroundColor = "rgba(12, 108, 242, 0.2)";
        setTimeout(() => {
          priceInput.style.transition = "background-color 0.5s ease";
          updatePriceInputStyle(priceInput, row);
        }, 500);

        updatedCount += 1;
      }
    } catch (err) {
      console.error(err);
      hasError = true;
      formulaErrorMessage = err.message;
    }
  });

  if (hasError) {
    showToast(`Formula Error: ${formulaErrorMessage}`);
    // Rollback since there was an error in calculation
    const rollbackState = state.priceUndoStack.pop();
    rows.forEach((row, idx) => {
      const priceInput = row.querySelector(".v-price");
      if (priceInput && rollbackState[idx] !== undefined) {
        priceInput.value = rollbackState[idx];
        updatePriceInputStyle(priceInput, row);
      }
    });
    renderBulkPriceGroups();
    return;
  }

  if (updatedCount > 0) {
    showToast(`Successfully updated ${updatedCount} variants using formula: ${formulaRaw}`);
    // Clear formula input
    formulaInput.value = "";
    // Re-render group listings
    renderBulkPriceGroups();
  } else {
    showToast("Could not calculate new prices. Please verify your formula.");
  }
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    const drawer = document.getElementById("editDrawer");
    if (drawer && drawer.classList.contains("active")) {
      // Let standard browser undo work on other inputs inside drawer (title, slug, tag, desc etc.)
      const tag = event.target.tagName;
      const isPriceInput = event.target.classList.contains("v-price") || event.target.classList.contains("v-compare");
      if ((tag === "INPUT" || tag === "TEXTAREA") && !isPriceInput) {
        return;
      }

      event.preventDefault();
      if (state.priceUndoStack.length > 0) {
        const previousPrices = state.priceUndoStack.pop();
        const rows = document.querySelectorAll("#variantEditorTable tbody tr");
        rows.forEach((row, idx) => {
          const priceInput = row.querySelector(".v-price");
          if (priceInput && previousPrices[idx] !== undefined) {
            priceInput.value = previousPrices[idx];
            updatePriceInputStyle(priceInput, row);
          }
        });
        showToast("Undo: Restored previous prices.");
        renderBulkPriceGroups();
      } else {
        showToast("Nothing left to undo.");
      }
    }
  }
});

document.getElementById("saveProductEdit").addEventListener("click", saveProductEditChanges);

/* --------------------------------------------------------------------------
   Cinematic Swatch Hover Large Preview
   -------------------------------------------------------------------------- */
function showLargePreview(src) {
  if (!src) return;
  let previewEl = document.getElementById("swatchHoverPreview");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = "swatchHoverPreview";
    previewEl.className = "swatch-hover-preview";
    previewEl.innerHTML = `<img src="" alt="" id="swatchHoverPreviewImg">`;
    document.body.appendChild(previewEl);
  }
  const img = previewEl.querySelector("img");
  img.src = src;
  previewEl.classList.add("active");
}

function hideLargePreview() {
  const previewEl = document.getElementById("swatchHoverPreview");
  if (previewEl) {
    previewEl.classList.remove("active");
  }
}

// 1. Mouseover listener on main preview table swatches
document.getElementById("previewTable").addEventListener("mouseover", (event) => {
  const swatch = event.target.closest(".inline-swatch-img");
  if (swatch) {
    showLargePreview(swatch.getAttribute("src"));
  }
});

document.getElementById("previewTable").addEventListener("mouseout", (event) => {
  const swatch = event.target.closest(".inline-swatch-img");
  if (swatch) {
    hideLargePreview();
  }
});

// 2. Mouseover listener on variant editor drawer table thumbnails
document.getElementById("variantEditorTable").addEventListener("mouseover", (event) => {
  const thumbImg = event.target.closest(".variant-thumb-img");
  if (thumbImg) {
    showLargePreview(thumbImg.getAttribute("src"));
  }
});

document.getElementById("variantEditorTable").addEventListener("mouseout", (event) => {
  const thumbImg = event.target.closest(".variant-thumb-img");
  if (thumbImg) {
    hideLargePreview();
  }
});

// 3. Mouseover listener on left sidebar image guide thumbnails
document.getElementById("imageGuideList").addEventListener("mouseover", (event) => {
  const thumb = event.target.closest(".image-guide-thumb");
  if (thumb) {
    showLargePreview(thumb.getAttribute("src"));
  }
});

document.getElementById("imageGuideList").addEventListener("mouseout", (event) => {
  const thumb = event.target.closest(".image-guide-thumb");
  if (thumb) {
    hideLargePreview();
  }
});

// 4. Click to copy image URL from guide list items
document.getElementById("imageGuideList").addEventListener("click", (event) => {
  const item = event.target.closest(".image-guide-item");
  if (item) {
    const url = item.getAttribute("data-url");
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast("Image URL copied to clipboard!");
      }).catch(err => {
        console.error("Copy failed:", err);
      });
    }
  }
});

// 5. 1-Click Squarespace Commerce API Sync Event Handler (Chunk-based pagination hotfix)
document.getElementById("btnSyncImages").addEventListener("click", async () => {
  if (!requirePremium()) return;
  const apiKeyInput = document.getElementById("sqspApiKey");
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast("Please enter your Squarespace API Key!");
    apiKeyInput.focus();
    return;
  }

  if (state.products.length === 0) {
    showToast("No products found to sync.");
    return;
  }

  const btn = document.getElementById("btnSyncImages");
  const originalText = btn.innerHTML;
  btn.innerHTML = `<span style="font-size: 10px;">Syncing...</span>`;
  btn.disabled = true;

  const progressContainer = document.getElementById("syncProgressContainer");
  const progressText = document.getElementById("syncProgressText");
  const progressPercent = document.getElementById("syncProgressPercent");
  const progressBar = document.getElementById("syncProgressBar");

  // Show progress panel
  if (progressContainer) {
    progressContainer.style.display = "block";
    progressText.innerText = "Starting batch sync process...";
    progressPercent.innerText = "0%";
    progressBar.style.width = "0%";
  }

  let totalSuccessCount = 0;

  try {
    for (let i = 0; i < state.products.length; i++) {
      const product = state.products[i];
      const productNum = i + 1;
      const totalProducts = state.products.length;

      if (progressText) progressText.innerText = `[${productNum}/${totalProducts}] Preparing ${product.title}...`;

      // 1. Generate SKUs for THIS product
      const currentProductSkus = (product.variants || []).map(v => 
        v.sku || `${product.handle.toUpperCase()}-${String(v.id || "").toUpperCase()}`
      ).filter(Boolean);

      // 2. Build local variant-to-color mapping for THIS product
      const currentColorImages = [];
      const uniqueColors = Array.from(new Set((product.variants || []).map(varItem => varItem.option1).filter(Boolean)));
      
      (product.variants || []).forEach(v => {
        let img = v.featuredImage || "";
        if (v.featuredImage === "none") {
          img = "";
        } else if (!img && v.option1) {
          img = findImageForVariant(v, product);
        }
        
        const csvSku = v.sku || `${product.handle.toUpperCase()}-${String(v.id || "").toUpperCase()}`;
        if (csvSku && img) {
          const colorIdx = uniqueColors.indexOf(v.option1);
          currentColorImages.push({ sku: csvSku, url: img, colorIndex: colorIdx });
        }
      });

      if (currentProductSkus.length === 0 || currentColorImages.length === 0) {
        console.warn(`Skipping ${product.title}: No variants/images to sync.`);
        continue;
      }

      // Chunk execution - split variants sync into chunks of size 25 to dodge Cloudflare subrequest limits
      const chunkSize = 25;
      const totalVariantsToSync = currentColorImages.length;

      for (let offset = 0; offset < totalVariantsToSync; offset += chunkSize) {
        const chunkImages = currentColorImages.slice(offset, offset + chunkSize);
        const chunkSkus = chunkImages.map(item => item.sku);

        if (progressText) {
          progressText.innerText = `[${productNum}/${totalProducts}] ${product.title}\nSyncing variants ${offset + 1} - ${Math.min(offset + chunkSize, totalVariantsToSync)} of ${totalVariantsToSync}...`;
        }

        // 3. Call Sync API for this chunk
        const response = await authenticatedFetch("/api/squarespace/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            productSkus: chunkSkus,
            colorImages: chunkImages,
            offset: offset,
            limit: chunkSize
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`[Product ${productNum}] ${errorData.error || `Server responded with status ${response.status}`}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;
            const data = JSON.parse(line);
            if (data.error) throw new Error(`[Product ${productNum}] ${data.error}`);
            
            if (data.status === "progress") {
              const pct = Math.round((data.current / data.total) * 100);
              if (progressText) progressText.innerText = `[${productNum}/${totalProducts}] ${product.title}\nSyncing... (${data.current}/${data.total}) SKU: ${data.sku}`;
              if (progressPercent) progressPercent.innerText = `${pct}%`;
              if (progressBar) progressBar.style.width = `${pct}%`;
            } else if (data.status === "complete") {
              totalSuccessCount += data.count;
            }
          }
        }
      }
    }

    // Final completion
    if (progressText) progressText.innerText = `Sync complete! Successfully updated ${totalSuccessCount} items across all products.`;
    if (progressPercent) progressPercent.innerText = "100%";
    if (progressBar) progressBar.style.width = "100%";
    showToast(`⚡ Success! ${totalSuccessCount} variant images synced successfully!`);

  } catch (err) {
    if (progressText) {
      progressText.innerText = "Error occurred during sync";
      progressPercent.innerText = "Error";
      progressBar.style.width = "0%";
    }
    alert("Squarespace sync failed:\n" + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Squarespace CSV File Importer & Reconstruction Engine
   -------------------------------------------------------------------------- */
function parseCsvText(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentRow.length > 0 || currentField !== "") {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter(row => row.some(cell => cell.trim() !== ""));
}

function importSquarespaceCsv(csvText) {
  const rows = parseCsvText(csvText);
  if (rows.length < 2) {
    showToast("Invalid CSV: Header or rows are missing.");
    return;
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const colIndex = {};
  
  CSV_COLUMNS.forEach(col => {
    const cleanCol = col.toLowerCase();
    const label = (CSV_EXPORT_COLUMN_LABELS[col] || col).toLowerCase();
    let idx = headers.indexOf(label);
    if (idx === -1) {
      idx = headers.indexOf(cleanCol);
    }
    colIndex[col] = idx;
  });

  if (colIndex["Product URL"] === -1 || colIndex["Option Value 1"] === -1) {
    showToast("Invalid CSV format. Product URL or Option columns not matched.");
    return;
  }

  function cleanPrice(val) {
    if (!val) return 0;
    const clean = val.replace(/[^0-9.]/g, "");
    return parseFloat(clean) || 0;
  }

  let importedProducts = [];
  let currentProduct = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;

    const prodType = (row[colIndex["Product Type [Non Editable]"]] || "").trim().toUpperCase();
    const handle = (row[colIndex["Product URL"]] || "").trim();
    
    const isPrimary = prodType === "PHYSICAL" || (prodType !== "" && !currentProduct) || (handle !== "" && (!currentProduct || currentProduct.handle !== handle));

    if (isPrimary && handle !== "") {
      const title = (row[colIndex["Title"]] || "").trim();
      const desc = (row[colIndex["Description"]] || "").trim();
      const page = (row[colIndex["Product Page"]] || "shop").trim();
      const category = (row[colIndex["Categories"]] || "").trim();
      const tags = (row[colIndex["Tags"]] || "").trim();
      const rawImages = (row[colIndex["Hosted Image URLs"]] || "").trim();
      
      const imageUrls = rawImages ? rawImages.split(" ").filter(Boolean) : [];
      const featuredImage = imageUrls[0] || "";

      const options = [];
      const opt1Name = (row[colIndex["Option Name 1"]] || "").trim();
      const opt2Name = (row[colIndex["Option Name 2"]] || "").trim();
      const opt3Name = (row[colIndex["Option Name 3"]] || "").trim();
      
      if (opt1Name) options.push({ name: opt1Name, values: [] });
      if (opt2Name) options.push({ name: opt2Name, values: [] });
      if (opt3Name) options.push({ name: opt3Name, values: [] });

      currentProduct = {
        id: `imported-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sourceUrl: `https://imported-product.com/products/${handle}`,
        handle: handle,
        variant: "",
        importMode: "variants",
        title: title || handle.replaceAll("-", " ").toUpperCase(),
        description: desc || "Imported product details",
        page: page,
        category: category,
        tags: tags || "",
        imageStatus: imageUrls.length > 0 ? "loaded" : "loading",
        imageUrls: imageUrls,
        allScrapedImages: imageUrls,
        featuredImage: featuredImage,
        options: options.length > 0 ? options : [{ name: "Title", values: ["Default Title"] }],
        variants: [],
        vatStatus: "VAT Excluded (Restored)"
      };

      importedProducts.push(currentProduct);
    }

    if (currentProduct) {
      const varId = (row[colIndex["Variant ID [Non Editable]"]] || "").trim() || `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const sku = (row[colIndex["SKU"]] || "").trim();
      const rawPrice = cleanPrice(row[colIndex["Price"]]);
      const rawSalePrice = cleanPrice(row[colIndex["Sale Price"]]);
      const isOnSale = (row[colIndex["On Sale"]] || "").trim().toLowerCase() === "yes" || (rawSalePrice > 0 && rawSalePrice < rawPrice);
      
      const stockVal = (row[colIndex["Stock"]] || "").trim();
      const stock = (stockVal.toLowerCase() === "unlimited" || stockVal === "") ? 99 : (parseInt(stockVal) || 0);
      const weight = parseFloat(row[colIndex["Weight"]]) || 0;

      const val1 = (row[colIndex["Option Value 1"]] || "").trim() || "Default Title";
      const val2 = (row[colIndex["Option Value 2"]] || "").trim();
      const val3 = (row[colIndex["Option Value 3"]] || "").trim();

      if (val1 && currentProduct.options[0] && !currentProduct.options[0].values.includes(val1)) {
        currentProduct.options[0].values.push(val1);
      }
      if (val2 && currentProduct.options[1] && !currentProduct.options[1].values.includes(val2)) {
        currentProduct.options[1].values.push(val2);
      }
      if (val3 && currentProduct.options[2] && !currentProduct.options[2].values.includes(val3)) {
        currentProduct.options[2].values.push(val3);
      }

      currentProduct.variants.push({
        id: varId,
        title: [val1, val2, val3].filter(Boolean).join(" / "),
        sku: sku,
        price: isOnSale && rawSalePrice > 0 ? rawSalePrice : rawPrice,
        compareAtPrice: isOnSale && rawSalePrice > 0 ? rawPrice : null,
        onSale: isOnSale ? "Yes" : "No",
        stock: stock,
        weight: weight,
        option1: val1,
        option2: val2 || null,
        option3: val3 || null,
        featuredImage: ""
      });
    }
  }

  if (importedProducts.length === 0) {
    showToast("No valid products could be reconstructed.");
    return;
  }

  importedProducts.forEach(prod => {
    const duplicateIdx = state.products.findIndex(p => p.handle === prod.handle);
    if (duplicateIdx !== -1) {
      state.products[duplicateIdx] = prod;
    } else {
      state.products.push(prod);
    }
  });

  state.activeProductId = importedProducts[0].id;
  render();
  showToast(`Successfully loaded ${importedProducts.length} products from CSV!`);
}

// Bind CSV File Input Change listener
document.getElementById("csvFileInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    importSquarespaceCsv(text);
    event.target.value = "";
  };
  reader.readAsText(file);
});

/* --------------------------------------------------------------------------
   CSV Download & Copy Controls
   -------------------------------------------------------------------------- */
document.getElementById("downloadCsv").addEventListener("click", () => {
  state.activePlatform = "squarespace";
  renderPreviewTable();
  renderImageGuides();
  updateActivePlatformUI();

  const rows = generateRows();
  if (rows.length === 0) {
    showToast("Please import a product to build CSV");
    return;
  }
  const csvContent = makeCsv(rows);
  
  // Clean Human-Readable Local Time Timestamp
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");
  const secs = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}-${month}-${date}_${hours}-${mins}-${secs}`;
  const filename = `catalog_${timestamp}.csv`;
  
  // Submit via HTML Form POST to /api/download for absolute filename enforcement on HTTPS
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/download";
  form.style.display = "none";
  
  const csvInput = document.createElement("input");
  csvInput.type = "hidden";
  csvInput.name = "csv";
  csvInput.value = csvContent;
  form.appendChild(csvInput);
  
  const nameInput = document.createElement("input");
  nameInput.type = "hidden";
  nameInput.name = "filename";
  nameInput.value = filename;
  form.appendChild(nameInput);
  
  document.body.appendChild(form);
  form.submit();
  
  setTimeout(() => {
    document.body.removeChild(form);
  }, 1000);
  
  showToast(`Downloading ${filename}`);
});

/* --------------------------------------------------------------------------
   Shopify CSV Generator
   -------------------------------------------------------------------------- */
const SHOPIFY_COLUMNS = [
  "Handle","Title","Body (HTML)","Vendor","Product Category","Type","Tags",
  "Published",
  "Option1 Name","Option1 Value",
  "Option2 Name","Option2 Value",
  "Option3 Name","Option3 Value",
  "Variant SKU","Variant Grams","Variant Inventory Tracker",
  "Variant Inventory Qty","Variant Inventory Policy","Variant Fulfillment Service",
  "Variant Price","Variant Compare At Price",
  "Variant Requires Shipping","Variant Taxable","Variant Barcode",
  "Image Src","Image Position","Image Alt Text",
  "Gift Card","SEO Title","SEO Description",
  "Variant Image","Variant Weight Unit","Status"
];

function generateShopifyRows() {
  const priceKey = selectedPriceKey();
  const rows = [];

  state.products.forEach((product) => {
    const sourceVat = document.getElementById("sourceVat")?.value || "incVat";

    // Build ordered image list: variant images first (unique), then rest
    const variantImgSet = new Set();
    (product.variants || []).forEach(v => {
      let img = v.featuredImage || "";
      if (img === "none") img = "";
      if (!img && v.option1) img = findImageForVariant(v, product);
      if (img) variantImgSet.add(img);
    });
    const allImages = Array.from(new Set([
      ...variantImgSet,
      ...(product.imageUrls || [])
    ])).filter(Boolean);

    const handle = (product.handle || product.title || "product")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const option1Name = product.options?.[0]?.name || "Title";
    const option2Name = product.options?.[1]?.name || "";
    const option3Name = product.options?.[2]?.name || "";

    let imagePosition = 1;

    (product.variants || []).forEach((variant, vi) => {
      const rawPrice = Number(variant.price || 0);
      const rawCompare = variant.compareAtPrice ? Number(variant.compareAtPrice) : null;
      const price = money(getVatAdjustedPrice(rawPrice, sourceVat, priceKey, product));
      const compareAt = rawCompare ? money(getVatAdjustedPrice(rawCompare, sourceVat, priceKey, product)) : "";

      let variantImg = variant.featuredImage || "";
      if (variantImg === "none") variantImg = "";
      if (!variantImg && variant.option1) variantImg = findImageForVariant(variant, product);

      // First variant row: include first image + product-level fields
      const isFirst = vi === 0;
      const imageSrc = isFirst && allImages.length > 0 ? allImages[0] : "";

      // Compute safe non-empty values for Shopify options to avoid import validation errors (e.g. "must specify at least one option value")
      const opt1Val = (variant.option1 || "").trim() || (option1Name.toLowerCase() === "title" ? "Default Title" : (option1Name.toLowerCase() === "size" ? "One Size" : "Default"));
      const opt2Val = option2Name ? ((variant.option2 || "").trim() || (option2Name.toLowerCase() === "size" ? "One Size" : "Default")) : "";
      const opt3Val = option3Name ? ((variant.option3 || "").trim() || (option3Name.toLowerCase() === "size" ? "One Size" : "Default")) : "";

      rows.push({
        "Handle": handle,
        "Title": isFirst ? product.title : "",
        "Body (HTML)": isFirst ? (product.description || "") : "",
        "Vendor": "",
        "Product Category": isFirst ? (product.category || "") : "",
        "Type": "",
        "Tags": isFirst ? (product.tags || "") : "",
        "Published": "TRUE",
        "Option1 Name": option1Name,
        "Option1 Value": opt1Val,
        "Option2 Name": option2Name,
        "Option2 Value": opt2Val,
        "Option3 Name": option3Name,
        "Option3 Value": opt3Val,
        "Variant SKU": resolveSku(variant.sku, `${handle}-${vi + 1}`),  
        "Variant Grams": variant.weight ? Math.round(Number(variant.weight) * 1000) : "0",
        "Variant Inventory Tracker": "shopify",
        "Variant Inventory Qty": variant.stock ?? 99,
        "Variant Inventory Policy": "deny",
        "Variant Fulfillment Service": "manual",
        "Variant Price": price,
        "Variant Compare At Price": compareAt,
        "Variant Requires Shipping": "TRUE",
        "Variant Taxable": "TRUE",
        "Variant Barcode": "",
        "Image Src": imageSrc,
        "Image Position": imageSrc ? imagePosition++ : "",
        "Image Alt Text": imageSrc ? product.title : "",
        "Gift Card": "FALSE",
        "SEO Title": isFirst ? product.title : "",
        "SEO Description": "",
        "Variant Image": variantImg,
        "Variant Weight Unit": "kg",
        "Status": "draft"
      });
    });

    // Extra image rows (one row per extra image, handle only)
    allImages.slice(1).forEach((imgUrl) => {
      rows.push({
        "Handle": handle,
        "Title": "","Body (HTML)": "","Vendor": "","Product Category": "","Type": "","Tags": "",
        "Published": "",
        "Option1 Name": "","Option1 Value": "","Option2 Name": "","Option2 Value": "",
        "Option3 Name": "","Option3 Value": "",
        "Variant SKU": "","Variant Grams": "","Variant Inventory Tracker": "",
        "Variant Inventory Qty": "","Variant Inventory Policy": "","Variant Fulfillment Service": "",
        "Variant Price": "","Variant Compare At Price": "",
        "Variant Requires Shipping": "","Variant Taxable": "","Variant Barcode": "",
        "Image Src": imgUrl,
        "Image Position": imagePosition++,
        "Image Alt Text": product.title,
        "Gift Card": "","SEO Title": "","SEO Description": "",
        "Variant Image": "","Variant Weight Unit": "","Status": ""
      });
    });
  });

  return rows;
}

function makeShopifyCsv(rows) {
  const header = SHOPIFY_COLUMNS.map(col => csvEscape(col)).join(",");
  const lines = [header];
  rows.forEach(row => {
    lines.push(SHOPIFY_COLUMNS.map(col => csvEscape(row[col] ?? "")).join(","));
  });
  return lines.join("\r\n");
}

document.getElementById("downloadShopifyCsv").addEventListener("click", () => {
  state.activePlatform = "shopify";
  renderPreviewTable();
  renderImageGuides();
  updateActivePlatformUI();

  const rows = generateShopifyRows();
  if (rows.length === 0) {
    showToast("Please import a product first");
    return;
  }
  const csvContent = makeShopifyCsv(rows);

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
  const filename = `shopify_${ts}.csv`;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/download";
  form.style.display = "none";

  const csvInput = document.createElement("input");
  csvInput.type = "hidden"; csvInput.name = "csv"; csvInput.value = csvContent;
  form.appendChild(csvInput);

  const nameInput = document.createElement("input");
  nameInput.type = "hidden"; nameInput.name = "filename"; nameInput.value = filename;
  form.appendChild(nameInput);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => document.body.removeChild(form), 1000);
  showToast(`📦 Downloading Shopify CSV: ${filename}`);
});

/* --------------------------------------------------------------------------
   WooCommerce CSV Generator
   -------------------------------------------------------------------------- */
const WOOCOMMERCE_COLUMNS = [
  "ID","Type","SKU","Name","Published","Is featured?","Visibility in catalogue",
  "Short description","Description","Date sale price starts","Date sale price ends",
  "Tax status","Tax class","In stock?","Stock","Backorders allowed?","Sold individually?",
  "Weight (kg)","Length (cm)","Width (cm)","Height (cm)",
  "Allow customer reviews?","Sale price","Regular price",
  "Categories","Tags","Images",
  "Attribute 1 name","Attribute 1 value(s)","Attribute 1 visible","Attribute 1 global",
  "Attribute 2 name","Attribute 2 value(s)","Attribute 2 visible","Attribute 2 global",
  "Attribute 3 name","Attribute 3 value(s)","Attribute 3 visible","Attribute 3 global",
  "Parent","Position"
];

function generateWooCommerceRows() {
  const priceKey = selectedPriceKey();
  const rows = [];

  state.products.forEach((product) => {
    const sourceVat = document.getElementById("sourceVat")?.value || "incVat";

    const allImages = Array.from(new Set([
      ...(product.variants || []).map(v => {
        let img = v.featuredImage || "";
        if (img === "none") img = "";
        if (!img && v.option1) img = findImageForVariant(v, product);
        return img;
      }).filter(Boolean),
      ...(product.imageUrls || [])
    ]));

    const option1Name = product.options?.[0]?.name || "";
    const option2Name = product.options?.[1]?.name || "";
    const option3Name = product.options?.[2]?.name || "";

    const isVariable = (product.variants || []).length > 1 ||
      ((product.variants || [])[0]?.option1 || "Default Title") !== "Default Title";

    const parentSku = (product.handle || product.title || "product")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // ---- Parent row (variable) ----
    if (isVariable) {
      const allOpt1 = [...new Set((product.variants || []).map(v => v.option1).filter(Boolean))].join(" | ");
      const allOpt2 = [...new Set((product.variants || []).map(v => v.option2).filter(Boolean))].join(" | ");
      const allOpt3 = [...new Set((product.variants || []).map(v => v.option3).filter(Boolean))].join(" | ");

      rows.push({
        "ID": "", "Type": "variable",
        "SKU": resolveSku("", parentSku),
        "Name": product.title || "",
        "Published": "1", "Is featured?": "0", "Visibility in catalogue": "visible",
        "Short description": "", "Description": product.description || "",
        "Date sale price starts": "", "Date sale price ends": "",
        "Tax status": "taxable", "Tax class": "",
        "In stock?": "1", "Stock": "", "Backorders allowed?": "0", "Sold individually?": "0",
        "Weight (kg)": "", "Length (cm)": "", "Width (cm)": "", "Height (cm)": "",
        "Allow customer reviews?": "1", "Sale price": "", "Regular price": "",
        "Categories": product.category || "", "Tags": product.tags || "",
        "Images": allImages.join(", "),
        "Attribute 1 name": option1Name, "Attribute 1 value(s)": allOpt1, "Attribute 1 visible": "1", "Attribute 1 global": "1",
        "Attribute 2 name": option2Name, "Attribute 2 value(s)": allOpt2, "Attribute 2 visible": "1", "Attribute 2 global": "1",
        "Attribute 3 name": option3Name, "Attribute 3 value(s)": allOpt3, "Attribute 3 visible": "1", "Attribute 3 global": "1",
        "Parent": "", "Position": "0"
      });
    }

    // ---- Variation / simple rows ----
    (product.variants || []).forEach((variant, vi) => {
      const rawPrice = Number(variant.price || 0);
      const rawCompare = variant.compareAtPrice ? Number(variant.compareAtPrice) : null;
      const isOnSale = variant.onSale === "Yes";
      const regularPrice = money(getVatAdjustedPrice(rawPrice, sourceVat, priceKey, product));
      const salePrice = isOnSale && rawCompare ? money(getVatAdjustedPrice(rawCompare, sourceVat, priceKey, product)) : "";

      let variantImg = variant.featuredImage || "";
      if (variantImg === "none") variantImg = "";
      if (!variantImg && variant.option1) variantImg = findImageForVariant(variant, product);

      rows.push({
        "ID": "", "Type": isVariable ? "variation" : "simple",
        "SKU": resolveSku(variant.sku, `${parentSku}-${vi + 1}`),
        "Name": isVariable ? (variant.title || variant.option1 || `Variation ${vi + 1}`) : product.title,
        "Published": "1", "Is featured?": "0", "Visibility in catalogue": "visible",
        "Short description": "", "Description": isVariable ? "" : (product.description || ""),
        "Date sale price starts": "", "Date sale price ends": "",
        "Tax status": "taxable", "Tax class": "",
        "In stock?": (variant.stock ?? 99) > 0 ? "1" : "0",
        "Stock": variant.stock != null ? variant.stock : 99,
        "Backorders allowed?": "0", "Sold individually?": "0",
        "Weight (kg)": variant.weight ? Number(variant.weight).toFixed(2) : "",
        "Length (cm)": "", "Width (cm)": "", "Height (cm)": "",
        "Allow customer reviews?": isVariable ? "" : "1",
        "Sale price": salePrice,
        "Regular price": regularPrice,
        "Categories": isVariable ? "" : (product.category || ""),
        "Tags": isVariable ? "" : (product.tags || ""),
        "Images": isVariable ? variantImg : allImages.join(", "),
        "Attribute 1 name": option1Name, "Attribute 1 value(s)": variant.option1 || "", "Attribute 1 visible": "1", "Attribute 1 global": "1",
        "Attribute 2 name": option2Name, "Attribute 2 value(s)": variant.option2 || "", "Attribute 2 visible": "1", "Attribute 2 global": "1",
        "Attribute 3 name": option3Name, "Attribute 3 value(s)": variant.option3 || "", "Attribute 3 visible": "1", "Attribute 3 global": "1",
        "Parent": isVariable ? `id:${parentSku}` : "",
        "Position": isVariable ? String(vi) : "0"
      });
    });
  });

  return rows;
}

function makeWooCommerceCsv(rows) {
  const header = WOOCOMMERCE_COLUMNS.map(col => csvEscape(col)).join(",");
  const lines = [header];
  rows.forEach(row => {
    lines.push(WOOCOMMERCE_COLUMNS.map(col => csvEscape(row[col] ?? "")).join(","));
  });
  return lines.join("\r\n");
}

document.getElementById("downloadWooCommerceCsv").addEventListener("click", () => {
  state.activePlatform = "woocommerce";
  renderPreviewTable();
  renderImageGuides();
  updateActivePlatformUI();

  const rows = generateWooCommerceRows();
  if (rows.length === 0) {
    showToast("Please import a product first");
    return;
  }
  const csvContent = makeWooCommerceCsv(rows);

  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
  const filename = `woocommerce_${ts}.csv`;

  const form = document.createElement("form");
  form.method = "POST"; form.action = "/api/download"; form.style.display = "none";

  const csvInput = document.createElement("input");
  csvInput.type = "hidden"; csvInput.name = "csv"; csvInput.value = csvContent;
  form.appendChild(csvInput);

  const nameInput = document.createElement("input");
  nameInput.type = "hidden"; nameInput.name = "filename"; nameInput.value = filename;
  form.appendChild(nameInput);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => document.body.removeChild(form), 1000);
  showToast(`🔵 Downloading WooCommerce CSV: ${filename}`);
});

/* --------------------------------------------------------------------------
   Utility UI helpers
   -------------------------------------------------------------------------- */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>⚡</span> <span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.25s ease";
    window.setTimeout(() => toast.remove(), 250);
  }, 2500);
}



// Theme toggle initialization and listener
function initTheme() {
  const currentTheme = localStorage.getItem("theme") || "light";
  state.theme = currentTheme;
  document.documentElement.setAttribute("data-theme", currentTheme);

  // ── Left-pane step tab switching ──
  document.querySelectorAll(".lpane-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.ltab;
      document.querySelectorAll(".lpane-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".lpane-tab-body").forEach(b => b.classList.remove("active"));
      tab.classList.add("active");
      const body = document.getElementById(target);
      if (body) body.classList.add("active");
    });
  });

  // ── Right-pane tab switching ──
  document.querySelectorAll(".rp-tab-link").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.rtab;
      document.querySelectorAll(".rp-tab-link").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".rp-tab-content").forEach(b => b.classList.remove("active"));
      tab.classList.add("active");
      const body = document.getElementById(target);
      if (body) body.classList.add("active");
    });
  });
  
  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const nextTheme = state.theme === "light" ? "dark" : "light";
      state.theme = nextTheme;
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("theme", nextTheme);
      showToast(`Switched to ${nextTheme === "light" ? "Warm Atelier" : "Midnight Studio"} mode`);
    });
  }
}

/* ==========================================================================
   15. Version 0.2.1 Universal Variant Merge Engine Implementations
   ========================================================================== */

// 1) Update select count & show/hide merge floating button panel
function updateMergeActionPanel() {
  const panel = document.getElementById("mergeActionPanel");
  const countText = document.getElementById("selectedCountText");
  const mergeBtn = document.getElementById("mergeBtn");
  if (!panel || !countText) return;

  const count = state.selectedProductIds.size;
  countText.textContent = count;

  if (count >= 2) {
    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

// 2) Parse Finish/Color option value from product title or URL
function detectVariantValue(product) {
  // If product title contains a separator, try to extract option name
  const title = product.title || "";
  const parts = title.split(/ - | \/ | \| /);
  if (parts.length > 1) {
    return parts[parts.length - 1].trim();
  }

  // Check URL handle
  const handle = product.handle || "";
  const handleParts = handle.split("-");
  if (handleParts.length > 2) {
    // Guessing the last words could be color (e.g. warm-brown-birch)
    // Find where colors might match or just take the last 2 segments
    return handleParts.slice(-2).join(" ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // Fallback to title itself
  return title.replace(/\b\w/g, c => c.toUpperCase());
}

// 3) Combine selected products into one Primary product
function mergeSelectedProducts() {
  const selectedIds = Array.from(state.selectedProductIds);
  if (selectedIds.length < 2) return;

  // Primary product is the first checked
  const primaryProduct = state.products.find(p => p.id === selectedIds[0]);
  if (!primaryProduct) return;

  // We will normalize Primary product's options to include 'Finish'
  if (!primaryProduct.options || primaryProduct.options.length === 0 || primaryProduct.options[0].name === "Title") {
    primaryProduct.options = [{ name: "Finish", values: [] }];
  } else if (primaryProduct.options[0].name !== "Finish") {
    primaryProduct.options[0].name = "Finish";
  }

  // Set the primary's first variant option value to its detected finish
  const primaryFinish = detectVariantValue(primaryProduct);
  primaryProduct.variants.forEach(v => {
    v.option1 = v.option1 && v.option1 !== "Default Title" ? v.option1 : primaryFinish;
    // Set variant-level featuredImage fallback to product featuredImage if it has none
    if (!v.featuredImage || v.featuredImage === "none") {
      v.featuredImage = primaryProduct.featuredImage || "";
    }
  });

  // Collect other products to merge
  const otherProducts = state.products.filter(p => selectedIds.slice(1).includes(p.id));

  // Merge variants & images
  const allImages = new Set([
    ...(primaryProduct.imageUrls || []),
    ...(primaryProduct.allScrapedImages || [])
  ]);

  otherProducts.forEach(prod => {
    const prodFinish = detectVariantValue(prod);
    
    // Add all of this product's images to Primary
    const prodImages = [...(prod.imageUrls || []), ...(prod.allScrapedImages || [])];
    prodImages.forEach(img => allImages.add(img));

    // Combine variants
    prod.variants.forEach(variant => {
      // Modify option 1 to be the detected finish value for this product
      const newOption1 = variant.option1 && variant.option1 !== "Default Title" ? variant.option1 : prodFinish;
      
      // Construct a new variant SKU or maintain original
      const originalSku = variant.sku || "";
      const baseSku = primaryProduct.handle.toUpperCase();
      const variantSuffix = String(variant.id || "").toUpperCase().slice(-6);
      const newSku = originalSku ? originalSku : `${baseSku}-${variantSuffix}`;

      // Resolve variant featured image (fallback to the source product's featured image if variant itself has none)
      const variantImg = variant.featuredImage && variant.featuredImage !== "none" ? variant.featuredImage : (prod.featuredImage || "");

      // Push copy of variant into primary's variants array
      primaryProduct.variants.push({
        ...variant,
        option1: newOption1,
        sku: newSku,
        featuredImage: variantImg,
        isMerged: true  // Flag as merged variant
      });
    });
  });

  // Clean primary product info (remove finish suffixes from product title/handle)
  const primaryFinishSuffixes = [
    ` - ${primaryFinish}`, ` / ${primaryFinish}`, ` | ${primaryFinish}`, 
    ` - ${primaryFinish.toLowerCase()}`, `-${primaryFinish.toLowerCase().replaceAll(' ', '-')}`
  ];
  let cleanTitle = primaryProduct.title;
  let cleanHandle = primaryProduct.handle;

  primaryFinishSuffixes.forEach(sfx => {
    if (cleanTitle.toLowerCase().endsWith(sfx.toLowerCase())) {
      cleanTitle = cleanTitle.slice(0, -sfx.length).trim();
    }
  });

  // Clean up any remaining trailing dashes/separators
  cleanTitle = cleanTitle.replace(/\s*[-\/|]$/, "").trim();
  cleanHandle = cleanHandle.replace(/-[a-z]+(?:-[a-z]+)*$/, "").trim(); // strip last suffix word from slug
  
  primaryProduct.title = cleanTitle;
  primaryProduct.handle = cleanHandle;
  
  // Re-map images to primary product
  primaryProduct.allScrapedImages = Array.from(allImages);
  primaryProduct.imageUrls = [...primaryProduct.allScrapedImages];
  primaryProduct.featuredImage = primaryProduct.featuredImage || primaryProduct.allScrapedImages[0] || "";

  // Delete other products from global state
  state.products = state.products.filter(p => !selectedIds.slice(1).includes(p.id));

  // Reset multi-select state
  state.selectedProductIds.clear();

  // Force UI update
  render();
  showToast(`Successfully merged ${otherProducts.length + 1} products under "${cleanTitle}"!`);
}

// 4) Fetch Single Product asynchronously from URL (to be used in Drawer Direct Variant Import)
async function fetchProductJson(urlStr) {
  const currency = document.getElementById("scrapingCurrency")?.value || "DKK";
  const productUrl = new URL(urlStr);
  const parts = productUrl.pathname.split("/").filter(Boolean);
  const productIndex = parts.lastIndexOf("products");
  let handle = "";
  if (productIndex >= 0 && parts[productIndex + 1]) {
    handle = parts[productIndex + 1].split("?")[0];
  } else {
    handle = (parts[parts.length - 1] || "").split("?")[0];
  }

  // First try direct fetch
  try {
    const directJsonUrl = `${productUrl.origin}/products/${handle}.js?currency=${currency}`;
    const directRes = await fetch(directJsonUrl);
    if (directRes.ok) {
      const shopifyData = await directRes.json();
      const cleanImage = (url) => {
        if (!url) return "";
        let src = typeof url === "string" ? url : (url.src || "");
        if (src.startsWith("//")) src = "https:" + src;
        return src.split("?")[0];
      };
      const uniqueImages = Array.from(new Set((shopifyData.images || []).map(cleanImage))).filter(Boolean).slice(0, 36);

      return {
        handle,
        title: shopifyData.title || "",
        images: uniqueImages,
        featuredImage: cleanImage((shopifyData.images || [])[0]),
        options: shopifyData.options || [{ name: "Title", values: ["Default Title"] }],
        variants: Array.isArray(shopifyData.variants)
          ? shopifyData.variants.map((v) => {
              const rawPrice = typeof v.price === "number" ? v.price / 100 : Number(v.price || 0) / 100;
              const rawComparePrice = v.compare_at_price 
                ? (typeof v.compare_at_price === "number" ? v.compare_at_price / 100 : Number(v.compare_at_price) / 100) 
                : null;
              const onSale = rawComparePrice && rawComparePrice > rawPrice ? "Yes" : "No";

              return {
                id: v.id,
                title: v.title,
                sku: v.sku || "",
                price: onSale === "Yes" ? rawComparePrice : rawPrice,
                compareAtPrice: onSale === "Yes" ? rawPrice : null,
                onSale: onSale,
                stock: typeof v.inventory_quantity === "number" ? v.inventory_quantity : (v.available ? 99 : 0),
                weight: v.weight ? Number(v.weight) / 1000 : 0,
                option1: v.option1 || null,
                option2: v.option2 || null,
                option3: v.option3 || null,
                featuredImage: v.featured_image ? cleanImage(v.featured_image) : ""
              };
            })
          : []
      };
    }
  } catch (err) {
    console.warn("Direct fetch for variant merge failed, using fallback endpoint:", err.message);
  }

  // Fallback to server proxy
  const response = await authenticatedFetch(`/api/product?url=${encodeURIComponent(urlStr)}&currency=${currency}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch details");
  }
  return data;
}

// 5) Import URL directly as variants inside edit drawer
async function importUrlAsVariant() {
  const input = document.getElementById("drawerMergeUrlInput");
  const btn = document.getElementById("drawerMergeUrlBtn");
  if (!input || !btn) return;

  const urlStr = input.value.trim();
  if (!urlStr) {
    showToast("Please enter a product URL first");
    return;
  }

  const activeProduct = state.products.find(p => p.id === state.activeProductId);
  if (!activeProduct) {
    showToast("No active product selected for merging");
    return;
  }

  try {
    new URL(urlStr);
  } catch (e) {
    showToast("Please enter a valid product link");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Fetching...";
  showToast("Connecting to variant source page...");

  try {
    const data = await fetchProductJson(urlStr);
    
    // Normalize Option 1 to 'Finish' if it's 'Title' or similar
    if (!activeProduct.options || activeProduct.options.length === 0 || activeProduct.options[0].name === "Title") {
      activeProduct.options = [{ name: "Finish", values: [] }];
    } else if (activeProduct.options[0].name !== "Finish") {
      activeProduct.options[0].name = "Finish";
    }

    const currentFinish = detectVariantValue(activeProduct);
    activeProduct.variants.forEach(v => {
      v.option1 = v.option1 && v.option1 !== "Default Title" ? v.option1 : currentFinish;
    });

    const newFinish = detectVariantValue(data);

    // Merge variants
    const newVariants = (data.variants || []).map(v => {
      const originalSku = v.sku || "";
      const baseSku = activeProduct.handle.toUpperCase();
      const variantSuffix = String(v.id || "").toUpperCase().slice(-6);
      const newSku = originalSku ? originalSku : `${baseSku}-${variantSuffix}`;

      // Resolve variant featured image (fallback to the source product's featured image if variant itself has none)
      const variantImg = v.featuredImage && v.featuredImage !== "none" ? v.featuredImage : (data.featuredImage || "");

      return {
        id: v.id,
        title: v.title,
        sku: newSku,
        price: v.price || 0,
        compareAtPrice: v.compareAtPrice || null,
        onSale: v.onSale || "No",
        stock: typeof v.stock !== 'undefined' ? v.stock : 99,
        weight: v.weight || 0,
        option1: v.option1 && v.option1 !== "Default Title" ? v.option1 : newFinish,
        option2: v.option2 || null,
        option3: v.option3 || null,
        featuredImage: variantImg,
        isMerged: true // Flag as merged
      };
    });

    activeProduct.variants.push(...newVariants);

    // Merge images
    const allImages = new Set([
      ...(activeProduct.imageUrls || []),
      ...(activeProduct.allScrapedImages || [])
    ]);

    const incomingImages = [...(data.images || []), ...(data.allScrapedImages || [])].filter(Boolean);
    incomingImages.forEach(img => allImages.add(img));

    activeProduct.allScrapedImages = Array.from(allImages);
    activeProduct.imageUrls = [...activeProduct.allScrapedImages];

    // Clear input
    input.value = "";
    showToast(`Variant "${newFinish}" successfully appended!`);
    
    // Re-render components
    populateImagesTab(activeProduct);
    populateVariantsTab(activeProduct);
    render();
  } catch (err) {
    showToast(`Merge failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Merge URL Variant";
  }
}

// 6) Bind v0.2.1 specific UI triggers
function initMergeTriggers() {
  const mergeBtn = document.getElementById("mergeBtn");
  if (mergeBtn) {
    mergeBtn.addEventListener("click", mergeSelectedProducts);
  }

  const drawerMergeBtn = document.getElementById("drawerMergeUrlBtn");
  if (drawerMergeBtn) {
    drawerMergeBtn.addEventListener("click", () => {
      if (!requirePremium()) return;
      importUrlAsVariant();
    });
  }
}

/* ==========================================================================
   PREMIUM ACCESS PASSCODE STATE MANAGEMENT & EVENT CONTROLLER
   ========================================================================== */

function isPremiumActive() {
  // Lite Version: Premium features are fully unlocked by default
  return true;
}

function requirePremium(onSuccess) {
  if (isPremiumActive()) {
    if (onSuccess) onSuccess();
    return true;
  } else {
    openPasscodeModal();
    return false;
  }
}

function openPasscodeModal(tabIndex = 0) {
  const overlay = document.getElementById("passcodeModalOverlay");
  if (overlay) {
    overlay.classList.add("active");
    switchTab(tabIndex === 0 ? "activate" : "checkout");
  }
}

function closePasscodeModal() {
  const overlay = document.getElementById("passcodeModalOverlay");
  if (overlay) overlay.classList.remove("active");
}

function switchTab(tabType) {
  const tabBtnActivate = document.getElementById("tabBtnActivate");
  const tabBtnCheckout = document.getElementById("tabBtnCheckout");
  const contentActivate = document.getElementById("modalContentActivate");
  const contentCheckout = document.getElementById("modalContentCheckout");

  if (!tabBtnActivate || !tabBtnCheckout || !contentActivate || !contentCheckout) return;

  if (tabType === "activate") {
    tabBtnActivate.classList.add("active");
    tabBtnCheckout.classList.remove("active");
    contentActivate.classList.add("active");
    contentCheckout.classList.add("active");
    contentCheckout.style.display = "none";
    contentActivate.style.display = "block";
  } else {
    tabBtnActivate.classList.remove("active");
    tabBtnCheckout.classList.add("active");
    contentActivate.classList.remove("active");
    contentCheckout.classList.add("active");
    contentActivate.style.display = "none";
    contentCheckout.style.display = "block";
  }
}

function updatePremiumUI() {
  const badge = document.getElementById("passcodeStatusBadge");
  if (!badge) return;

  const isPremium = isPremiumActive();
  const labelEl = badge.querySelector(".badge-label");

  if (isPremium) {
    badge.className = "passcode-status-badge premium";
    const rawExpiry = localStorage.getItem("access_expiry");
    let expiryStr = "Active";
    if (rawExpiry) {
      try {
        const d = new Date(rawExpiry);
        expiryStr = `✨ Premium (Exp: ${d.getMonth() + 1}/${d.getDate()})`;
      } catch {}
    }
    if (labelEl) labelEl.textContent = expiryStr;
    badge.title = "Premium Active. Click to manage passcode.";
  } else {
    badge.className = "passcode-status-badge guest";
    if (labelEl) labelEl.textContent = "🔑 Guest Mode";
    badge.title = "Click to enter passcode and unlock premium.";
  }



  const syncBtn = document.getElementById("btnSyncImages");
  if (syncBtn) {
    if (isPremium) {
      syncBtn.innerHTML = "Sync Images";
    } else {
      syncBtn.innerHTML = "🔒 Sync Images";
    }
  }

  const mergeBtn = document.getElementById("drawerMergeUrlBtn");
  if (mergeBtn) {
    if (isPremium) {
      mergeBtn.innerHTML = "Merge URL Variant";
    } else {
      mergeBtn.innerHTML = "🔒 Merge URL";
    }
  }
}

// Global fetch interceptor to append authorization bearer passcode to advanced API calls
async function authenticatedFetch(url, options = {}) {
  const passcode = localStorage.getItem("access_passcode");
  if (passcode) {
    options.headers = options.headers || {};
    options.headers["Authorization"] = `Bearer ${passcode}`;
  }
  return fetch(url, options);
}

function initPasscodeAuth() {
  // 1. Badge Trigger click (Open Lite Info Modal)
  const badge = document.getElementById("passcodeStatusBadge");
  if (badge) {
    badge.addEventListener("click", () => {
      openPasscodeModal(0);
    });
  }

  // 2. Modal Close Trigger
  const closeBtn = document.getElementById("closePasscodeModal");
  if (closeBtn) {
    closeBtn.addEventListener("click", closePasscodeModal);
  }
  
  const overlay = document.getElementById("passcodeModalOverlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePasscodeModal();
    });
  }

  // 3. Tab switching
  const tabBtnActivate = document.getElementById("tabBtnActivate");
  const tabBtnCheckout = document.getElementById("tabBtnCheckout");
  if (tabBtnActivate) {
    tabBtnActivate.addEventListener("click", () => switchTab("activate"));
  }
  if (tabBtnCheckout) {
    tabBtnCheckout.addEventListener("click", () => switchTab("checkout"));
  }

  // 4. Passcode validation form submission
  const passcodeForm = document.getElementById("passcodeForm");
  if (passcodeForm) {
    passcodeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("passcodeInput");
      const passcodeVal = input.value.trim();
      
      if (!passcodeVal) return;

      const submitBtn = passcodeForm.querySelector("button[type='submit']");
      const origText = submitBtn.textContent;
      submitBtn.textContent = "Verifying...";
      submitBtn.disabled = true;

      try {
        const response = await fetch("/api/auth/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: passcodeVal })
        });
        
        const data = await response.json();
        
        if (response.ok && data.valid) {
          localStorage.setItem("access_passcode", passcodeVal);
          localStorage.setItem("access_expiry", data.expiry);
          showToast("✨ Premium Access Activated Successfully!");
          closePasscodeModal();
          updatePremiumUI();
          input.value = "";
        } else {
          showToast(`❌ Error: ${data.error || "Invalid passcode"}`);
        }
      } catch (err) {
        showToast("Server validation failed. Please check your internet connection.");
      } finally {
        submitBtn.textContent = origText;
        submitBtn.disabled = false;
      }
    });
  }

  // 5. Automated passcode format auto-hyphen injector (893-201)
  const codeInput = document.getElementById("passcodeInput");
  if (codeInput) {
    codeInput.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "");
      if (val.length > 3) {
        val = val.substring(0, 3) + "-" + val.substring(3, 6);
      }
      e.target.value = val;
    });
  }

  // 6. Checkout checkout simulation purchase form submission
  const checkoutForm = document.getElementById("simulatedCheckoutForm");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("checkoutEmail");
      const emailVal = emailInput.value.trim();

      if (!emailVal) return;

      const payBtn = document.getElementById("paySubmitBtn");
      const origText = payBtn.textContent;
      payBtn.textContent = "Connecting to Stripe...";
      payBtn.disabled = true;

      try {
        const response = await fetch("/api/auth/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailVal })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          if (data.url) {
            // Real Stripe checkout session redirect!
            showToast("Redirecting to Stripe Checkout...");
            window.location.href = data.url;
          } else if (data.fallback) {
            // Fallback simulation mode
            showToast("Stripe offline fallback mode activated.");
            document.getElementById("checkoutFormState").style.display = "none";
            const successState = document.getElementById("checkoutSuccessState");
            successState.style.display = "block";
            
            document.getElementById("revealedCodeText").textContent = data.passcode;
            document.getElementById("successEmailText").textContent = data.email;
            
            successState.dataset.tempCode = data.passcode;
            successState.dataset.tempExpiry = data.expiry;
          }
        } else {
          showToast(`Stripe Checkout failed: ${data.error || "Try again"}`);
        }
      } catch (err) {
        // Full offline local fallback
        const mockCode = String(Math.floor(100000 + Math.random() * 900000));
        const mockFormatted = `${mockCode.substring(0, 3)}-${mockCode.substring(3)}`;
        const mockExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        document.getElementById("checkoutFormState").style.display = "none";
        const successState = document.getElementById("checkoutSuccessState");
        successState.style.display = "block";
        
        document.getElementById("revealedCodeText").textContent = mockFormatted;
        document.getElementById("successEmailText").textContent = emailVal;
        
        successState.dataset.tempCode = mockFormatted;
        successState.dataset.tempExpiry = mockExpiry;
        showToast("Offline payment simulation succeeded!");
      } finally {
        payBtn.textContent = origText;
        payBtn.disabled = false;
      }
    });
  }

  // 7. Click-to-copy code box click listener
  const revealBox = document.getElementById("passcodeRevealBox");
  if (revealBox) {
    revealBox.addEventListener("click", () => {
      const codeText = document.getElementById("revealedCodeText").textContent;
      if (codeText && codeText !== "--- ---") {
        navigator.clipboard.writeText(codeText);
        showToast("📋 Passcode copied to clipboard!");
      }
    });
  }

  // 8. Success activate and apply code button click listener
  const applyBtn = document.getElementById("successApplyBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const successState = document.getElementById("checkoutSuccessState");
      const code = successState.dataset.tempCode;
      const expiry = successState.dataset.tempExpiry;

      if (code && expiry) {
        localStorage.setItem("access_passcode", code);
        localStorage.setItem("access_expiry", expiry);
        showToast("✨ Premium Access Activated Successfully!");
        closePasscodeModal();
        updatePremiumUI();
        
        document.getElementById("checkoutFormState").style.display = "block";
        successState.style.display = "none";
        document.getElementById("checkoutEmail").value = "";
      }
    });
  }
}

function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get("checkout");
  const email = params.get("email");

  if (checkoutStatus === "success") {
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);

    showToast("💳 Payment successful! Activating premium access...", 4000);
    openPasscodeModal(0);
    
    const input = document.getElementById("passcodeInput");
    if (input) {
      input.placeholder = "Activating access...";
      input.focus();
    }

    if (email) {
      const decodedEmail = decodeURIComponent(email);
      let attempts = 0;
      const maxAttempts = 15; // 30 seconds total
      
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`/api/auth/retrieve?email=${encodeURIComponent(decodedEmail)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.passcode) {
              clearInterval(interval);
              
              // Automatically save and activate passcode!
              localStorage.setItem("access_passcode", data.passcode);
              localStorage.setItem("access_expiry", data.expiry);
              
              showToast("✨ Premium Access Activated Automatically!", 5000);
              updatePremiumUI();
              
              // Show the success card with code in the modal
              document.getElementById("checkoutFormState").style.display = "none";
              const successState = document.getElementById("checkoutSuccessState");
              successState.style.display = "block";
              
              document.getElementById("revealedCodeText").textContent = data.passcode;
              document.getElementById("successEmailText").textContent = decodedEmail;
              
              successState.dataset.tempCode = data.passcode;
              successState.dataset.tempExpiry = data.expiry;
              
              openPasscodeModal(1); // Switch to Tab 2 (Checkout Success State)
            }
          }
        } catch (e) {
          console.error("Error polling passcode retrieval:", e);
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          if (input) {
            input.placeholder = "Enter passcode";
          }
          showToast("Payment confirmed, but activation key is still generating. Check your email or try manually.");
        }
      }, 2000);
    }
  } else if (checkoutStatus === "cancel") {
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    showToast("❌ Payment was cancelled. Feel free to try again.");
  }
}

// Initialize System
initTheme();
initMergeTriggers();
initPasscodeAuth();
handleStripeRedirect();
updatePremiumUI();
initCurrencyRates();
render();

// ==========================================================================
// 09. Service Documentation Modal System
// ==========================================================================
function initDocumentationModal() {
  const floatingDocBtn = document.getElementById("floatingDocBtn");
  const floatingPricingBtn = document.getElementById("floatingPricingBtn");
  const docModalOverlay = document.getElementById("docModalOverlay");
  const closeDocModal = document.getElementById("closeDocModal");

  if (floatingDocBtn && docModalOverlay && closeDocModal) {
    // Open modal
    floatingDocBtn.addEventListener("click", () => {
      docModalOverlay.classList.add("active");
      document.body.style.overflow = "hidden"; // Prevent background scroll
    });

    // Close modal functions
    const closeModal = () => {
      docModalOverlay.classList.remove("active");
      document.body.style.overflow = ""; // Restore background scroll
    };

    closeDocModal.addEventListener("click", closeModal);

    // Close on backdrop click
    docModalOverlay.addEventListener("click", (e) => {
      if (e.target === docModalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && docModalOverlay.classList.contains("active")) {
        closeModal();
      }
    });
  }

  // Handle floating Lite Info button click
  if (floatingPricingBtn) {
    floatingPricingBtn.addEventListener("click", () => {
      openPasscodeModal(0); // Open Lite info modal
    });
  }
}

// Initialize Doc Modal
initDocumentationModal();

// Listen for messages from the ShopShuttle Chrome Extension
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOPSHUTTLE_EXTENSION_IMPORT") {
    const rawProducts = event.data.products;
    if (!Array.isArray(rawProducts)) return;
    
    let addedCount = 0;
    rawProducts.forEach((p) => {
      const exists = state.products.some((item) => item.sourceUrl === p.sourceUrl);
      if (exists) return;
      
      const normalizedProduct = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        sourceUrl: p.sourceUrl,
        handle: p.handle || "product",
        variant: p.variant || "",
        importMode: "variants",
        scrapingCurrency: p.currency || document.getElementById("scrapingCurrency")?.value || "USD",
        title: p.title || "Clipped Product",
        description: generatePremiumDescription({ title: p.title || "" }, p.description || ""),
        page: "shop",
        category: p.category || "",
        tags: p.tags || "",
        imageStatus: p.images && p.images.length ? "loaded" : "empty",
        imageUrls: p.images || [],
        allScrapedImages: p.images || [],
        featuredImage: p.featuredImage || (p.images && p.images[0]) || "",
        options: p.options || [{ name: "Title", values: ["Default Title"] }],
        variants: p.variants || [{
          id: "default",
          title: "Default Title",
          sku: "",
          price: p.price || 0,
          compareAtPrice: null,
          onSale: "No",
          stock: 99,
          weight: 0,
          option1: "Default Title"
        }],
        vatStatus: p.vatStatus || "VAT Included (Assumed)"
      };
      
      // Auto-assign category if not present
      if (!normalizedProduct.category) {
        normalizedProduct.category = autoAssignCategory(normalizedProduct);
      }
      
      state.products.push(normalizedProduct);
      addedCount++;
    });
    
    if (addedCount > 0) {
      render();
      showToast(`Successfully imported ${addedCount} product(s) from ShopShuttle Extension! 🚀`);
    } else {
      showToast("All imported products are already in the list.");
    }
  }
});


