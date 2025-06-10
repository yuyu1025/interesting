// Import necessary modules. The 'http' module is for creating the server,
// and 'fetch' is for making the API call to the AI model.
const http = require('http');

/**
 * Parses command-line arguments to find the API key.
 * It supports formats like --apiKey=YOUR_KEY or --apiKey YOUR_KEY.
 * It also falls back to the environment variable if no argument is provided.
 * @returns {string} The found API key or an empty string.
 */
function getApiKey() {
    const args = process.argv.slice(2); // Get arguments, skipping node executable and script path.

    // Look for --apiKey=YOUR_KEY or --key=YOUR_KEY
    const keyArgEquals = args.find(arg => arg.startsWith('--apiKey=') || arg.startsWith('--key='));
    if (keyArgEquals) {
        return keyArgEquals.split('=')[1];
    }

    // Look for --apiKey YOUR_KEY or --key YOUR_KEY
    const keyArgIndex = args.findIndex(arg => arg === '--apiKey' || arg === '--key');
    if (keyArgIndex !== -1 && args[keyArgIndex + 1]) {
        return args[keyArgIndex + 1];
    }

    // Fallback to environment variable
    return process.env.GEMINI_API_KEY || "";
}

// Get the API key once at startup from command-line args or environment variable.
const apiKey = getApiKey();


/**
 * Calls the Gemini API to generate HTML content based on the request details.
 * @param {string} method - The HTTP request method (e.g., 'GET').
 * @param {string} url - The request URL path (e.g., '/home').
 * @param {string} userAgent - The User-Agent string from the request headers.
 * @returns {Promise<string>} A promise that resolves with the AI-generated HTML.
 */
async function generateHtmlWithAI(method, url, userAgent) {
    // IMPORTANT: Replace with your actual Google AdSense Publisher ID.
    const googleAdSensePublisherID = "ca-pub-XXXXXXXXXXXXXXXX"; 
    const adSenseCode = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${googleAdSensePublisherID}" crossorigin="anonymous"></script>`;

    const prompt = `你是一个 HTTP server ，` +
                   `用户当前在使用 ${method} 方法，` +
                   `请求路径是 ${url} ，用户userAgent是${userAgent}，` +
                   `请你对此请求和路径写出对应的 html 文档，` +
                   `HTML 文档的 head 标签中必须包含一个 charset=utf-8 标签，` +
                   `并且，请务必在 head 标签中加入这段 Google AdSense 广告代码: ${adSenseCode} ，`+
                   `样式只能写成行内样式，写在标签的 style 属性上！` +
                   `除了 html 内容外不要返回其他内容！` +
                   `并且 html 内最少要有一个超链接，` +
                   `路径必须是本站的绝对路径。`;
    
    if (!apiKey) {
      console.warn("Warning: API Key not provided. Use --apiKey argument or GEMINI_API_KEY env var. API calls may fail.");
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }]
    };

    console.log(`Sending prompt for path: ${url} (with AdSense instruction)`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            let htmlContent = result.candidates[0].content.parts[0].text;
            
            htmlContent = htmlContent.replace(/^```html\s*|```$/g, '').trim();
            
            return htmlContent;
        } else {
            console.error("Unexpected API response structure:", JSON.stringify(result, null, 2));
            return `<html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; background-color: #f0f0f0; color: #333;"><div style="text-align: center; padding: 50px;"><h1>错误</h1><p>未能从 AI 获取有效内容。</p><p>请检查服务器日志。</p><a href="/">返回首页</a></div></body></html>`;
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return `<html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; background-color: #fdd; color: #a00;"><div style="text-align: center; padding: 50px;"><h1>500 - 服务器内部错误</h1><p>调用AI服务时发生错误。</p><p>${error.message}</p><a href="/">返回首页</a></div></body></html>`;
    }
}

// Create the HTTP server.
const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') {
        res.writeHead(204, { 'Content-Type': 'image/x-icon' });
        res.end();
        return;
    }

    try {
        const method = req.method;
        const url = req.url;
        const userAgent = req.headers['user-agent'] || 'Unknown';

        console.log(`Received ${method} request for ${url}`);
        console.log(`User-Agent: ${userAgent}`);

        const htmlContent = await generateHtmlWithAI(method, url, userAgent);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);

    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('服务器内部发生错误。');
    }
});

// Define the port the server will listen on.
const PORT = 3000;

server.listen(PORT, () => {
    console.log(`AI HTTP Server is running on http://localhost:${PORT}`);
    console.log(`\nTo provide an API key, run the server with the --apiKey argument:`);
    console.log(`  node server.js --apiKey YOUR_API_KEY_HERE`);
    console.log(`Or:`);
    console.log(`  node server.js --apiKey="YOUR_API_KEY_HERE"`);
    console.log('\n请在浏览器中访问不同的路径来测试。');
});
