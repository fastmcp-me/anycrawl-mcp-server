# AnyCrawl MCP Server

🚀 **AnyCrawl MCP Server** — Powerful web scraping and crawling for Cursor, Claude, and other LLM clients via the Model Context Protocol (MCP).

## Features

- **Web Scraping**: Extract content from single URLs with multiple output formats
- **Website Crawling**: Crawl entire websites with configurable depth and limits
- **Search Engine Integration**: Search the web and optionally scrape results
- **Multiple Engines**: Support for Playwright, Cheerio, and Puppeteer
- **Flexible Output**: Markdown, HTML, text, screenshots, and structured JSON
- **Async Operations**: Non-blocking crawl jobs with status monitoring
- **Error Handling**: Robust error handling and logging
- **Multiple Modes**: Support for different deployment scenarios (CLOUD_SERVICE, SSE_LOCAL, HTTP_STREAMABLE_SERVER, runLocalServer)

## Installation

### Running with npx

```bash
ANYCRAWL_API_KEY=YOUR-API-KEY npx -y anycrawl-mcp
```

### Manual installation

```bash
npm install -g anycrawl-mcp-server
ANYCRAWL_API_KEY=YOUR-API-KEY anycrawl-mcp
```

## Configuration

Set the required environment variable:

```bash
export ANYCRAWL_API_KEY="your-api-key-here"
```

Optionally set a custom base URL:

```bash
export ANYCRAWL_BASE_URL="https://api.anycrawl.dev"  # Default
```

### Get your API key

- Visit the AnyCrawl website and sign up or log in: [AnyCrawl](https://anycrawl.dev)
- 🎉 Sign up for free to receive 1,500 credits — enough to crawl nearly 1,500 pages.
- Open the dashboard → API Keys → Copy your key.
- Copy the key and set it as the `ANYCRAWL_API_KEY` environment variable (see above).

## Usage

### Running on Cursor

Configuring Cursor. Note: Requires Cursor v0.45.6+.

For Cursor v0.48.6 and newer, add this to your MCP Servers settings:

```json
{
  "mcpServers": {
    "anycrawl-mcp": {
      "command": "npx",
      "args": ["-y", "anycrawl-mcp"],
      "env": {
        "ANYCRAWL_API_KEY": "YOUR-API-KEY"
      }
    }
  }
}
```

For Cursor v0.45.6:

1. Open Cursor Settings → Features → MCP Servers → "+ Add New MCP Server"
2. Name: "anycrawl-mcp" (or your preferred name)
3. Type: "command"
4. Command:

```bash
env ANYCRAWL_API_KEY=YOUR-API-KEY npx -y anycrawl-mcp
```

On Windows, if you encounter issues:

```bash
cmd /c "set ANYCRAWL_API_KEY=YOUR-API-KEY && npx -y anycrawl-mcp"
```

### Running on VS Code

For manual installation, add this JSON to your User Settings (JSON) in VS Code (Command Palette → Preferences: Open User Settings (JSON)):

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "apiKey",
        "description": "AnyCrawl API Key",
        "password": true
      }
    ],
    "servers": {
      "anycrawl": {
        "command": "npx",
        "args": ["-y", "anycrawl-mcp"],
        "env": {
          "ANYCRAWL_API_KEY": "${input:apiKey}"
        }
      }
    }
  }
}
```

Optionally, place the following in `.vscode/mcp.json` in your workspace to share config:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "apiKey",
      "description": "AnyCrawl API Key",
      "password": true
    }
  ],
  "servers": {
    "anycrawl": {
      "command": "npx",
      "args": ["-y", "anycrawl-mcp"],
      "env": {
        "ANYCRAWL_API_KEY": "${input:apiKey}"
      }
    }
  }
}
```

### Running on Windsurf

Add this to `./codeium/windsurf/model_config.json`:

```json
{
  "mcpServers": {
    "mcp-server-anycrawl": {
      "command": "npx",
      "args": ["-y", "anycrawl-mcp"],
      "env": {
        "ANYCRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Running with SSE Local Mode

To use Server-Sent Events (SSE) locally instead of stdio transport:

```bash
ANYCRAWL_MODE=SSE_LOCAL ANYCRAWL_API_KEY=YOUR-API-KEY npx -y anycrawl-mcp
```

## Available Tools

### 1. Scrape Tool (`anycrawl_scrape`)

Scrape a single URL and extract content in various formats.

**Best for:**

- Extracting content from a single page
- Quick data extraction
- Testing specific URLs

**Parameters:**

- `url` (required): The URL to scrape
- `engine` (required): Scraping engine (`playwright`, `cheerio`, `puppeteer`)
- `formats` (optional): Output formats (`markdown`, `html`, `text`, `screenshot`, `screenshot@fullPage`, `rawHtml`, `json`)
- `proxy` (optional): Proxy URL
- `timeout` (optional): Timeout in milliseconds (default: 300000)
- `retry` (optional): Whether to retry on failure (default: false)
- `wait_for` (optional): Wait time for page to load
- `include_tags` (optional): HTML tags to include
- `exclude_tags` (optional): HTML tags to exclude
- `json_options` (optional): Options for JSON extraction

**Example:**

```json
{
  "name": "anycrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "engine": "cheerio",
    "formats": ["markdown", "html"],
    "timeout": 30000
  }
}
```

### 2. Crawl Tool (`anycrawl_crawl`)

Start a crawl job to scrape multiple pages from a website.

**Best for:**

- Extracting content from multiple related pages
- Comprehensive website analysis
- Bulk data collection

**Parameters:**

- `url` (required): The base URL to crawl
- `engine` (required): Scraping engine
- `max_depth` (optional): Maximum crawl depth (default: 10)
- `limit` (optional): Maximum number of pages (default: 100)
- `strategy` (optional): Crawling strategy (`all`, `same-domain`, `same-hostname`, `same-origin`)
- `exclude_paths` (optional): URL patterns to exclude
- `include_paths` (optional): URL patterns to include
- `scrape_options` (optional): Options for individual page scraping

**Example:**

```json
{
  "name": "anycrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog",
    "engine": "playwright",
    "max_depth": 2,
    "limit": 50,
    "strategy": "same-domain"
  }
}
```

### 3. Crawl Status Tool (`anycrawl_crawl_status`)

Check the status of a crawl job.

**Parameters:**

- `job_id` (required): The crawl job ID

**Example:**

```json
{
  "name": "anycrawl_crawl_status",
  "arguments": {
    "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396"
  }
}
```

### 4. Crawl Results Tool (`anycrawl_crawl_results`)

Get results from a crawl job.

**Parameters:**

- `job_id` (required): The crawl job ID
- `skip` (optional): Number of results to skip (for pagination)

**Example:**

```json
{
  "name": "anycrawl_crawl_results",
  "arguments": {
    "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396",
    "skip": 0
  }
}
```

### 5. Cancel Crawl Tool (`anycrawl_cancel_crawl`)

Cancel a pending crawl job.

**Parameters:**

- `job_id` (required): The crawl job ID to cancel

**Example:**

```json
{
  "name": "anycrawl_cancel_crawl",
  "arguments": {
    "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396"
  }
}
```

### 6. Search Tool (`anycrawl_search`)

Search the web using AnyCrawl search engine.

**Best for:**

- Finding specific information across multiple websites
- Research and discovery
- When you don't know which website has the information

**Parameters:**

- `query` (required): Search query
- `engine` (optional): Search engine (`google`)
- `limit` (optional): Maximum number of results (default: 10)
- `offset` (optional): Number of results to skip (default: 0)
- `pages` (optional): Number of pages to search
- `lang` (optional): Language code
- `country` (optional): Country code
- `scrape_options` (required): Options for scraping search results
- `safeSearch` (optional): Safe search level (0=off, 1=moderate, 2=strict)

**Example:**

```json
{
  "name": "anycrawl_search",
  "arguments": {
    "query": "latest AI research papers 2024",
    "engine": "google",
    "limit": 5,
    "scrape_options": {
      "engine": "cheerio",
      "formats": ["markdown"]
    }
  }
}
```

## Output Formats

### Markdown

Clean, structured markdown content perfect for LLM consumption.

### HTML

Raw HTML content with all formatting preserved.

### Text

Plain text content with minimal formatting.

### Screenshot

Visual screenshot of the page.

### Screenshot@fullPage

Full-page screenshot including content below the fold.

### Raw HTML

Unprocessed HTML content.

### JSON

Structured data extraction using custom schemas.

## Engines

### Cheerio

- Fast and lightweight
- Good for static content
- Server-side rendering

### Playwright

- Full browser automation
- JavaScript rendering
- Best for dynamic content

### Puppeteer

- Chrome/Chromium automation
- Good balance of features and performance

## Error Handling

The server provides comprehensive error handling:

- **Validation Errors**: Invalid parameters or missing required fields
- **API Errors**: AnyCrawl API errors with detailed messages
- **Network Errors**: Connection and timeout issues
- **Rate Limiting**: Automatic retry with backoff

## Logging

The server includes detailed logging:

- **Debug**: Detailed operation information
- **Info**: General operation status
- **Warn**: Non-critical issues
- **Error**: Critical errors and failures

Set log level with environment variable:

```bash
export LOG_LEVEL=debug  # debug, info, warn, error
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone <repository>
cd anycrawl-mcp
npm ci
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Format

```bash
npm run format
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests: `npm test`
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/any4ai/anycrawl-mcp-server/issues)
- Documentation: [AnyCrawl API Docs](https://docs.anycrawl.dev)
- Email: help@anycrawl.dev

## About AnyCrawl

AnyCrawl is a powerful Node.js/TypeScript crawler that turns websites into LLM-ready data and extracts structured SERP results from Google/Bing/Baidu/etc. It features native multi-threading for bulk processing and supports multiple output formats.

- **Website**: https://anycrawl.dev
- **GitHub**: https://github.com/any4ai/anycrawl
- **API**: https://api.anycrawl.dev
