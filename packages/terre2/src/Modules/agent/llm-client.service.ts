import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // for tool messages
};

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: any;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

@Injectable()
export class LlmClientService {
  private readonly baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  private readonly model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  private get apiKey(): string {
    return process.env.DEEPSEEK_API_KEY || '';
  }

  async chat(
    messages: ChatMessage[],
    options?: { tools?: OpenAITool[] }
  ): Promise<{ content: string; usage?: any; message?: any; toolCalls?: ToolCall[] }>
  {
    if (!this.apiKey) {
      throw new HttpException('DEEPSEEK_API_KEY is not set', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const body: any = {
      model: this.model,
      messages,
      stream: false,
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const resp = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    let json: any = null;
    try { json = await resp.json(); } catch {}

    if (!resp.ok) {
      const msg = json?.error?.message || resp.statusText || 'DeepSeek API error';
      // 4xx 归为 BAD_REQUEST，5xx 归为 BAD_GATEWAY
      const status = resp.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST;
      throw new HttpException(`DeepSeek API error: ${msg}`, status);
    }

    const message = json?.choices?.[0]?.message ?? {};
    const content: string = message?.content ?? '';
    const toolCalls: ToolCall[] | undefined = message?.tool_calls as any;
    return { content, usage: json?.usage, message, toolCalls };
  }
}

