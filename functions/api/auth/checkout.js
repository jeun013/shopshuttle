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
    const { email } = await request.json();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const stripeSecret = env.STRIPE_SECRET_KEY;
    
    // Graceful Fallback: If Stripe API key is not yet set up, return a simulator link or error
    if (!stripeSecret) {
      console.warn("STRIPE_SECRET_KEY is missing in Cloudflare environment variables!");
      
      // We will simulate Stripe redirect by generating a passcode immediately and returning a fallback payload
      const mockCode = String(Math.floor(100000 + Math.random() * 900000));
      const formattedCode = `${mockCode.substring(0, 3)}-${mockCode.substring(3)}`;
      const mockExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      return new Response(JSON.stringify({
        fallback: true,
        message: "Stripe Secret Key is missing in Cloudflare. Running in Offline Simulator mode.",
        passcode: formattedCode,
        expiry: mockExpiry,
        email
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Call Stripe API to create a Checkout Session (using native fetch to prevent heavy library dependency)
    const formData = new URLSearchParams();
    formData.append("payment_method_types[]", "card");
    formData.append("mode", "payment");
    formData.append("customer_email", email);
    
    // Set 7-day access price ($9 USD)
    formData.append("line_items[0][price_data][currency]", "usd");
    formData.append("line_items[0][price_data][product_data][name]", "ShopShuttle Pro - 7 Day Access");
    formData.append("line_items[0][price_data][product_data][description]", "Instant passcode activation sent immediately to your email.");
    formData.append("line_items[0][price_data][unit_amount]", "900"); // $9.00 USD in cents
    formData.append("line_items[0][quantity]", "1");

    // Success and cancel redirect URLs
    const origin = new URL(request.url).origin;
    formData.append("success_url", `${origin}/?checkout=success&email=${encodeURIComponent(email)}`);
    formData.append("cancel_url", `${origin}/?checkout=cancel`);
    
    // Attach email in metadata to extract during Stripe Webhook trigger
    formData.append("metadata[customer_email]", email);

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData.toString()
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      throw new Error(session.error?.message || "Stripe Checkout session generation failed.");
    }

    return new Response(JSON.stringify({
      success: true,
      url: session.url
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    console.error("[STRIPE CHECKOUT ERROR]", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to create checkout session." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
