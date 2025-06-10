/**
 * Cloudflare Worker: AI-Powered Dynamic HTML Server
 *
 * This worker intercepts HTTP requests and uses a generative AI (Google Gemini)
 * to create HTML content on the fly based on the request path. It then dynamically
 * injects Google Analytics and AdSense scripts into the AI-generated HTML before
 * sending it to the user.
 *
 * How to configure:
 * 1. Create a new Cloudflare Worker.
 * 2. Paste this code into the editor.
 * 3. Go to the Worker's settings -> Variables -> "Secret Variables" and add:
 * - GEMINI_API_KEY: Your Google AI (Gemini) API key.
 * - GA_MEASUREMENT_ID: Your Google Analytics Measurement ID (e.g., "G-XXXXXXXXXX").
 * - ADSENSE_CLIENT_ID: Your Google AdSense Client ID (e.g., "ca-pub-xxxxxxxxxxxxxxxx").
 * 4. Save and Deploy.
 */

// Handler for injecting scripts into the <head> of the HTML
class HeadInjector {
  constructor(env) {
    this.env = env;
  }

  element(element) {
    // Inject Google Analytics script if the Measurement ID is configured
    if (this.env.GA_MEASUREMENT_ID) {
      element.append(`
        <!-- Google Analytics (injected by Cloudflare Worker) -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=${this.env.GA_MEASUREMENT_ID}"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${this.env.GA_MEASUREMENT_ID}');
        </script>
      `, { html: true });
    }

    // Inject Google AdSense script if the Client ID is configured
    if (this.env.ADSENSE_CLIENT_ID) {
      element.append(`
        <!-- Google AdSense (injected by Cloudflare Worker) -->
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.env.ADSENSE_CLIENT_ID}" crossorigin="anonymous"></script>
      `, { html: true });
    }
  }
}


export default {
  async fetch(request, env, ctx) {
    // --- Step 1: Validate Environment Configuration ---
    if (!env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured.");
      return new Response("AI service is not configured. Administrator needs to set the GEMINI_API_KEY secret.", {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const url = new URL(request.url);

    // --- Step 2: Handle non-HTML requests gracefully ---
    // Avoid running AI for common non-page requests like favicons or assets.
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // --- Step 3: Extract Request Details & Build the AI Prompt ---
    const method = request.method;
    const path = url.pathname;
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    const prompt = `你是一个 HTTP server，用户当前在使用 ${method} 方法，请求路径是 ${path}，用户 User-Agent 是 ${userAgent}，请你对此请求和路径写出对应的 HTML 文档。HTML 文档的 head 标签中必须包含一个 charset=utf-8 标签，样式只能写成行内样式，写在标签的 style 属性上！除了 HTML 内容外不要返回其他内容！并且 HTML 内最少要有一个超链接，路径必须是本站的绝对路径（例如 /about 或 /products）。`;

    // --- Step 4: Call the Gemini API to Generate HTML ---
    try {
      const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
      
      const payload = {
        contents: [{
          role: "user",
          parts: [{ text: prompt }]
        }]
      };

      const aiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!aiResponse.ok) {
        const errorBody = await aiResponse.text();
        console.error(`Gemini API Error (${aiResponse.status}): ${errorBody}`);
        return new Response(`Failed to get a response from the AI model. Status: ${aiResponse.status}`, { status: 502 });
      }

      const result = await aiResponse.json();

      // --- Step 5: Extract HTML and Prepare for Streaming Injection ---
      let htmlContent = "<!-- AI content generation failed -->"; // Default content on failure
      if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0].text) {
          htmlContent = result.candidates[0].content.parts[0].text;
          // Clean up potential markdown formatting from the AI response
          htmlContent = htmlContent.replace(/^```html\n/, '').replace(/\n```$/, '');
      } else {
         console.error("Unexpected AI response structure:", JSON.stringify(result, null, 2));
         return new Response("Received an unexpected response format from the AI model.", { status: 500 });
      }
      
      const initialResponse = new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });

      // --- Step 6: Use HTMLRewriter to Inject Scripts and Return ---
      const rewriter = new HTMLRewriter().on('head', new HeadInjector(env));
      return rewriter.transform(initialResponse);

    } catch (error) {
      console.error("Error during worker execution:", error);
      return new Response("An internal error occurred while processing the request.", {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>500 - Server Error</title>
            <style>body { font-family: sans-serif; text-align: center; padding: 50px; }</style>
          </head>
          <body>
            <h1>500 - Internal Server Error</h1>
            <p>Sorry, something went wrong on our end while asking the AI to build this page.</p>
            <p><i>Error: ${error.message}</i></p>
          </body>
          </html>
        `
      });
    }
  },
};
