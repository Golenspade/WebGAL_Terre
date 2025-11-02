import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentMcpService } from './agent-mcp.service';

@Module({
  controllers: [AgentController],
  providers: [AgentMcpService],
  exports: [AgentMcpService],
})
export class AgentModule {}

