import { t } from '@lingui/macro';
import { useAgentResultsStore } from '../store/useAgentResultsStore';
import DiffViewer from './DiffViewer';
import ErrorBanner from './ErrorBanner';
import ValidationResults from './ValidationResults';
import ResourcesList from './ResourcesList';
import styles from './agentResults.module.scss';

export default function AgentResults() {
  const { result, error } = useAgentResultsStore();

  if (!result && !error) {
    return null;
  }

  return (
    <div className={styles.results}>
      {error && <ErrorBanner error={error} />}

      {result && (
        <div className={styles.resultContent}>
          {result.type === 'read' && (
            <div className={styles.readResult}>
              <h3>{t`文件已读取`}</h3>
              <p>{t`大小`}: {result.data.bytes} bytes</p>
              <p>{t`编码`}: {result.data.encoding}</p>
            </div>
          )}

          {result.type === 'diff' && (
            <div className={styles.diffResult}>
              <h3>{t`Dry-run 预览`}</h3>
              {result.data.diff && <DiffViewer diff={result.data.diff} />}
            </div>
          )}

          {result.type === 'apply' && (
            <div className={styles.applyResult}>
              <h3>{t`写入成功`}</h3>
              <p>{t`快照 ID`}: {result.data.snapshotId}</p>
              <p>{t`写入字节`}: {result.data.bytesWritten}</p>
            </div>
          )}

          {result.type === 'validate' && (
            <ValidationResults result={result.data} />
          )}

          {result.type === 'resources' && (
            <ResourcesList resources={result.data} />
          )}
        </div>
      )}
    </div>
  );
}

