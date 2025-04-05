const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    let baseUrl;
    try {
      baseUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Invalid URL' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(url);
    const html = response.data;
    const contentType = response.headers['content-type']

    if (!contentType || !contentType.includes('text/html')) {
      console.warn('Content type is not HTML');
      return res.status(400).json({ success: false, error: 'Invalid content type' });
    }

    // Use cheerio to parse HTML and selectively replace text content, not URLs
    const $ = cheerio.load(html);

    // --- URL Rewriting Logic ---
    const urlAttributes = ['href', 'src']; // Attributes that might contain URLs

    $('*').each(function() {
        const element = $(this);
        urlAttributes.forEach(attr => {
            const originalValue = element.attr(attr);
            if (originalValue) {
                try {
                    // Resolve the relative URL against the base URL
                    const absoluteUrl = new URL(originalValue, baseUrl.href).href;
                    element.attr(attr, absoluteUrl); // Update the attribute
                } catch (e) {
                    // Ignore invalid URLs or URLs that can't be resolved
                    // console.warn(`Could not resolve URL: ${originalValue} on page ${url}`);
                }
            }
        });

        // Handle inline styles with url() - basic example
        const style = element.attr('style');
        if (style && style.includes('url(')) {
            const updatedStyle = style.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, inlineUrl) => {
                  try {
                    const absoluteInlineUrl = new URL(inlineUrl, baseUrl.href).href;
                    return `url('${absoluteInlineUrl}')`;
                  } catch(e) {
                    return match; // Keep original if resolution fails
                  }
            });
            element.attr('style', updatedStyle);
        }
    });
  
    // Function to replace text but skip URLs and attributes
    function replaceYaleWithFale(i, el) {
      if ($(el).children().length === 0 || $(el).text().trim() !== '') {
        // Get the HTML content of the element
        let content = $(el).html();
        
        // Only process if it's a text node
        if (content && $(el).children().length === 0) {
          // Replace Yale with Fale in text content only
          content = content.replace(/Yale/g, 'Fale').replace(/yale/g, 'fale').replace(/YALE/g, 'FALE');
          $(el).html(content);
        }
      }
    }
    
    // Process text nodes in the body
    $('body *').contents().filter(function() {
      return this.nodeType === 3; // Text nodes only
    }).each(function() {
      // Replace text content but not in URLs or attributes
      const text = $(this).text();
      const newText = text.replace(/Yale/g, 'Fale').replace(/yale/g, 'fale').replace(/YALE/g, 'FALE');
      if (text !== newText) {
        $(this).replaceWith(newText);
      }
    });
    
    // Process title separately
    const title = $('title').text().replace(/Yale/g, 'Fale').replace(/yale/g, 'fale').replace(/YALE/g, 'FALE');
    $('title').text(title);
    
    return res.json({ 
      success: true, 
      content: $.html(),
      title: title,
      originalUrl: url
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      success: false,
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Export the app instance *before* starting the server
module.exports = app;

// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}
