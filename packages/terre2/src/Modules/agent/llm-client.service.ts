import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class LlmClientService {
  private readonly baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  private readonly model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  private get apiKey(): string {
    return process.env.DEEPSEEK_API_KEY || '';
  }

  async chat(messages: ChatMessage[]): Promise<{ content: string; usage?: any }>
  {
    if (!this.apiKey) {
      throw new HttpException('DEEPSEEK_API_KEY is not set', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const resp = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    let json: any = null;
    try { json = await resp.json(); } catch {}

    if (!resp.ok) {
      const msg = json?.error?.message || resp.statusText || 'DeepSeek API error';
      // 4xx 归为 BAD_REQUEST，5xx 归为 BAD_GATEWAY
      const status = resp.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST;
      throw new HttpException(`DeepSeek API error: ${msg}`, status);
    }

    const content: string = json?.choices?.[0]?.message?.content ?? '';
    return { content, usage: json?.usage };
  }
}

