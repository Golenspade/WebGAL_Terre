import { useEffect, useRef, useState } from 'react';
import { agentClient } from '@/api/agentClient';
import { Button, Spinner } from '@fluentui/react-components';

interface Msg { role: 'user' | 'assistant'; content: string }

export default function ChatPanel() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    try {
      const res = await agentClient.chat({ sessionId, message: text });
      setSessionId(res.sessionId);
      setMessages((m) => [...m, { role: 'assistant', content: res.content }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `对话失败：${e?.message || '未知错误'}` }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 420 }}>
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', maxWidth: '75%', padding: '8px 10px', borderRadius: 8, background: m.role === 'user' ? '#DCF2FF' : '#F5F5F7' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</pre>
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ marginTop: 8 }}>
            <Spinner size="tiny" label="生成中..." />
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入内容，回车发送，Shift+Enter 换行"
          style={{ flex: 1, height: 64, resize: 'vertical' }}
        />
        <Button appearance="primary" onClick={send} disabled={sending || !input.trim()}>发送</Button>
      </div>
    </div>
  );
}

