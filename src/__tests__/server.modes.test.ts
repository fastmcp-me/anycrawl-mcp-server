import axios from 'axios';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const cliPath = path.resolve(process.cwd(), 'src/cli.ts');

jest.setTimeout(45000);

const startServer = (mode: 'CLOUD_SERVICE' | 'HTTP_STREAMABLE_SERVER', port: number): ChildProcessWithoutNullStreams => {
    const env = {
        ...process.env,
        ANYCRAWL_MODE: mode,
        ANYCRAWL_API_KEY: 'test-key',
        ANYCRAWL_PORT: String(port),
        ANYCRAWL_HOST: '127.0.0.1',
        LOG_LEVEL: 'error',
    };
    // Run from source using tsx CLI directly (simplest & portable)
    const tsxBin = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
    const child = spawn(tsxBin, [cliPath], { env, stdio: 'pipe' });
    // Help debugging if startup fails
    child.stderr.on('data', (d) => {
        // eslint-disable-next-line no-console
        console.error(String(d));
    });
    return child;
};

const stopServer = (child?: ChildProcessWithoutNullStreams) => {
    if (!child) return;
    try {
        child.kill('SIGTERM');
    } catch { }
};

const waitForHealth = async (port: number) => {
    const url = `http://127.0.0.1:${port}/health`;
    const start = Date.now();
    // Wait up to 20s
    while (Date.now() - start < 20000) {
        try {
            const res = await axios.get(url);
            if (res.status === 200) return res.data;
        } catch { }
        await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('Server did not become healthy in time');
};

describe('Server modes', () => {
    let child: ChildProcessWithoutNullStreams | undefined;

    afterEach(() => {
        stopServer(child);
        child = undefined;
    });

    it('starts CLOUD_SERVICE (stateless streamable HTTP) and serves health + /mcp POST', async () => {
        const port = 34561;
        child = startServer('CLOUD_SERVICE', port);
        const health = await waitForHealth(port);
        expect(health.mode).toBe('CLOUD_SERVICE');

        // POST /mcp initialize request
        const initReq = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                clientInfo: { name: 'jest-client', version: '0.0.0' },
                capabilities: {},
            },
        };
        const resp = await axios.post(`http://127.0.0.1:${port}/mcp`, initReq, {
            validateStatus: () => true,
            headers: {
                'Accept': 'application/json, text/event-stream',
                'Content-Type': 'application/json',
                'Mcp-Protocol-Version': '2025-03-26',
            },
        });
        expect(resp.status).toBe(200);
        // Stateless mode should not require/return a session header
        // but should return a JSON-RPC response body
        expect(resp.data?.jsonrpc).toBe('2.0');
        expect(resp.data?.id).toBe(1);
    });

    it('starts HTTP_STREAMABLE_SERVER (stateful streamable HTTP) and returns session header', async () => {
        const port = 34562;
        child = startServer('HTTP_STREAMABLE_SERVER', port);
        const health = await waitForHealth(port);
        expect(health.mode).toBe('HTTP_STREAMABLE_SERVER');

        const initReq = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                clientInfo: { name: 'jest-client', version: '0.0.0' },
                capabilities: {},
            },
        };
        const resp = await axios.post(`http://127.0.0.1:${port}/mcp`, initReq, {
            validateStatus: () => true,
            headers: {
                'Accept': 'application/json, text/event-stream',
                'Content-Type': 'application/json',
                'Mcp-Protocol-Version': '2025-03-26',
            },
        });
        expect(resp.status).toBe(200);
        // Streamable HTTP with sessions should include a session header
        const sessionId = resp.headers['mcp-session-id'] || resp.headers['Mcp-Session-Id'] || resp.headers['mcp-session-id'];
        expect(sessionId).toBeTruthy();
    });

    it('HTTP_STREAMABLE_SERVER supports GET /mcp SSE with correct headers', async () => {
        const port = 34563;
        child = startServer('HTTP_STREAMABLE_SERVER', port);
        await waitForHealth(port);

        // Initialize to get session id
        const initReq = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                clientInfo: { name: 'jest-client', version: '0.0.0' },
                capabilities: {},
            },
        };
        const initResp = await axios.post(`http://127.0.0.1:${port}/mcp`, initReq, {
            validateStatus: () => true,
            headers: {
                'Accept': 'application/json, text/event-stream',
                'Content-Type': 'application/json',
                'Mcp-Protocol-Version': '2025-03-26',
            },
        });
        expect(initResp.status).toBe(200);
        const sessionId = (initResp.headers['mcp-session-id'] as string) || '';
        expect(sessionId).toBeTruthy();

        // Open SSE stream
        const sseResp = await axios.get(`http://127.0.0.1:${port}/mcp`, {
            validateStatus: () => true,
            responseType: 'stream',
            headers: {
                'Accept': 'text/event-stream',
                'Mcp-Session-Id': sessionId,
                'Mcp-Protocol-Version': '2025-03-26',
            },
        });
        expect(sseResp.status).toBe(200);
        expect(String(sseResp.headers['content-type'] || '')).toContain('text/event-stream');
        // Close the stream to end test quickly
        if (sseResp.data && typeof (sseResp.data as any).destroy === 'function') {
            (sseResp.data as any).destroy();
        }
    });

    it('CLOUD_SERVICE returns 405 for GET /mcp', async () => {
        const port = 34564;
        child = startServer('CLOUD_SERVICE', port);
        await waitForHealth(port);

        const resp = await axios.get(`http://127.0.0.1:${port}/mcp`, {
            validateStatus: () => true,
            headers: {
                'Accept': 'text/event-stream',
            },
        });
        expect(resp.status).toBe(405);
    });
});


