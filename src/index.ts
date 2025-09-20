#!/usr/bin/env node

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AnyCrawlMCPServer } from './mcp-server.js';

// Main execution
async function main() {
    const apiKey = process.env.ANYCRAWL_API_KEY;
    const baseUrl = process.env.ANYCRAWL_BASE_URL;
    const mode = process.env.ANYCRAWL_MODE || 'STDIO';

    if (!apiKey) {
        logger.error('ANYCRAWL_API_KEY environment variable is required');
        process.exit(1);
    }

    try {
        if (mode === 'HTTP_STREAMABLE_SERVER') {
            const port = Number(process.env.ANYCRAWL_PORT || 3000);
            const host = process.env.ANYCRAWL_HOST || '0.0.0.0';

            const app = express();
            app.use(helmet());
            app.use(express.json({ limit: '5mb' }));
            app.use(cors({
                origin: '*',
                exposedHeaders: ['Mcp-Session-Id'],
                allowedHeaders: ['Content-Type', 'mcp-session-id'],
            }));

            app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', mode }));

            const transports: Record<string, StreamableHTTPServerTransport> = {};
            const servers: Record<string, AnyCrawlMCPServer> = {};

            app.post('/mcp', async (req: Request, res: Response) => {
                const sessionId = req.headers['mcp-session-id'] as string | undefined;
                let transport: StreamableHTTPServerTransport | undefined = sessionId ? transports[sessionId] : undefined;

                if (sessionId && transport) {
                    await transport.handleRequest(req, res, req.body);
                    return;
                }

                if (!sessionId && isInitializeRequest(req.body)) {
                    // Create transport and server for new session
                    const newTransport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        enableJsonResponse: true,
                        onsessioninitialized: (sid) => {
                            transports[sid] = newTransport;
                        },
                        // enableDnsRebindingProtection: true,
                        // allowedHosts: ['127.0.0.1'],
                    });
                    const server = new AnyCrawlMCPServer(apiKey, baseUrl);
                    newTransport.onclose = () => {
                        if (newTransport.sessionId) {
                            delete transports[newTransport.sessionId];
                            delete servers[newTransport.sessionId];
                        }
                    };
                    servers[newTransport.sessionId ?? 'pending'] = server;
                    await server.connectTransport(newTransport);
                    await newTransport.handleRequest(req, res, req.body);
                    return;
                }

                res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                    id: null,
                });
            });

            const handleSessionRequest = async (req: Request, res: Response) => {
                const sessionId = req.headers['mcp-session-id'] as string | undefined;
                if (!sessionId || !transports[sessionId]) {
                    res.status(400).send('Invalid or missing session ID');
                    return;
                }
                const transport = transports[sessionId];
                await transport.handleRequest(req, res);
            };

            app.get('/mcp', handleSessionRequest);
            app.delete('/mcp', handleSessionRequest);

            await new Promise<void>((resolve) => {
                app.listen(port, host, () => {
                    logger.info(`MCP Streamable HTTP Server listening on http://${host}:${port}`);
                    resolve();
                });
            });
            return;
        }

        if (mode === 'SSE_SERVER') {
            // SSE server for legacy clients
            const port = Number(process.env.ANYCRAWL_PORT || 3000);
            const host = process.env.ANYCRAWL_HOST || '0.0.0.0';

            const app = express();
            app.use(helmet());
            app.use(express.json({ limit: '5mb' }));
            app.use(cors({
                origin: '*',
                exposedHeaders: ['Mcp-Session-Id'],
                allowedHeaders: ['Content-Type', 'mcp-session-id'],
            }));

            app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok', mode }));

            // Create a shared server instance for SSE
            const server = new AnyCrawlMCPServer(apiKey, baseUrl);
            const transports: Record<string, SSEServerTransport> = {};

            // Legacy SSE endpoint for older clients
            app.get('/sse', async (req: Request, res: Response) => {
                // Create SSE transport for legacy clients
                const transport = new SSEServerTransport('/messages', res);
                transports[transport.sessionId] = transport;

                res.on("close", () => {
                    delete transports[transport.sessionId];
                });

                await server.connectTransport(transport);
            });

            // Legacy message endpoint for older clients
            app.post('/messages', async (req: Request, res: Response) => {
                const sessionId = req.query.sessionId as string;
                const transport = transports[sessionId];
                if (transport) {
                    await transport.handlePostMessage(req, res, req.body);
                } else {
                    res.status(400).send('No transport found for sessionId');
                }
            });

            await new Promise<void>((resolve) => {
                app.listen(port, host, () => {
                    logger.info(`MCP SSE Server listening on http://${host}:${port}`);
                    resolve();
                });
            });
            return;
        }

        // Default: stdio MCP server
        const mcpServer = new AnyCrawlMCPServer(apiKey, baseUrl);
        await mcpServer.run();
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

export { main };