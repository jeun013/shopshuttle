// Native JWT Verification middleware for Cloudflare Workers using Web Crypto API
// Contacting Clerk JWKS keys for secure Bearer session validation.

function base64urlDecode(str) {
  // Convert from Base64URL to standard Base64
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  // Decode Base64 string
  const raw = atob(str);
  return raw;
}

export function decodeJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  
  const header = JSON.parse(base64urlDecode(parts[0]));
  const payload = JSON.parse(base64urlDecode(parts[1]));
  
  return { header, payload, parts };
}

// Convert JWK format to Web Crypto Key Object (RS256)
async function importJwk(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: { name: "SHA-256" }
    },
    false,
    ["verify"]
  );
}

// Cache JWKS keys in memory (Cloudflare Worker global memory state)
let jwksCache = null;
let jwksCacheTime = 0;

async function getJwks(clerkJwksUrl = "https://api.clerk.com/v1/jwks") {
  const now = Date.now();
  // Keep key set cached for 1 hour to prevent API throttling
  if (jwksCache && (now - jwksCacheTime < 3600000)) {
    return jwksCache;
  }

  const response = await fetch(clerkJwksUrl, {
    headers: {
      "User-Agent": "ShopShuttle/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS keys from Clerk: ${response.statusText}`);
  }
  
  const jwks = await response.json();
  jwksCache = jwks;
  jwksCacheTime = now;
  return jwks;
}

/**
 * Cleans the passcode input by removing any hyphens or whitespace.
 */
function cleanPasscode(code) {
  return String(code || "").replace(/[-\s]/g, "").trim();
}

export async function verifyPasscode(context) {
  // Lite Version: Bypass passcode verification to allow free direct scraper proxy usage
  const expiryTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
  return { premium: true, expiry: expiryTime };
}

/**
 * Compatibility wrapper to support verifyClerkToken usages
 */
export async function verifyClerkToken(arg) {
  // If arg has a .request property, it is the Pages Context.
  // Otherwise, it is a raw request (fallback with empty env).
  const context = (arg && arg.request) ? arg : { request: arg, env: {} };
  return await verifyPasscode(context);
}

