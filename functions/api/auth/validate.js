import { verifyPasscode } from "../utils/auth.js";

export async function onRequest(context) {
  const { request } = context;
  
  // Handle CORS Preflight
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

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    // Re-use our robust verifyPasscode helper!
    // Since verifyPasscode expects an Authorization header, we can simulate or pass it.
    // However, let's also allow passing passcode in the JSON body for easier frontend usage.
    let body;
    try {
      body = await request.clone().json();
    } catch {
      body = {};
    }

    let checkContext = context;
    if (body.passcode) {
      // If passcode is passed in the body, create a mock request containing the Authorization header
      const mockHeaders = new Headers(request.headers);
      mockHeaders.set("Authorization", `Bearer ${body.passcode}`);
      
      const mockRequest = new Request(request.url, {
        method: request.method,
        headers: mockHeaders
      });
      
      checkContext = { ...context, request: mockRequest };
    }

    const authResult = await verifyPasscode(checkContext);
    
    return new Response(JSON.stringify({ 
      valid: true, 
      expiry: authResult.expiry 
    }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ 
      valid: false, 
      error: err.message || "Invalid or expired passcode" 
    }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
