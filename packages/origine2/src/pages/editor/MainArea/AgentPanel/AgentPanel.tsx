import { useState, useEffect } from 'react';
import styles from './agentPanel.module.scss';
import { t } from '@lingui/macro';
import { Button, Spinner, Tab, TabList } from '@fluentui/react-components';
import { agentClient } from '@/api/agentClient';
import type { AgentStatusDto } from '@/api/Api';
import { useGameEditorContext } from '@/store/useGameEditorStore';
import AgentHeader from './components/AgentHeader';
import AgentActions from './components/AgentActions';
import AgentResults from './components/AgentResults';
import SnapshotTimeline from './components/SnapshotTimeline';
import RuntimeInfo from './components/RuntimeInfo';
import ChatPanel from './components/ChatPanel';

export default function AgentPanel() {
  const currentTag = useGameEditorContext((state) => state.currentTag);
  const [status, setStatus] = useState<AgentStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workspace' | 'chat' | 'snapshots'>('workspace');
  const [runtimeMode, setRuntimeMode] = useState<'terre' | 'external'>(() => {
    try {
      const raw = localStorage.getItem('webgal.agent.runmode');
      if (raw === 'external' || raw === 'terre') return raw;
    } catch {}
    return 'terre';
  });

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

  useEffect(() => {
    try { localStorage.setItem('webgal.agent.runmode', runtimeMode); } catch {}
  }, [runtimeMode]);

  const handleConnect = async (projectRoot: string) => {
    if (runtimeMode !== 'terre') {
      setError(t`当前为“外部 Cline”模式，Terre 不会启动 MCP。`);
      return;
    }
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
        runtimeMode={runtimeMode}
        onChangeRuntimeMode={setRuntimeMode}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onRefreshTools={handleRefreshTools}
      />

      {status?.running ? (
        <>
          <RuntimeInfo />

          <div className={styles.tabs}>
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_, data) => setActiveTab(data.value as 'workspace' | 'chat' | 'snapshots')}
            >
              <Tab value="workspace">{t`工作区`}</Tab>
              <Tab value="chat">{t`对话`}</Tab>
              <Tab value="snapshots">{t`快照时间线`}</Tab>
            </TabList>
          </div>

          {activeTab === 'workspace' ? (
            <>
              <AgentActions
                projectRoot={status.projectRoot || ''}
                currentScene={currentTag?.name}
              />
              <AgentResults />
            </>
          ) : activeTab === 'chat' ? (
            <ChatPanel />
          ) : (
            <SnapshotTimeline runtimeMode={runtimeMode} />
          )}
        </>
      ) : (
        <div className={styles.placeholder}>
          {runtimeMode === 'terre' ? (
            <>
              <p>{t`请先连接到项目`}</p>
              <p>{t`点击上方"连接"按钮开始`}</p>
            </>
          ) : (
            <>
              <p>{t`当前处于 “外部 Cline” 模式。`}</p>
              <p>{t`请在 Cline 中启动 MCP；此处仅做观测与只读操作（连接按钮已隐藏）。`}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

