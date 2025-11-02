import { useState } from 'react';
import { t } from '@lingui/macro';
import { Button } from '@fluentui/react-components';
import { ChevronDown20Regular, ChevronUp20Regular } from '@fluentui/react-icons';
import type { ToolError } from '@/api/agentClient';
import styles from './errorBanner.module.scss';

interface ErrorBannerProps {
  error: ToolError;
}

export default function ErrorBanner({ error }: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const getErrorTitle = (code: string) => {
    const titles: Record<string, string> = {
      E_NOT_FOUND: t`文件未找到`,
      E_BAD_ARGS: t`参数错误`,
      E_CONFLICT: t`冲突`,
      E_TIMEOUT: t`超时`,
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

  return (
    <div className={styles.errorBanner}>
      <div className={styles.errorHeader}>
        <div className={styles.errorTitle}>
          <span className={styles.errorCode}>{error.code}</span>
          <span className={styles.errorMessage}>{getErrorTitle(error.code)}: {error.message}</span>
        </div>
        {(error.hint || error.details) && (
          <Button
            appearance="subtle"
            icon={expanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
            onClick={() => setExpanded(!expanded)}
            size="small"
          >
            {expanded ? t`收起` : t`详情`}
          </Button>
        )}
      </div>

      {expanded && (
        <div className={styles.errorDetails}>
          {error.hint && (
            <div className={styles.hint}>
              <strong>{t`建议`}:</strong> {error.hint}
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

