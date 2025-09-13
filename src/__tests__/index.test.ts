import { AnyCrawlMCPServer } from '../index.js';
import { AnyCrawlClient } from '../anycrawl-client.js';
import { logger } from '../logger.js';

// Mock dependencies
jest.mock('../anycrawl-client.js');
jest.mock('../logger.js');

const MockedAnyCrawlClient = jest.mocked(AnyCrawlClient);
const mockLogger = jest.mocked(logger);

describe('AnyCrawlMCPServer', () => {
    let server: AnyCrawlMCPServer;
    let mockClient: jest.Mocked<AnyCrawlClient>;

    beforeEach(() => {
        mockClient = {
            healthCheck: jest.fn(),
            scrape: jest.fn(),
            createCrawl: jest.fn(),
            getCrawlStatus: jest.fn(),
            getCrawlResults: jest.fn(),
            cancelCrawl: jest.fn(),
            search: jest.fn(),
        } as any;

        MockedAnyCrawlClient.mockImplementation(() => mockClient);
        server = new AnyCrawlMCPServer('test-api-key', 'https://api.test.com');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with API key and base URL', () => {
            expect(MockedAnyCrawlClient).toHaveBeenCalledWith('test-api-key', 'https://api.test.com');
            expect(mockLogger.info).toHaveBeenCalledWith('Initializing AnyCrawl MCP Server');
            expect(mockLogger.info).toHaveBeenCalledWith('AnyCrawl MCP Server initialized successfully');
        });

        it('should initialize with default base URL', () => {
            new AnyCrawlMCPServer('test-api-key');
            expect(MockedAnyCrawlClient).toHaveBeenCalledWith('test-api-key', undefined);
        });
    });

    describe('tool handlers', () => {
        describe('anycrawl_scrape', () => {
            it('should handle successful scraping', async () => {
                const mockResult = {
                    url: 'https://example.com',
                    status: 'completed' as const,
                    jobId: 'test-job-id',
                    title: 'Test Page',
                    html: '<html>Test</html>',
                    markdown: '# Test Page',
                    metadata: [],
                    timestamp: '2024-01-01T00:00:00Z',
                };

                mockClient.scrape.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleScrape({
                    url: 'https://example.com',
                    engine: 'cheerio',
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
                expect(mockClient.scrape).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'cheerio',
                });
            });

            it('should forward extract_source when provided', async () => {
                const mockResult = {
                    url: 'https://example.com',
                    status: 'completed' as const,
                };

                mockClient.scrape.mockResolvedValueOnce(mockResult);

                await (server as any).handleScrape({
                    url: 'https://example.com',
                    engine: 'cheerio',
                    extract_source: 'markdown',
                });

                expect(mockClient.scrape).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'cheerio',
                    extract_source: 'markdown',
                });
            });

            it('should handle failed scraping', async () => {
                const mockResult = {
                    url: 'https://example.com',
                    status: 'failed' as const,
                    error: 'Scraping failed',
                };

                mockClient.scrape.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleScrape({
                    url: 'https://example.com',
                    engine: 'cheerio',
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(result.content[0].text).toContain('Scraping failed for https://example.com: Scraping failed');
                expect(result.isError).toBe(true);
            });

            it('should handle scraping with all options', async () => {
                const mockResult = {
                    url: 'https://example.com',
                    status: 'completed' as const,
                };

                mockClient.scrape.mockResolvedValueOnce(mockResult);

                const options = {
                    url: 'https://example.com',
                    engine: 'playwright',
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown', 'html'],
                    timeout: 60000,
                    retry: true,
                    wait_for: 3000,
                    include_tags: ['article'],
                    exclude_tags: ['nav'],
                    json_options: { schema: { type: 'object' } },
                };

                await (server as any).handleScrape(options);

                expect(mockClient.scrape).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'playwright',
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown', 'html'],
                    timeout: 60000,
                    retry: true,
                    wait_for: 3000,
                    include_tags: ['article'],
                    exclude_tags: ['nav'],
                    json_options: { schema: { type: 'object' } },
                });
            });
        });

        describe('anycrawl_crawl', () => {
            it('should handle successful crawl creation', async () => {
                const mockResult = {
                    job_id: 'test-crawl-id',
                    status: 'created' as const,
                    message: 'Crawl job created',
                };

                mockClient.createCrawl.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleCrawl({
                    url: 'https://example.com',
                    engine: 'cheerio',
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(result.content[0].text).toContain('Crawl job created successfully!');
                expect(result.content[0].text).toContain('Job ID: test-crawl-id');
                expect(mockClient.createCrawl).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'cheerio',
                });
            });

            it('should forward extract_source and json_options for crawl', async () => {
                const mockResult = {
                    job_id: 'test-crawl-id',
                    status: 'created' as const,
                    message: 'Crawl job created',
                };

                mockClient.createCrawl.mockResolvedValueOnce(mockResult);

                await (server as any).handleCrawl({
                    url: 'https://example.com',
                    engine: 'cheerio',
                    extract_source: 'markdown',
                    scrape_options: {
                        engine: 'cheerio',
                        json_options: { schema: { type: 'object' }, user_prompt: 'Extract' },
                    },
                });

                expect(mockClient.createCrawl).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'cheerio',
                    extract_source: 'markdown',
                    scrape_options: {
                        engine: 'cheerio',
                        json_options: { schema: { type: 'object' }, user_prompt: 'Extract' },
                    },
                });
            });

            it('should handle crawl creation with all options', async () => {
                const mockResult = {
                    job_id: 'test-crawl-id',
                    status: 'created' as const,
                    message: 'Crawl job created',
                };

                mockClient.createCrawl.mockResolvedValueOnce(mockResult);

                const options = {
                    url: 'https://example.com',
                    engine: 'playwright',
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown'],
                    timeout: 60000,
                    wait_for: 3000,
                    retry: true,
                    include_tags: ['article'],
                    exclude_tags: ['nav'],
                    json_options: { schema: { type: 'object' } },
                    scrape_options: { engine: 'cheerio' },
                    exclude_paths: ['/admin/*'],
                    include_paths: ['/blog/*'],
                    max_depth: 5,
                    strategy: 'same-domain',
                    limit: 50,
                };

                await (server as any).handleCrawl(options);

                expect(mockClient.createCrawl).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    engine: 'playwright',
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown'],
                    timeout: 60000,
                    retry: true,
                    max_depth: 5,
                    strategy: 'same-domain',
                    limit: 50,
                    scrape_options: { engine: 'cheerio' },
                });
            });
        });

        describe('anycrawl_crawl_status', () => {
            it('should handle crawl status retrieval', async () => {
                const mockResult = {
                    job_id: 'test-crawl-id',
                    status: 'completed' as const,
                    start_time: '2024-01-01T00:00:00Z',
                    expires_at: '2024-01-02T00:00:00Z',
                    credits_used: 10,
                    total: 100,
                    completed: 95,
                    failed: 5,
                };

                mockClient.getCrawlStatus.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleCrawlStatus({
                    job_id: 'test-crawl-id',
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
                expect(mockClient.getCrawlStatus).toHaveBeenCalledWith('test-crawl-id');
            });
        });

        describe('anycrawl_crawl_results', () => {
            it('should handle crawl results retrieval', async () => {
                const mockResult = {
                    status: 'completed' as const,
                    total: 100,
                    completed: 100,
                    creditsUsed: 10,
                    next: 'next-page-url',
                    data: [{ url: 'https://example.com', title: 'Test' }],
                };

                mockClient.getCrawlResults.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleCrawlResults({
                    job_id: 'test-crawl-id',
                    skip: 0,
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
                expect(mockClient.getCrawlResults).toHaveBeenCalledWith('test-crawl-id', 0);
            });

            it('should handle crawl results with skip parameter', async () => {
                const mockResult = {
                    status: 'completed' as const,
                    total: 100,
                    completed: 100,
                    creditsUsed: 10,
                    data: [],
                };

                mockClient.getCrawlResults.mockResolvedValueOnce(mockResult);

                await (server as any).handleCrawlResults({
                    job_id: 'test-crawl-id',
                    skip: 50,
                });

                expect(mockClient.getCrawlResults).toHaveBeenCalledWith('test-crawl-id', 50);
            });
        });

        describe('anycrawl_cancel_crawl', () => {
            it('should handle crawl cancellation', async () => {
                const mockResult = {
                    job_id: 'test-crawl-id',
                    status: 'cancelled',
                };

                mockClient.cancelCrawl.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleCancelCrawl({
                    job_id: 'test-crawl-id',
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(result.content[0].text).toContain('Crawl job cancelled successfully!');
                expect(result.content[0].text).toContain('Job ID: test-crawl-id');
                expect(mockClient.cancelCrawl).toHaveBeenCalledWith('test-crawl-id');
            });
        });

        describe('anycrawl_search', () => {
            it('should handle search with minimal options', async () => {
                const mockResult: any[] = [
                    {
                        title: 'Test Result',
                        url: 'https://example.com',
                        description: 'Test description',
                        source: 'google',
                    },
                ];

                mockClient.search.mockResolvedValueOnce(mockResult);

                const result = await (server as any).handleSearch({
                    query: 'test query',
                    scrape_options: { engine: 'cheerio' },
                });

                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                expect(JSON.parse(result.content[0].text)).toEqual(mockResult);
                expect(mockClient.search).toHaveBeenCalledWith({
                    query: 'test query',
                    engine: 'google',
                    limit: 10,
                    offset: 0,
                    scrape_options: { engine: 'cheerio' },
                });
            });

            it('should handle search with all options', async () => {
                const mockResult: any[] = [];

                mockClient.search.mockResolvedValueOnce(mockResult);

                const options = {
                    query: 'test query',
                    engine: 'google',
                    limit: 20,
                    offset: 10,
                    pages: 2,
                    lang: 'en',
                    country: 'US',
                    scrape_options: { engine: 'playwright' },
                    safeSearch: 1,
                };

                await (server as any).handleSearch(options);

                expect(mockClient.search).toHaveBeenCalledWith({
                    query: 'test query',
                    engine: 'google',
                    limit: 20,
                    offset: 10,
                    pages: 2,
                    lang: 'en',
                    country: 'US',
                    scrape_options: { engine: 'playwright' },
                    safeSearch: 1,
                });
            });
        });
    });

    describe('error handling', () => {
        it('should handle unknown tool', async () => {
            const result = await (server as any).handleToolCall({
                name: 'unknown_tool',
                arguments: {},
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Unknown tool: unknown_tool');
        });

        it('should handle tool execution errors', async () => {
            mockClient.scrape.mockRejectedValueOnce(new Error('API Error'));

            const result = await (server as any).handleToolCall({
                name: 'anycrawl_scrape',
                arguments: {
                    url: 'https://example.com',
                    engine: 'cheerio',
                },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Tool execution failed: API Error');
        });

        it('should handle McpError', async () => {
            const mcpError = new Error('MCP Error');
            (mcpError as any).code = 'INVALID_REQUEST';
            mockClient.scrape.mockRejectedValueOnce(mcpError);

            const result = await (server as any).handleToolCall({
                name: 'anycrawl_scrape',
                arguments: {
                    url: 'https://example.com',
                    engine: 'cheerio',
                },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Tool execution failed: MCP Error');
        });
    });

    describe('logging', () => {
        it('should log tool calls', async () => {
            const mockResult = {
                url: 'https://example.com',
                status: 'completed' as const,
            };

            mockClient.scrape.mockResolvedValueOnce(mockResult);

            await (server as any).handleScrape({
                url: 'https://example.com',
                engine: 'cheerio',
            });

            expect(mockLogger.info).toHaveBeenCalledWith('Starting scrape for URL: https://example.com');
            expect(mockLogger.debug).toHaveBeenCalledWith('Tool anycrawl_scrape completed successfully');
        });

        it('should log errors', async () => {
            mockClient.scrape.mockRejectedValueOnce(new Error('API Error'));

            await (server as any).handleToolCall({
                name: 'anycrawl_scrape',
                arguments: {
                    url: 'https://example.com',
                    engine: 'cheerio',
                },
            });

            expect(mockLogger.error).toHaveBeenCalledWith('Tool anycrawl_scrape failed:', 'API Error');
        });
    });
});
