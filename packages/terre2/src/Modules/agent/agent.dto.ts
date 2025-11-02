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

