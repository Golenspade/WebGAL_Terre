import { t } from '@lingui/macro';
import type { ValidateScriptResponse } from '@/api/agentClient';
import styles from './validationResults.module.scss';

interface ValidationResultsProps {
  result: ValidateScriptResponse;
}

export default function ValidationResults({ result }: ValidationResultsProps) {
  const getKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      syntax: t`语法错误`,
      resource: t`资源错误`,
      warning: t`警告`,
    };
    return labels[kind] || kind;
  };

  const getKindClass = (kind: string) => {
    return styles[`kind-${kind}`] || styles['kind-warning'];
  };

  return (
    <div className={styles.validationResults}>
      <h3>{result.valid ? t`校验通过` : t`校验失败`}</h3>

      {result.diagnostics.length === 0 ? (
        <p className={styles.success}>{t`未发现问题`}</p>
      ) : (
        <div className={styles.diagnostics}>
          {result.diagnostics.map((diagnostic, index) => (
            <div key={index} className={`${styles.diagnostic} ${getKindClass(diagnostic.kind)}`}>
              <div className={styles.diagnosticHeader}>
                <span className={styles.line}>{t`行`} {diagnostic.line}</span>
                <span className={styles.kind}>{getKindLabel(diagnostic.kind)}</span>
              </div>
              <div className={styles.message}>{diagnostic.message}</div>
              {diagnostic.fixHint && (
                <div className={styles.hint}>
                  <strong>{t`建议`}:</strong> {diagnostic.fixHint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

