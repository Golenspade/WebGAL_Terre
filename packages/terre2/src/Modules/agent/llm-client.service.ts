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
  private readonly baseURL =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  private readonly model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  private readonly maxTokens: number = Number.parseInt(
    process.env.AGENT_MAX_TOKENS || '8192',
    10,
  );
  private readonly temperature: number = Number.parseFloat(
    process.env.AGENT_TEMPERATURE || '0.2',
  );

  private get apiKey(): string {
    return process.env.DEEPSEEK_API_KEY || '';
  }

  async chat(
    messages: ChatMessage[],
    options?: { tools?: OpenAITool[] },
  ): Promise<{
    content: string;
    usage?: any;
    message?: any;
    toolCalls?: ToolCall[];
  }> {
    if (!this.apiKey) {
      throw new HttpException(
        'DEEPSEEK_API_KEY is not set',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const body: any = {
      model: this.model,
      messages,
      stream: false,
    };
    body.max_tokens = this.maxTokens;
    body.temperature = this.temperature;
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto';
    }

    const doRequest = async () => {
      const resp = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      return resp;
    };

    // 简易自动重试：最多 2 次，针对 429/5xx/网络错误，指数退避 500ms, 1500ms
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await doRequest();
        let json: any = null;
        try {
          json = await resp.json();
        } catch {}
        if (!resp.ok) {
          const status = resp.status || 0;
          const msg =
            json?.error?.message || resp.statusText || 'DeepSeek API error';
          const retriable = status === 429 || status >= 500;
          if (retriable && attempt < 2) {
            const delay = 500 * (attempt === 0 ? 1 : 3);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          const httpStatus =
            status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST;
          throw new HttpException(`DeepSeek API error: ${msg}`, httpStatus);
        }
        const message = json?.choices?.[0]?.message ?? {};
        const content: string = message?.content ?? '';
        const toolCalls: ToolCall[] | undefined = message?.tool_calls as any;
        return { content, usage: json?.usage, message, toolCalls };
      } catch (err: any) {
        lastErr = err;
        // 非 HTTP 错误（网络/解析）重试
        if (attempt < 2) {
          const delay = 500 * (attempt === 0 ? 1 : 3);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        // 到达最大重试次数
        if (err instanceof HttpException) throw err;
        throw new HttpException(
          err?.message || 'DeepSeek API request failed',
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
    // 理论上不会到达这里
    throw (
      lastErr ||
      new HttpException('DeepSeek API unknown failure', HttpStatus.BAD_GATEWAY)
    );
  }
}
