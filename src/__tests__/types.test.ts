import {
    EngineSchema,
    FormatSchema,
    JsonOptionsSchema,
    ScrapeOptionsSchema,
    CrawlOptionsSchema,
    SearchOptionsSchema,
    ScrapeToolSchema,
    CrawlToolSchema,
    SearchToolSchema,
    CrawlStatusToolSchema,
    CrawlResultsToolSchema,
    CancelCrawlToolSchema,
} from '../types.js';

describe('Type Schemas', () => {
    describe('EngineSchema', () => {
        it('should validate valid engines', () => {
            expect(EngineSchema.parse('playwright')).toBe('playwright');
            expect(EngineSchema.parse('cheerio')).toBe('cheerio');
            expect(EngineSchema.parse('puppeteer')).toBe('puppeteer');
        });

        it('should reject invalid engines', () => {
            expect(() => EngineSchema.parse('invalid')).toThrow();
            expect(() => EngineSchema.parse('selenium')).toThrow();
            expect(() => EngineSchema.parse('')).toThrow();
        });
    });

    describe('FormatSchema', () => {
        it('should validate valid formats', () => {
            expect(FormatSchema.parse('markdown')).toBe('markdown');
            expect(FormatSchema.parse('html')).toBe('html');
            expect(FormatSchema.parse('text')).toBe('text');
            expect(FormatSchema.parse('screenshot')).toBe('screenshot');
            expect(FormatSchema.parse('screenshot@fullPage')).toBe('screenshot@fullPage');
            expect(FormatSchema.parse('rawHtml')).toBe('rawHtml');
            expect(FormatSchema.parse('json')).toBe('json');
        });

        it('should reject invalid formats', () => {
            expect(() => FormatSchema.parse('invalid')).toThrow();
            expect(() => FormatSchema.parse('pdf')).toThrow();
            expect(() => FormatSchema.parse('')).toThrow();
        });
    });

    describe('JsonOptionsSchema', () => {
        it('should validate valid JSON options', () => {
            const validOptions = {
                schema: { type: 'object' },
                user_prompt: 'Extract article content',
                schema_name: 'Article',
                schema_description: 'Extracts article metadata and content',
            };

            expect(JsonOptionsSchema.parse(validOptions)).toEqual(validOptions);
        });

        it('should validate partial JSON options', () => {
            const partialOptions = {
                schema: { type: 'object' },
            };

            expect(JsonOptionsSchema.parse(partialOptions)).toEqual(partialOptions);
        });

        it('should validate empty JSON options', () => {
            expect(JsonOptionsSchema.parse({})).toEqual({});
        });
    });

    describe('ScrapeOptionsSchema', () => {
        it('should validate minimal scrape options', () => {
            const minimalOptions = {
                engine: 'cheerio',
            };

            const result = ScrapeOptionsSchema.parse(minimalOptions);
            expect(result.engine).toBe('cheerio');
            expect(result.formats).toEqual(['markdown']);
            expect(result.timeout).toBe(300000);
        });

        it('should validate full scrape options', () => {
            const fullOptions = {
                engine: 'playwright',
                proxy: 'http://proxy.example.com:8080',
                formats: ['markdown', 'html', 'screenshot'],
                timeout: 60000,
                wait_for: 3000,
                include_tags: ['article', 'main'],
                exclude_tags: ['nav', 'footer'],
                json_options: {
                    schema: { type: 'object' },
                    user_prompt: 'Extract content',
                },
            };

            expect(ScrapeOptionsSchema.parse(fullOptions)).toEqual(fullOptions);
        });

        it('should reject invalid URLs for proxy', () => {
            expect(() => ScrapeOptionsSchema.parse({
                engine: 'cheerio',
                proxy: 'invalid-url',
            })).toThrow();
        });

        it('should reject invalid timeout values', () => {
            expect(() => ScrapeOptionsSchema.parse({
                engine: 'cheerio',
                timeout: 500, // Too low
            })).toThrow();

            expect(() => ScrapeOptionsSchema.parse({
                engine: 'cheerio',
                timeout: 700000, // Too high
            })).toThrow();
        });

        it('should reject invalid wait_for values', () => {
            expect(() => ScrapeOptionsSchema.parse({
                engine: 'cheerio',
                wait_for: 0, // Too low
            })).toThrow();

            expect(() => ScrapeOptionsSchema.parse({
                engine: 'cheerio',
                wait_for: 70000, // Too high
            })).toThrow();
        });
    });

    describe('CrawlOptionsSchema', () => {
        it('should validate minimal crawl options', () => {
            const minimalOptions = {
                url: 'https://example.com',
                engine: 'cheerio',
            };

            const result = CrawlOptionsSchema.parse(minimalOptions);
            expect(result.url).toBe('https://example.com');
            expect(result.engine).toBe('cheerio');
            expect(result.formats).toEqual(['markdown']);
            expect(result.timeout).toBe(300000);
            expect(result.retry).toBe(false);
            expect(result.max_depth).toBe(10);
            expect(result.strategy).toBe('same-domain');
            expect(result.limit).toBe(100);
        });

        it('should validate full crawl options', () => {
            const fullOptions = {
                url: 'https://example.com',
                engine: 'playwright',
                proxy: 'http://proxy.example.com:8080',
                formats: ['markdown', 'html'],
                timeout: 60000,
                wait_for: 3000,
                retry: true,
                include_tags: ['article'],
                exclude_tags: ['nav'],
                json_options: { schema: { type: 'object' } },
                scrape_options: {},
                exclude_paths: ['/admin/*'],
                include_paths: ['/blog/*'],
                max_depth: 5,
                strategy: 'same-hostname',
                limit: 50,
            };

            const parsed = CrawlOptionsSchema.parse(fullOptions);
            expect(parsed).toMatchObject(fullOptions);
        });

        it('should reject invalid URLs', () => {
            expect(() => CrawlOptionsSchema.parse({
                url: 'invalid-url',
                engine: 'cheerio',
            })).toThrow();
        });

        it('should reject invalid strategy values', () => {
            expect(() => CrawlOptionsSchema.parse({
                url: 'https://example.com',
                engine: 'cheerio',
                strategy: 'invalid-strategy',
            })).toThrow();
        });

        it('should reject invalid max_depth values', () => {
            expect(() => CrawlOptionsSchema.parse({
                url: 'https://example.com',
                engine: 'cheerio',
                max_depth: 0, // Too low
            })).toThrow();

            expect(() => CrawlOptionsSchema.parse({
                url: 'https://example.com',
                engine: 'cheerio',
                max_depth: 60, // Too high
            })).toThrow();
        });

        it('should reject invalid limit values', () => {
            expect(() => CrawlOptionsSchema.parse({
                url: 'https://example.com',
                engine: 'cheerio',
                limit: 0, // Too low
            })).toThrow();

            expect(() => CrawlOptionsSchema.parse({
                url: 'https://example.com',
                engine: 'cheerio',
                limit: 60000, // Too high
            })).toThrow();
        });
    });

    describe('SearchOptionsSchema', () => {
        it('should validate minimal search options', () => {
            const minimalOptions = {
                query: 'test query',
                scrape_options: { engine: 'cheerio' },
            };

            const result = SearchOptionsSchema.parse(minimalOptions);
            expect(result.query).toBe('test query');
            expect(result.engine).toBe('google');
            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);
            expect(result.scrape_options.engine).toBe('cheerio');
        });

        it('should validate full search options', () => {
            const fullOptions = {
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

            const parsed = SearchOptionsSchema.parse(fullOptions);
            expect(parsed).toMatchObject(fullOptions);
        });

        it('should reject invalid engine values', () => {
            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                engine: 'bing',
                scrape_options: { engine: 'cheerio' },
            })).toThrow();
        });

        it('should reject invalid limit values', () => {
            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                limit: 0, // Too low
                scrape_options: { engine: 'cheerio' },
            })).toThrow();

            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                limit: 150, // Too high
                scrape_options: { engine: 'cheerio' },
            })).toThrow();
        });

        it('should reject invalid offset values', () => {
            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                offset: -1, // Too low
                scrape_options: { engine: 'cheerio' },
            })).toThrow();
        });

        it('should reject invalid pages values', () => {
            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                pages: 0, // Too low
                scrape_options: { engine: 'cheerio' },
            })).toThrow();

            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                pages: 25, // Too high
                scrape_options: { engine: 'cheerio' },
            })).toThrow();
        });

        it('should reject invalid safeSearch values', () => {
            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                safeSearch: -1, // Too low
                scrape_options: { engine: 'cheerio' },
            })).toThrow();

            expect(() => SearchOptionsSchema.parse({
                query: 'test query',
                safeSearch: 3, // Too high
                scrape_options: { engine: 'cheerio' },
            })).toThrow();
        });

        it('should accept null safeSearch', () => {
            const options = {
                query: 'test query',
                safeSearch: null,
                scrape_options: { engine: 'cheerio' },
            };

            const parsed = SearchOptionsSchema.parse(options);
            expect(parsed).toMatchObject(options);
        });
    });

    describe('MCP Tool Schemas', () => {
        describe('ScrapeToolSchema', () => {
            it('should validate minimal scrape tool input', () => {
                const input = {
                    url: 'https://example.com',
                    engine: 'cheerio',
                };

                const result = ScrapeToolSchema.parse(input);
                expect(result.url).toBe('https://example.com');
                expect(result.engine).toBe('cheerio');
                expect(result.formats).toEqual(['markdown']);
                expect(result.timeout).toBe(300000);
                expect(result.retry).toBe(false);
            });

            it('should validate full scrape tool input', () => {
                const input = {
                    url: 'https://example.com',
                    engine: 'playwright',
                    proxy: 'http://proxy.example.com:8080',
                    formats: ['markdown', 'html', 'screenshot'],
                    timeout: 60000,
                    retry: true,
                    wait_for: 3000,
                    include_tags: ['article'],
                    exclude_tags: ['nav'],
                    json_options: {
                        schema: { type: 'object' },
                        user_prompt: 'Extract content',
                    },
                };

                expect(ScrapeToolSchema.parse(input)).toEqual(input);
            });
        });

        describe('CrawlToolSchema', () => {
            it('should validate minimal crawl tool input', () => {
                const input = {
                    url: 'https://example.com',
                    engine: 'cheerio',
                };

                const result = CrawlToolSchema.parse(input);
                expect(result.url).toBe('https://example.com');
                expect(result.engine).toBe('cheerio');
                expect(result.formats).toEqual(['markdown']);
                expect(result.timeout).toBe(300000);
                expect(result.retry).toBe(false);
                expect(result.max_depth).toBe(10);
                expect(result.strategy).toBe('same-domain');
                expect(result.limit).toBe(100);
            });
        });

        describe('SearchToolSchema', () => {
            it('should validate minimal search tool input', () => {
                const input = {
                    query: 'test query',
                    scrape_options: { engine: 'cheerio' },
                };

                const result = SearchToolSchema.parse(input);
                expect(result.query).toBe('test query');
                expect(result.engine).toBe('google');
                expect(result.limit).toBe(10);
                expect(result.offset).toBe(0);
                expect(result.scrape_options.engine).toBe('cheerio');
            });
        });

        describe('CrawlStatusToolSchema', () => {
            it('should validate crawl status tool input', () => {
                const input = {
                    job_id: 'test-job-id',
                };

                expect(CrawlStatusToolSchema.parse(input)).toEqual(input);
            });
        });

        describe('CrawlResultsToolSchema', () => {
            it('should validate crawl results tool input with default skip', () => {
                const input = {
                    job_id: 'test-job-id',
                };

                const result = CrawlResultsToolSchema.parse(input);
                expect(result.job_id).toBe('test-job-id');
                expect(result.skip).toBe(0);
            });

            it('should validate crawl results tool input with custom skip', () => {
                const input = {
                    job_id: 'test-job-id',
                    skip: 50,
                };

                expect(CrawlResultsToolSchema.parse(input)).toEqual(input);
            });
        });

        describe('CancelCrawlToolSchema', () => {
            it('should validate cancel crawl tool input', () => {
                const input = {
                    job_id: 'test-job-id',
                };

                expect(CancelCrawlToolSchema.parse(input)).toEqual(input);
            });
        });
    });
});
