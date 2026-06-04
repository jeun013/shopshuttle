import { sendPasscodeEmail } from "../utils/email.js";

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(",");
  let timestamp = "";
  const signatures = [];

  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "t") timestamp = val.trim();
    if (key === "v1") signatures.push(val.trim());
  }

  if (!timestamp || signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(signedPayload);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    messageData
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const computedSignature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return signatures.includes(computedSignature);
}

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
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
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("stripe-signature");
    
    // Resolve webhook secret, checking both the correct key and the STRIPE_WEBH00K_SECRET typo
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBH00K_SECRET;

    if (webhookSecret) {
      const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.error("[STRIPE WEBHOOK ERROR] Signature verification failed.");
        return new Response(JSON.stringify({ error: "Invalid stripe signature" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      console.log("[STRIPE WEBHOOK] Signature verified successfully.");
    } else {
      console.warn("[STRIPE WEBHOOK WARNING] Webhook secret (STRIPE_WEBHOOK_SECRET or STRIPE_WEBH00K_SECRET) is missing. Skipping signature verification in development/fallback mode.");
    }

    const event = JSON.parse(rawBody);
    console.log(`[STRIPE WEBHOOK] Received event: ${event.type}`);

    // We process successful checkout completions
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const email = session.metadata?.customer_email || session.customer_details?.email;

      if (!email) {
        throw new Error("No customer email found in checkout session metadata or details.");
      }

      // Generate cryptographically random 6-digit passcode (format: 123-456)
      const randomCode = String(Math.floor(100000 + Math.random() * 900000));
      const formattedCode = `${randomCode.substring(0, 3)}-${randomCode.substring(3)}`;
      
      // Calculate 7-day expiration time
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const payload = {
        email,
        expiry,
        createdAt: new Date().toISOString(),
        stripeSessionId: session.id
      };

      // Store in Cloudflare Workers KV if available
      if (env.PASSCODES) {
        // Store both formatted and stripped versions for 100% foolproof user matching
        await env.PASSCODES.put(randomCode, JSON.stringify(payload));
        await env.PASSCODES.put(formattedCode, JSON.stringify(payload));
        // Store email index to retrieve passcode easily on redirect return
        await env.PASSCODES.put(`email:${email.toLowerCase().trim()}`, JSON.stringify({ passcode: formattedCode, expiry }));
        console.log(`[STRIPE WEBHOOK SUCCESS] Registered passcode: ${formattedCode} for ${email}`);
      } else {
        console.warn("[STRIPE WEBHOOK WARNING] KV Binding 'PASSCODES' is not configured. Passcode could not be saved to production database!");
      }

      // Dispatch passcode email securely using Resend or SendGrid REST API
      const emailResult = await sendPasscodeEmail(email, formattedCode, expiry, env);
      if (emailResult.success) {
        console.log(`[STRIPE WEBHOOK EMAIL] Successfully dispatched passcode email via ${emailResult.provider} to ${email}`);
      } else {
        console.warn(`[STRIPE WEBHOOK EMAIL WARNING] Email dispatch failed or was skipped: ${emailResult.error}`);
      }

      // Log passcode generated so it is retrievable in Cloudflare Worker logs
      console.log(`\n========================================\n[NEW PASSCODE ACTIVATED]\nEMAIL: ${email}\nCODE: ${formattedCode}\nEXPIRY: ${expiry}\n========================================\n`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    console.error("[STRIPE WEBHOOK ERROR]", err);
    return new Response(JSON.stringify({ error: `Webhook handling error: ${err.message}` }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
