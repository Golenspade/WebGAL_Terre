import { useState } from 'react';
import { t } from '@lingui/macro';
import { Button, Input, Label } from '@fluentui/react-components';
import { Circle12Filled, ArrowSync20Regular } from '@fluentui/react-icons';
import type { AgentStatusDto } from '@/api/Api';
import styles from './agentHeader.module.scss';

interface AgentHeaderProps {
  status: AgentStatusDto | null;
  loading: boolean;
  error: string | null;
  runtimeMode: 'terre' | 'external';
  onChangeRuntimeMode: (mode: 'terre' | 'external') => void;
  onConnect: (projectRoot: string) => void;
  onDisconnect: () => void;
  onRefreshTools: () => void;
}

export default function AgentHeader({
  status,
  loading,
  error,
  runtimeMode,
  onChangeRuntimeMode,
  onConnect,
  onDisconnect,
  onRefreshTools,
}: AgentHeaderProps) {
  const [projectRootInput, setProjectRootInput] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);

  const handleConnect = () => {
    if (projectRootInput.trim()) {
      onConnect(projectRootInput.trim());
      setShowConnectForm(false);
    }
  };

  const isConnected = status?.running || false;

  return (
    <div className={styles.header}>
      <div className={styles.statusRow}>
        <div className={styles.statusIndicator}>
          <Circle12Filled
            className={isConnected ? styles.statusOnline : styles.statusOffline}
          />
          <span className={styles.statusText}>
            {isConnected ? t`已连接` : t`未连接`}
          </span>
        </div>

        {isConnected && status?.projectRoot && (
          <div className={styles.projectRoot}>
            <Label size="small">{t`项目根`}:</Label>
            <span className={styles.projectRootPath}>{status.projectRoot}</span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {/* 运行模式选择 */}
        <div className={styles.modeSwitch}>
          <span className={styles.modeLabel}>{t`运行模式`}:</span>
          <Button
            size="small"
            appearance={runtimeMode === 'terre' ? 'primary' : 'subtle'}
            onClick={() => onChangeRuntimeMode('terre')}
            disabled={loading}
          >
            {t`Terre 托管`}
          </Button>
          <Button
            size="small"
            appearance={runtimeMode === 'external' ? 'primary' : 'subtle'}
            onClick={() => onChangeRuntimeMode('external')}
            disabled={loading}
          >
            {t`外部 Cline`}
          </Button>
        </div>

        {runtimeMode === 'terre' ? (
          !isConnected ? (
            <>
              {!showConnectForm ? (
                <Button
                  appearance="primary"
                  onClick={() => setShowConnectForm(true)}
                  disabled={loading}
                >
                  {t`连接`}
                </Button>
              ) : (
                <div className={styles.connectForm}>
                  <Input
                    placeholder={t`输入项目根路径`}
                    value={projectRootInput}
                    onChange={(e) => setProjectRootInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConnect();
                      if (e.key === 'Escape') setShowConnectForm(false);
                    }}
                    className={styles.projectRootInput}
                  />
                  <Button
                    appearance="primary"
                    onClick={handleConnect}
                    disabled={!projectRootInput.trim() || loading}
                  >
                    {t`确认`}
                  </Button>
                  <Button
                    onClick={() => setShowConnectForm(false)}
                    disabled={loading}
                  >
                    {t`取消`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <Button
                icon={<ArrowSync20Regular />}
                onClick={onRefreshTools}
                disabled={loading}
                title={t`刷新工具列表`}
              >
                {t`刷新工具`}
              </Button>
              <Button
                onClick={onDisconnect}
                disabled={loading}
              >
                {t`断开`}
              </Button>
            </>
          )
        ) : (
          // 外部模式：隐藏连接/断开，仅提示
          <div className={styles.externalHint}>
            <span>{t`外部 MCP 模式（由 Cline 管理）`}</span>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.error}>
          <span>{error}</span>
        </div>
      )}

      {isConnected && status?.tools && (
        <div className={styles.toolsInfo}>
          <span className={styles.toolsCount}>
            {t`可用工具`}: {status.tools.length}
          </span>
        </div>
      )}
    </div>
  );
}

