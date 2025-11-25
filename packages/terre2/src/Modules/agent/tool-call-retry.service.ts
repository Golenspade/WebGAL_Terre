import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage, ToolCall } from './llm-client.service';

/**
 * 工具调用重试配置
 */
export interface ToolCallRetryConfig {
  /** 最大重试次数 (默认 2) */
  maxRetries: number;
  /** 重试前的基础延迟毫秒数 (默认 500) */
  retryDelayMs: number;
  /** 是否启用智能检测 (检测用户意图是否需要工具) */
  enableSmartDetection: boolean;
}

/**
 * 重试结果
 */
export interface RetryResult {
  /** 是否应该重试 */
  shouldRetry: boolean;
  /** 重试原因 */
  reason?: string;
  /** 附加到消息历史的提示消息 */
  nudgeMessage?: ChatMessage;
}

/**
 * 重试上下文 - 跟踪重试状态
 */
export interface RetryContext {
  /** 当前重试次数 */
  attemptCount: number;
  /** 原始用户消息 */
  originalMessage: string;
  /** 之前失败的原因 */
  previousReasons: string[];
}

/**
 * 用于检测用户意图是否需要工具调用的关键词模式
 */
const TOOL_INTENT_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // 文件操作意图
  {
    pattern:
      /(?:列出|显示|查看|列一下|看看|list).{0,10}(?:文件|目录|资源|场景|脚本)/i,
    description: 'list files',
  },
  {
    pattern:
      /(?:读取|读一下|打开|查看|看看|read).{0,10}(?:文件|内容|脚本|场景)/i,
    description: 'read file',
  },
  {
    pattern: /(?:写入|写|修改|更新|编辑|创建|新建|write|edit|create)/i,
    description: 'write file',
  },
  {
    pattern: /(?:搜索|查找|找|搜|search|find).{0,10}(?:文件|内容|关键字)/i,
    description: 'search files',
  },

  // 脚本验证意图
  {
    pattern: /(?:验证|检查|校验|validate|check).{0,10}(?:脚本|语法|格式)/i,
    description: 'validate script',
  },

  // 项目信息意图
  {
    pattern: /(?:项目|游戏).{0,10}(?:信息|状态|配置)/i,
    description: 'project info',
  },
  {
    pattern: /(?:运行时|runtime).{0,10}(?:信息|状态)/i,
    description: 'runtime info',
  },

  // 快照相关
  {
    pattern: /(?:快照|snapshot|回滚|rollback|恢复|restore)/i,
    description: 'snapshot operations',
  },
];

/**
 * 渐进式重试提示模板
 */
const RETRY_NUDGE_TEMPLATES: string[] = [
  '请使用可用的工具来完成这个任务。你可以调用 {suggestedTools} 等工具来获取所需信息。',
  '我注意到你没有使用工具。请直接调用相关工具（如 {suggestedTools}）来执行操作，而不是仅给出文字建议。',
  '这个任务需要使用工具来完成。请使用 tool_calls 来调用 {suggestedTools}，我会帮你执行。',
];

@Injectable()
export class ToolCallRetryService {
  private readonly logger = new Logger(ToolCallRetryService.name);

  private readonly defaultConfig: ToolCallRetryConfig = {
    maxRetries: 2,
    retryDelayMs: 500,
    enableSmartDetection: true,
  };

  /**
   * 创建新的重试上下文
   */
  createContext(originalMessage: string): RetryContext {
    return {
      attemptCount: 0,
      originalMessage,
      previousReasons: [],
    };
  }

  /**
   * 分析是否需要重试
   *
   * @param context 重试上下文
   * @param toolCalls LLM 返回的工具调用
   * @param availableTools 可用的工具列表
   * @param config 重试配置 (可选)
   */
  analyzeRetry(
    context: RetryContext,
    toolCalls: ToolCall[] | undefined,
    availableTools: Array<{ name: string; description?: string }>,
    config: Partial<ToolCallRetryConfig> = {},
  ): RetryResult {
    const cfg = { ...this.defaultConfig, ...config };

    // 已经有工具调用，不需要重试
    if (toolCalls && toolCalls.length > 0) {
      this.logger.debug(
        `LLM produced ${toolCalls.length} tool call(s), no retry needed`,
      );
      return { shouldRetry: false };
    }

    // 达到最大重试次数
    if (context.attemptCount >= cfg.maxRetries) {
      this.logger.debug(`Max retries (${cfg.maxRetries}) reached, stopping`);
      return {
        shouldRetry: false,
        reason: `已达到最大重试次数 (${cfg.maxRetries})`,
      };
    }

    // 没有可用工具，不需要重试
    if (!availableTools || availableTools.length === 0) {
      this.logger.debug('No tools available, cannot retry');
      return { shouldRetry: false };
    }

    // 智能检测：分析用户意图是否需要工具
    if (cfg.enableSmartDetection) {
      const intentAnalysis = this.analyzeUserIntent(
        context.originalMessage,
        availableTools,
      );

      if (!intentAnalysis.needsTool) {
        this.logger.debug('User intent does not require tool usage');
        return { shouldRetry: false };
      }

      // 需要工具但 LLM 没有调用，准备重试
      const reason = `检测到 "${intentAnalysis.detectedIntent}" 意图，但 LLM 未调用工具`;
      context.previousReasons.push(reason);
      context.attemptCount++;

      const nudgeMessage = this.buildNudgeMessage(
        context.attemptCount,
        intentAnalysis.suggestedTools,
      );

      this.logger.log(`Retry #${context.attemptCount}: ${reason}`);

      return {
        shouldRetry: true,
        reason,
        nudgeMessage,
      };
    }

    // 非智能模式：只要没有工具调用就重试
    context.attemptCount++;
    const reason = `LLM 未产生工具调用 (尝试 ${context.attemptCount}/${cfg.maxRetries})`;
    context.previousReasons.push(reason);

    const nudgeMessage = this.buildNudgeMessage(
      context.attemptCount,
      availableTools.slice(0, 3).map((t) => t.name),
    );

    this.logger.log(`Retry #${context.attemptCount}: ${reason}`);

    return {
      shouldRetry: true,
      reason,
      nudgeMessage,
    };
  }

  /**
   * 分析用户意图
   */
  private analyzeUserIntent(
    message: string,
    availableTools: Array<{ name: string; description?: string }>,
  ): { needsTool: boolean; detectedIntent?: string; suggestedTools: string[] } {
    const toolNames = availableTools.map((t) => t.name);
    const suggestedTools: string[] = [];
    let detectedIntent: string | undefined;

    for (const { pattern, description } of TOOL_INTENT_PATTERNS) {
      if (pattern.test(message)) {
        detectedIntent = description;

        // 根据意图推荐相关工具
        if (description.includes('list')) {
          if (toolNames.includes('list_files'))
            suggestedTools.push('list_files');
          if (toolNames.includes('list_project_resources'))
            suggestedTools.push('list_project_resources');
        }
        if (description.includes('read')) {
          if (toolNames.includes('read_file')) suggestedTools.push('read_file');
        }
        if (description.includes('write') || description.includes('edit')) {
          if (toolNames.includes('write_to_file'))
            suggestedTools.push('write_to_file');
          if (toolNames.includes('replace_in_file'))
            suggestedTools.push('replace_in_file');
        }
        if (description.includes('search')) {
          if (toolNames.includes('search_files'))
            suggestedTools.push('search_files');
        }
        if (description.includes('validate')) {
          if (toolNames.includes('validate_script'))
            suggestedTools.push('validate_script');
        }
        if (
          description.includes('snapshot') ||
          description.includes('rollback')
        ) {
          if (toolNames.includes('list_snapshots'))
            suggestedTools.push('list_snapshots');
          if (toolNames.includes('restore_snapshot'))
            suggestedTools.push('restore_snapshot');
        }
        if (description.includes('runtime')) {
          if (toolNames.includes('get_runtime_info'))
            suggestedTools.push('get_runtime_info');
        }

        break; // 只匹配第一个意图
      }
    }

    // 如果没有检测到明确意图，检查是否提到了任何工具名
    if (!detectedIntent) {
      const mentionedTools = toolNames.filter(
        (name) =>
          message
            .toLowerCase()
            .includes(name.toLowerCase().replace(/_/g, ' ')) ||
          message.toLowerCase().includes(name.toLowerCase()),
      );
      if (mentionedTools.length > 0) {
        detectedIntent = 'explicit tool mention';
        suggestedTools.push(...mentionedTools);
      }
    }

    // 去重
    const uniqueTools = [...new Set(suggestedTools)];

    return {
      needsTool: !!detectedIntent,
      detectedIntent,
      suggestedTools:
        uniqueTools.length > 0 ? uniqueTools : toolNames.slice(0, 3),
    };
  }

  /**
   * 构建重试提示消息
   */
  private buildNudgeMessage(
    attemptCount: number,
    suggestedTools: string[],
  ): ChatMessage {
    const templateIndex = Math.min(
      attemptCount - 1,
      RETRY_NUDGE_TEMPLATES.length - 1,
    );
    const template = RETRY_NUDGE_TEMPLATES[templateIndex];

    const toolList = suggestedTools.slice(0, 3).join('、');
    const content = template.replace('{suggestedTools}', toolList);

    return {
      role: 'user',
      content: `[系统提示] ${content}`,
    };
  }

  /**
   * 获取重试延迟时间 (指数退避)
   */
  getRetryDelay(attemptCount: number, baseDelayMs = 500): number {
    // 指数退避: 500ms, 1000ms, 2000ms, ...
    return baseDelayMs * Math.pow(2, attemptCount - 1);
  }

  /**
   * 等待重试延迟
   */
  async waitForRetry(attemptCount: number, baseDelayMs = 500): Promise<void> {
    const delay = this.getRetryDelay(attemptCount, baseDelayMs);
    this.logger.debug(`Waiting ${delay}ms before retry #${attemptCount}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * 生成重试摘要（用于日志和调试）
   */
  generateRetrySummary(context: RetryContext): string {
    if (context.attemptCount === 0) {
      return '无重试';
    }
    return `重试 ${context.attemptCount} 次: ${context.previousReasons.join(
      ' → ',
    )}`;
  }
}
