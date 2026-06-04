import { sendPasscodeEmail } from "../utils/email.js";

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

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  const { email } = body;
  if (!email || !email.includes("@")) {
    return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Generate a random 6-digit passcode
  const randomCode = String(Math.floor(100000 + Math.random() * 900000));
  const formattedCode = `${randomCode.substring(0, 3)}-${randomCode.substring(3)}`;
  
  // Set expiry to 7 days from now
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const payload = {
    email,
    expiry,
    createdAt: new Date().toISOString()
  };

  // If KV binding "PASSCODES" is available, store it!
  if (context.env && context.env.PASSCODES) {
    // Store both raw and formatted versions for ultra-high user friendliness
    await context.env.PASSCODES.put(randomCode, JSON.stringify(payload));
    await context.env.PASSCODES.put(formattedCode, JSON.stringify(payload));
  }

  // Dispatch passcode email securely using Resend or SendGrid REST API
  if (context.env) {
    const emailResult = await sendPasscodeEmail(email, formattedCode, expiry, context.env);
    if (emailResult.success) {
      console.log(`[GENERATE PASSCODE EMAIL] Successfully dispatched passcode email via ${emailResult.provider} to ${email}`);
    } else {
      console.warn(`[GENERATE PASSCODE EMAIL WARNING] Email dispatch failed or was skipped: ${emailResult.error}`);
    }
  }

  console.log(`[PASSCODE GENERATED] Email: ${email}, Code: ${formattedCode}, Expiry: ${expiry}`);

  return new Response(JSON.stringify({
    success: true,
    passcode: formattedCode,
    expiry,
    email
  }), {
    status: 200,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
