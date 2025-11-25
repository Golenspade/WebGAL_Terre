import { Injectable, Logger } from '@nestjs/common';
import {
  LlmClientService,
  ChatMessage,
  OpenAITool,
  ToolCall,
} from './llm-client.service';
import { ChatRequestDto, ChatResponseDto, ChatStepDto } from './agent.dto';
import { randomUUID } from 'crypto';
import { AgentMcpService } from './agent-mcp.service';
import {
  ToolCallRetryService,
  RetryContext,
  ToolCallRetryConfig,
} from './tool-call-retry.service';
import { promises as fs } from 'fs';
import * as path from 'path';

const READ_ONLY_TOOLS = new Set<string>([
  'list_files',
  'read_file',
  'search_files',
  'validate_script',
  'list_project_resources',
  'list_snapshots',
  'get_runtime_info',
]);

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private systemPromptCache?: string;
  private sessions = new Map<string, ChatMessage[]>();

  /** 重试配置，可通过环境变量覆盖 */
  private readonly retryConfig: Partial<ToolCallRetryConfig> = {
    maxRetries: Number.parseInt(
      process.env.AGENT_TOOL_CALL_MAX_RETRIES || '2',
      10,
    ),
    retryDelayMs: Number.parseInt(
      process.env.AGENT_TOOL_CALL_RETRY_DELAY_MS || '500',
      10,
    ),
    enableSmartDetection:
      process.env.AGENT_TOOL_CALL_SMART_DETECTION !== 'false',
  };

  constructor(
    private readonly llm: LlmClientService,
    private readonly agentMcp: AgentMcpService,
    private readonly retryService: ToolCallRetryService,
  ) {}

  private getOrCreateSession(id?: string): {
    id: string;
    history: ChatMessage[];
  } {
    const sid = id || randomUUID();
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, [
        {
          role: 'system',
          content:
            '你是 WebGAL 脚本编辑助手。回答简洁、具体；如需建议改动，先给出方案与理由；只读任务（列文件/读取/校验等）可直接完成；涉及写入/回滚等高风险操作时，只能准备"变更摘要/建议"，等待用户确认。',
        },
      ]);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { id: sid, history: this.sessions.get(sid)! };
  }

  private mapMcpToolsToOpenAI(
    tools: Array<{ name: string; description?: string; inputSchema?: any }>,
  ): OpenAITool[] {
    // 向 LLM 暴露全部 MCP 工具（含写入类），由执行阶段决定是否阻止。
    // 这样当用户请求"准备写入/预览 diff"时，模型才能产生 write_to_file/replace_in_file 等 tool_calls，
    // 前端才能显示"已阻止执行（需确认）"与"预览变更"按钮。
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  private async getSystemPrompt(): Promise<string> {
    if (this.systemPromptCache) return this.systemPromptCache;
    try {
      const registryPath = path.resolve(
        process.cwd(),
        'assets/prompts/webgal/registry.json',
      );
      const registryRaw = await fs.readFile(registryPath, 'utf-8');
      const registry = JSON.parse(registryRaw);
      const baseDir = path.dirname(registryPath);
      const readFiles = async (arr?: string[]) => {
        if (!Array.isArray(arr)) return '';
        const contents = await Promise.all(
          arr.map(async (p) => {
            try {
              return await fs.readFile(path.resolve(baseDir, p), 'utf-8');
            } catch {
              return '';
            }
          }),
        );
        return contents.filter(Boolean).join('\n\n');
      };
      const system = await readFiles(registry.system);
      const facts = await readFiles(registry.facts);
      const examples = await readFiles(registry.examples);
      const assembled = [system, facts, examples].filter(Boolean).join('\n\n');
      this.systemPromptCache = assembled || '你是 WebGAL 脚本编辑助手。';
      return this.systemPromptCache;
    } catch {
      this.systemPromptCache = '你是 WebGAL 脚本编辑助手。';
      return this.systemPromptCache;
    }
  }

  /**
   * 对常见目录型工具做路径兜底：当 path 为空/为 '.' 时默认指向 'game' 目录，
   * 让用户无需关心项目层级即可直接列出资源。
   */
  private normalizeToolArgs(name: string, args: any): any {
    try {
      const needsGameDefault =
        name === 'list_files' ||
        name === 'search_files' ||
        name === 'list_snapshots';
      if (needsGameDefault) {
        const p = args?.path;
        if (p === undefined || p === null || p === '.' || p === './') {
          return { ...(args || {}), path: 'game' };
        }
      }
    } catch {}
    return args;
  }

  /**
   * 带重试的 LLM 调用核心逻辑
   * 当 LLM 应该调用工具但没有调用时，会自动重试
   */
  private async chatWithRetry(
    messages: ChatMessage[],
    openAiTools: OpenAITool[] | undefined,
    mcpTools: Array<{ name: string; description?: string }>,
    retryContext: RetryContext,
    emit?: (event: string, data: any) => void,
  ): Promise<{
    content: string;
    usage?: any;
    message?: any;
    toolCalls?: ToolCall[];
  }> {
    // 首次调用
    let result = await this.llm.chat(messages, { tools: openAiTools });

    // 重试循环
    while (true) {
      const retryResult = this.retryService.analyzeRetry(
        retryContext,
        result.toolCalls,
        mcpTools,
        this.retryConfig,
      );

      if (!retryResult.shouldRetry) {
        // 记录重试摘要（如果有重试）
        if (retryContext.attemptCount > 0) {
          const summary = this.retryService.generateRetrySummary(retryContext);
          this.logger.log(`Tool call retry summary: ${summary}`);
        }
        break;
      }

      // 发送重试事件（如果是流式模式）
      if (emit) {
        emit('retry', {
          attempt: retryContext.attemptCount,
          reason: retryResult.reason,
        });
      }

      // 等待重试延迟
      await this.retryService.waitForRetry(
        retryContext.attemptCount,
        this.retryConfig.retryDelayMs,
      );

      // 添加提示消息到对话历史
      if (retryResult.nudgeMessage) {
        // 先添加助手的回复（如果有）
        if (result.content) {
          messages.push({ role: 'assistant', content: result.content });
        }
        // 添加重试提示
        messages.push(retryResult.nudgeMessage);
      }

      this.logger.log(
        `Retrying LLM call (attempt ${retryContext.attemptCount})...`,
      );

      // 重新调用 LLM
      result = await this.llm.chat(messages, { tools: openAiTools });
    }

    return result;
  }

  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    const { id, history } = this.getOrCreateSession(dto.sessionId);
    // 装配系统提示（Prompt Pack）
    try {
      const sys = await this.getSystemPrompt();
      if (history.length > 0 && history[0].role === 'system') {
        history[0].content = sys;
      } else {
        history.unshift({ role: 'system', content: sys });
      }
    } catch {}

    const userMsg: ChatMessage = {
      role: 'user',
      content: dto.context?.scenePath
        ? `[scene=${dto.context.scenePath}]\n${dto.message}`
        : dto.message,
    };
    history.push(userMsg);

    // 控制上下文长度
    const MAX_HISTORY = 12;
    const messages = history.slice(-MAX_HISTORY);

    // 获取可用只读工具（若 MCP 未运行，则以无工具模式退化）
    let openAiTools: OpenAITool[] | undefined;
    let mcpTools: Array<{ name: string; description?: string }> = [];
    try {
      const status = this.agentMcp.getStatus();
      if (status.running) {
        mcpTools = await this.agentMcp.listTools();
        openAiTools = this.mapMcpToolsToOpenAI(mcpTools);
      }
    } catch {
      // ignore and proceed without tools
    }

    // 创建重试上下文
    const retryContext = this.retryService.createContext(dto.message);

    // 使用带重试的调用
    const first = await this.chatWithRetry(
      messages,
      openAiTools,
      mcpTools,
      retryContext,
    );

    // 如模型未产生 tool_calls，直接返回原始内容
    const toolCalls: ToolCall[] | undefined = first.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      const retryInfo =
        retryContext.attemptCount > 0
          ? `\n\n[系统: 已尝试 ${retryContext.attemptCount} 次引导工具调用，模型仍选择文本回复]`
          : '';
      const assistant: ChatMessage = {
        role: 'assistant',
        content: (first.content || '') + retryInfo,
      };
      history.push(assistant);
      return {
        sessionId: id,
        role: 'assistant',
        content: assistant.content,
        usage: first.usage,
      };
    }

    // 步数上限（可由 env AGENT_MAX_TOOL_STEPS 覆盖，默认 12）
    const MAX_TOOL_STEPS = Number.parseInt(
      process.env.AGENT_MAX_TOOL_STEPS || '12',
      10,
    );
    const limitedToolCalls = toolCalls.slice(0, Math.max(0, MAX_TOOL_STEPS));

    // 处理 tool_calls（只执行只读类）
    const steps: ChatStepDto[] = [];
    const stepSummaries: string[] = [];

    for (const call of limitedToolCalls) {
      const name = call.function?.name as string;
      let args: any = {};
      try {
        args = call.function?.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {}

      if (!READ_ONLY_TOOLS.has(name)) {
        const summary = `写入/危险操作需要确认，已阻止执行`;
        steps.push({ name, args, blocked: true, summary });
        stepSummaries.push(
          `- [未执行] ${name}(${safePreviewArgs(args)}): ${summary}`,
        );
        continue;
      }

      try {
        args = this.normalizeToolArgs(name, args);
        const started = Date.now();
        const result = await this.agentMcp.callTool(name, args);
        const durationMs = Date.now() - started;
        const summary = safePreviewResult(result);
        steps.push({ name, args, summary, result, durationMs });
        stepSummaries.push(`- ${name}(${safePreviewArgs(args)}): ${summary}`);
      } catch (err: any) {
        const summary = err?.message || '执行失败';
        steps.push({
          name,
          args,
          summary,
          error: {
            message: err?.message || '执行失败',
            code: err?.code,
            hint: err?.hint,
            details: err?.details,
          },
        });
        stepSummaries.push(
          `- [失败] ${name}(${safePreviewArgs(args)}): ${summary}`,
        );
      }
    }

    // 组合最终回复（先以汇总文本返回；下一阶段再做"二次对话总结"）
    if (limitedToolCalls.length < (toolCalls?.length || 0)) {
      stepSummaries.push(
        `- [提示] 已达到单轮工具步数上限 ${MAX_TOOL_STEPS}，剩余步骤未执行`,
      );
    }

    // 添加重试信息到摘要
    if (retryContext.attemptCount > 0) {
      stepSummaries.unshift(
        `- [重试] 经过 ${retryContext.attemptCount} 次重试后成功调用工具`,
      );
    }

    const summary = `我已按你的请求尝试调用工具：\n${stepSummaries.join(
      '\n',
    )}\n\n如需对文件进行修改，我可以先准备 diff 供你确认，再执行写入。`;

    const assistant: ChatMessage = { role: 'assistant', content: summary };
    history.push(assistant);

    return {
      sessionId: id,
      role: 'assistant',
      content: assistant.content,
      steps,
      usage: first.usage,
    };
  }

  async chatStream(
    dto: ChatRequestDto,
    emit: (event: string, data: any) => void,
  ): Promise<void> {
    const { id, history } = this.getOrCreateSession(dto.sessionId);

    // 装配系统提示（Prompt Pack）
    try {
      const sys = await this.getSystemPrompt();
      if (history.length > 0 && history[0].role === 'system') {
        history[0].content = sys;
      } else {
        history.unshift({ role: 'system', content: sys });
      }
    } catch {}

    emit('meta', { sessionId: id });

    const userMsg: ChatMessage = {
      role: 'user',
      content: dto.context?.scenePath
        ? `[scene=${dto.context.scenePath}]\n${dto.message}`
        : dto.message,
    };
    history.push(userMsg);

    const MAX_HISTORY = 12;
    const messages = history.slice(-MAX_HISTORY);

    // 列工具（若 MCP 未运行，则以无工具模式退化）
    let openAiTools: OpenAITool[] | undefined;
    let mcpTools: Array<{ name: string; description?: string }> = [];
    try {
      const status = this.agentMcp.getStatus();
      if (status.running) {
        mcpTools = await this.agentMcp.listTools();
        openAiTools = this.mapMcpToolsToOpenAI(mcpTools);
      }
    } catch {}

    // 创建重试上下文
    const retryContext = this.retryService.createContext(dto.message);

    // 使用带重试的调用（传入 emit 以发送重试事件）
    const first = await this.chatWithRetry(
      messages,
      openAiTools,
      mcpTools,
      retryContext,
      emit,
    );
    const toolCalls: ToolCall[] | undefined = first.toolCalls;

    // 无工具调用：直接返回文本
    if (!toolCalls || toolCalls.length === 0) {
      const retryInfo =
        retryContext.attemptCount > 0
          ? `\n\n[系统: 已尝试 ${retryContext.attemptCount} 次引导工具调用，模型仍选择文本回复]`
          : '';
      const content = (first.content || '') + retryInfo;
      if (content) emit('assistant', { content });
      const assistant: ChatMessage = { role: 'assistant', content };
      history.push(assistant);
      emit('final', { content, usage: first.usage });
      return;
    }

    // 有工具调用：先把模型的说明话术发出去
    if (first.content) {
      emit('assistant', { content: first.content });
    }

    // 发送重试信息（如果有）
    if (retryContext.attemptCount > 0) {
      emit('info', {
        type: 'retry_success',
        message: `经过 ${retryContext.attemptCount} 次重试后成功调用工具`,
        attempts: retryContext.attemptCount,
      });
    }

    const MAX_TOOL_STEPS = Number.parseInt(
      process.env.AGENT_MAX_TOOL_STEPS || '12',
      10,
    );
    const limitedToolCalls = toolCalls.slice(0, Math.max(0, MAX_TOOL_STEPS));

    const steps: ChatStepDto[] = [];
    const stepSummaries: string[] = [];

    // 添加重试信息到摘要
    if (retryContext.attemptCount > 0) {
      stepSummaries.push(
        `- [重试] 经过 ${retryContext.attemptCount} 次重试后成功调用工具`,
      );
    }

    for (const call of limitedToolCalls) {
      const name = call.function?.name as string;
      let args: any = {};
      try {
        args = call.function?.arguments
          ? JSON.parse(call.function.arguments)
          : {};
      } catch {}

      if (!READ_ONLY_TOOLS.has(name)) {
        const summary = '写入/危险操作需要确认，已阻止执行';
        const step: ChatStepDto = { name, args, blocked: true, summary };
        steps.push(step);
        stepSummaries.push(
          `- [未执行] ${name}(${safePreviewArgs(args)}): ${summary}`,
        );
        emit('step', step);
        continue;
      }

      try {
        args = this.normalizeToolArgs(name, args);
        const started = Date.now();
        const result = await this.agentMcp.callTool(name, args);
        const durationMs = Date.now() - started;
        const summary = safePreviewResult(result);
        const step: ChatStepDto = { name, args, summary, result, durationMs };
        steps.push(step);
        stepSummaries.push(`- ${name}(${safePreviewArgs(args)}): ${summary}`);
        emit('step', step);
      } catch (err: any) {
        const summary = err?.message || '执行失败';
        const step: ChatStepDto = {
          name,
          args,
          summary,
          error: {
            message: err?.message || '执行失败',
            code: err?.code,
            hint: err?.hint,
            details: err?.details,
          },
        };
        steps.push(step);
        stepSummaries.push(
          `- [失败] ${name}(${safePreviewArgs(args)}): ${summary}`,
        );
        emit('step', step);
      }
    }

    if (limitedToolCalls.length < (toolCalls?.length || 0)) {
      stepSummaries.push(
        `- [提示] 已达到单轮工具步数上限 ${MAX_TOOL_STEPS}，剩余步骤未执行`,
      );
    }
    const summary = `我已按你的请求尝试调用工具：\n${stepSummaries.join(
      '\n',
    )}\n\n如需对文件进行修改，我可以先准备 diff 供你确认，再执行写入。`;

    const assistant: ChatMessage = { role: 'assistant', content: summary };
    history.push(assistant);

    emit('final', { content: assistant.content, steps, usage: first.usage });
  }
}

// 辅助：参数/结果摘要，避免过长
function safePreviewArgs(args: any): string {
  try {
    const json = JSON.stringify(args);
    return json.length > 200 ? json.slice(0, 197) + '...' : json;
  } catch {
    return '[unserializable]';
  }
}

function safePreviewResult(result: any): string {
  try {
    const json = JSON.stringify(result);
    if (json.length <= 200) return json;
    // 常见结果的友好摘要
    if (Array.isArray(result) && result.length) {
      return `数组(${result.length})`;
    }
    if (result && typeof result === 'object') {
      const keys = Object.keys(result);
      return `对象{${keys.slice(0, 5).join(', ')}${
        keys.length > 5 ? ', ...' : ''
      }}`;
    }
    return json.slice(0, 197) + '...';
  } catch {
    return '[unserializable]';
  }
}
