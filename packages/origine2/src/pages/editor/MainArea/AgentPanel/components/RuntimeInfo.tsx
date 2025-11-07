import { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import {
  Button,
  Badge,
  Tooltip,
  Spinner,
} from '@fluentui/react-components';
import {
  ChevronDown20Regular,
  ChevronUp20Regular,
  Copy20Regular,
  CheckmarkCircle20Filled,
  ArrowSync20Regular,
} from '@fluentui/react-icons';
import { useRuntimeInfoStore } from '../store/useRuntimeInfoStore';
import ErrorBanner from './ErrorBanner';
import styles from './runtimeInfo.module.scss';

export default function RuntimeInfo() {
  const { info, loading, error, fetchRuntimeInfo } = useRuntimeInfoStore();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  useEffect(() => {
    const doFetch = async () => {
      await fetchRuntimeInfo();
      setLastRefreshedAt(Date.now());
    };
    void doFetch();
  }, []);

  const handleCopyJson = () => {
    if (!info) return;
    
    const json = JSON.stringify(info, null, 2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch((err) => {
        console.error('Failed to copy runtime info:', err);
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading && !info) {
    return (
      <div className={styles.runtimeInfo}>
        <div className={styles.loading}>
          <Spinner size="tiny" />
          <span>{t`加载运行环境...`}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.runtimeInfo}>
        <ErrorBanner error={error} />
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className={styles.runtimeInfo}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>{t`运行环境`}</span>
          <Badge appearance="tint" size="small">
            {info.tools.length} {t`工具`}
          </Badge>
        </div>
        <div className={styles.actions}>
          <Tooltip content={copied ? t`已复制!` : t`复制策略 JSON`} relationship="label">
            <Button
              icon={copied ? <CheckmarkCircle20Filled /> : <Copy20Regular />}
              size="small"
              appearance="subtle"
              onClick={handleCopyJson}
            >
              {t`复制策略`}
            </Button>
          </Tooltip>
          <Tooltip content={lastRefreshedAt ? t`最近刷新：${new Date(lastRefreshedAt).toLocaleString()}` : t`刷新`} relationship="label">
            <Button
              icon={<ArrowSync20Regular />}
              size="small"
              appearance="subtle"
              onClick={async () => { await fetchRuntimeInfo(); setLastRefreshedAt(Date.now()); }}
            >
              {t`刷新`}
            </Button>
          </Tooltip>
          <Button
            icon={expanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
            size="small"
            appearance="subtle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t`收起` : t`详情`}
          </Button>
        </div>
      </div>

      <div className={styles.summary}>
        {/* Sandbox */}
        <div className={styles.badge}>
          <Badge appearance="outline" size="small">
            {t`Sandbox`}: {info.sandbox.textEncoding}, {formatBytes(info.sandbox.maxReadBytes)}
            {info.sandbox.forbiddenDirs.length > 0 && `, ${info.sandbox.forbiddenDirs.length} ${t`禁止目录`}`}
          </Badge>
        </div>

        {/* Execution */}
        {info.execution ? (
          <div className={styles.badge}>
            <Badge appearance="tint" color="success" size="small">
              {t`Exec`}: {t`开启`} ({info.execution.allowedCommands.length} {t`命令`})
            </Badge>
          </div>
        ) : (
          <div className={styles.badge}>
            <Badge appearance="outline" color="subtle" size="small">
              {t`Exec`}: {t`关闭`}
            </Badge>
          </div>
        )}

        {/* Browser */}
        {info.browser ? (
          <div className={styles.badge}>
            <Badge appearance="tint" color="informative" size="small">
              {t`Browser`}: {t`开启`} ({info.browser.allowedHosts.length} {t`域名`})
            </Badge>
          </div>
        ) : (
          <div className={styles.badge}>
            <Badge appearance="outline" color="subtle" size="small">
              {t`Browser`}: {t`关闭`}
            </Badge>
          </div>
        )}

        {/* Retention */}
        <div className={styles.badge}>
          <Badge appearance="outline" size="small">
            {t`Retention`}: {info.snapshotRetention}
          </Badge>
        </div>
      </div>

      {expanded && (
        <div className={styles.details}>
          <div className={styles.section}>
            <h4>{t`项目根目录`}</h4>
            <code>{info.projectRoot}</code>
          </div>

          <div className={styles.section}>
            <h4>{t`沙箱配置`}</h4>
            <ul>
              <li>{t`编码`}: <code>{info.sandbox.textEncoding}</code></li>
              <li>{t`最大读取`}: <code>{formatBytes(info.sandbox.maxReadBytes)}</code></li>
              {info.sandbox.forbiddenDirs.length > 0 && (
                <li>
                  {t`禁止目录`}: <code>{info.sandbox.forbiddenDirs.join(', ')}</code>
                </li>
              )}
            </ul>
          </div>

          {info.execution && (
            <div className={styles.section}>
              <h4>{t`命令执行`}</h4>
              <ul>
                <li>{t`超时`}: <code>{info.execution.timeoutMs}ms</code></li>
                <li>{t`允许命令`}: <code>{info.execution.allowedCommands.join(', ')}</code></li>
                {info.execution.workingDir && (
                  <li>{t`工作目录`}: <code>{info.execution.workingDir}</code></li>
                )}
              </ul>
            </div>
          )}

          {info.browser && (
            <div className={styles.section}>
              <h4>{t`浏览器`}</h4>
              <ul>
                <li>{t`超时`}: <code>{info.browser.timeoutMs}ms</code></li>
                <li>{t`允许主机`}: <code>{info.browser.allowedHosts.join(', ')}</code></li>
                {info.browser.screenshotDir && (
                  <li>{t`截图目录`}: <code>{info.browser.screenshotDir}</code></li>
                )}
              </ul>
            </div>
          )}

          <div className={styles.section}>
            <h4>{t`可用工具`} ({info.tools.length})</h4>
            <div className={styles.toolsList}>
              {info.tools.map((tool) => (
                <Badge key={tool} appearance="outline" size="small">
                  {tool}
                </Badge>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <h4>{t`服务器信息`}</h4>
            <ul>
              <li>{t`名称`}: <code>{info.server.name}</code></li>
              <li>{t`版本`}: <code>{info.server.version}</code></li>
            </ul>
          </div>

          {(info.policiesPath || info.lock) && (
            <div className={styles.section}>
              <h4>{t`策略与锁`}</h4>
              <ul>
                {info.policiesPath && (
                  <li>{t`策略文件`}: <code>{info.policiesPath}</code></li>
                )}
                {info.lock && (
                  <li>
                    {t`锁`}: <code>{info.lock.owner || 'unknown'}</code>
                    {typeof info.lock.startedAt === 'number' && (
                      <> {t`于`} <code>{new Date(info.lock.startedAt).toLocaleString()}</code></>
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

