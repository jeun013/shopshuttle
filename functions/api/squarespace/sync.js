import { verifyClerkToken } from "../utils/auth.js";

export async function onRequest(context) {
  const { request } = context;

  // Handle CORS preflight options request
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { apiKey, productSkus, colorImages, offset, limit } = body;
  if (!apiKey || !productSkus || !colorImages) {
    return new Response(JSON.stringify({ error: "Missing parameters" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Create a TransformStream to support streaming response!
  let { readable, writable } = new TransformStream();
  let writer = writable.getWriter();
  let encoder = new TextEncoder();

  // Process asynchronously and stream back to the client!
  context.waitUntil((async () => {
    try {
      const sqspProducts = await fetchSquarespaceProducts(apiKey);
      
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
        await writer.write(encoder.encode(JSON.stringify({ 
          error: "These product SKUs are not registered in Squarespace yet. Please import the downloaded CSV into Squarespace first before clicking the sync button!" 
        }) + "\n"));
        await writer.close();
        return;
      }

      const productId = targetProduct.id;
      const sqspVariants = targetProduct.variants || [];
      const sqspImages = targetProduct.images || [];

      const totalVariants = sqspVariants.length;
      const startIdx = typeof offset === "number" ? offset : 0;
      const endIdx = typeof limit === "number" && limit > 0 ? Math.min(startIdx + limit, totalVariants) : totalVariants;

      await writer.write(encoder.encode(JSON.stringify({ 
        status: "start", 
        total: totalVariants, 
        offset: startIdx, 
        limit: endIdx - startIdx 
      }) + "\n"));

      const results = [];
      for (let i = startIdx; i < endIdx; i++) {
        const variant = sqspVariants[i];
        const vSkuUpper = String(variant.sku).trim().toUpperCase();
        
        const localVarData = colorImages.find(item => String(item.sku).trim().toUpperCase() === vSkuUpper);
        if (!localVarData) {
          results.push({ sku: variant.sku, status: "no_local_data_matched" });
          await writer.write(encoder.encode(JSON.stringify({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "skipped_no_local" }) + "\n"));
          continue;
        }

        const localImgUrl = localVarData.url;
        const colorIndex = localVarData.colorIndex;
        const imageId = findSquarespaceImageId(sqspImages, localImgUrl, colorIndex);
        
        if (imageId) {
          // Optimization: If this image ID is already mapped to the variant, skip additional API calls!
          if (variant.imageId === imageId) {
            results.push({ sku: variant.sku, status: "success", imageId, skipped: true });
            await writer.write(encoder.encode(JSON.stringify({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "success_skipped" }) + "\n"));
          } else {
            await associateVariantImage(apiKey, productId, variant.id, imageId);
            results.push({ sku: variant.sku, status: "success", imageId });
            await writer.write(encoder.encode(JSON.stringify({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "success" }) + "\n"));
          }
        } else {
          results.push({ sku: variant.sku, status: "no_image_matched" });
          await writer.write(encoder.encode(JSON.stringify({ status: "progress", current: i + 1, total: totalVariants, sku: variant.sku, result: "skipped_no_image" }) + "\n"));
        }
      }

      const successCount = results.filter(r => r.status === "success").length;
      await writer.write(encoder.encode(JSON.stringify({ status: "complete", count: successCount, details: results }) + "\n"));

    } catch (err) {
      await writer.write(encoder.encode(JSON.stringify({ error: err.message || "Failed during sync process" }) + "\n"));
    } finally {
      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

// Sub-helpers inside CF worker
async function fetchSquarespaceProducts(apiKey) {
  let products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    let url = "https://api.squarespace.com/v2/commerce/products";
    if (cursor) url += `?cursor=${encodeURIComponent(cursor)}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "User-Agent": "ShopShuttle/1.0",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Squarespace API Error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    products = products.concat(data.products || []);
    cursor = data.pagination?.nextPageCursor || null;
    hasNext = !!(data.pagination?.hasNextPage && cursor);
  }

  return products;
}

function findSquarespaceImageId(sqspImages, localImgUrl, colorIndex) {
  if (!sqspImages || sqspImages.length === 0) return null;
  
  const cleanFilename = (url) => {
    try {
      const p = new URL(url).pathname;
      return p.substring(p.lastIndexOf("/") + 1).toLowerCase();
    } catch {
      return String(url).substring(String(url).lastIndexOf("/") + 1).toLowerCase();
    }
  };

  const localFile = cleanFilename(localImgUrl);

  for (const img of sqspImages) {
    if (img.url && cleanFilename(img.url) === localFile) return img.id;
  }

  if (colorIndex !== undefined && colorIndex >= 0 && colorIndex < sqspImages.length) {
    return sqspImages[colorIndex].id;
  }

  return sqspImages[0]?.id || null;
}

async function associateVariantImage(apiKey, productId, variantId, imageId) {
  const url = `https://api.squarespace.com/v2/commerce/products/${productId}/variants/${variantId}/image`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "ShopShuttle/1.0"
    },
    body: JSON.stringify({ imageId })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to associate image for variant ${variantId}: ${response.statusText} - ${text}`);
  }
}
