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
  private lineBuffer = '';
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
      this.lineBuffer += chunk.toString('utf8');
      this.processLines();
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

  /**
   * Process newline-delimited JSON messages from MCP stdout
   * According to MCP spec: "Messages are delimited by newlines, and MUST NOT contain embedded newlines."
   */
  private processLines(): void {
    const lines = this.lineBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const message = JSON.parse(trimmed) as JsonRpcResponse;
        this.handleResponse(message);
      } catch (error) {
        this.logger.error(`Failed to parse JSON-RPC message: ${trimmed}`);
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
    this.lineBuffer = '';
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

  /**
   * Send a JSON-RPC request to MCP process
   * According to MCP spec: "Messages are delimited by newlines"
   */
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

      // 发送换行分隔的 JSON（MCP stdio 协议）
      const json = JSON.stringify(request);
      this.mcpProcess!.stdin?.write(json + '\n');
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
    // 从 terre2 的位置向上查找 webgal_agent
    // __dirname 在开发时是 src/Modules/agent，编译后是 dist/Modules/agent
    // 需要向上找到 WebGAL_Terre，然后再向上找到 webgal_agent

    const possiblePaths = [
      // 从 src 目录（开发环境）
      path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/dist/bin.js'),
      path.resolve(__dirname, '../../../../../webgal_agent/packages/mcp-webgal/src/bin.ts'),
      // 从 dist 目录（编译后）
      path.resolve(__dirname, '../../../../../../../webgal_agent/packages/mcp-webgal/dist/bin.js'),
      path.resolve(__dirname, '../../../../../../../webgal_agent/packages/mcp-webgal/src/bin.ts'),
    ];

    // 优先使用已构建的 dist/bin.js
    for (const binPath of possiblePaths) {
      if (fs.existsSync(binPath)) {
        if (binPath.endsWith('.js')) {
          this.logger.log(`Using compiled MCP binary: ${binPath}`);
          return { command: 'node', args: [binPath] };
        } else if (binPath.endsWith('.ts')) {
          this.logger.log(`Using TypeScript MCP source: ${binPath}`);
          return { command: 'npx', args: ['tsx', binPath] };
        }
      }
    }

    // 尝试全局安装的 mcp-webgal
    this.logger.warn('MCP binary not found in expected locations, trying globally installed mcp-webgal');
    return { command: 'mcp-webgal', args: [] };
  }
}

