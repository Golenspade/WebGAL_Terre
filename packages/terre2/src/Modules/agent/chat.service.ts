import { Injectable } from '@nestjs/common';
import { LlmClientService, ChatMessage, OpenAITool, ToolCall } from './llm-client.service';
import { ChatRequestDto, ChatResponseDto } from './agent.dto';
import { randomUUID } from 'crypto';
import { AgentMcpService } from './agent-mcp.service';

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
  private sessions = new Map<string, ChatMessage[]>();

  constructor(private readonly llm: LlmClientService, private readonly agentMcp: AgentMcpService) {}

  private getOrCreateSession(id?: string): { id: string; history: ChatMessage[] } {
    const sid = id || randomUUID();
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, [
        {
          role: 'system',
          content:
            '你是 WebGAL 脚本编辑助手。回答简洁、具体；如需建议改动，先给出方案与理由；只读任务（列文件/读取/校验等）可直接完成；涉及写入/回滚等高风险操作时，只能准备“变更摘要/建议”，等待用户确认。',
        },
      ]);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { id: sid, history: this.sessions.get(sid)! };
  }

  private mapMcpToolsToOpenAI(tools: Array<{ name: string; description?: string; inputSchema?: any }>): OpenAITool[] {
    return tools
      .filter((t) => READ_ONLY_TOOLS.has(t.name))
      .map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      }));
  }

  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    const { id, history } = this.getOrCreateSession(dto.sessionId);

    const userMsg: ChatMessage = {
      role: 'user',
      content: dto.context?.scenePath ? `[scene=${dto.context.scenePath}]\n${dto.message}` : dto.message,
    };
    history.push(userMsg);

    // 控制上下文长度
    const MAX_HISTORY = 12;
    const messages = history.slice(-MAX_HISTORY);

    // 获取可用只读工具（若 MCP 未运行，则以无工具模式退化）
    let openAiTools: OpenAITool[] | undefined;
    try {
      const status = this.agentMcp.getStatus();
      if (status.running) {
        const mcpTools = await this.agentMcp.listTools();
        openAiTools = this.mapMcpToolsToOpenAI(mcpTools);
      }
    } catch {
      // ignore and proceed without tools
    }

    const first = await this.llm.chat(messages, { tools: openAiTools });

    // 如模型未产生 tool_calls，直接返回原始内容
    const toolCalls: ToolCall[] | undefined = first.toolCalls;
    if (!toolCalls || toolCalls.length === 0) {
      const assistant: ChatMessage = { role: 'assistant', content: first.content || '' };
      history.push(assistant);
      return { sessionId: id, role: 'assistant', content: assistant.content, usage: first.usage };
    }

    // 处理 tool_calls（只执行只读类）
    const stepSummaries: string[] = [];
    for (const call of toolCalls) {
      const name = call.function?.name;
      let args: any = {};
      try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch {}

      if (!READ_ONLY_TOOLS.has(name)) {
        stepSummaries.push(`- [未执行] ${name}(${safePreviewArgs(args)}): 写入/危险操作需要确认，已阻止执行`);
        continue;
      }

      try {
        const result = await this.agentMcp.callTool(name, args);
        const preview = safePreviewResult(result);
        stepSummaries.push(`- ${name}(${safePreviewArgs(args)}): ${preview}`);
      } catch (err: any) {
        stepSummaries.push(`- [失败] ${name}(${safePreviewArgs(args)}): ${err?.message || '执行失败'}`);
      }
    }

    // 组合最终回复（先以汇总文本返回；下一阶段再做“二次对话总结”）
    const summary = `我已按你的请求尝试调用工具：\n${stepSummaries.join('\n')}\n\n如需对文件进行修改，我可以先准备 diff 供你确认，再执行写入。`;
    const assistant: ChatMessage = { role: 'assistant', content: summary };
    history.push(assistant);

    return { sessionId: id, role: 'assistant', content: assistant.content, usage: first.usage };
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
      return `对象{${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''}}`;
    }
    return json.slice(0, 197) + '...';
  } catch {
    return '[unserializable]';
  }
}

