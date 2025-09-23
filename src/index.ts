#!/usr/bin/env node

import { FastMCP, type Context, type Tool } from 'fastmcp';
import { logger } from './logger.js';
import { AnyCrawlMCPServer } from './mcp-server.js';
import { IncomingHttpHeaders } from 'http';

// Session data interface
interface SessionData extends Record<string, unknown> {
    anycrawlApiKey: string;
    baseUrl?: string;
}

// Extract API key from headers
function extractApiKey(headers: IncomingHttpHeaders): string | null {
    // Try x-anycrawl-api-key header first
    const anycrawlApiKey = headers['x-anycrawl-api-key'] || headers['X-AnyCrawl-Api-Key'];
    if (typeof anycrawlApiKey === 'string') {
        return anycrawlApiKey;
    }

    // Fallback to Authorization header
    const authHeader = headers.authorization || headers.Authorization;
    if (typeof authHeader === 'string') {
        // Handle "Bearer <token>" format
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match) {
            return match[1] || null;
        }
        // Handle direct token
        return authHeader || null;
    }
    return null;
}

// Create FastMCP server instance
const server = new FastMCP<SessionData>({
    name: 'anycrawl-fastmcp',
    version: '0.0.6',
    logger: {
        debug: (message: string, data?: any) => logger.debug(message, data),
        error: (message: string, data?: any) => logger.error(message, data),
        info: (message: string, data?: any) => logger.info(message, data),
        log: (message: string, data?: any) => logger.info(message, data),
        warn: (message: string, data?: any) => logger.warn(message, data),
    },
    roots: { enabled: false },
    authenticate: async (request: { headers: IncomingHttpHeaders }): Promise<SessionData> => {
        if (process.env.CLOUD_SERVICE === 'true') {
            const apiKey = extractApiKey(request.headers);

            if (!apiKey) {
                throw new Error('AnyCrawl API key is required');
            }
            return { anycrawlApiKey: apiKey };
        } else {
            // For self-hosted instances, use default base URL if not provided
            const baseUrl = process.env.ANYCRAWL_BASE_URL || 'https://api.anycrawl.dev';
            return {
                anycrawlApiKey: process.env.ANYCRAWL_API_KEY || '',
                baseUrl
            };
        }
    },
    // Lightweight health endpoint for LB checks
    health: {
        enabled: true,
        message: 'ok',
        path: '/health',
        status: 200,
    },
});

// Helper function to get AnyCrawl MCP Server instance
function getAnyCrawlMCPServer(session: SessionData): AnyCrawlMCPServer {
    return new AnyCrawlMCPServer(session.anycrawlApiKey, session.baseUrl);
}

// Create tools that delegate to AnyCrawlMCPServer
const createTool = (toolDef: { name: string; description: string }): Tool<SessionData> => ({
    name: toolDef.name,
    description: toolDef.description,
    execute: async (args, context) => {
        const mcpServer = getAnyCrawlMCPServer(context.session!);

        try {
            context.log.info(`Executing ${toolDef.name} tool`, { args: JSON.stringify(args) });

            // Use the existing MCP server's tool handling
            const result = await mcpServer.handleToolCall({ name: toolDef.name, arguments: args });

            return {
                type: 'text',
                text: JSON.stringify(result, null, 2)
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log.error(`${toolDef.name} tool execution failed`, { error: errorMessage });
            throw new Error(`${toolDef.name} failed: ${errorMessage}`);
        }
    },
    annotations: {
        readOnlyHint: toolDef.name !== 'anycrawl_cancel_crawl',
        openWorldHint: ['anycrawl_scrape', 'anycrawl_crawl', 'anycrawl_search'].includes(toolDef.name),
        destructiveHint: toolDef.name === 'anycrawl_cancel_crawl',
        title: toolDef.name.replace('anycrawl_', '').replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
    }
});

// Get tool definitions from AnyCrawlMCPServer and add them to FastMCP
const tempServer = new AnyCrawlMCPServer('temp', undefined);
const toolDefinitions = tempServer.getToolDefinitions();

// Add all tools to the server
toolDefinitions.forEach(toolDef => {
    server.addTool(createTool(toolDef));
});

// Main execution function
async function main() {
    const mode = process.env.ANYCRAWL_MODE || 'STDIO';

    try {
        if (mode === 'MCP_AND_SSE') {
            // Cloud mode - supports both MCP protocol and SSE endpoints
            const port = Number(process.env.ANYCRAWL_PORT || 3000);
            const host = process.env.ANYCRAWL_HOST || '0.0.0.0';

            logger.info(`Starting AnyCrawl FastMCP Server in cloud mode on ${host}:${port}`);
            logger.info('🚀 Server supports both MCP protocol (STDIO) and SSE endpoints');
            logger.info('   MCP protocol: Available via STDIO');
            logger.info(`   SSE endpoint: http://${host}:${port}/sse`);
            logger.info(`   MCP endpoint: http://${host}:${port}/mcp`);

            await server.start({
                transportType: 'httpStream',
                httpStream: {
                    host,
                    port,
                    stateless: true
                }
            });
        } else {
            // STDIO mode (default)
            logger.info('Starting AnyCrawl FastMCP Server in STDIO mode');
            await server.start({
                transportType: 'stdio'
            });
        }
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    server.stop().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    server.stop().then(() => process.exit(0));
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        logger.error('Unhandled error in main:', error);
        process.exit(1);
    });
}

export { main };