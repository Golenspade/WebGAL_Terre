import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

@Injectable()
export class AgentMcpService implements OnModuleDestroy {
  private readonly logger = new Logger(AgentMcpService.name);
  private mcpProcess: ChildProcess | null = null;
  private projectRoot: string | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }>();
  private buffer = '';
  private tools: McpTool[] = [];

  async start(projectRoot: string, options?: { enableExec?: boolean; enableBrowser?: boolean }): Promise<void> {
    if (this.mcpProcess) {
      this.logger.warn('MCP process already running, stopping first');
      await this.stop();
    }

    this.projectRoot = projectRoot;
    const mcpBinPath = this.resolveMcpBinPath();

    if (!mcpBinPath) {
      throw new Error('MCP binary not found');
    }

    const args = ['--project', projectRoot];
    if (options?.enableExec) {
      args.push('--enable-exec');
    }
    if (options?.enableBrowser) {
      args.push('--enable-browser');
    }

    this.logger.log(`Starting MCP: ${mcpBinPath} ${args.join(' ')}`);

    this.mcpProcess = spawn(mcpBinPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    });

    this.mcpProcess.stdout?.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.mcpProcess.stderr?.on('data', (chunk) => {
      this.logger.debug(`MCP stderr: ${chunk.toString()}`);
    });

    this.mcpProcess.on('error', (error) => {
      this.logger.error(`MCP process error: ${error.message}`);
      this.cleanup();
    });

    this.mcpProcess.on('exit', (code, signal) => {
      this.logger.log(`MCP process exited with code ${code}, signal ${signal}`);
      this.cleanup();
    });

    // Wait for initialization and fetch tools
    await this.waitForReady();
    await this.fetchTools();
  }

  async stop(): Promise<void> {
    if (!this.mcpProcess) {
      return;
    }

    this.logger.log('Stopping MCP process');
    this.mcpProcess.kill('SIGTERM');
    
    // Wait for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.mcpProcess) {
          this.mcpProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.mcpProcess?.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.cleanup();
  }

  async callTool<T = any>(name: string, args?: any): Promise<T> {
    if (!this.mcpProcess) {
      throw new Error('MCP process not running');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args || {} },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Tool call timeout: ${name}`));
      }, 60000); // 60s timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const message = JSON.stringify(request) + '\n';
      this.mcpProcess!.stdin?.write(message);
    });
  }

  async listTools(): Promise<McpTool[]> {
    return this.tools;
  }

  getStatus(): { running: boolean; projectRoot: string | null; tools: McpTool[] } {
    return {
      running: this.mcpProcess !== null,
      projectRoot: this.projectRoot,
      tools: this.tools,
    };
  }

  onModuleDestroy() {
    this.stop();
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as JsonRpcResponse;
        this.handleResponse(message);
      } catch (error) {
        this.logger.error(`Failed to parse JSON-RPC message: ${line}`);
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id as number);
    if (!pending) {
      this.logger.warn(`Received response for unknown request ID: ${response.id}`);
      return;
    }

    this.pendingRequests.delete(response.id as number);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  private cleanup(): void {
    this.mcpProcess = null;
    this.projectRoot = null;
    this.buffer = '';
    this.tools = [];

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP process terminated'));
    }
    this.pendingRequests.clear();
  }

  private async waitForReady(): Promise<void> {
    // Simple delay to allow MCP to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async fetchTools(): Promise<void> {
    try {
      const id = ++this.requestId;
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id,
        method: 'tools/list',
      };

      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error('List tools timeout'));
        }, 10000);

        this.pendingRequests.set(id, { resolve, reject, timeout });

        const message = JSON.stringify(request) + '\n';
        this.mcpProcess!.stdin?.write(message);
      });

      this.tools = result.tools || [];
      this.logger.log(`Fetched ${this.tools.length} tools from MCP`);
    } catch (error) {
      this.logger.error(`Failed to fetch tools: ${error.message}`);
      this.tools = [];
    }
  }

  private resolveMcpBinPath(): string | null {
    // Try multiple possible locations
    const possiblePaths = [
      // Development: TypeScript source
      path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/src/bin.ts'),
      // Production: Compiled JS
      path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/dist/bin.js'),
      // Installed globally
      'mcp-webgal',
    ];

    for (const binPath of possiblePaths) {
      if (fs.existsSync(binPath)) {
        // If .ts file, use tsx to run it
        if (binPath.endsWith('.ts')) {
          return `npx tsx ${binPath}`;
        }
        return binPath;
      }
    }

    this.logger.error('MCP binary not found in any of the expected locations');
    return null;
  }
}

