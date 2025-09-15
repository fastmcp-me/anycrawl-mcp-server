import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { main, AnyCrawlMCPServer } from '../index';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

jest.setTimeout(20000);

describe('Server modes', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...OLD_ENV };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    test('exits with error when ANYCRAWL_API_KEY missing', async () => {
        process.env.ANYCRAWL_API_KEY = '' as any;
        const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error('exit:' + code);
        }) as any);
        const consoleSpy = jest.spyOn(console, 'error');

        await expect(main()).rejects.toThrow('exit:1');
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ANYCRAWL_API_KEY environment variable is required'));
        exitSpy.mockRestore();
    });

    test('CLOUD_SERVICE mode handles POST /mcp and returns JSON', async () => {
        process.env.ANYCRAWL_MODE = 'CLOUD_SERVICE';
        process.env.ANYCRAWL_API_KEY = 'test';

        const app = express();
        app.use(helmet());
        app.use(express.json({ limit: '1mb' }));
        app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['Content-Type', 'mcp-session-id'] }));

        const srv = new AnyCrawlMCPServer('test');
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await srv.connectTransport(transport);

        // override app post handler to simulate main() behavior quickly
        app.post('/mcp', async (req: Request, res: Response) => {
            await transport.handleRequest(req, res, req.body);
        });

        const httpServer = await new Promise<import('http').Server>((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        try {
            const address = httpServer.address();
            if (!address || typeof address === 'string') throw new Error('bad address');
            const baseUrl = `http://127.0.0.1:${address.port}`;

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
            const json = await initResp.json();
            expect(json.result).toBeTruthy();
        } finally {
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
    });

    test('STDIO mode starts server without throwing (smoke)', async () => {
        process.env.ANYCRAWL_MODE = 'STDIO';
        process.env.ANYCRAWL_API_KEY = 'test';
        // Prevent actual stdio connect by stubbing AnyCrawlMCPServer.run
        const connectSpy = jest.spyOn(AnyCrawlMCPServer.prototype, 'run').mockResolvedValue();
        await expect(main()).resolves.toBeUndefined();
        expect(connectSpy).toHaveBeenCalled();
        connectSpy.mockRestore();
    });
});
