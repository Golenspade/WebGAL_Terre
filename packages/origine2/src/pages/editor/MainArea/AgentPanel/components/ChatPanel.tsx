import { useEffect, useRef, useState } from 'react';
import { agentClient } from '@/api/agentClient';
import { Button, Spinner } from '@fluentui/react-components';
import { CheckmarkCircle16Filled, DismissCircle16Filled, Warning16Filled } from '@fluentui/react-icons';
import ChatWriteConfirm from './ChatWriteConfirm';
import ChatReplaceConfirm from './ChatReplaceConfirm';
import ErrorBanner from './ErrorBanner';

interface Step { name: string; args?: any; blocked?: boolean; summary?: string; result?: any; durationMs?: number; error?: { code?: string; message: string; hint?: string; details?: any } }
interface Msg { role: 'user' | 'assistant'; content: string; steps?: Step[]; failed?: boolean; stepsCollapsed?: boolean }

export default function ChatPanel() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmArgs, setConfirmArgs] = useState<any | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceArgs, setReplaceArgs] = useState<any | null>(null);
  const [lastFailedRequest, setLastFailedRequest] = useState<{ sessionId?: string; message: string } | null>(null);

  const STORAGE_KEY = 'webgal.agent.chat.session';

  // 初始化：从本地恢复会话
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && Array.isArray(saved.messages)) {
          setSessionId(saved.sessionId);
          setMessages(saved.messages);
        }
      }
    } catch {}
  }, []);

  // 持久化：保存到本地
  useEffect(() => {
    try {
      const payload = { sessionId, messages };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }, [sessionId, messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (retry?: { sessionId?: string; message: string }) => {
    const text = (retry?.message ?? input).trim();
    const sid = retry?.sessionId ?? sessionId;
    if (!text || sending) return;
    setSending(true);
    if (!retry) {
      setMessages((m) => [...m, { role: 'user', content: text }]);
      setInput('');
    }

    // 优先使用 SSE 流；失败时回退为 POST
    try {
      const es = agentClient.openChatStream({ sessionId: sid, message: text });
      let assistantIndex = -1;
      let finalized = false;
      let usedFallback = false;

      // 占位的 assistant 条目
      setMessages((prev) => {
        const next = [...prev, { role: 'assistant', content: '', steps: [], stepsCollapsed: false } as Msg];
        assistantIndex = next.length - 1;
        return next;
      });

      es.addEventListener('meta', (ev) => {
        try { const data = JSON.parse((ev as MessageEvent).data); if (data?.sessionId) setSessionId(data.sessionId); } catch {}
      });
      es.addEventListener('assistant', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          setMessages((prev) => {
            const next = [...prev];
            const m = next[assistantIndex];
            if (m) next[assistantIndex] = { ...m, content: (m.content || '') + (data?.content || '') };
            return next;
          });
        } catch {}
      });
      es.addEventListener('step', (ev) => {
        try {
          const step = JSON.parse((ev as MessageEvent).data) as Step;
          setMessages((prev) => {
            const next = [...prev];
            const m = next[assistantIndex];
            if (m) next[assistantIndex] = { ...m, steps: [...(m.steps || []), step], stepsCollapsed: false };
            return next;
          });
        } catch {}
      });
      es.addEventListener('final', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data);
          setMessages((prev) => {
            const next = [...prev];
            const m = next[assistantIndex];
            if (m) next[assistantIndex] = { ...m, content: data?.content ?? m.content, steps: data?.steps ?? m.steps, stepsCollapsed: false };
            return next;
          });
          setLastFailedRequest(null);
        } catch {}
        finalized = true;
        setSending(false);
        es.close();
      });
      es.addEventListener('error', async () => {
        if (finalized || usedFallback) return;
        usedFallback = true;
        es.close();
        // 回退：直接调用 POST 获取最终结果
        try {
          const res = await agentClient.chat({ sessionId: sid, message: text });
          setSessionId(res.sessionId);
          setMessages((prev) => {
            const next = [...prev];
            const m = next[assistantIndex];
            if (m) next[assistantIndex] = { ...m, content: res.content, steps: res.steps, stepsCollapsed: false };
            return next;
          });
          setLastFailedRequest(null);
        } catch (e: any) {
          setLastFailedRequest({ sessionId: sid, message: text });
          setMessages((prev) => {
            const next = [...prev];
            const m = next[assistantIndex];
            if (m) next[assistantIndex] = { ...m, content: `对话失败：${e?.message || '未知错误'}`, failed: true };
            return next;
          });
        } finally {
          setSending(false);
        }
      });
    } catch (e: any) {
      // 极早期失败的同步异常：直接回退 POST
      try {
        const res = await agentClient.chat({ sessionId: sid, message: text });
        setSessionId(res.sessionId);
        setMessages((m) => [...m, { role: 'assistant', content: res.content, steps: res.steps, stepsCollapsed: false }]);
        setLastFailedRequest(null);
      } catch (err: any) {
        setLastFailedRequest({ sessionId: sid, message: text });
        setMessages((m) => [...m, { role: 'assistant', content: `对话失败：${err?.message || '未知错误'}`, failed: true }]);
      } finally {
        setSending(false);
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const openWriteConfirm = (args: any) => {
    setConfirmArgs(args || null);
    setConfirmOpen(true);
  };

  const openReplaceConfirm = (args: any) => {
    setReplaceArgs(args || null);
    setReplaceOpen(true);
  };

  const toggleStepsCollapsed = (msgIndex: number) => {
    setMessages((prev) => {
      const next = [...prev];
      const m = next[msgIndex];
      if (m) next[msgIndex] = { ...m, stepsCollapsed: !m.stepsCollapsed };
      return next;
    });
  };

  const clearSession = () => {
    setMessages([]);
    setSessionId(undefined);
    setLastFailedRequest(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', maxWidth: '75%', padding: '8px 10px', borderRadius: 8, background: m.role === 'user' ? '#DCF2FF' : '#F5F5F7' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</pre>
              {m.failed && lastFailedRequest && (
                <div style={{ marginTop: 6 }}>
                  <ErrorBanner error={{ code: 'E_LLM', message: m.content } as any} onRetry={() => send(lastFailedRequest)} />
                </div>
              )}
              {/* 步骤呈现 */}
              {m.steps && m.steps.length > 0 && (
                <div style={{ marginTop: 8, padding: '6px 8px', background: '#fff', border: '1px solid #eee', borderRadius: 6 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize: 12, color: '#666', marginBottom: 4 }}>
                    <span>执行步骤</span>
                    <Button size="small" appearance="subtle" onClick={() => toggleStepsCollapsed(i)}>
                      {m.stepsCollapsed ? '展开' : '折叠'}
                    </Button>
                  </div>

                  {!m.stepsCollapsed && (
                    <>
                      {m.steps.map((s, idx) => (
                        <div key={idx} style={{ margin: '6px 0', padding: '6px 8px', border: '1px solid #eee', borderRadius: 6, background: s.error ? '#fff5f5' : s.blocked ? '#fff8e6' : '#f9fbff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: s.error ? '#b42318' : s.blocked ? '#8a2d0a' : '#333' }}>
                            <span aria-hidden>
                              {s.error ? <DismissCircle16Filled color="#b42318" /> : s.blocked ? <Warning16Filled color="#8a2d0a" /> : <CheckmarkCircle16Filled color="#1a7f37" />}
                            </span>
                            <span style={{ lineHeight: 1.4 }}>
                              {s.name}({shortArgs(s.args)}){typeof s.durationMs === 'number' ? ` · ${s.durationMs}ms` : ''}：{s.blocked ? '已阻止执行（需确认）' : s.summary || '完成'}
                              {s.error ? `（错误：${s.error.message}${s.error.hint ? '；提示：' + s.error.hint : ''}）` : ''}
                            </span>
                            {s.blocked && s.name === 'write_to_file' && (
                              <Button size="small" appearance="subtle" onClick={() => openWriteConfirm(s.args)} style={{ marginLeft: 6 }}>
                                预览变更
                              </Button>
                            )}
                            {s.blocked && s.name === 'replace_in_file' && (
                              <Button size="small" appearance="subtle" onClick={() => openReplaceConfirm(s.args)} style={{ marginLeft: 6 }}>
                                预览替换
                              </Button>
                            )}
                          </div>
                          {s.result && (
                            <details style={{ marginTop: 6 }}>
                              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>查看原始结果</summary>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                                {safeJson(s.result)}
                              </pre>
                            </details>
                          )}
                          {s.error?.details && (
                            <details style={{ marginTop: 6 }}>
                              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>错误详情</summary>
                              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                                {safeJson(s.error.details)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </>
                  )}

                  {/* 错误详情 Banner（如有）*/}
                  {m.steps.some(s => !!s.error) && (
                    <div style={{ marginTop: 8 }}>
                      <ErrorBanner error={m.steps.find(s => !!s.error)!.error as any} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ marginTop: 8 }}>
            <Spinner size="tiny" label="生成中..." />
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入内容，回车发送，Shift+Enter 换行"
          style={{ flex: 1, height: 64, resize: 'vertical' }}
        />
        <Button appearance="subtle" onClick={clearSession} disabled={sending}>清空对话</Button>
        <Button appearance="primary" onClick={() => send()} disabled={sending || !input.trim()}>发送</Button>
      </div>

      <ChatWriteConfirm open={confirmOpen} onOpenChange={setConfirmOpen} args={confirmArgs} />
      <ChatReplaceConfirm open={replaceOpen} onOpenChange={setReplaceOpen} args={replaceArgs} />
    </div>
  );
}

function shortArgs(a?: any) {
  if (!a) return '';
  try {
    const s = JSON.stringify(a);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  } catch {
    return '[unserializable]';
  }
}

function safeJson(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return '[unserializable]'; }
}
