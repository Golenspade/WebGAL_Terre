import { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Button } from '@fluentui/react-components';
import { ChevronDown20Regular, ChevronUp20Regular } from '@fluentui/react-icons';
import type { ToolError } from '@/api/agentClient';
import { agentClient } from '@/api/agentClient';
import styles from './errorBanner.module.scss';

interface ErrorBannerProps {
  error: ToolError;
  onRetry?: () => void;
  retryLabel?: string;
}

export default function ErrorBanner({ error, onRetry, retryLabel }: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const getErrorTitle = (code: string) => {
    const titles: Record<string, string> = {
      E_NOT_FOUND: t`文件未找到`,
      E_BAD_ARGS: t`参数错误`,
      E_CONFLICT: t`冲突`,
      E_TIMEOUT: t`超时`,
      E_DENY_PATH: t`路径禁止`,
      E_FORBIDDEN: t`禁止访问`,
      E_POLICY_VIOLATION: t`策略违规`,
      E_TOO_LARGE: t`文件过大`,
      E_ENCODING: t`编码错误`,
      E_PARSE_FAIL: t`解析失败`,
      E_LINT_FAIL: t`校验失败`,
      E_TOOL_DISABLED: t`工具已禁用`,
      E_PREVIEW_FAIL: t`预览失败`,
      E_INTERNAL: t`内部错误`,
      E_IO: t`IO 错误`,
    };
    return titles[code] || t`错误`;
  };

  // 根据错误码生成上下文相关的建议
  const getContextualHint = (code: string): string | null => {
    const hints: Record<string, string> = {
      E_TOOL_DISABLED: t`该功能未启用。请在 policies.json 中设置 "enabled": true 以启用此功能。`,
      E_POLICY_VIOLATION: t`操作被策略禁止。请检查 policies.json 中的 sandbox.forbiddenDirs 或相关配置。`,
      E_DENY_PATH: t`路径被策略禁止访问。请检查 policies.json 中的 sandbox.forbiddenDirs 配置。`,
      E_FORBIDDEN: t`操作被禁止。请检查 policies.json 中的相关权限配置。`,
      E_TOO_LARGE: t`文件超过大小限制。可在 policies.json 中调整 sandbox.maxReadBytes 参数（当前限制可在运行环境中查看）。`,
    };
    return hints[code] || null;
  };

  const contextualHint = getContextualHint(error.code);
  const [runtimeExtra, setRuntimeExtra] = useState<string | null>(null);
  const displayHint = (error.hint || contextualHint || '') + (runtimeExtra ? ` ${runtimeExtra}` : '');

  useEffect(() => {
    let mounted = true;
    const maybeFetchRuntime = async () => {
      if (error.code === 'E_TOO_LARGE' && !error.hint && expanded) {
        try {
          const info = await agentClient.getRuntimeInfo();
          const max = info?.sandbox?.maxReadBytes;
          if (mounted && typeof max === 'number') {
            setRuntimeExtra(t`（当前 maxReadBytes = ${max}）`);
          }
        } catch {
          // ignore
        }
      }
    };
    void maybeFetchRuntime();
    return () => { mounted = false; };
  }, [expanded, error.code, error.hint]);

  return (
    <div className={styles.errorBanner}>
      <div className={styles.errorHeader}>
        <div className={styles.errorTitle}>
          <span className={styles.errorCode}>{error.code}</span>
          <span className={styles.errorMessage}>{getErrorTitle(error.code)}: {error.message}</span>
        </div>
        {(displayHint || error.details) && (
          <Button
            appearance="subtle"
            icon={expanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
            onClick={() => setExpanded(!expanded)}
            size="small"
          >
            {expanded ? t`收起` : t`详情`}
          </Button>
        )}
        {typeof onRetry === 'function' && (
          <Button
            appearance="subtle"
            size="small"
            onClick={onRetry}
            style={{ marginLeft: 6 }}
          >
            {retryLabel || t`重试`}
          </Button>
        )}
      </div>

      {expanded && (
        <div className={styles.errorDetails}>
          {displayHint && (
            <div className={styles.hint}>
              <strong>{t`建议`}:</strong> {displayHint}
              {typeof onRetry === 'function' && (
                <Button size="small" appearance="subtle" onClick={onRetry} style={{ marginLeft: 6 }}>
                  {retryLabel || t`重试`}
                </Button>
              )}
            </div>
          )}
          {error.details && (
            <div className={styles.details}>
              <strong>{t`详细信息`}:</strong>
              <pre>{JSON.stringify(error.details, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

