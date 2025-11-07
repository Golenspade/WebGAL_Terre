import { ApiProperty } from '@nestjs/swagger';

export class CallToolDto {
  @ApiProperty({ description: 'Tool name to call' })
  name: string;

  @ApiProperty({ description: 'Tool arguments', required: false })
  args?: any;
}

export class ToolDto {
  @ApiProperty({ description: 'Tool name' })
  name: string;

  @ApiProperty({ description: 'Tool description', required: false })
  description?: string;

  @ApiProperty({ description: 'Tool input schema', required: false })
  inputSchema?: any;
}

export class AgentStatusDto {
  @ApiProperty({ description: 'Whether MCP is running' })
  running: boolean;

  @ApiProperty({ description: 'Current project root', required: false })
  projectRoot?: string;

  @ApiProperty({ description: 'Available tools', type: [ToolDto] })
  tools: ToolDto[];
}

export class SetProjectRootDto {
  @ApiProperty({ description: 'Project root directory' })
  projectRoot: string;

  @ApiProperty({ description: 'Enable execution capability', required: false, default: false })
  enableExec?: boolean;

  @ApiProperty({ description: 'Enable browser capability', required: false, default: false })
  enableBrowser?: boolean;
}

export class ChatRequestDto {
  @ApiProperty({ description: 'Existing session id (optional)', required: false })
  sessionId?: string;

  @ApiProperty({ description: 'User message' })
  message: string;

  @ApiProperty({ description: 'Optional context info', required: false })
  context?: { scenePath?: string };
}

export class ChatStepErrorDto {
  @ApiProperty({ required: false }) code?: string;
  @ApiProperty() message: string;
  @ApiProperty({ required: false }) hint?: string;
  @ApiProperty({ required: false }) details?: any;
}

export class ChatStepDto {
  @ApiProperty() name: string;
  @ApiProperty({ required: false }) args?: any;
  @ApiProperty({ required: false, description: 'Whether the step was blocked (e.g., write/restore requires confirmation)' }) blocked?: boolean;
  @ApiProperty({ required: false, description: 'Short human-readable summary of result or error' }) summary?: string;
  @ApiProperty({ required: false, type: ChatStepErrorDto }) error?: ChatStepErrorDto;
}

export class ChatResponseDto {
  @ApiProperty({ description: 'Session id' })
  sessionId: string;

  @ApiProperty({ description: 'Assistant role' })
  role: 'assistant';

  @ApiProperty({ description: 'Assistant reply content' })
  content: string;

  @ApiProperty({ description: 'Structured tool call steps (optional)', required: false, type: [ChatStepDto] })
  steps?: ChatStepDto[];

  @ApiProperty({ description: 'LLM usage info', required: false })
  usage?: any;
}
