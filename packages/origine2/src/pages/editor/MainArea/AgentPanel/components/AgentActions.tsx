import { useState } from 'react';
import { t } from '@lingui/macro';
import { Button, Textarea, Label, Radio, RadioGroup } from '@fluentui/react-components';
import { agentClient } from '@/api/agentClient';
import type {
  WriteToFileResponse,
  ValidateScriptResponse,
  ListProjectResourcesResponse,
  ReadFileResponse,
} from '@/api/agentClient';
import styles from './agentActions.module.scss';
import { useAgentResultsStore } from '../store/useAgentResultsStore';

interface AgentActionsProps {
  projectRoot: string;
  currentScene?: string;
}

export default function AgentActions({ projectRoot, currentScene }: AgentActionsProps) {
  const [targetPath, setTargetPath] = useState('');
  const [content, setContent] = useState('');
  const [writeMode, setWriteMode] = useState<'overwrite' | 'append'>('overwrite');
  const [loading, setLoading] = useState(false);
  const [lastDryRunParams, setLastDryRunParams] = useState<any>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const { setResult, setError, clearResults } = useAgentResultsStore();

  // 默认目标文件路径（避免重复扩展名）
  const name = currentScene || '';
  const normalized = name.endsWith('.txt') ? name : `${name}.txt`;
  const defaultPath = name ? `game/scene/${normalized}` : '';
  const effectivePath = targetPath || defaultPath;

  const handleReadFile = async () => {
    if (!effectivePath) {
      setError({ code: 'E_BAD_ARGS', message: t`请指定文件路径` });
      return;
    }

    try {
      setLoading(true);
      clearResults();
      const result = await agentClient.readFile(effectivePath);
      setContent(result.content);
      setResult({ type: 'read', data: result });
    } catch (err: any) {
      setError(err.response?.data || { code: 'E_INTERNAL', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDryRun = async () => {
    if (!effectivePath || !content) {
      setError({ code: 'E_BAD_ARGS', message: t`请指定文件路径和内容` });
      return;
    }

    try {
      setLoading(true);
      clearResults();
      const params = {
        path: effectivePath,
        content,
        mode: writeMode,
        dryRun: true,
      };
      const result = await agentClient.writeToFile(params);
      setLastDryRunParams(params);
      setResult({ type: 'diff', data: result });
    } catch (err: any) {
      setError(err.response?.data || { code: 'E_INTERNAL', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!lastDryRunParams) {
      setError({ code: 'E_BAD_ARGS', message: t`请先执行 Dry-run` });
      return;
    }

    try {
      setLoading(true);
      clearResults();
      
      // 生成或复用幂等键
      const key = idempotencyKey || `apply-${Date.now()}`;
      setIdempotencyKey(key);

      const result = await agentClient.writeToFile({
        ...lastDryRunParams,
        dryRun: false,
        idempotencyKey: key,
      });
      setResult({ type: 'apply', data: result });
    } catch (err: any) {
      const errorData = err.response?.data;
      setError(errorData || { code: 'E_INTERNAL', message: err.message });
      
      // E_CONFLICT 时提供重试建议
      if (errorData?.code === 'E_CONFLICT') {
        setError({
          ...errorData,
          hint: errorData.hint || t`文件已被修改，请重新执行 Dry-run 并检查差异`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!effectivePath && !content) {
      setError({ code: 'E_BAD_ARGS', message: t`请指定文件路径或内容` });
      return;
    }

    try {
      setLoading(true);
      clearResults();
      const result = await agentClient.validateScript({
        path: effectivePath || undefined,
        content: content || undefined,
      });
      setResult({ type: 'validate', data: result });
    } catch (err: any) {
      setError(err.response?.data || { code: 'E_INTERNAL', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleListResources = async () => {
    try {
      setLoading(true);
      clearResults();
      const result = await agentClient.listProjectResources();
      setResult({ type: 'resources', data: result });
    } catch (err: any) {
      setError(err.response?.data || { code: 'E_INTERNAL', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.actions}>
      <div className={styles.section}>
        <Label weight="semibold">{t`目标文件`}</Label>
        <input
          type="text"
          className={styles.pathInput}
          placeholder={defaultPath || t`例如: game/scene/start.txt`}
          value={targetPath}
          onChange={(e) => setTargetPath(e.target.value)}
          disabled={loading}
        />
        {defaultPath && !targetPath && (
          <span className={styles.hint}>{t`默认`}: {defaultPath}</span>
        )}
      </div>

      <div className={styles.section}>
        <Label weight="semibold">{t`内容`}</Label>
        <Textarea
          className={styles.contentArea}
          placeholder={t`输入或编辑场景内容...`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading}
          rows={10}
        />
      </div>

      <div className={styles.section}>
        <Label weight="semibold">{t`写入模式`}</Label>
        <RadioGroup
          value={writeMode}
          onChange={(_, data) => setWriteMode(data.value as 'overwrite' | 'append')}
        >
          <Radio value="overwrite" label={t`覆盖`} disabled={loading} />
          <Radio value="append" label={t`追加`} disabled={loading} />
        </RadioGroup>
      </div>

      <div className={styles.buttonGroup}>
        <Button
          appearance="secondary"
          onClick={handleReadFile}
          disabled={loading || !effectivePath}
        >
          {t`读取场景`}
        </Button>
        <Button
          appearance="secondary"
          onClick={handleDryRun}
          disabled={loading || !effectivePath || !content}
        >
          {t`Dry-run`}
        </Button>
        <Button
          appearance="primary"
          onClick={handleApply}
          disabled={loading || !lastDryRunParams}
        >
          {t`Apply`}
        </Button>
        <Button
          appearance="secondary"
          onClick={handleValidate}
          disabled={loading || (!effectivePath && !content)}
        >
          {t`校验`}
        </Button>
        <Button
          appearance="secondary"
          onClick={handleListResources}
          disabled={loading}
        >
          {t`资源列表`}
        </Button>
      </div>
    </div>
  );
}

