import readline from 'readline';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ Error: GEMINI_API_KEY environment variable is not set.");
  console.error("Please run: export GEMINI_API_KEY='your_api_key' in your terminal first.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("==================================================");
console.log("🤖 Welcome to [Interactive AI Product Scraper v1.0]!");
console.log("==================================================\n");

async function scrapeWithAI(url) {
  try {
    console.log(`\n🔍 Fetching data from [${url}]...`);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    
    let html = await response.text();
    
    // Lightweight: Keep JSON-LD (schema data) because it contains rich price/options info!
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove scripts except application/ld+json which contains structured metadata
    html = html.replace(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi, '');

    const prompt = `
    You are the world's best e-commerce scraper AI.
    Analyze the HTML source below, extract the product data accurately, and return it in JSON format.
    (Note: Price or variants option details might be inside <script type="application/ld+json"> blocks or custom attributes like data-price. Look carefully!)
    
    [Response Format (Output PURE JSON only)]
    {
      "title": "Product Title",
      "description": "Description",
      "price": price_number,
      "currency": "currency_symbol_or_code",
      "options": ["Option Name 1", "Option Name 2"],
      "variants": [{"name": "Option Combination", "price": price_number}],
      "images": ["imageURL1", "imageURL2"]
    }
    
    [HTML Source]
    ${html.slice(0, 80000)}
    `;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    
    const aiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    });

    const aiData = await aiResponse.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const rawJson = aiData.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(rawJson);

    console.log("\n🎉 [Extraction Complete] AI Analysis Results:\n");
    console.log(`📌 Title: ${parsedData.title}`);
    console.log(`💰 Price: ${parsedData.price || 'Not found'} ${parsedData.currency || ''}`);
    console.log(`📦 Options: ${(parsedData.options || []).join(', ') || 'None'}`);
    console.log(`🎨 Variants: ${(parsedData.variants || []).length} combinations found`);
    console.log(`🖼️ Images: ${(parsedData.images || []).length} images extracted\n`);
    
  } catch (err) {
    console.error(`\n❌ Error occurred: ${err.message}\n`);
  }
}

function askQuestion() {
  rl.question('🔗 Enter the product URL to analyze (type exit to quit): ', async (url) => {
    if (url.trim().toLowerCase() === 'exit') {
      console.log('👋 Closing the AI Scraper. Goodbye!');
      rl.close();
      return;
    }
    
    if (url.trim() === '') {
      askQuestion();
      return;
    }

    await scrapeWithAI(url.trim());
    console.log("--------------------------------------------------");
    askQuestion(); // loop
  });
}

// Start conversation loop
askQuestion();
