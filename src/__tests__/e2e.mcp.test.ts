import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { AnyCrawlMCPServer } from '../index';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('MCP e2e over Streamable HTTP', () => {
    const API_KEY = 'test-key';

    test('initialize session, list tools, and call scrape', async () => {
        process.env.ANYCRAWL_API_KEY = API_KEY;
        const consoleSpy = jest.spyOn(console, 'error');

        const app = express();
        app.use(helmet());
        app.use(express.json({ limit: '1mb' }));
        app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'mcp-session-id'] }));

        const server = new AnyCrawlMCPServer(API_KEY);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'test-session', enableJsonResponse: true });
        await server.connectTransport(transport);

        // Mock client return for scrape
        // Replace SDK client with manual mock
        const mockedClient = {
            scrape: jest.fn().mockResolvedValue({ url: 'https://example.com', status: 'completed', markdown: '# ok' }),
            crawl: jest.fn(),
            getCrawlStatus: jest.fn(),
            getCrawlResults: jest.fn(),
            cancelCrawl: jest.fn(),
            search: jest.fn(),
        } as any;
        (server as any)['client'] = mockedClient;

        app.post('/mcp', async (req: Request, res: Response) => {
            await transport.handleRequest(req, res, req.body);
        });

        const httpServer = await new Promise<import('http').Server>((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });

        try {
            const address = httpServer.address();
            if (!address || typeof address === 'string') throw new Error('invalid address');
            const baseUrl = `http://127.0.0.1:${address.port}`;

            // Initialize MCP session
            const initResp = await fetch(`${baseUrl}/mcp`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    'Mcp-Protocol-Version': '2025-03-26',
                } as any,
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: { protocolVersion: '2025-03-26', clientInfo: { name: 'jest', version: '0.0.0' }, capabilities: {} },
                }),
            });
            expect(initResp.status).toBe(200);
            const sessionId = initResp.headers.get('mcp-session-id');
            expect(sessionId).toBe('test-session');

            // List tools
            const listResp = await fetch(`${baseUrl}/mcp`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    'Mcp-Protocol-Version': '2025-03-26',
                    'Mcp-Session-Id': sessionId!,
                } as any,
                body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
            });
            const listJson = await listResp.json();
            expect(listJson.result).toBeTruthy();
            const toolNames = (listJson.result.tools as Array<{ name: string }>).map((t) => t.name);
            expect(toolNames).toEqual(expect.arrayContaining(['anycrawl_scrape', 'anycrawl_crawl', 'anycrawl_search']));

            // Call scrape tool
            const callResp = await fetch(`${baseUrl}/mcp`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/event-stream',
                    'Content-Type': 'application/json',
                    'Mcp-Protocol-Version': '2025-03-26',
                    'Mcp-Session-Id': sessionId!,
                } as any,
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'tools/call',
                    params: { name: 'anycrawl_scrape', arguments: { url: 'https://example.com', engine: 'cheerio' } },
                }),
            });
            const callJson = await callResp.json();
            expect(callJson.result).toBeTruthy();
            const text = callJson.result.content?.[0]?.text as string;
            const parsed = JSON.parse(text);
            expect(parsed.url).toBe('https://example.com');
            expect(parsed.status).toBe('completed');

            // Verify server logged important events (INFO level)
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Starting scrape for URL:'));
        } finally {
            await new Promise<void>((resolve) => httpServer.close(() => resolve()))
        }
    }, 20000);
});


