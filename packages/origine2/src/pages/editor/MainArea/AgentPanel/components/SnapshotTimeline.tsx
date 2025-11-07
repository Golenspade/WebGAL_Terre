import { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import {
  Button,
  Input,
  Label,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowSync20Regular,
  Copy20Regular,
  CheckmarkCircle20Filled,
} from '@fluentui/react-icons';
import { useSnapshotsStore } from '../store/useSnapshotsStore';
import DiffViewer from './DiffViewer';
import ErrorBanner from './ErrorBanner';
import styles from './snapshotTimeline.module.scss';

export default function SnapshotTimeline({ runtimeMode }: { runtimeMode?: 'terre' | 'external' }) {
  const {
    snapshots,
    loading,
    error,
    filters,
    selectedId,
    restoreState,
    restoring,
    applyLoading,
    setFilters,
    fetchSnapshots,
    restoreSnapshot,
    applyRestore,
    retryDryRun,
    clearRestore,
    copySnapshotId,
  } = useSnapshotsStore();

  const [pathFilter, setPathFilter] = useState(filters.path || '');
  const [limitInput, setLimitInput] = useState(String(filters.limit));
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 初始加载
  useEffect(() => {
    fetchSnapshots();
  }, []);

  // 处理过滤器应用
  const handleApplyFilters = () => {
    const limit = parseInt(limitInput, 10);
    setFilters({
      path: pathFilter.trim() || undefined,
      limit: isNaN(limit) || limit < 1 ? 50 : Math.min(limit, 1000),
    });
  };

  // 处理快照选择（并发安全：进行中时禁止切换）
  const handleSelectSnapshot = async (snapshotId: string) => {
    if (restoring || applyLoading) return;
    if (selectedId === snapshotId) {
      clearRestore();
    } else {
      await restoreSnapshot(snapshotId);
    }
  };

  // 处理应用恢复
  const handleApply = async () => {
    const key = idempotencyKey || `restore-${Date.now()}`;
    setIdempotencyKey(key);
    await applyRestore(key);
  };

  // 处理复制 ID
  const handleCopyId = (id: string) => {
    copySnapshotId(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={styles.timeline}>
      {/* 过滤器 */}
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <div className={styles.filterField}>
            <Label size="small">{t`路径过滤`}</Label>
            <Input
              placeholder={t`例如: game/scene`}
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              className={styles.pathInput}
            />
            <span className={styles.hint}>{t`POSIX 格式前缀匹配，大小写敏感`}</span>
          </div>

          <div className={styles.filterField}>
            <Label size="small">{t`数量限制`}</Label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
              className={styles.limitInput}
            />
            <span className={styles.hint}>{t`默认 50，最大 1000`}</span>
          </div>

          <div className={styles.filterActions}>
            <Button
              appearance="primary"
              onClick={handleApplyFilters}
              disabled={loading}
            >
              {t`应用过滤`}
            </Button>
            <Button
              icon={<ArrowSync20Regular />}
              onClick={fetchSnapshots}
              disabled={loading}
            >
              {t`刷新`}
            </Button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className={styles.errorSection}>
          <ErrorBanner error={error} />
          {error.code === 'E_CONFLICT' && restoreState && (
            <Button
              appearance="secondary"
              onClick={retryDryRun}
              disabled={restoring}
              className={styles.retryButton}
            >
              {t`重新 Dry-run`}
            </Button>
          )}
        </div>
      )}

      {/* 加载状态 */}
      {loading && !snapshots.length && (
        <div className={styles.loading}>
          <Spinner label={t`加载快照...`} />
        </div>
      )}

      {/* 快照列表 */}
      {!loading && snapshots.length === 0 && (
        <div className={styles.empty}>
          <p>{t`暂无快照`}</p>
          <p className={styles.hint}>
            {filters.path
              ? t`尝试调整路径过滤条件`
              : t`执行写入操作后会自动创建快照`}
          </p>
        </div>
      )}

      {snapshots.length > 0 && (
        <div className={styles.list}>
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className={`${styles.snapshotItem} ${
                selectedId === snapshot.id ? styles.selected : ''
              }`}
              onClick={() => handleSelectSnapshot(snapshot.id)}
            >
              <div className={styles.snapshotHeader}>
                <div className={styles.snapshotId}>
                  <code>{snapshot.id}</code>
                  <Tooltip content={copiedId === snapshot.id ? t`已复制!` : t`复制 ID`} relationship="label">
                    <Button
                      icon={copiedId === snapshot.id ? <CheckmarkCircle20Filled /> : <Copy20Regular />}
                      size="small"
                      appearance="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyId(snapshot.id);
                      }}
                    />
                  </Tooltip>
                </div>
                <div className={styles.snapshotTime}>
                  {formatTimestamp(snapshot.timestamp)}
                </div>
              </div>

              <div className={styles.snapshotInfo}>
                <div className={styles.snapshotPath}>
                  <Label size="small">{t`路径`}:</Label>
                  <code>{snapshot.path}</code>
                </div>
                <div className={styles.snapshotHash}>
                  <Label size="small">{t`哈希`}:</Label>
                  <code>{snapshot.contentHash}</code>
                </div>
                {snapshot.idempotencyKey && (
                  <div className={styles.snapshotKey}>
                    <Label size="small">{t`幂等键`}:</Label>
                    <code>{snapshot.idempotencyKey}</code>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 恢复预览区 */}
      {restoreState && (
        <div className={styles.restoreSection}>
          <div className={styles.restoreHeader}>
            <h3>{t`恢复预览`}</h3>
            <Button
              appearance="subtle"
              onClick={clearRestore}
              disabled={restoring || applyLoading}
            >
              {t`取消`}
            </Button>
          </div>

          <div className={styles.restoreInfo}>
            <p>
              <Label>{t`快照 ID`}:</Label> <code>{restoreState.snapshotId}</code>
            </p>
            <p>
              <Label>{t`文件路径`}:</Label> <code>{restoreState.path}</code>
            </p>
          </div>

          {restoring && (
            <div className={styles.loading}>
              <Spinner label={t`正在生成 Diff...`} />
            </div>
          )}

          {restoreState.diff && !restoring && (
            <>
              <div className={styles.diffSection}>
                <h4>{t`变更预览`}</h4>
                <DiffViewer diff={restoreState.diff} />
              </div>

              {!restoreState.applied && (
                <div className={styles.applySection}>
                  <Button
                    appearance="primary"
                    onClick={handleApply}
                    disabled={applyLoading || runtimeMode === 'external'}
                  >
                    {applyLoading ? t`应用中...` : runtimeMode === 'external' ? t`只读模式（禁用）` : t`确认恢复`}
                  </Button>
                  {runtimeMode === 'external' && (
                    <div className={styles.hint}>
                      {t`外部 Cline 模式：这里仅预览 Diff，回滚应用被禁用以避免竞态。`}
                    </div>
                  )}
                </div>
              )}

              {restoreState.applied && restoreState.newSnapshotId && (
                <div className={styles.successSection}>
                  <p className={styles.successMessage}>
                    ✅ {t`恢复成功！`}
                  </p>
                  <div className={styles.newSnapshotId}>
                    <Label>{t`新快照 ID`}:</Label>
                    <code>{restoreState.newSnapshotId}</code>
                    <Tooltip content={copiedId === restoreState.newSnapshotId ? t`已复制!` : t`复制 ID`} relationship="label">
                      <Button
                        icon={copiedId === restoreState.newSnapshotId ? <CheckmarkCircle20Filled /> : <Copy20Regular />}
                        size="small"
                        appearance="subtle"
                        onClick={() => handleCopyId(restoreState.newSnapshotId!)}
                      />
                    </Tooltip>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

