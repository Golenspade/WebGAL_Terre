import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner } from '@fluentui/react-components';
import DiffViewer from './DiffViewer';
import type { Diff, WriteToFileResponse } from '@/api/agentClient';
import { agentClient } from '@/api/agentClient';
import { WsUtil } from '@/utils/wsUtil';

export interface ChatWriteArgs {
  path?: string;
  content?: string;
  mode?: 'overwrite' | 'append';
}

export default function ChatWriteConfirm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  args: ChatWriteArgs | null;
}) {
  const { open, onOpenChange, args } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WriteToFileResponse | null>(null);
  const canApply = useMemo(() => !!preview && preview.applied === false, [preview]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setLoading(false);
      return;
    }
    // 自动进行 Dry-run 以获取 diff
    void doDryRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, args?.path, args?.content, args?.mode]);

  const doDryRun = async () => {
    if (!args?.path || typeof args.content !== 'string') {
      setError('参数不足：缺少 path 或 content');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await agentClient.writeToFile({
        path: args.path,
        content: args.content,
        mode: args.mode ?? 'overwrite',
        dryRun: true,
      });
      setPreview({ ...res, applied: false });
    } catch (e: any) {
      setError(e?.message || 'Dry-run 失败');
    } finally {
      setLoading(false);
    }
  };

  const doApply = async () => {
    if (!args?.path || typeof args.content !== 'string') return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `chat-apply-${Date.now()}`;
      const res = await agentClient.writeToFile({
        path: args.path,
        content: args.content,
        mode: args.mode ?? 'overwrite',
        dryRun: false,
        idempotencyKey,
      });
      setPreview({ ...res, applied: true });
      // 通知其它编辑器重新拉取磁盘内容（Monaco 文本编辑器监听 focus 事件会自动刷新）
      try {
        WsUtil.sendTemplateRefetchCommand();
      } catch {}
      try {
        window.dispatchEvent(new Event('focus'));
      } catch {}

    } catch (e: any) {
      setError(e?.message || '写入失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(!!data.open)}>
      <DialogSurface style={{ maxWidth: 900 }}>
        <DialogBody>
          <DialogTitle>写入确认</DialogTitle>
          <DialogContent>
            {!args?.path ? (
              <div>缺少必要参数：path</div>
            ) : (
              <>
                <div style={{ marginBottom: 8, color: '#666' }}>目标文件：{args.path}</div>
                {loading && (
                  <div style={{ margin: '8px 0' }}>
                    <Spinner size="small" label={preview ? '应用中...' : '加载预览中...'} />
                  </div>
                )}
                {error && (
                  <div style={{ color: '#b42318', marginBottom: 8 }}>{error}</div>
                )}
                {preview?.diff && <DiffViewer diff={preview.diff as Diff} />}
                {preview?.applied && (
                  <div style={{ marginTop: 8 }}>
                    <div>写入成功！</div>
                    {preview.snapshotId && <div>快照 ID：{preview.snapshotId}</div>}
                    {typeof preview.bytesWritten === 'number' && (
                      <div>写入字节：{preview.bytesWritten}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button appearance="secondary" onClick={doDryRun} disabled={loading || !args?.path || typeof args?.content !== 'string'}>
              重新预览
            </Button>
            <Button appearance="primary" onClick={doApply} disabled={loading || !canApply}>
              确认写入
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

