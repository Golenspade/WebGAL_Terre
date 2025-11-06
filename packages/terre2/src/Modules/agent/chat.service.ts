import { Injectable } from '@nestjs/common';
import { LlmClientService, ChatMessage } from './llm-client.service';
import { ChatRequestDto, ChatResponseDto } from './agent.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class ChatService {
  private sessions = new Map<string, ChatMessage[]>();

  constructor(private readonly llm: LlmClientService) {}

  private getOrCreateSession(id?: string): { id: string; history: ChatMessage[] } {
    const sid = id || randomUUID();
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, [
        {
          role: 'system',
          content:
            '你是 WebGAL 脚本编辑助手。回答简洁、具体；如需建议改动，先给出方案与理由，必要时提示“可使用校验/预览/写入工具”，但 MVP 阶段不要自动执行。',
        },
      ]);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { id: sid, history: this.sessions.get(sid)! };
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

    const res = await this.llm.chat(messages);
    const assistant: ChatMessage = { role: 'assistant', content: res.content || '' };
    history.push(assistant);

    return { sessionId: id, role: 'assistant', content: assistant.content, usage: res.usage };
  }
}

