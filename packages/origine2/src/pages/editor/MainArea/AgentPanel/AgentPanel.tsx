import { useState, useEffect } from 'react';
import styles from './agentPanel.module.scss';
import { t } from '@lingui/macro';
import { Button, Spinner } from '@fluentui/react-components';
import { agentClient } from '@/api/agentClient';
import type { AgentStatusDto } from '@/api/Api';
import { useGameEditorContext } from '@/store/useGameEditorStore';
import AgentHeader from './components/AgentHeader';
import AgentActions from './components/AgentActions';
import AgentResults from './components/AgentResults';

export default function AgentPanel() {
  const currentTag = useGameEditorContext((state) => state.currentTag);
  const [status, setStatus] = useState<AgentStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动连接策略：进入 Agent 模式时尝试获取状态
  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const statusData = await agentClient.getStatus();
      setStatus(statusData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to get agent status:', err);
      setStatus({ running: false, tools: [] });
      setError(null); // 不显示错误，只是标记为未连接
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (projectRoot: string) => {
    try {
      setLoading(true);
      setError(null);
      await agentClient.start({ projectRoot, enableExec: false, enableBrowser: false });
      await checkStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to start MCP');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      setError(null);
      await agentClient.stop();
      await checkStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to stop MCP');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshTools = async () => {
    await checkStatus();
  };

  if (loading && !status) {
    return (
      <div className={styles.agentPanel}>
        <div className={styles.loading}>
          <Spinner label={t`正在连接...`} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.agentPanel}>
      <AgentHeader
        status={status}
        loading={loading}
        error={error}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onRefreshTools={handleRefreshTools}
      />

      {status?.running ? (
        <>
          <AgentActions
            projectRoot={status.projectRoot || ''}
            currentScene={currentTag?.name}
          />
          <AgentResults />
        </>
      ) : (
        <div className={styles.placeholder}>
          <p>{t`请先连接到项目`}</p>
          <p>{t`点击上方"连接"按钮开始`}</p>
        </div>
      )}
    </div>
  );
}

