/**
 * Utility to dispatch premium passcode emails using Resend or SendGrid APIs via native fetch.
 */
export async function sendPasscodeEmail(email, formattedCode, expiry, env) {
  const emailFrom = env.EMAIL_FROM || "ShopShuttle <onboarding@resend.dev>";
  
  // Format English/UTC time
  let formattedExpiry = expiry;
  try {
    formattedExpiry = new Date(expiry).toLocaleString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short"
    });
  } catch (e) {
    console.warn("Date formatting failed, fallback to raw string:", e);
  }

  const subject = "ShopShuttle Premium Passcode 🔑";
  
  // Clean, beautiful, premium CSS-styled HTML template
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #4f46e5; margin-bottom: 8px; font-size: 22px; font-weight: 700;">Your Premium Passcode is Ready! 🔑</h2>
      <p style="font-size: 14px; color: #374151; line-height: 1.6; margin-top: 16px;">
        Hello! Thank you for purchasing ShopShuttle Premium Access.<br>
        Your payment has been successfully processed, giving you 7 days of unlimited access to premium features (Shopify Bulk Upload, Image Sync, Matrix Merging, etc.).
      </p>
      
      <div style="background-color: #f5f3ff; border: 2px dashed #4f46e5; border-radius: 8px; padding: 24px; text-align: center; margin: 28px 0;">
        <p style="font-size: 11px; color: #6b7280; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">User Login Passcode</p>
        <span style="font-size: 32px; font-weight: 800; color: #4f46e5; letter-spacing: 4px; font-family: Monaco, Consolas, monospace;">${formattedCode}</span>
      </div>
      
      <div style="background-color: #f9fafb; border-radius: 6px; padding: 18px; margin-bottom: 24px; border: 1px solid #f3f4f6;">
        <ul style="margin: 0; padding: 0 0 0 20px; font-size: 13px; color: #4b5563; line-height: 1.7;">
          <li style="margin-bottom: 6px;"><strong>Linked Email Address:</strong> ${email}</li>
          <li style="margin-bottom: 6px;"><strong>Passcode Expiry:</strong> ${formattedExpiry} (7 days from issuance)</li>
          <li style="margin-bottom: 0;"><strong>How to Use:</strong> Click the <strong>🔑 Guest Mode</strong> badge at the top-right of the web app, enter this passcode, and click Verify & Activate.</li>
        </ul>
      </div>

      <p style="font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
        Although premium access is automatically activated on the browser you used for checkout, you can input this code on any other computer or mobile device to restore your session instantly.
      </p>
      
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 28px 0;" />
      <p style="font-size: 11px; color: #9ca3af; text-align: center; margin: 0;">ShopShuttle &copy; 2026. All rights reserved.</p>
    </div>
  `;

  // Standard plain text fallback
  const textBody = `Your ShopShuttle Premium Passcode has been generated!\n\nHello!\nYour payment was successful, and your passcode has been generated. Click '🔑 Guest Mode' at the top-right of the web app and enter the code below to unlock premium features.\n\nPasscode: ${formattedCode}\nLinked Email: ${email}\nExpiry: ${formattedExpiry}\n\nThank you!`;

  // 1. Try Resend Service
  if (env.RESEND_API_KEY) {
    console.log(`[EMAIL SENDING] Initiating Resend email dispatch to: ${email}`);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: emailFrom,
          to: email,
          subject: subject,
          html: htmlBody,
          text: textBody
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Resend API returned status code ${res.status}`);
      }
      console.log(`[EMAIL SUCCESS] Dispatched via Resend successfully to ${email}. ID: ${data.id}`);
      return { success: true, provider: "resend", id: data.id };
    } catch (err) {
      console.error("[EMAIL ERROR] Resend dispatch failed:", err);
      return { success: false, error: err.message };
    }
  }

  // 2. Try SendGrid Service
  if (env.SENDGRID_API_KEY) {
    console.log(`[EMAIL SENDING] Initiating SendGrid email dispatch to: ${email}`);
    try {
      // SendGrid requires clean emails for the "from" field
      let cleanFromEmail = "onboarding@resend.dev";
      if (emailFrom.includes("<")) {
        const matches = emailFrom.match(/<([^>]+)>/);
        if (matches && matches[1]) {
          cleanFromEmail = matches[1].trim();
        }
      } else {
        cleanFromEmail = emailFrom.trim();
      }

      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: email }],
              subject: subject
            }
          ],
          from: {
            email: cleanFromEmail,
            name: emailFrom.includes("<") ? emailFrom.split("<")[0].trim() : "ShopShuttle"
          },
          content: [
            {
              type: "text/html",
              value: htmlBody
            },
            {
              type: "text/plain",
              value: textBody
            }
          ]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SendGrid API returned status code ${res.status}: ${errText}`);
      }
      console.log(`[EMAIL SUCCESS] Dispatched via SendGrid successfully to ${email}`);
      return { success: true, provider: "sendgrid" };
    } catch (err) {
      console.error("[EMAIL ERROR] SendGrid dispatch failed:", err);
      return { success: false, error: err.message };
    }
  }

  // 3. Fallback Warning
  console.warn(`[EMAIL WARNING] Email API Key not configured! (RESEND_API_KEY or SENDGRID_API_KEY is missing). The passcode was generated successfully but could not be emailed to: ${email}`);
  return { success: false, error: "No email providers configured" };
}
