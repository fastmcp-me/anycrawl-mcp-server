#!/usr/bin/env node
import { CombinedMCPServer } from './combined-server.js';
import { main } from './index.js';
import { logger } from './logger.js';

if (process.env.ANYCRAWL_MODE === 'COMBINED') {
    const combinedServer = new CombinedMCPServer();
    await combinedServer.start();
} else {
    // Entry point for running the MCP server from CLI
    main().catch((error) => {
        logger.error('Fatal error:', error);
        process.exit(1);
    });
}