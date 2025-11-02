import { useState } from 'react';
import styles from './agentPanel.module.scss';
import { t } from '@lingui/macro';
import { Button } from '@fluentui/react-components';

export default function AgentPanel() {
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [connected, setConnected] = useState(false);

  return (
    <div className={styles.agentPanel}>
      <div className={styles.header}>
        <h2>{t`智能助手`}</h2>
        <div className={styles.status}>
          <span className={connected ? styles.statusOnline : styles.statusOffline}>
            {connected ? t`已连接` : t`未连接`}
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.placeholder}>
          <p>{t`智能助手面板开发中...`}</p>
          <p>{t`功能包括：`}</p>
          <ul>
            <li>{t`场景列表与读取`}</li>
            <li>{t`预览写入与差异对比`}</li>
            <li>{t`脚本验证与诊断`}</li>
            <li>{t`资源列表查看`}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

