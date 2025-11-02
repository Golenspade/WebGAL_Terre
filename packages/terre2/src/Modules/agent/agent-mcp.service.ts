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
  private buffer = Buffer.alloc(0);
  private tools: McpTool[] = [];
  private initialized = false;

  async start(projectRoot: string, options?: { enableExec?: boolean; enableBrowser?: boolean }): Promise<void> {
    if (this.mcpProcess) {
      this.logger.warn('MCP process already running, stopping first');
      await this.stop();
    }

    this.projectRoot = projectRoot;
    const { command, args: binArgs } = this.resolveMcpBinPath();

    if (!command) {
      throw new Error('MCP binary not found');
    }

    const args = [...binArgs, '--project', projectRoot];
    if (options?.enableExec) {
      args.push('--enable-exec');
    }
    if (options?.enableBrowser) {
      args.push('--enable-browser');
    }

    this.logger.log(`Starting MCP: ${command} ${args.join(' ')}`);

    this.mcpProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
      cwd: projectRoot,
    });

    this.mcpProcess.stdout?.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
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
    await this.initialize();
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

    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args || {},
    });

    // 解包 MCP 工具响应：result.content[0].text 包含实际结果
    if (result.content && Array.isArray(result.content) && result.content[0]?.text) {
      try {
        const parsed = JSON.parse(result.content[0].text);

        // 检查是否有错误
        if (parsed.error) {
          const error: any = new Error(parsed.error.message || 'Tool call failed');
          error.code = parsed.error.code;
          error.hint = parsed.error.hint;
          error.details = parsed.error.details;
          throw error;
        }

        return parsed as T;
      } catch (parseError) {
        // 如果解析失败，返回原始文本
        this.logger.warn(`Failed to parse tool result: ${parseError.message}`);
        return result.content[0].text as T;
      }
    }

    // 如果没有 content，返回原始结果
    return result as T;
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
    while (true) {
      // 查找 Content-Length 头
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        // 没有完整的头，等待更多数据
        break;
      }

      // 解析头部
      const headerStr = this.buffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length: (\d+)/i.exec(headerStr);
      if (!match) {
        this.logger.error('Invalid LSP frame: missing Content-Length');
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      // 检查是否有完整的消息体
      if (this.buffer.length < messageEnd) {
        // 等待更多数据
        break;
      }

      // 提取并解析消息
      const messageStr = this.buffer.slice(messageStart, messageEnd).toString('utf8');
      this.buffer = this.buffer.slice(messageEnd);

      try {
        const message = JSON.parse(messageStr) as JsonRpcResponse;
        this.handleResponse(message);
      } catch (error) {
        this.logger.error(`Failed to parse JSON-RPC message: ${messageStr}`);
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
    this.buffer = Buffer.alloc(0);
    this.tools = [];
    this.initialized = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MCP process terminated'));
    }
    this.pendingRequests.clear();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.log('Initializing MCP connection');

    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'webgal-terre',
          version: '0.1.0',
        },
      });

      this.logger.log(`MCP initialized successfully: ${JSON.stringify(result)}`);
      this.initialized = true;
    } catch (error) {
      this.logger.error(`MCP initialization failed: ${error.message}`);
      throw new Error(`Failed to initialize MCP: ${error.message}`);
    }
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.mcpProcess) {
      throw new Error('MCP process not running');
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 60000); // 60s timeout

      this.pendingRequests.set(id, { resolve, reject, timeout });

      // 使用 LSP 帧格式发送
      const json = JSON.stringify(request);
      const contentLength = Buffer.byteLength(json, 'utf8');
      const frame = `Content-Length: ${contentLength}\r\n\r\n${json}`;

      this.mcpProcess!.stdin?.write(frame);
    });
  }

  private async fetchTools(): Promise<void> {
    try {
      const result = await this.sendRequest('tools/list');
      this.tools = result.tools || [];
      this.logger.log(`Fetched ${this.tools.length} tools from MCP`);

      // 如果工具列表为空，重试一次
      if (this.tools.length === 0) {
        this.logger.warn('Tool list is empty, retrying...');
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryResult = await this.sendRequest('tools/list');
        this.tools = retryResult.tools || [];
        this.logger.log(`Retry: Fetched ${this.tools.length} tools from MCP`);
      }
    } catch (error) {
      this.logger.error(`Failed to fetch tools: ${error.message}`);
      this.tools = [];
    }
  }

  private resolveMcpBinPath(): { command: string; args: string[] } | { command: null; args: [] } {
    // Try multiple possible locations
    const tsPath = path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/src/bin.ts');
    const distPath = path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/dist/bin.js');

    // 优先使用已构建的 dist/bin.js
    if (fs.existsSync(distPath)) {
      this.logger.log(`Using compiled MCP binary: ${distPath}`);
      return { command: 'node', args: [distPath] };
    }

    // Fallback 到 TypeScript 源码（开发环境）
    if (fs.existsSync(tsPath)) {
      this.logger.log(`Using TypeScript MCP source: ${tsPath}`);
      return { command: 'npx', args: ['tsx', tsPath] };
    }

    // 尝试全局安装的 mcp-webgal
    this.logger.log('Trying globally installed mcp-webgal');
    return { command: 'mcp-webgal', args: [] };
  }
}

