/**
 * This is the main entry point for the Cloudflare Worker.
 * It's triggered by every incoming HTTP request.
 * @param {Request} request - The incoming request object.
 * @param {object} env - An object containing environment variables and secrets set in the Cloudflare dashboard.
 * @param {object} ctx - The execution context.
 * @returns {Promise<Response>} A promise that resolves with the Response object.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Ignore requests for the favicon to keep logs clean.
    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Extract details from the incoming request.
    const method = request.method;
    const path = url.pathname;
    const userAgent = request.headers.get('user-agent') || 'Unknown';

    try {
      // Generate the dynamic HTML by calling the AI function.
      // We pass the secrets from the `env` object.
      const htmlContent = await generateHtmlWithAI(method, path, userAgent, env);

      // Return the generated HTML as a new Response.
      return new Response(htmlContent, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (error) {
      // In case of an error, return a user-friendly error page.
      console.error('Worker error:', error);
      const errorMessage = `<html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; background-color: #fdd; color: #a00;"><div style="text-align: center; padding: 50px;"><h1>500 - Worker Error</h1><p>${error.message}</p></div></body></html>`;
      return new Response(errorMessage, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  },
};

/**
 * Calls the Gemini API to generate HTML content based on the request details.
 * @param {string} method - The HTTP request method.
 * @param {string} path - The request URL path.
 * @param {string} userAgent - The User-Agent string.
 * @param {object} env - The environment object containing secrets.
 * @returns {Promise<string>} A promise that resolves with the AI-generated HTML.
 */
async function generateHtmlWithAI(method, path, userAgent, env) {
  // === CONFIGURATION FROM CLOUDFLARE SECRETS ===
  // These values are read from the variables you set in the Worker's dashboard.
  const apiKey = env.GEMINI_API_KEY;
  const googleAdSensePublisherID = env.GOOGLE_ADSENSE_ID || "ca-pub-XXXXXXXXXXXXXXXX";
  const googleAnalyticsMeasurementID = env.GOOGLE_ANALYTICS_ID || "G-XXXXXXXXXX";
  // ===============================================

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in your Worker's settings.");
  }

  const adSenseCode = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${googleAdSensePublisherID}" crossorigin="anonymous"></script>`;
  const analyticsCode = `<script async src="https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsMeasurementID}"></script><script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${googleAnalyticsMeasurementID}');</script>`;

  const prompt = `你是一个 HTTP server ，` +
                 `用户当前在使用 ${method} 方法，` +
                 `请求路径是 ${path} ，用户userAgent是${userAgent}，` +
                 `请你对此请求和路径写出对应的 html 文档，` +
                 `HTML 文档的 head 标签中必须包含一个 charset=utf-8 标签，` +
                 `并且，请务必在 head 标签中加入 Google AdSense 广告代码: ${adSenseCode} ，` +
                 `以及这段 Google Analytics 跟踪代码: ${analyticsCode} ，`+
                 `样式只能写成行内样式，写在标签的 style 属性上！` +
                 `除了 html 内容外不要返回其他内容！` +
                 `并且 html 内最少要有一个超链接，` +
                 `路径必须是本站的绝对路径。`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  console.log(`Sending prompt for path: ${path} (with AdSense and Analytics instructions)`);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API request failed with status ${response.status}: ${errorBody}`);
  }

  const result = await response.json();

  if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
    let htmlContent = result.candidates[0].content.parts[0].text;
    return htmlContent.replace(/^```html\s*|```$/g, '').trim();
  } else {
    console.error("Unexpected API response structure:", JSON.stringify(result, null, 2));
    throw new Error("Failed to get valid content from the AI. Check Worker logs for details.");
  }
}
