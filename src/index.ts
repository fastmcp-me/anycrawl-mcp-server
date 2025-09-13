#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
    CallToolResult,
    TextContent,
    ErrorCode,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AnyCrawlClient } from './anycrawl-client.js';
import { logger } from './logger.js';
import {
    ScrapeToolSchema,
    CrawlToolSchema,
    SearchToolSchema,
    CrawlStatusToolSchema,
    CrawlResultsToolSchema,
    CancelCrawlToolSchema,
} from './types.js';

export class AnyCrawlMCPServer {
    private server: Server;
    private client: AnyCrawlClient;

    constructor(apiKey: string, baseUrl?: string) {
        logger.info('Initializing AnyCrawl MCP Server');

        this.server = new Server(
            {
                name: 'anycrawl-mcp-server',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.client = new AnyCrawlClient(apiKey, baseUrl);
        this.setupToolHandlers();

        logger.info('AnyCrawl MCP Server initialized successfully');
    }

    // Helper for tests to simulate tool calls without MCP transport
    public async handleToolCall(request: { name: string; arguments: any }): Promise<any> {
        const { name, arguments: args } = request as any;
        try {
            logger.debug(`Tool called: ${name}`, args);
            switch (name) {
                case 'anycrawl_scrape':
                    {
                        const r = await this.handleScrape(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                case 'anycrawl_crawl':
                    {
                        const r = await this.handleCrawl(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                case 'anycrawl_crawl_status':
                    {
                        const r = await this.handleCrawlStatus(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                case 'anycrawl_crawl_results':
                    {
                        const r = await this.handleCrawlResults(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                case 'anycrawl_cancel_crawl':
                    {
                        const r = await this.handleCancelCrawl(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                case 'anycrawl_search':
                    {
                        const r = await this.handleSearch(args);
                        logger.debug(`Tool ${name} completed successfully`);
                        return r;
                    }
                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` as string }],
                        isError: true,
                    } as any;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            logger.error(`Tool ${name} failed:`, message);
            return {
                content: [{ type: 'text', text: `Tool execution failed: ${message}` as string }],
                isError: true,
            } as any;
        }
    }

    private setupToolHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'anycrawl_scrape',
                        description: `🚀 Scrape a single URL and extract content in various formats. AnyCrawl turns websites into LLM-ready structured data with high performance multi-threading.

Best for: Extracting content from a known, single page (article, docs page, product page).
Not recommended for: Broad discovery across many pages (use anycrawl_crawl); open-ended questions across the web (use anycrawl_search).
Common mistakes: Using a headless engine unnecessarily (prefer cheerio for static pages); requesting heavy formats (screenshots/rawHtml) when not needed; setting large timeouts without cause.

Prompt example: "Scrape this page and return clean markdown: https://example.com/blog/post"
Engine guidance: Use cheerio for static HTML, playwright for dynamic apps, puppeteer for Chrome automation.

Usage example without formats:
{
  "name": "anycrawl_scrape",
  "arguments": {
    "url": "https://news.ycombinator.com",
    "engine": "cheerio"
  }
}

Usage example with formats:
{
  "name": "anycrawl_scrape",
  "arguments": {
    "url": "https://example.com/docs/page",
    "engine": "playwright",
    "formats": ["markdown"],
    "wait_for": 1500
  }
}

Curl examples (JSON extraction via json_options):

1) Using user_prompt for ad-hoc extraction

curl -X POST https://api.anycrawl.dev/v1/scrape \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "url": "https://example.com/",
  "engine": "playwright",
  "formats": [
    "markdown",
    "json"
  ],
  "json_options": {
    "user_prompt": "Extract the page title and the main paragraph content as plain text."
  }
}'

2) Using a JSON Schema with user_prompt for structured extraction

curl -X POST https://api.anycrawl.dev/v1/scrape \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "url": "https://example.com/",
  "engine": "playwright",
  "formats": [
    "markdown",
    "json"
  ],
  "json_options": {
    "schema": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "title of web"
        }
      },
      "required": [
        "title"
      ]
    },
    "user_prompt": "Extract the page title and the main paragraph content as plain text."
  }
}'

Returns: { url, status, jobId, title, html?, markdown?, metadata?, timestamp }`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                url: {
                                    type: 'string',
                                    format: 'uri',
                                    description: 'The URL to scrape. Must be a valid HTTP/HTTPS URL.',
                                    examples: ['https://example.com', 'https://news.ycombinator.com'],
                                },
                                engine: {
                                    type: 'string',
                                    enum: ['playwright', 'cheerio', 'puppeteer'],
                                    description: 'The scraping engine to use. Cheerio is fastest for static content, Playwright for dynamic content, Puppeteer for Chrome automation.',
                                    default: 'cheerio',
                                    examples: ['cheerio', 'playwright', 'puppeteer'],
                                },
                                proxy: {
                                    type: 'string',
                                    format: 'uri',
                                    description: 'Optional proxy URL for requests. Format: http://user:pass@host:port or socks5://host:port',
                                    examples: ['http://proxy.example.com:8080', 'socks5://127.0.0.1:1080'],
                                },
                                formats: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'],
                                    },
                                    description: 'Output formats to extract. Markdown is LLM-friendly, HTML preserves structure, screenshots capture visual content, JSON for structured data.',
                                    default: ['markdown'],
                                    examples: [['markdown'], ['markdown', 'html'], ['screenshot', 'markdown']],
                                },
                                timeout: {
                                    type: 'number',
                                    minimum: 1000,
                                    maximum: 600000,
                                    description: 'Request timeout in milliseconds. Default 5 minutes.',
                                    default: 300000,
                                    examples: [30000, 60000, 300000],
                                },
                                retry: {
                                    type: 'boolean',
                                    description: 'Whether to automatically retry on failure. Useful for unreliable networks.',
                                    default: false,
                                },
                                wait_for: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 60000,
                                    description: 'Wait time in milliseconds for page to fully load. Useful for dynamic content.',
                                    examples: [1000, 3000, 5000],
                                },
                                include_tags: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'HTML tags to include in extraction. Useful for filtering specific content.',
                                    examples: [['article', 'main'], ['h1', 'h2', 'p'], ['div.content']],
                                },
                                exclude_tags: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'HTML tags to exclude from extraction. Useful for removing ads, navigation, etc.',
                                    examples: [['nav', 'footer', 'aside'], ['script', 'style'], ['div.advertisement']],
                                },
                                json_options: {
                                    type: 'object',
                                    description: 'Options for structured JSON extraction using AI. Define schema for consistent data extraction.',
                                    properties: {
                                        schema: {
                                            type: 'object',
                                            description: 'JSON Schema for structured data extraction. Define the expected output format.',
                                            examples: [{
                                                type: 'object',
                                                properties: {
                                                    title: { type: 'string' },
                                                    author: { type: 'string' },
                                                    date: { type: 'string' },
                                                    content: { type: 'string' }
                                                }
                                            }]
                                        },
                                        user_prompt: {
                                            type: 'string',
                                            description: 'Custom prompt for AI extraction. Guide the AI on what to extract.',
                                            examples: ['Extract the main article content, author, and publication date', 'Get product name, price, and description']
                                        },
                                        schema_name: {
                                            type: 'string',
                                            description: 'Name for the extraction schema.',
                                            examples: ['Article', 'Product', 'NewsItem']
                                        },
                                        schema_description: {
                                            type: 'string',
                                            description: 'Description of what this schema extracts.',
                                            examples: ['Extracts article metadata and content', 'Extracts product information from e-commerce pages']
                                        },
                                    },
                                },
                            },
                            required: ['url', 'engine'],
                        },
                    },
                    {
                        name: 'anycrawl_crawl',
                        description: `🌐 Start an asynchronous crawl job to scrape multiple pages from a website. Perfect for comprehensive site analysis, content aggregation, and bulk data collection with native multi-threading.

Best for: Multi-page coverage of a site or section (docs, blogs, categories).
Not recommended for: A single known page (use anycrawl_scrape); open-ended web-wide queries (use anycrawl_search).
Common mistakes: Setting limit too high; using strategy="all" unintentionally; requesting heavy formats (e.g., full-page screenshots) across many pages; deep max_depth without need.

Prompt example: "Crawl the docs section and return markdown for up to 100 pages."
Strategy guidance:
- same-domain (default) is safest;
- same-hostname for subdomain specificity;
- same-origin for strict protocol+domain;
- all for external links (use cautiously).

Usage example (basic):
{
  "name": "anycrawl_crawl",
  "arguments": {
    "url": "https://docs.example.com/*",
    "engine": "cheerio",
    "limit": 100,
    "max_depth": 5
  }
}

Usage example (with formats and filters):
{
  "name": "anycrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog/*",
    "engine": "cheerio",
    "formats": ["markdown"],
    "exclude_paths": ["/tags/*", "*.pdf"],
    "include_tags": ["article", "main"],
    "limit": 50
  }
}

Curl examples (JSON extraction across pages via json_options):

1) Create a crawl with user_prompt

curl -X POST https://api.anycrawl.dev/v1/crawl \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "url": "https://example.com/blog/*",
  "engine": "cheerio",
  "limit": 50,
  "formats": ["markdown", "json"],
  "json_options": {
    "user_prompt": "Extract the article title and author for each page."
  }
}'

2) Create a crawl with a JSON Schema

curl -X POST https://api.anycrawl.dev/v1/crawl \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "url": "https://example.com/docs/*",
  "engine": "cheerio",
  "max_depth": 5,
  "formats": ["markdown", "json"],
  "json_options": {
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "slug": { "type": "string" }
      },
      "required": ["title"]
    },
    "user_prompt": "Extract the page title and compute a slug."
  }
}'

Returns: Job creation info { job_id, status, message }. Use anycrawl_crawl_status and anycrawl_crawl_results to monitor and retrieve data.`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                url: {
                                    type: 'string',
                                    format: 'uri',
                                    description: 'The base URL to start crawling from. Can include wildcards like https://example.com/blog/*',
                                    examples: ['https://example.com', 'https://blog.example.com', 'https://docs.example.com/*'],
                                },
                                engine: {
                                    type: 'string',
                                    enum: ['playwright', 'cheerio', 'puppeteer'],
                                    description: 'The scraping engine to use for each crawled page. Cheerio for speed, Playwright for dynamic content, Puppeteer for Chrome automation.',
                                    default: 'cheerio',
                                    examples: ['cheerio', 'playwright', 'puppeteer'],
                                },
                                proxy: {
                                    type: 'string',
                                    format: 'uri',
                                    description: 'Optional proxy URL for all requests. Useful for bypassing rate limits or accessing geo-restricted content.',
                                    examples: ['http://proxy.example.com:8080', 'socks5://127.0.0.1:1080'],
                                },
                                formats: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'],
                                    },
                                    description: 'Output formats to extract from each page. Markdown is LLM-friendly, HTML preserves structure, screenshots capture visual content.',
                                    default: ['markdown'],
                                    examples: [['markdown'], ['markdown', 'html'], ['screenshot', 'markdown', 'json']],
                                },
                                timeout: {
                                    type: 'number',
                                    minimum: 1000,
                                    maximum: 600000,
                                    description: 'Timeout in milliseconds for each page request. Default 5 minutes.',
                                    default: 300000,
                                    examples: [30000, 60000, 300000],
                                },
                                wait_for: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 60000,
                                    description: 'Wait time in milliseconds for each page to fully load. Essential for dynamic content.',
                                    examples: [1000, 3000, 5000],
                                },
                                retry: {
                                    type: 'boolean',
                                    description: 'Whether to automatically retry failed pages. Recommended for large crawls.',
                                    default: false,
                                },
                                include_tags: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'HTML tags to include in extraction from each page. Useful for filtering specific content types.',
                                    examples: [['article', 'main'], ['h1', 'h2', 'p'], ['div.content', 'section']],
                                },
                                exclude_tags: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'HTML tags to exclude from extraction. Useful for removing ads, navigation, footers.',
                                    examples: [['nav', 'footer', 'aside'], ['script', 'style'], ['div.advertisement', 'div.sidebar']],
                                },
                                json_options: {
                                    type: 'object',
                                    description: 'Options for structured JSON extraction using AI. Define schema for consistent data extraction across all pages.',
                                    properties: {
                                        schema: {
                                            type: 'object',
                                            description: 'JSON Schema for structured data extraction.',
                                            examples: [{
                                                type: 'object',
                                                properties: {
                                                    title: { type: 'string' },
                                                    content: { type: 'string' },
                                                    author: { type: 'string' },
                                                    date: { type: 'string' }
                                                }
                                            }]
                                        },
                                        user_prompt: {
                                            type: 'string',
                                            description: 'Custom prompt for AI extraction across all pages.',
                                            examples: ['Extract article title, content, and author from each page', 'Get product name, price, and description from e-commerce pages']
                                        },
                                        schema_name: {
                                            type: 'string',
                                            description: 'Name for the extraction schema.',
                                            examples: ['Article', 'Product', 'BlogPost']
                                        },
                                        schema_description: {
                                            type: 'string',
                                            description: 'Description of what this schema extracts.',
                                            examples: ['Extracts article metadata and content', 'Extracts product information from e-commerce pages']
                                        },
                                    },
                                },
                                scrape_options: {
                                    type: 'object',
                                    description: 'Advanced options for individual page scraping. Overrides global settings for fine-tuned control.',
                                    properties: {
                                        proxy: {
                                            type: 'string',
                                            format: 'uri',
                                            description: 'Proxy URL specifically for page scraping.',
                                            examples: ['http://proxy.example.com:8080']
                                        },
                                        formats: {
                                            type: 'array',
                                            items: {
                                                type: 'string',
                                                enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'],
                                            },
                                            description: 'Specific formats for page scraping.',
                                            examples: [['markdown', 'screenshot']]
                                        },
                                        timeout: {
                                            type: 'number',
                                            minimum: 1000,
                                            maximum: 600000,
                                            description: 'Timeout for individual page scraping.',
                                            examples: [30000, 60000]
                                        },
                                        wait_for: {
                                            type: 'number',
                                            minimum: 1,
                                            maximum: 60000,
                                            description: 'Wait time for individual page loading.',
                                            examples: [2000, 5000]
                                        },
                                        include_tags: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Tags to include for individual pages.',
                                            examples: [['article', 'main']]
                                        },
                                        exclude_tags: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Tags to exclude for individual pages.',
                                            examples: [['nav', 'footer']]
                                        },
                                        json_options: {
                                            type: 'object',
                                            description: 'JSON extraction options for individual pages.'
                                        },
                                        engine: {
                                            type: 'string',
                                            enum: ['playwright', 'cheerio', 'puppeteer'],
                                            description: 'Specific engine for page scraping.',
                                            examples: ['playwright', 'cheerio']
                                        },
                                    },
                                },
                                exclude_paths: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'URL patterns to exclude from crawling. Supports wildcards and regex patterns.',
                                    examples: [['/admin/*', '/api/*', '*.pdf'], ['/login', '/register', '/logout']],
                                },
                                include_paths: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'URL patterns to include in crawling. If specified, only matching URLs will be crawled.',
                                    examples: [['/blog/*', '/articles/*'], ['/products/*', '/category/*']],
                                },
                                max_depth: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 50,
                                    description: 'Maximum crawl depth from the starting URL. Prevents infinite crawling.',
                                    default: 10,
                                    examples: [3, 5, 10, 20],
                                },
                                strategy: {
                                    type: 'string',
                                    enum: ['all', 'same-domain', 'same-hostname', 'same-origin'],
                                    description: 'Crawling strategy: all (any URL), same-domain (example.com), same-hostname (www.example.com), same-origin (exact protocol+domain+port).',
                                    default: 'same-domain',
                                    examples: ['same-domain', 'same-hostname', 'all'],
                                },
                                limit: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 50000,
                                    description: 'Maximum number of pages to crawl. Prevents runaway crawls.',
                                    default: 100,
                                    examples: [50, 100, 500, 1000],
                                },
                            },
                            required: ['url', 'engine'],
                        },
                    },
                    {
                        name: 'anycrawl_crawl_status',
                        description: '📊 Check the status of an asynchronous crawl job. Monitor progress, view statistics, and track completion status.\n\nBest for: Ongoing monitoring of a crawl created with anycrawl_crawl.\nNot recommended for: Fetching page content (use anycrawl_crawl_results).\n\nUsage example:\n{\n  "name": "anycrawl_crawl_status",\n  "arguments": { "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396" }\n}\n\nReturns: { job_id, status, start_time, expires_at, credits_used, total, completed, failed }',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                job_id: {
                                    type: 'string',
                                    description: 'The unique crawl job ID returned when the crawl was created.',
                                    examples: ['7a2e165d-8f81-4be6-9ef7-23222330a396', '550e8400-e29b-41d4-a716-446655440000'],
                                },
                            },
                            required: ['job_id'],
                        },
                    },
                    {
                        name: 'anycrawl_crawl_results',
                        description: '📄 Get results from a completed or in-progress crawl job. Supports pagination for large crawls with thousands of pages.\n\nBest for: Retrieving crawled page data and metadata after or during a crawl.\nCommon mistakes: Forgetting to paginate via skip when next is present; requesting extremely large pages of data.\n\nUsage example:\n{\n  "name": "anycrawl_crawl_results",\n  "arguments": {\n    "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396",\n    "skip": 0\n  }\n}\n\nReturns: { status, total, completed, creditsUsed, next?, data: Array<pageResult> } where next can be used as the next skip value for pagination.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                job_id: {
                                    type: 'string',
                                    description: 'The unique crawl job ID to retrieve results from.',
                                    examples: ['7a2e165d-8f81-4be6-9ef7-23222330a396', '550e8400-e29b-41d4-a716-446655440000'],
                                },
                                skip: {
                                    type: 'number',
                                    minimum: 0,
                                    description: 'Number of results to skip for pagination. Use 0 for first page, 100 for second page, etc.',
                                    default: 0,
                                    examples: [0, 100, 200, 500],
                                },
                            },
                            required: ['job_id'],
                        },
                    },
                    {
                        name: 'anycrawl_cancel_crawl',
                        description: '🛑 Cancel a pending or running crawl job. Useful for stopping long-running crawls or correcting configuration mistakes.\n\nBest for: Stopping crawls that are no longer needed or misconfigured.\nNot recommended for: Completed jobs (cancellation has no effect).\n\nUsage example:\n{\n  "name": "anycrawl_cancel_crawl",\n  "arguments": { "job_id": "7a2e165d-8f81-4be6-9ef7-23222330a396" }\n}\n\nReturns: Confirmation { job_id, status } indicating cancellation state.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                job_id: {
                                    type: 'string',
                                    description: 'The unique crawl job ID to cancel. Only pending or running jobs can be cancelled.',
                                    examples: ['7a2e165d-8f81-4be6-9ef7-23222330a396', '550e8400-e29b-41d4-a716-446655440000'],
                                },
                            },
                            required: ['job_id'],
                        },
                    },
                    {
                        name: 'anycrawl_search',
                        description: `🔍 Search the web using AnyCrawl's powerful search engine integration. Get SERP (Search Engine Results Page) data with optional content scraping for comprehensive research.

Best for: Finding specific information across multiple websites when you don't know which site has it; retrieving the most relevant content for an open-ended query.
Not recommended for: Searching the filesystem; when you already know the exact website to extract (use anycrawl_scrape); when you need comprehensive coverage of a single site (use anycrawl_crawl).
Common mistakes: Using crawl for open-ended questions; requesting heavy scrape_options (large formats/timeouts) unnecessarily.

Prompt example: "Find the latest research papers on AI published in 2023."
Sources: web (default). Image/news verticals are not yet supported in this tool.
Scrape options: Only set scrape_options when absolutely necessary. Prefer small limits (≤5) and minimal formats (e.g., ["markdown"]) to avoid timeouts.

Usage example without formats:
{
  "name": "anycrawl_search",
  "arguments": {
    "query": "top AI companies",
    "limit": 5,
    "scrape_options": { "engine": "cheerio" }
  }
}

Usage example with formats:
{
  "name": "anycrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5,
    "lang": "en",
    "country": "US",
    "scrape_options": {
      "engine": "cheerio",
      "formats": ["markdown"],
      "wait_for": 1000
    }
  }
}

Curl examples (with scrape_options and optional JSON extraction):

1) Basic search with scraping each result page

curl -X POST https://api.anycrawl.dev/v1/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "query": "python web scraping tutorial",
  "limit": 5,
  "scrape_options": {
    "engine": "cheerio",
    "formats": ["markdown"]
  }
}'

2) Search with JSON Schema extraction from result pages

curl -X POST https://api.anycrawl.dev/v1/search \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ANYCRAWL_API_KEY' \
  -d '{
  "query": "best restaurants in New York",
  "limit": 5,
  "lang": "en",
  "country": "US",
  "scrape_options": {
    "engine": "cheerio",
    "formats": ["markdown", "json"],
    "json_options": {
      "schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "rating": { "type": "number" }
        },
        "required": ["name"]
      },
      "user_prompt": "Extract the restaurant name and rating if available."
    }
  }
}'

Returns: Array of search results with optional scraped content for each result URL.`,
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'Search query string. Use specific keywords for better results.',
                                    examples: ['latest AI research papers 2024', 'best restaurants in New York', 'Python web scraping tutorial'],
                                },
                                engine: {
                                    type: 'string',
                                    enum: ['google'],
                                    description: 'Search engine to use. Currently supports Google with more engines coming soon.',
                                    default: 'google',
                                    examples: ['google'],
                                },
                                limit: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 100,
                                    description: 'Maximum number of search results to return. Higher limits provide more comprehensive results.',
                                    default: 5,
                                    examples: [5, 10, 20, 50],
                                },
                                offset: {
                                    type: 'number',
                                    minimum: 0,
                                    description: 'Number of results to skip for pagination. Use 0 for first page, 10 for second page, etc.',
                                    default: 0,
                                    examples: [0, 10, 20, 50],
                                },
                                pages: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 20,
                                    description: 'Number of search result pages to process. Each page typically contains 10 results.',
                                    examples: [1, 2, 5, 10],
                                },
                                lang: {
                                    type: 'string',
                                    description: 'Language code for search results. Use ISO 639-1 codes like \'en\', \'es\', \'fr\'.',
                                    examples: ['en', 'es', 'fr', 'de', 'zh', 'ja'],
                                },
                                country: {
                                    type: 'string',
                                    description: 'Country code for search results. Use ISO 3166-1 alpha-2 codes like \'US\', \'GB\', \'CA\'.',
                                    examples: ['US', 'GB', 'CA', 'AU', 'DE', 'FR'],
                                },
                                scrape_options: {
                                    type: 'object',
                                    description: 'Options for scraping each search result URL. Enables deep content extraction from search results.',
                                    properties: {
                                        engine: {
                                            type: 'string',
                                            enum: ['playwright', 'cheerio', 'puppeteer'],
                                            description: 'Scraping engine for search result URLs. Cheerio for speed, Playwright for dynamic content.',
                                            examples: ['cheerio', 'playwright', 'puppeteer'],
                                        },
                                        proxy: {
                                            type: 'string',
                                            format: 'uri',
                                            description: 'Proxy URL for scraping search results.',
                                            examples: ['http://proxy.example.com:8080', 'socks5://127.0.0.1:1080']
                                        },
                                        formats: {
                                            type: 'array',
                                            items: {
                                                type: 'string',
                                                enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'],
                                            },
                                            description: 'Output formats for each search result page.',
                                            examples: [['markdown'], ['markdown', 'html'], ['screenshot', 'markdown']]
                                        },
                                        timeout: {
                                            type: 'number',
                                            minimum: 1000,
                                            maximum: 600000,
                                            description: 'Timeout for scraping each search result.',
                                            examples: [30000, 60000, 300000]
                                        },
                                        wait_for: {
                                            type: 'number',
                                            minimum: 1,
                                            maximum: 60000,
                                            description: 'Wait time for each search result page to load.',
                                            examples: [1000, 3000, 5000]
                                        },
                                        include_tags: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'HTML tags to include when scraping search results.',
                                            examples: [['article', 'main'], ['h1', 'h2', 'p']]
                                        },
                                        exclude_tags: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'HTML tags to exclude when scraping search results.',
                                            examples: [['nav', 'footer'], ['script', 'style']]
                                        },
                                        json_options: {
                                            type: 'object',
                                            description: 'JSON extraction options for search result content.'
                                        },
                                    },
                                    required: ['engine'],
                                },
                                safeSearch: {
                                    type: 'number',
                                    minimum: 0,
                                    maximum: 2,
                                    nullable: true,
                                    description: 'Safe search level: 0=off (show all results), 1=moderate (filter some content), 2=strict (maximum filtering).',
                                    examples: [0, 1, 2],
                                },
                            },
                            required: ['query', 'scrape_options'],
                        },
                    },
                ] as Tool[],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
            const { name, arguments: args } = request.params;
            logger.debug(`Tool called: ${name}`, args);

            try {
                let result: CallToolResult;
                switch (name) {
                    case 'anycrawl_scrape':
                        result = await this.handleScrape(args);
                        break;
                    case 'anycrawl_crawl':
                        result = await this.handleCrawl(args);
                        break;
                    case 'anycrawl_crawl_status':
                        result = await this.handleCrawlStatus(args);
                        break;
                    case 'anycrawl_crawl_results':
                        result = await this.handleCrawlResults(args);
                        break;
                    case 'anycrawl_cancel_crawl':
                        result = await this.handleCancelCrawl(args);
                        break;
                    case 'anycrawl_search':
                        result = await this.handleSearch(args);
                        break;
                    default:
                        logger.warn(`Unknown tool requested: ${name}`);
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }

                logger.debug(`Tool ${name} completed successfully`);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                logger.error(`Tool ${name} failed:`, errorMessage);

                if (error instanceof McpError) {
                    throw error;
                }

                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
            }
        });
    }

    private async handleScrape(args: any): Promise<CallToolResult> {
        logger.info(`Starting scrape for URL: ${args.url}`);
        const validatedArgs = ScrapeToolSchema.parse(args);
        const scrapeArgs: any = {
            url: validatedArgs.url,
            engine: validatedArgs.engine,
        };
        if ('proxy' in args) scrapeArgs.proxy = validatedArgs.proxy;
        if ('formats' in args) scrapeArgs.formats = validatedArgs.formats;
        if ('timeout' in args) scrapeArgs.timeout = validatedArgs.timeout;
        if ('retry' in args) scrapeArgs.retry = validatedArgs.retry;
        if ('wait_for' in args) scrapeArgs.wait_for = validatedArgs.wait_for;
        if ('include_tags' in args) scrapeArgs.include_tags = validatedArgs.include_tags;
        if ('exclude_tags' in args) scrapeArgs.exclude_tags = validatedArgs.exclude_tags;
        if ('json_options' in args) scrapeArgs.json_options = validatedArgs.json_options;
        if ('extract_source' in args) scrapeArgs.extract_source = validatedArgs.extract_source;
        const result = await this.client.scrape(scrapeArgs);

        if (result.status === 'failed') {
            logger.warn(`Scraping failed for ${result.url}: ${result.error}`);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Scraping failed for ${result.url}: ${result.error}`,
                    },
                ],
                isError: true,
            };
        }

        logger.info(`Scraping completed successfully for ${result.url}`);
        const response = {
            url: result.url,
            status: result.status,
            jobId: result.jobId,
            title: result.title,
            html: result.html,
            markdown: result.markdown,
            metadata: result.metadata,
            timestamp: result.timestamp,
        };

        const ret = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_scrape completed successfully');
        return ret;
    }

    private async handleCrawl(args: any): Promise<CallToolResult> {
        logger.info(`Starting crawl for URL: ${args.url}`);
        const validatedArgs = CrawlToolSchema.parse(args);
        const crawlArgs: any = {
            url: validatedArgs.url,
            engine: validatedArgs.engine,
        };
        if ('formats' in args) crawlArgs.formats = validatedArgs.formats;
        if ('timeout' in args) crawlArgs.timeout = validatedArgs.timeout;
        if ('retry' in args) crawlArgs.retry = validatedArgs.retry;
        if ('max_depth' in args) crawlArgs.max_depth = validatedArgs.max_depth;
        if ('strategy' in args) crawlArgs.strategy = validatedArgs.strategy;
        if ('limit' in args) crawlArgs.limit = validatedArgs.limit;
        if ('proxy' in args) crawlArgs.proxy = validatedArgs.proxy;
        if ('extract_source' in args) crawlArgs.extract_source = validatedArgs.extract_source;
        if ('scrape_options' in args) crawlArgs.scrape_options = (args as any).scrape_options;
        const result = await this.client.createCrawl(crawlArgs);

        logger.info(`Crawl job created with ID: ${result.job_id}`);
        const ret2 = {
            content: [
                {
                    type: 'text',
                    text: `Crawl job created successfully!\nJob ID: ${result.job_id}\nStatus: ${result.status}\nMessage: ${result.message}\n\nUse anycrawl_crawl_status to check progress.`,
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_crawl completed successfully');
        return ret2;
    }

    private async handleCrawlStatus(args: any): Promise<CallToolResult> {
        const validatedArgs = CrawlStatusToolSchema.parse(args);
        const result = await this.client.getCrawlStatus(validatedArgs.job_id);

        const response = {
            job_id: result.job_id,
            status: result.status,
            start_time: result.start_time,
            expires_at: result.expires_at,
            credits_used: result.credits_used,
            total: result.total,
            completed: result.completed,
            failed: result.failed,
        };

        const ret3 = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_crawl_status completed successfully');
        return ret3;
    }

    private async handleCrawlResults(args: any): Promise<CallToolResult> {
        const validatedArgs = CrawlResultsToolSchema.parse(args);
        const result = await this.client.getCrawlResults(validatedArgs.job_id, validatedArgs.skip);

        const response = {
            status: result.status,
            total: result.total,
            completed: result.completed,
            creditsUsed: result.creditsUsed,
            next: result.next,
            data: result.data,
        };

        const ret4 = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_crawl_results completed successfully');
        return ret4;
    }

    private async handleCancelCrawl(args: any): Promise<CallToolResult> {
        const validatedArgs = CancelCrawlToolSchema.parse(args);
        const result = await this.client.cancelCrawl(validatedArgs.job_id);

        const ret5 = {
            content: [
                {
                    type: 'text',
                    text: `Crawl job cancelled successfully!\nJob ID: ${result.job_id}\nStatus: ${result.status}`,
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_cancel_crawl completed successfully');
        return ret5;
    }

    private async handleSearch(args: any): Promise<CallToolResult> {
        const validatedArgs = SearchToolSchema.parse(args);
        const searchArgs: any = {
            query: validatedArgs.query,
            engine: validatedArgs.engine, // include defaults
            limit: validatedArgs.limit,
            offset: validatedArgs.offset,
        };
        if ('pages' in args) searchArgs.pages = validatedArgs.pages;
        if ('lang' in args) searchArgs.lang = validatedArgs.lang;
        if ('country' in args) searchArgs.country = validatedArgs.country;
        // pass raw scrape_options to avoid injecting defaults
        searchArgs.scrape_options = (args as any).scrape_options;
        if ('safeSearch' in args) searchArgs.safeSearch = validatedArgs.safeSearch;
        const results = await this.client.search(searchArgs);

        const ret6 = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(results, null, 2),
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_search completed successfully');
        return ret6;
    }

    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info('AnyCrawl MCP Server running on stdio');
    }
}

// Main execution
async function main() {
    const apiKey = process.env.ANYCRAWL_API_KEY;
    const baseUrl = process.env.ANYCRAWL_BASE_URL;

    if (!apiKey) {
        logger.error('ANYCRAWL_API_KEY environment variable is required');
        process.exit(1);
    }

    try {
        const server = new AnyCrawlMCPServer(apiKey, baseUrl);
        await server.run();
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

export { main };