import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Res,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AgentMcpService } from './agent-mcp.service';
import { CallToolDto, AgentStatusDto, SetProjectRootDto, ToolDto, ChatRequestDto, ChatResponseDto } from './agent.dto';
import { ChatService } from './chat.service';

@Controller('api/agent')
@ApiTags('Agent')
export class AgentController {
  constructor(private readonly agentMcp: AgentMcpService, private readonly chatSvc: ChatService) {}

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

  @Post('chat')
  @ApiOperation({ summary: 'Chat with LLM (MVP, no tool calls)' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({ status: 200, description: 'Assistant reply', type: ChatResponseDto })
  async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    try {
      return await this.chatSvc.chat(dto);
    } catch (error: any) {
      const message = error?.message || 'Chat failed';
      // 将缺少密钥映射为 503，其它按 502 处理
      const status = message.includes('DEEPSEEK_API_KEY') ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
      throw new HttpException(message, status);
    }
  }

  @Get('chat/stream')
  @ApiOperation({ summary: 'Chat with LLM (SSE: assistant text + tool steps)' })
  @ApiResponse({ status: 200, description: 'SSE event stream' })
  async chatStream(
    @Res() res: Response,
    @Query('sessionId') sessionId?: string,
    @Query('message') message?: string,
    @Query('scenePath') scenePath?: string,
  ): Promise<void> {
    if (!message) {
      throw new HttpException('message is required', HttpStatus.BAD_REQUEST);
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    const emit = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.chatSvc.chatStream(
        {
          sessionId: sessionId || undefined,
          message,
          context: scenePath ? { scenePath } : undefined,
        } as any,
        emit,
      );
    } catch (error: any) {
      const msg = error?.message || 'Chat stream failed';
      emit('error', { message: msg });
    } finally {
      emit('done', {});
      res.end();
    }
  }


  /**
   * Map CONTRACTS.md error codes to HTTP status codes
   * 完整映射所有错误码（包括 CONTRACTS.md 定义的 13 种 + 额外的 I/O 错误）
   */
  private getHttpStatusFromErrorCode(code?: string): number {
    if (!code) return HttpStatus.INTERNAL_SERVER_ERROR;

    // 映射 CONTRACTS.md 错误码到 HTTP 状态码
    const errorCodeMap: Record<string, number> = {
      // 4xx Client Errors
      E_NOT_FOUND: HttpStatus.NOT_FOUND,                    // 404
      E_BAD_ARGS: HttpStatus.BAD_REQUEST,                   // 400
      E_CONFLICT: HttpStatus.CONFLICT,                      // 409
      E_TIMEOUT: HttpStatus.REQUEST_TIMEOUT,                // 408
      E_FORBIDDEN: HttpStatus.FORBIDDEN,                    // 403
      E_POLICY_VIOLATION: HttpStatus.FORBIDDEN,             // 403
      E_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,            // 413
      E_ENCODING: HttpStatus.UNPROCESSABLE_ENTITY,          // 422
      E_PARSE_FAIL: HttpStatus.UNPROCESSABLE_ENTITY,        // 422
      E_LINT_FAIL: HttpStatus.UNPROCESSABLE_ENTITY,         // 422

      // 5xx Server Errors
      E_TOOL_DISABLED: HttpStatus.SERVICE_UNAVAILABLE,      // 503
      E_PREVIEW_FAIL: HttpStatus.INTERNAL_SERVER_ERROR,     // 500
      E_INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,         // 500
      E_IO: HttpStatus.INTERNAL_SERVER_ERROR,               // 500 (I/O 错误)
    };

    return errorCodeMap[code] || HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

