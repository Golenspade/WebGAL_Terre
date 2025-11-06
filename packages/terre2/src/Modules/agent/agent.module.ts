import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentMcpService } from './agent-mcp.service';
import { ChatService } from './chat.service';
import { LlmClientService } from './llm-client.service';

@Module({
  controllers: [AgentController],
  providers: [AgentMcpService, ChatService, LlmClientService],
  exports: [AgentMcpService],
})
export class AgentModule {}

