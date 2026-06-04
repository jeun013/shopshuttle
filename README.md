<video src="./shopshuttle_demo01_1.mp4?raw=true" width="100%" controls></video>

# ShopShuttle

A client-first ETL utility that parses and standardizes product listings from multiple e-commerce structures, applies user-configured tax and currency rules, and maps them to standard bulk import formats.

## 📘 Documentation

We have comprehensive technical specifications and service guides available in both English and Korean:

- [English Documentation](service_documentation_en.md)

---

## 🚀 Key Features

* **Multi-Platform Scraper**: Dynamic data extraction from **Shopify** (`/products/{handle}.js`), **Squarespace** (`Static.SQUARESPACE_CONTEXT`), and **WooCommerce** (hybrid JSON-LD and DOM parser).
* **Currency Exchange Processing**: Automated and manual exchange rate overrides using cached real-time exchange rates.
* **Tax/VAT Conversions**: Clean extraction and handling of tax-inclusive and tax-exclusive items.
* **SKU Custom Policy**: Automated handle-based ID generation, source SKU preservation, or blank upload slots.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS
* **Backend**: Cloudflare Pages Serverless Functions
* **Testing & Deployment**: Cloudflare Wrangler

---

## 💻 Local Development

To run the application locally:

1. Install Wrangler CLI (if not already installed):
   ```bash
   npm install -g wrangler
   ```
2. Start the local serverless development environment:
   ```bash
   npx wrangler pages dev .
   ```
3. Open your browser and navigate to `http://localhost:8788`.
