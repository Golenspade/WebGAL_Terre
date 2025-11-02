import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AgentMcpService } from './agent-mcp.service';
import { CallToolDto, AgentStatusDto, SetProjectRootDto, ToolDto } from './agent.dto';

@Controller('api/agent')
@ApiTags('Agent')
export class AgentController {
  constructor(private readonly agentMcp: AgentMcpService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get Agent MCP status' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current MCP status',
    type: AgentStatusDto,
  })
  getStatus(): AgentStatusDto {
    const status = this.agentMcp.getStatus();
    return {
      running: status.running,
      projectRoot: status.projectRoot || undefined,
      tools: status.tools,
    };
  }

  @Post('start')
  @ApiOperation({ summary: 'Start MCP with project root' })
  @ApiBody({ type: SetProjectRootDto })
  @ApiResponse({
    status: 200,
    description: 'MCP started successfully',
  })
  async start(@Body() dto: SetProjectRootDto): Promise<{ success: boolean }> {
    try {
      await this.agentMcp.start(dto.projectRoot, {
        enableExec: dto.enableExec || false,
        enableBrowser: dto.enableBrowser || false,
      });
      return { success: true };
    } catch (error) {
      throw new HttpException(
        `Failed to start MCP: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('stop')
  @ApiOperation({ summary: 'Stop MCP' })
  @ApiResponse({
    status: 200,
    description: 'MCP stopped successfully',
  })
  async stop(): Promise<{ success: boolean }> {
    try {
      await this.agentMcp.stop();
      return { success: true };
    } catch (error) {
      throw new HttpException(
        `Failed to stop MCP: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('tools')
  @ApiOperation({ summary: 'List available tools' })
  @ApiResponse({
    status: 200,
    description: 'Returns the list of available tools',
    type: [ToolDto],
  })
  async listTools(): Promise<ToolDto[]> {
    return this.agentMcp.listTools();
  }

  @Post('call')
  @ApiOperation({ summary: 'Call a tool' })
  @ApiBody({ type: CallToolDto })
  @ApiResponse({
    status: 200,
    description: 'Tool call result',
  })
  async callTool(@Body() dto: CallToolDto): Promise<any> {
    try {
      const result = await this.agentMcp.callTool(dto.name, dto.args);
      return result;
    } catch (error) {
      // 透传 MCP 工具错误的详细信息
      const statusCode = this.getHttpStatusFromErrorCode(error.code);
      throw new HttpException(
        {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
        },
        statusCode,
      );
    }
  }

  private getHttpStatusFromErrorCode(code?: string): number {
    if (!code) return HttpStatus.INTERNAL_SERVER_ERROR;

    // 映射 CONTRACTS.md 错误码到 HTTP 状态码
    const errorCodeMap: Record<string, number> = {
      E_NOT_FOUND: HttpStatus.NOT_FOUND,
      E_BAD_ARGS: HttpStatus.BAD_REQUEST,
      E_CONFLICT: HttpStatus.CONFLICT,
      E_TIMEOUT: HttpStatus.REQUEST_TIMEOUT,
      E_FORBIDDEN: HttpStatus.FORBIDDEN,
      E_POLICY_VIOLATION: HttpStatus.FORBIDDEN,
      E_TOOL_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,
      E_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
      E_ENCODING: HttpStatus.UNPROCESSABLE_ENTITY,
      E_PARSE_FAIL: HttpStatus.UNPROCESSABLE_ENTITY,
      E_LINT_FAIL: HttpStatus.UNPROCESSABLE_ENTITY,
      E_PREVIEW_FAIL: HttpStatus.INTERNAL_SERVER_ERROR,
      E_INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
    };

    return errorCodeMap[code] || HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

