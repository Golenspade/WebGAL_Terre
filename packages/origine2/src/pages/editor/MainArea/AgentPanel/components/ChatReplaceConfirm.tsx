import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner } from '@fluentui/react-components';
import DiffViewer from './DiffViewer';
import type { Diff, WriteToFileResponse } from '@/api/agentClient';
import { agentClient } from '@/api/agentClient';
import { WsUtil } from '@/utils/wsUtil';

export interface ChatReplaceArgs {
  path?: string;
  find?: string; // 正则字符串
  replace?: string;
  flags?: string; // 例如 g,i,m
}

export default function ChatReplaceConfirm(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  args: ChatReplaceArgs | null;
}) {
  const { open, onOpenChange, args } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<WriteToFileResponse | null>(null);
  const [newContent, setNewContent] = useState<string | null>(null);
  const [replaceCount, setReplaceCount] = useState<number | null>(null);
  const canApply = useMemo(() => !!preview && preview.applied === false && typeof newContent === 'string', [preview, newContent]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setLoading(false);
      setNewContent(null);
      setReplaceCount(null);
      return;
    }
    void doDryRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, args?.path, args?.find, args?.replace, args?.flags]);

  const doDryRun = async () => {
    if (!args?.path || typeof args.find !== 'string') {
      setError('参数不足：缺少 path 或 find');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      // 读取原始内容
      const read = await agentClient.readFile(args.path);
      const oldContent = read.content ?? '';
      // 构建正则
      let regex: RegExp;
      try {
        regex = new RegExp(args.find, args.flags || 'g');
      } catch (e: any) {
        setError(`无效的正则：${e?.message || 'unknown'}`);
        return;
      }
      // 应用替换并统计条数
      let count = 0;
      const replaced = oldContent.replace(regex, (_m) => {
        count++;
        return args.replace ?? '';
      });
      setReplaceCount(count);
      setNewContent(replaced);
      // 用 write_to_file 的 dry-run 生成精确 diff
      const res = await agentClient.writeToFile({
        path: args.path,
        content: replaced,
        mode: 'overwrite',
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
    if (!args?.path || typeof newContent !== 'string') return;
    try {
      setLoading(true);
      setError(null);
      // 直接用 write_to_file 应用，确保生成 snapshotId 与并发校验
      const idempotencyKey = `chat-replace-apply-${Date.now()}`;
      const res = await agentClient.writeToFile({
        path: args.path,
        content: newContent,
        mode: 'overwrite',
        dryRun: false,
        idempotencyKey,
      });
      setPreview({ ...res, applied: true });
      try { WsUtil.sendTemplateRefetchCommand(); } catch {}
      try { window.dispatchEvent(new Event('focus')); } catch {}
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
          <DialogTitle>替换确认</DialogTitle>
          <DialogContent>
            {!args?.path ? (
              <div>缺少必要参数：path</div>
            ) : (
              <>
                <div style={{ marginBottom: 8, color: '#666' }}>目标文件：{args.path}</div>
                <div style={{ marginBottom: 8, color: '#666' }}>规则：/{args.find ?? ''}/{args.flags ?? 'g'} → "{args.replace ?? ''}"{typeof replaceCount === 'number' ? `（命中 ${replaceCount} 处）` : ''}</div>
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
            <Button appearance="secondary" onClick={doDryRun} disabled={loading || !args?.path || !args?.find}>重新预览</Button>
            <Button appearance="primary" onClick={doApply} disabled={loading || !canApply}>确认写入</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

