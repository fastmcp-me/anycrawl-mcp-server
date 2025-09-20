#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
    CallToolResult,
    TextContent,
    ErrorCode,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AnyCrawlClient } from '@anycrawl/js-sdk';
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
                version: '0.0.3',
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
            logger.info(`Tool called: ${name}`, {
                tool: name,
                parameters: args,
                timestamp: new Date().toISOString()
            });
            switch (name) {
                case 'anycrawl_scrape':
                    {
                        const r = await this.handleScrape(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
                        return r;
                    }
                case 'anycrawl_crawl':
                    {
                        const r = await this.handleCrawl(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
                        return r;
                    }
                case 'anycrawl_crawl_status':
                    {
                        const r = await this.handleCrawlStatus(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
                        return r;
                    }
                case 'anycrawl_crawl_results':
                    {
                        const r = await this.handleCrawlResults(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
                        return r;
                    }
                case 'anycrawl_cancel_crawl':
                    {
                        const r = await this.handleCancelCrawl(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
                        return r;
                    }
                case 'anycrawl_search':
                    {
                        const r = await this.handleSearch(args);
                        logger.info(`Tool ${name} completed successfully`, {
                            tool: name,
                            timestamp: new Date().toISOString()
                        });
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
            logger.error(`Tool ${name} failed:`, {
                tool: name,
                error: message,
                parameters: args,
                timestamp: new Date().toISOString()
            });
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
                        description: `Scrape a single URL and extract content in selected formats.

Best for: One known page (articles, docs, product pages).
Not recommended for: Multi-page coverage (use anycrawl_crawl) or open-ended discovery (use anycrawl_search).

Usage (parameters):
- url: HTTP/HTTPS URL to scrape (string, required)
- engine: 'cheerio' | 'playwright' | 'puppeteer' (required)
- proxy: Proxy URL (string, optional)
- formats: Output formats ['markdown'|'html'|'text'|'screenshot'|'screenshot@fullPage'|'rawHtml'|'json'] (optional)
- timeout: Request timeout in ms (number, optional)
- retry: Enable auto-retry on failure (boolean, optional)
- wait_for: Wait in ms for dynamic pages (number, optional)
- include_tags: HTML tags to include (string[], optional)
- exclude_tags: HTML tags to exclude (string[], optional)
- json_options: { schema?, user_prompt?, schema_name?, schema_description? } (optional)
- extract_source: 'html' | 'markdown' (optional)

Returns: { url, status, jobId?, title?, html?, markdown?, metadata?, timestamp? }

Examples:
- Minimal: { "url": "https://example.com", "engine": "cheerio" }
- With JSON extraction: { "url": "https://news.ycombinator.com", "engine": "playwright", "formats": ["markdown"], "json_options": { "user_prompt": "Extract titles", "schema_name": "Articles" } }
- With JSON schema extraction: { "url": "https://example.com/article", "engine": "cheerio", "json_options": { "schema_name": "Article", "schema_description": "Extract article metadata and content", "schema": { "type": "object", "properties": { "title": { "type": "string" }, "author": { "type": "string" }, "date": { "type": "string" }, "content": { "type": "string" } }, "required": ["title", "content"] } } }`,
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
                                extract_source: {
                                    type: 'string',
                                    enum: ['html', 'markdown'],
                                    description: 'Choose which source to extract from. Default is markdown.',
                                    default: 'markdown',
                                    examples: ['markdown', 'html'],
                                },
                            },
                            required: ['url', 'engine'],
                        },
                    },
                    {
                        name: 'anycrawl_crawl',
                        description: `Start a crawl and return aggregated results.

Best for: Multi-page coverage (docs, blogs, categories).
Not recommended for: Single page (use anycrawl_scrape) or broad discovery (use anycrawl_search).

Usage (parameters):
- url: Start URL or pattern (string, required)
- engine: 'cheerio' | 'playwright' | 'puppeteer' (required)
- proxy: Proxy URL (string, optional)
- formats: Output formats per page (string[], optional)
- timeout: Page request timeout in ms (number, optional)
- wait_for: Wait in ms for dynamic pages (number, optional)
- retry: Auto-retry failed pages (boolean, optional)
- include_tags: Tags to include (string[], optional)
- exclude_tags: Tags to exclude (string[], optional)
- json_options: { schema?, user_prompt?, schema_name?, schema_description? } (optional)
- extract_source: 'html' | 'markdown' (optional)
- scrape_options: Per-page overrides { proxy?, formats?, timeout?, wait_for?, include_tags?, exclude_tags?, json_options?, engine? } (optional)
- exclude_paths: URL patterns to exclude (string[], optional)
- include_paths: URL patterns to include (string[], optional)
- max_depth: Maximum crawl depth (number, optional)
- strategy: 'all' | 'same-domain' | 'same-hostname' | 'same-origin' (optional)
- limit: Max pages to crawl (number, optional)
- poll_seconds: Poll interval seconds for waiting (default: 3)
- poll_interval_ms: Alternative to poll_seconds in milliseconds (default: 3000)
- timeout_ms: Overall timeout milliseconds for waiting (default: 60000)

Returns: Aggregated crawl results: { job_id, status, total, completed, creditsUsed, data }

Examples:
- Minimal: { "url": "https://docs.example.com/*", "engine": "cheerio" }
- Advanced: { "url": "https://blog.example.com/*", "engine": "playwright", "limit": 50, "strategy": "same-domain", "scrape_options": { "formats": ["markdown", "html"], "timeout": 60000 }, "poll_seconds": 2, "timeout_ms": 120000 }
- With JSON schema extraction: { "url": "https://example.com/articles/*", "engine": "cheerio", "json_options": { "schema_name": "Article", "schema": { "type": "object", "properties": { "title": { "type": "string" }, "content": { "type": "string" } }, "required": ["title", "content"] } } }`,
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
                                extract_source: {
                                    type: 'string',
                                    enum: ['html', 'markdown'],
                                    description: 'Choose which source to extract from. Default is markdown.',
                                    default: 'markdown',
                                    examples: ['markdown', 'html'],
                                },
                                poll_seconds: {
                                    type: 'number',
                                    minimum: 1,
                                    maximum: 60,
                                    description: 'Polling interval in seconds when aggregating results.',
                                    default: 3,
                                    examples: [1, 3, 5, 10],
                                },
                                poll_interval_ms: {
                                    type: 'number',
                                    minimum: 100,
                                    maximum: 60000,
                                    description: 'Polling interval in milliseconds (alternative to poll_seconds).',
                                    default: 3000,
                                    examples: [500, 1000, 3000, 5000],
                                },
                                timeout_ms: {
                                    type: 'number',
                                    minimum: 1000,
                                    maximum: 600000,
                                    description: 'Overall aggregation timeout in milliseconds.',
                                    default: 60000,
                                    examples: [30000, 60000, 120000],
                                },
                            },
                            required: ['url', 'engine'],
                        },
                    },
                    {
                        name: 'anycrawl_crawl_status',
                        description: 'Check the status of a crawl job.\n\nUsage (parameters):\n- job_id: Crawl job ID (string, required)\n\nReturns: { job_id, status, start_time, expires_at, credits_used, total, completed, failed }',
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
                        description: 'Get results from a completed or in-progress crawl job.\n\nUsage (parameters):\n- job_id: Crawl job ID (string, required)\n- skip: Number of results to skip for pagination (number, optional)\n\nReturns: { status, total, completed, creditsUsed, next?, data: Array<pageResult> }',
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
                        description: 'Cancel a pending or running crawl job.\n\nUsage (parameters):\n- job_id: Crawl job ID (string, required)\n\nReturns: { job_id, status }',
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
                        description: `Search the web and optionally scrape each result for content.

Best for: Finding relevant pages across websites and extracting their content.
Not recommended for: Filesystem search or single known page (use anycrawl_scrape).

Usage (parameters):
- query: Search query string (string, required)
- engine: 'google' (optional)
- limit: Max number of results, recommended to be 5 (number, optional)
- offset: Results to skip (number, optional)
- pages: Number of search result pages (number, optional)
- lang: Language code (string, optional)
- country: Country code (string, optional)
- scrape_engine: Scrape engine for result pages: 'cheerio' | 'playwright' | 'puppeteer' (optional)
- Top-level scrape options (apply to scraping results): proxy?, formats?, timeout?, wait_for?, include_tags?, exclude_tags?, json_options?, extract_source?
- scrape_options: Optional nested object mirroring the top-level scrape options { engine?, proxy?, formats?, timeout?, wait_for?, include_tags?, exclude_tags?, json_options?, extract_source? }
- safeSearch: 0 | 1 | 2 (number, optional)

Returns: Array of search results with optional scraped content per URL

Examples:
- Minimal: { "query": "AnyCrawl docs", "engine": "google", "limit": 5 }
- Minimal: { "query": "site:example.com example", "engine": "google", "limit": 5 }
- With scraping: { "query": "best LLM benchmarks 2024", "scrape_engine": "cheerio", "formats": ["markdown"], "include_tags": ["article", "main"], "safeSearch": 1 }
- With JSON schema extraction: { "query": "site:example.com docs", "scrape_engine": "cheerio", "json_options": { "schema_name": "Doc", "schema": { "type": "object", "properties": { "title": { "type": "string" }, "url": { "type": "string" } }, "required": ["title", "url"] } } }
- Best JSON schema extraction for search results: { "query": "AnyCrawl docs", "scrape_engine": "cheerio", "json_options": { "user_prompt": "extract summary" } }`,
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
                                    description: 'Maximum number of search results to return. Higher limits provide more comprehensive results. Recommended to be 5.',
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
                                scrape_engine: {
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
                                extract_source: {
                                    type: 'string',
                                    enum: ['html', 'markdown'],
                                    description: 'Choose which source to extract from. Default is markdown.',
                                    default: 'markdown',
                                    examples: ['markdown', 'html'],
                                },
                            },
                            required: ['query'],
                        },
                    },
                ] as Tool[],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
            const { name, arguments: args } = request.params;
            logger.info(`Tool called: ${name}`, {
                tool: name,
                parameters: args,
                timestamp: new Date().toISOString()
            });

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

                logger.info(`Tool ${name} completed successfully`, {
                    tool: name,
                    timestamp: new Date().toISOString()
                });
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                logger.error(`Tool ${name} failed:`, {
                    tool: name,
                    error: errorMessage,
                    parameters: args,
                    timestamp: new Date().toISOString()
                });

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

        if (!result || typeof (result as any).status !== 'string') {
            logger.error('Unexpected scrape result payload:', result as any);
            throw new McpError(ErrorCode.InternalError, 'Unexpected scrape result from AnyCrawl API');
        }

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

        // Top-level crawl params (NOT part of ScrapeOptionsSchema)
        const crawlArgs: any = {
            url: validatedArgs.url,
        };
        if ('retry' in args) crawlArgs.retry = validatedArgs.retry;
        if ('exclude_paths' in args) crawlArgs.exclude_paths = validatedArgs.exclude_paths;
        if ('include_paths' in args) crawlArgs.include_paths = validatedArgs.include_paths;
        if ('max_depth' in args) crawlArgs.max_depth = validatedArgs.max_depth;
        if ('strategy' in args) crawlArgs.strategy = validatedArgs.strategy;
        if ('limit' in args) crawlArgs.limit = validatedArgs.limit;
        if ('engine' in args) crawlArgs.engine = validatedArgs.engine;

        // ScrapeOptionsSchema fields must be nested under scrape_options
        const scrapeOptions: any = {};
        if ('proxy' in args) scrapeOptions.proxy = validatedArgs.proxy;
        if ('formats' in args) scrapeOptions.formats = validatedArgs.formats;
        if ('timeout' in args) scrapeOptions.timeout = validatedArgs.timeout;
        if ('wait_for' in args) scrapeOptions.wait_for = validatedArgs.wait_for;
        if ('include_tags' in args) scrapeOptions.include_tags = validatedArgs.include_tags;
        if ('exclude_tags' in args) scrapeOptions.exclude_tags = validatedArgs.exclude_tags;
        if ('json_options' in args) scrapeOptions.json_options = validatedArgs.json_options;
        if ('extract_source' in args) scrapeOptions.extract_source = validatedArgs.extract_source;

        // Use SDK's aggregated crawl which handles creation and polling internally
        const pollSeconds: number = (args as any).poll_seconds
            ?? (((args as any).poll_interval_ms ? Math.max(1, Math.round((args as any).poll_interval_ms / 1000)) : 3));
        const timeoutMs: number = (args as any).timeout_ms ?? 60000;

        const aggregated = await (this.client as any).crawl(crawlArgs, pollSeconds, timeoutMs);

        const ret = {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(aggregated, null, 2),
                } as TextContent,
            ],
        };
        logger.debug('Tool anycrawl_crawl completed successfully');
        return ret;
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

        // Top-level search params
        const searchArgs: any = {
            query: validatedArgs.query,
        };
        if ('engine' in args) searchArgs.engine = validatedArgs.engine; // search engine (e.g., google)
        if ('limit' in args) searchArgs.limit = validatedArgs.limit;
        if ('offset' in args) searchArgs.offset = validatedArgs.offset;
        if ('pages' in args) searchArgs.pages = validatedArgs.pages;
        if ('lang' in args) searchArgs.lang = validatedArgs.lang;
        if ('country' in args) searchArgs.country = validatedArgs.country;
        if ('safeSearch' in args) searchArgs.safeSearch = validatedArgs.safeSearch;

        // Build nested scrape_options from SearchScrapeOptions fields
        const scrapeOptions: any = {};
        if ('scrape_engine' in args) scrapeOptions.engine = (validatedArgs as any).scrape_engine;
        if ('proxy' in args) scrapeOptions.proxy = validatedArgs.proxy as any;
        if ('formats' in args) scrapeOptions.formats = validatedArgs.formats as any;
        if ('timeout' in args) scrapeOptions.timeout = validatedArgs.timeout as any;
        if ('wait_for' in args) scrapeOptions.wait_for = validatedArgs.wait_for as any;
        if ('include_tags' in args) scrapeOptions.include_tags = validatedArgs.include_tags as any;
        if ('exclude_tags' in args) scrapeOptions.exclude_tags = validatedArgs.exclude_tags as any;
        if ('json_options' in args) scrapeOptions.json_options = validatedArgs.json_options as any;
        if ('extract_source' in args) scrapeOptions.extract_source = (validatedArgs as any).extract_source;
        if (Object.keys(scrapeOptions).length > 0) {
            searchArgs.scrape_options = scrapeOptions;
        }

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

    public async connectTransport(transport: StdioServerTransport | StreamableHTTPServerTransport | SSEServerTransport): Promise<void> {
        await this.server.connect(transport);
    }
}
