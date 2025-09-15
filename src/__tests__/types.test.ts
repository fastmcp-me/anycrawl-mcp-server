import {
    EngineSchema,
    FormatSchema,
    ExtractSourceSchema,
    JsonOptionsSchema,
    ScrapeOptionsSchema,
    SearchScrapeOptionsSchema,
    ScrapeOptionsBaseSchema,
    CrawlToolSchema,
    ScrapeToolSchema,
    SearchToolSchema,
    CrawlStatusToolSchema,
    CrawlResultsToolSchema,
    CancelCrawlToolSchema,
} from '../types';

describe('types schemas', () => {
    test('EngineSchema allows supported engines', () => {
        expect(EngineSchema.parse('cheerio')).toBe('cheerio');
        expect(EngineSchema.parse('playwright')).toBe('playwright');
        expect(EngineSchema.parse('puppeteer')).toBe('puppeteer');
    });

    test('FormatSchema supports known formats', () => {
        expect(FormatSchema.parse('markdown')).toBe('markdown');
        expect(FormatSchema.parse('html')).toBe('html');
        expect(() => FormatSchema.parse('pdf' as any)).toThrow();
    });

    test('ExtractSourceSchema supports html|markdown', () => {
        expect(ExtractSourceSchema.parse('html')).toBe('html');
        expect(ExtractSourceSchema.parse('markdown')).toBe('markdown');
        expect(() => ExtractSourceSchema.parse('text' as any)).toThrow();
    });

    test('JsonOptionsSchema validates optional fields', () => {
        const v = JsonOptionsSchema.parse({ user_prompt: 'x' });
        expect(v.user_prompt).toBe('x');
    });

    test('ScrapeOptionsBaseSchema fills defaults', () => {
        const v = ScrapeOptionsBaseSchema.parse({});
        expect(v.formats).toEqual(['markdown']);
        expect(v.timeout).toBe(300000);
        // extract_source default is applied in extend schemas
    });

    test('ScrapeOptionsSchema requires engine', () => {
        expect(() => ScrapeOptionsSchema.parse({} as any)).toThrow();
        const v = ScrapeOptionsSchema.parse({ engine: 'cheerio' });
        expect(v.engine).toBe('cheerio');
        expect(v.formats).toEqual(['markdown']);
    });

    test('SearchScrapeOptionsSchema allows optional scrape_engine', () => {
        const v = SearchScrapeOptionsSchema.parse({ scrape_engine: 'cheerio' });
        expect(v.scrape_engine).toBe('cheerio');
    });

    test('ScrapeToolSchema requires url and engine', () => {
        expect(() => ScrapeToolSchema.parse({ url: 'https://a.com' } as any)).toThrow();
        const ok = ScrapeToolSchema.parse({ url: 'https://a.com', engine: 'cheerio' });
        expect(ok.retry).toBe(false);
    });

    test('CrawlToolSchema validates crawl fields and defaults', () => {
        const val = CrawlToolSchema.parse({ url: 'https://a.com', engine: 'cheerio' });
        expect(val.max_depth).toBe(10);
        expect(val.limit).toBe(100);
        expect(val.strategy).toBe('same-domain');
    });

    test('SearchToolSchema validates required fields and nested scrape_options', () => {
        const ok = SearchToolSchema.parse({
            query: 'test',
            scrape_options: { engine: 'cheerio' },
        });
        expect(ok.engine).toBe('google');
        expect(ok.limit).toBe(10);
        expect(ok.offset).toBe(0);
    });

    test('CrawlStatusToolSchema requires job_id', () => {
        expect(() => CrawlStatusToolSchema.parse({} as any)).toThrow();
        expect(CrawlStatusToolSchema.parse({ job_id: 'abc' }).job_id).toBe('abc');
    });

    test('CrawlResultsToolSchema validates skip default', () => {
        expect(CrawlResultsToolSchema.parse({ job_id: 'abc' }).skip).toBe(0);
    });

    test('CancelCrawlToolSchema requires job_id', () => {
        expect(() => CancelCrawlToolSchema.parse({} as any)).toThrow();
        expect(CancelCrawlToolSchema.parse({ job_id: 'abc' }).job_id).toBe('abc');
    });
});


