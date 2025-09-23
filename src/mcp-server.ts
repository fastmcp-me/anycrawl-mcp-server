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

    // Get tool definitions for FastMCP integration
    public getToolDefinitions(): Array<{ name: string; description: string; parameters: any }> {
        return this.getToolDefinitionsInternal().map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));
    }

    // Internal method to get tool definitions with full schema
    private getToolDefinitionsInternal() {
        return [
            {
                name: 'anycrawl_scrape',
                description: `Scrape a single URL and extract content in selected formats.

Best for: One known page (articles, docs, product pages).
Not recommended for: Multi-page coverage (use anycrawl_crawl) or open-ended discovery (use anycrawl_search).

RECOMMENDED: Use 'playwright' engine for best results with dynamic content and modern websites.

Usage (parameters):
- url: HTTP/HTTPS URL to scrape (string, required)
- engine: 'playwright' | 'cheerio' | 'puppeteer' (required, default: 'playwright')
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
- Recommended: { "url": "https://example.com", "engine": "playwright" }
- With JSON extraction: { "url": "https://news.ycombinator.com", "engine": "playwright", "formats": ["markdown"], "json_options": { "user_prompt": "Extract titles", "schema_name": "Articles" } }
- With JSON schema extraction: { "url": "https://example.com/article", "engine": "playwright", "json_options": { "schema_name": "Article", "schema_description": "Extract article metadata and content", "schema": { "type": "object", "properties": { "title": { "type": "string" }, "author": { "type": "string" }, "date": { "type": "string" }, "content": { "type": "string" } }, "required": ["title", "content"] } } }`,
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
                            description: 'The scraping engine to use. RECOMMENDED: Playwright for best results with dynamic content and modern websites. Cheerio is fastest for static content, Puppeteer for Chrome automation.',
                            default: 'playwright',
                            examples: ['playwright', 'cheerio', 'puppeteer'],
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
                                    description: 'JSON schema defining the structure of extracted data',
                                },
                                user_prompt: {
                                    type: 'string',
                                    description: 'Natural language prompt for AI extraction',
                                    examples: ['Extract the main article content, author, and publication date', 'Get product name, price, and description']
                                },
                                schema_name: {
                                    type: 'string',
                                    description: 'Name for the extraction schema',
                                    examples: ['Article', 'Product', 'Event']
                                },
                                schema_description: {
                                    type: 'string',
                                    description: 'Description of what the schema extracts',
                                    examples: ['Extract article metadata and content', 'Extract product information']
                                }
                            }
                        },
                        extract_source: {
                            type: 'string',
                            enum: ['html', 'markdown'],
                            description: 'Source format for extraction. HTML preserves original structure, markdown is LLM-friendly.',
                            default: 'markdown',
                            examples: ['html', 'markdown'],
                        },
                    },
                    required: ['url', 'engine'],
                }
            },
            {
                name: 'anycrawl_crawl',
                description: `Crawl an entire website with configurable depth and limits.

Best for: Multi-page coverage, site mapping, content discovery.
Not recommended for: Single pages (use anycrawl_scrape) or open-ended discovery (use anycrawl_search).

RECOMMENDED: Use 'playwright' engine for best results with dynamic content and modern websites.

Usage (parameters):
- url: Starting URL to crawl (string, required)
- engine: 'playwright' | 'cheerio' | 'puppeteer' (required, default: 'playwright')
- max_depth: Maximum crawl depth (number, optional, default: 10)
- limit: Maximum pages to crawl (number, optional, default: 100)
- strategy: Crawl strategy 'all' | 'same-domain' | 'same-hostname' | 'same-origin' (optional, default: 'same-domain')
- include_paths: Path patterns to include (string[], optional)
- exclude_paths: Path patterns to exclude (string[], optional)
- retry: Enable auto-retry on failure (boolean, optional)
- poll_seconds: Polling interval for job status (number, optional)
- poll_interval_ms: Polling interval in milliseconds (number, optional)
- timeout_ms: Job timeout in milliseconds (number, optional)
- scrape_options: Nested scrape options for each page (object, optional)

Returns: { job_id, status, message } for async jobs

Examples:
- Recommended: { "url": "https://example.com", "engine": "playwright", "limit": 50 }
- Deep crawl: { "url": "https://docs.example.com", "engine": "playwright", "max_depth": 5, "limit": 200 }
- Filtered crawl: { "url": "https://blog.example.com", "engine": "playwright", "include_paths": ["/posts/*"], "exclude_paths": ["/admin/*"] }`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            format: 'uri',
                            description: 'Starting URL to crawl. Must be a valid HTTP/HTTPS URL.',
                            examples: ['https://example.com', 'https://docs.example.com'],
                        },
                        engine: {
                            type: 'string',
                            enum: ['playwright', 'cheerio', 'puppeteer'],
                            description: 'The crawling engine to use. RECOMMENDED: Playwright for best results with dynamic content and modern websites. Cheerio is fastest for static content, Puppeteer for Chrome automation.',
                            default: 'playwright',
                            examples: ['playwright', 'cheerio', 'puppeteer'],
                        },
                        max_depth: {
                            type: 'number',
                            minimum: 1,
                            maximum: 50,
                            description: 'Maximum depth to crawl from the starting URL.',
                            default: 10,
                            examples: [3, 5, 10, 20],
                        },
                        limit: {
                            type: 'number',
                            minimum: 1,
                            maximum: 50000,
                            description: 'Maximum number of pages to crawl.',
                            default: 100,
                            examples: [10, 50, 100, 1000],
                        },
                        strategy: {
                            type: 'string',
                            enum: ['all', 'same-domain', 'same-hostname', 'same-origin'],
                            description: 'Crawling strategy. same-domain is most common, all crawls everything, same-hostname includes subdomains, same-origin is strictest.',
                            default: 'same-domain',
                            examples: ['same-domain', 'same-hostname', 'all'],
                        },
                        include_paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Path patterns to include in crawling. Supports wildcards.',
                            examples: [['/blog/*', '/articles/*'], ['/docs/**'], ['/posts/*']],
                        },
                        exclude_paths: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Path patterns to exclude from crawling. Supports wildcards.',
                            examples: [['/admin/*', '/private/*'], ['/api/**'], ['/login', '/logout']],
                        },
                        retry: {
                            type: 'boolean',
                            description: 'Whether to automatically retry failed requests.',
                            default: false,
                        },
                        poll_seconds: {
                            type: 'number',
                            minimum: 1,
                            maximum: 60,
                            description: 'Polling interval in seconds for checking job status.',
                            default: 3,
                            examples: [1, 3, 5, 10],
                        },
                        poll_interval_ms: {
                            type: 'number',
                            minimum: 100,
                            maximum: 60000,
                            description: 'Polling interval in milliseconds for checking job status.',
                            default: 3000,
                            examples: [1000, 3000, 5000],
                        },
                        timeout_ms: {
                            type: 'number',
                            minimum: 1000,
                            maximum: 600000,
                            description: 'Job timeout in milliseconds.',
                            default: 60000,
                            examples: [30000, 60000, 300000],
                        },
                        scrape_options: {
                            type: 'object',
                            description: 'Options for scraping each page during crawl. Same as scrape tool options.',
                            properties: {
                                proxy: { type: 'string', format: 'uri' },
                                formats: {
                                    type: 'array',
                                    items: { type: 'string', enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'] }
                                },
                                timeout: { type: 'number', minimum: 1000, maximum: 600000 },
                                wait_for: { type: 'number', minimum: 1, maximum: 60000 },
                                include_tags: { type: 'array', items: { type: 'string' } },
                                exclude_tags: { type: 'array', items: { type: 'string' } },
                                json_options: { type: 'object' },
                                extract_source: { type: 'string', enum: ['html', 'markdown'] },
                                engine: { type: 'string', enum: ['playwright', 'cheerio', 'puppeteer'] }
                            }
                        }
                    },
                    required: ['url', 'engine'],
                }
            },
            {
                name: 'anycrawl_search',
                description: `Search the web and optionally scrape results.

Best for: Open-ended discovery, finding relevant content.
Not recommended for: Known URLs (use anycrawl_scrape) or comprehensive site coverage (use anycrawl_crawl).

RECOMMENDED: Use limit=5 for balanced performance and cost. Use 'playwright' engine for scraping results.

Usage (parameters):
- query: Search query string (string, required)
- engine: Search engine 'google' (optional, default: 'google')
- limit: Number of results to return (number, optional, default: 5)
- offset: Number of results to skip (number, optional, default: 0)
- pages: Number of search result pages to process (number, optional)
- lang: Language code (string, optional)
- country: Country code (string, optional)
- safeSearch: Safe search level 0-2 (number, optional)
- scrape_options: Options for scraping search results (object, optional)

Returns: Array of search results with optional scraped content

Examples:
- Recommended: { "query": "artificial intelligence news", "limit": 5 }
- With scraping: { "query": "TypeScript tutorials", "limit": 5, "scrape_options": { "formats": ["markdown"], "engine": "playwright" } }
- Localized search: { "query": "machine learning", "lang": "es", "country": "ES", "limit": 5 }`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query string.',
                            examples: ['artificial intelligence', 'TypeScript tutorials', 'machine learning news'],
                        },
                        engine: {
                            type: 'string',
                            enum: ['google'],
                            description: 'Search engine to use. Currently only Google is supported.',
                            default: 'google',
                        },
                        limit: {
                            type: 'number',
                            minimum: 1,
                            maximum: 100,
                            description: 'Number of search results to return. RECOMMENDED: 5 for balanced performance and cost.',
                            default: 5,
                            examples: [5, 10, 20, 50],
                        },
                        offset: {
                            type: 'number',
                            minimum: 0,
                            description: 'Number of results to skip (for pagination).',
                            default: 0,
                            examples: [0, 10, 20, 50],
                        },
                        pages: {
                            type: 'number',
                            minimum: 1,
                            maximum: 20,
                            description: 'Number of search result pages to process.',
                            examples: [1, 2, 5, 10],
                        },
                        lang: {
                            type: 'string',
                            description: 'Language code for localized search results.',
                            examples: ['en', 'es', 'fr', 'de', 'zh'],
                        },
                        country: {
                            type: 'string',
                            description: 'Country code for localized search results.',
                            examples: ['US', 'ES', 'FR', 'DE', 'CN'],
                        },
                        safeSearch: {
                            type: 'number',
                            minimum: 0,
                            maximum: 2,
                            description: 'Safe search level: 0=off, 1=moderate, 2=strict.',
                            examples: [0, 1, 2],
                        },
                        scrape_options: {
                            type: 'object',
                            description: 'Options for scraping search results. Same as scrape tool options.',
                            properties: {
                                engine: { type: 'string', enum: ['playwright', 'cheerio', 'puppeteer'] },
                                proxy: { type: 'string', format: 'uri' },
                                formats: {
                                    type: 'array',
                                    items: { type: 'string', enum: ['markdown', 'html', 'text', 'screenshot', 'screenshot@fullPage', 'rawHtml', 'json'] }
                                },
                                timeout: { type: 'number', minimum: 1000, maximum: 600000 },
                                wait_for: { type: 'number', minimum: 1, maximum: 60000 },
                                include_tags: { type: 'array', items: { type: 'string' } },
                                exclude_tags: { type: 'array', items: { type: 'string' } },
                                json_options: { type: 'object' },
                                extract_source: { type: 'string', enum: ['html', 'markdown'] }
                            }
                        }
                    },
                    required: ['query'],
                }
            },
            {
                name: 'anycrawl_crawl_status',
                description: `Get the status of a crawl job.

Check progress, completion status, and statistics for an ongoing or completed crawl job.

Usage (parameters):
- job_id: The crawl job ID (string, required)

Returns: { job_id, status, start_time, expires_at, credits_used, total, completed, failed }

Examples:
- Check status: { "job_id": "crawl_12345" }`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        job_id: {
                            type: 'string',
                            description: 'The crawl job ID to check status for.',
                            examples: ['crawl_12345', 'crawl_67890'],
                        },
                    },
                    required: ['job_id'],
                }
            },
            {
                name: 'anycrawl_crawl_results',
                description: `Get the results of a completed crawl job.

Retrieve the scraped content and metadata from a completed crawl job.

Usage (parameters):
- job_id: The crawl job ID (string, required)
- skip: Number of results to skip (number, optional, default: 0)

Returns: { status, total, completed, creditsUsed, next?, data[] }

Examples:
- Get all results: { "job_id": "crawl_12345" }
- Paginated results: { "job_id": "crawl_12345", "skip": 50 }`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        job_id: {
                            type: 'string',
                            description: 'The crawl job ID to get results for.',
                            examples: ['crawl_12345', 'crawl_67890'],
                        },
                        skip: {
                            type: 'number',
                            minimum: 0,
                            description: 'Number of results to skip (for pagination).',
                            default: 0,
                            examples: [0, 10, 50, 100],
                        },
                    },
                    required: ['job_id'],
                }
            },
            {
                name: 'anycrawl_cancel_crawl',
                description: `Cancel a running crawl job.

Stop an ongoing crawl job and prevent further processing.

Usage (parameters):
- job_id: The crawl job ID to cancel (string, required)

Returns: { success: boolean, message: string }

Examples:
- Cancel job: { "job_id": "crawl_12345" }`,
                inputSchema: {
                    type: 'object',
                    properties: {
                        job_id: {
                            type: 'string',
                            description: 'The crawl job ID to cancel.',
                            examples: ['crawl_12345', 'crawl_67890'],
                        },
                    },
                    required: ['job_id'],
                }
            }
        ];
    }

    // Helper for tests to simulate tool calls without MCP transport
    public async handleToolCall(request: { name: string; arguments: any }): Promise<any> {
        const { name, arguments: args } = request as any;

        // Validate arguments
        if (!args || typeof args !== 'object') {
            logger.error(`Invalid arguments for tool ${name}:`, { args });
            return {
                content: [{ type: 'text', text: `Invalid arguments: expected object, got ${typeof args}` }],
                isError: true,
            };
        }

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
                tools: this.getToolDefinitionsInternal()
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
