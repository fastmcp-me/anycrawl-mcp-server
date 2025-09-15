#!/usr/bin/env node
import { main } from './index';
import { logger } from './logger';

// Entry point for running the MCP server from CLI
main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
});


