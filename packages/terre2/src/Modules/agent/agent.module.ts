import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentMcpService } from './agent-mcp.service';
import { ChatService } from './chat.service';
import { LlmClientService } from './llm-client.service';
import { ToolCallRetryService } from './tool-call-retry.service';

@Module({
  controllers: [AgentController],
  providers: [
    AgentMcpService,
    ChatService,
    LlmClientService,
    ToolCallRetryService,
  ],
  exports: [AgentMcpService],
})
export class AgentModule {}
