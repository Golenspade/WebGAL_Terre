/**
 * Agent API Client
 * 封装 Agent MCP 后端 REST API 调用
 */

import { api } from './index';
import type { AgentStatusDto, SetProjectRootDto, ToolDto, CallToolDto } from './Api';

/**
 * 工具错误结构（对齐 CONTRACTS.md）
 */
export interface ToolError {
  code: string;
  message: string;
  hint?: string;
  details?: any;
  recoverable?: boolean;
}

/**
 * Diff 结构（来自 agent-core）
 */
export interface DiffHunk {
  startOld: number;
  lenOld: number;
  startNew: number;
  lenNew: number;
  linesOld: string[];
  linesNew: string[];
}

export interface Diff {
  type: 'line' | 'char';
  hunks: DiffHunk[];
}

/**
 * 写入文件响应
 */
export interface WriteToFileResponse {
  applied: boolean;
  diff?: Diff;
  snapshotId?: string;
  bytesWritten?: number;
}

/**
 * 脚本校验诊断
 */
export interface ScriptDiagnostic {
  line: number;
  kind: 'syntax' | 'resource' | 'warning';
  message: string;
  fixHint?: string;
}

export interface ValidateScriptResponse {
  valid: boolean;
  diagnostics: ScriptDiagnostic[];
}

/**
 * 项目资源列表
 */
export interface ListProjectResourcesResponse {
  backgrounds: string[];
  figures: string[];
  bgm: string[];
  vocals: string[];
  scenes: string[];
}

/**
 * 读取文件响应
 */
export interface ReadFileResponse {
  content: string;
  encoding: string;
  bytes: number;
  path?: string;
}

/**
 * 列出文件响应
 */
export interface ListFilesResponse {
  entries: string[];
}

/**
 * Agent API 客户端类
 */
export class AgentClient {
  /**
   * 获取 Agent MCP 状态
   */
  async getStatus(): Promise<AgentStatusDto> {
    const response = await api.agentControllerGetStatus();
    return response.data;
  }

  /**
   * 启动 MCP
   */
  async start(params: SetProjectRootDto): Promise<{ success: boolean }> {
    await api.agentControllerStart(params);
    return { success: true };
  }

  /**
   * 停止 MCP
   */
  async stop(): Promise<{ success: boolean }> {
    await api.agentControllerStop();
    return { success: true };
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<ToolDto[]> {
    const response = await api.agentControllerListTools();
    return response.data;
  }

  /**
   * 调用工具（泛型方法）
   */
  async callTool<T = any>(name: string, args?: any): Promise<T> {
    const response = await api.agentControllerCallTool({ name, args });
    return response.data as T;
  }

  /**
   * 列出文件
   */
  async listFiles(path: string, globs?: string[], dirsOnly?: boolean): Promise<ListFilesResponse> {
    return this.callTool<ListFilesResponse>('list_files', { path, globs, dirsOnly });
  }

  /**
   * 读取文件
   */
  async readFile(path: string, maxBytes?: number): Promise<ReadFileResponse> {
    return this.callTool<ReadFileResponse>('read_file', { path, maxBytes });
  }

  /**
   * 写入文件
   */
  async writeToFile(params: {
    path: string;
    content: string;
    mode?: 'overwrite' | 'append';
    dryRun?: boolean;
    idempotencyKey?: string;
  }): Promise<WriteToFileResponse> {
    return this.callTool<WriteToFileResponse>('write_to_file', params);
  }

  /**
   * 校验脚本
   */
  async validateScript(params: {
    path?: string;
    content?: string;
    scenePath?: string;
  }): Promise<ValidateScriptResponse> {
    return this.callTool<ValidateScriptResponse>('validate_script', params);
  }

  /**
   * 列出项目资源
   */
  async listProjectResources(extensions?: any): Promise<ListProjectResourcesResponse> {
    return this.callTool<ListProjectResourcesResponse>('list_project_resources', { extensions });
  }

  /**
   * 搜索文件
   */
  async searchFiles(params: {
    path: string;
    regex: string;
    filePattern?: string;
    maxMatches?: number;
  }): Promise<any> {
    return this.callTool('search_files', params);
  }

  /**
   * 替换文件内容
   */
  async replaceInFile(params: {
    path: string;
    find: string;
    replace: string;
    flags?: string;
  }): Promise<any> {
    return this.callTool('replace_in_file', params);
  }

  /**
   * 预览场景
   */
  async previewScene(scenePath: string): Promise<{ url: string }> {
    return this.callTool('preview_scene', { scenePath });
  }
}

/**
 * 单例实例
 */
export const agentClient = new AgentClient();

