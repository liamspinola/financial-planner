import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, MessageSquare, Check, X, Send, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../lib/api';
import Spinner from '../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(isoStr) {
  const d      = new Date(isoStr);
  const now    = new Date();
  const days   = Math.floor((now - d) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const SUGGESTIONS = [
  "What's the fastest way to clear my debt?",
  'If I got a pay rise, what difference would it make?',
  'Should I focus on my overdraft or credit card first?',
];

// ─── SessionRow ───────────────────────────────────────────────────────────────

function SessionRow({ conv, isActive, onSelect, onDelete, onRename }) {
  const [editing,    setEditing]   = useState(false);
  const [title,      setTitle]     = useState(conv.title);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTitle(conv.title); }, [conv.title]);

  function commitRename() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    else setTitle(conv.title);
    setEditing(false);
  }

  return (
    <div
      onClick={() => !editing && onSelect(conv.id)}
      className={`group relative flex flex-col px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-1 ${
        isActive
          ? 'bg-slate-700/60 border-l-2 border-teal-500'
          : 'hover:bg-slate-700/30 border-l-2 border-transparent'
      }`}
    >
      {editing ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitRename();
              if (e.key === 'Escape') { setTitle(conv.title); setEditing(false); }
            }}
            onBlur={commitRename}
            className="flex-1 bg-slate-600 text-slate-100 text-xs rounded px-1.5 py-0.5 outline-none border border-teal-500/50 min-w-0"
            autoFocus
          />
        </div>
      ) : (
        <p
          onDoubleClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
          className="text-xs font-medium text-slate-200 truncate pr-5 leading-snug"
        >
          {conv.title}
        </p>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-500">{relativeDate(conv.updated_at)}</span>
        {conv.message_count > 0 && (
          <span className="text-[10px] text-slate-600">
            · {Math.floor(conv.message_count / 2)} msg{Math.floor(conv.message_count / 2) !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!editing && (
        confirming ? (
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { onDelete(conv.id); setConfirming(false); }}
              className="p-0.5 rounded text-red-400 hover:bg-red-500/20" title="Confirm delete">
              <Check size={11} />
            </button>
            <button onClick={() => setConfirming(false)}
              className="p-0.5 rounded text-slate-400 hover:bg-slate-600" title="Cancel">
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirming(true); }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-opacity"
            title="Delete conversation"
          >
            <Trash2 size={12} />
          </button>
        )
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'rounded-br-sm bg-blue-600/30 text-blue-100 border border-blue-500/20'
            : 'rounded-bl-sm bg-slate-700/60 text-slate-200 border border-slate-600/40'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

// ─── ThinkingDots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-slate-700/60 border border-slate-600/40 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="text-xs text-slate-400 italic mr-1">Claude is thinking</span>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

function ChatPanel({ conv, onContextToggle, onTitleUpdate }) {
  const [messages,      setMessages]      = useState([]);
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [sending,       setSending]       = useState(false);
  const [input,         setInput]         = useState('');
  const [typewriter,    setTypewriter]    = useState(null); // { messageId, text, displayed }
  const [error,         setError]         = useState(null);
  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const typewriterTimer = useRef(null);
  const finishTimerRef  = useRef(null);
  const hasMessages     = messages.length > 0 || sending;

  // Scroll to bottom whenever messages or typewriter text changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typewriter?.displayed, sending]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!conv?.id) return;
    setMessages([]);
    setTypewriter(null);
    setError(null);
    setInput('');
    clearInterval(typewriterTimer.current);
    clearTimeout(finishTimerRef.current);
    setLoadingMsgs(true);
    api.getMessages(conv.id)
      .then(setMessages)
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [conv?.id]);

  // Typewriter: reveal response word by word at ~30 words/sec
  useEffect(() => {
    if (!typewriter) return;

    typewriterTimer.current = setInterval(() => {
      setTypewriter(prev => {
        if (!prev) return null;
        const words         = prev.text.split(' ');
        const displayedWords = prev.displayed ? prev.displayed.split(' ') : [];
        if (displayedWords.length >= words.length) {
          clearInterval(typewriterTimer.current);
          return prev; // setTimeout in handleSend will clear this and set real content
        }
        // Reveal 2 words per tick (66ms × 2 words ≈ 30 words/sec)
        const next = words.slice(0, displayedWords.length + 2).join(' ');
        return { ...prev, displayed: next };
      });
    }, 66);

    return () => clearInterval(typewriterTimer.current);
  }, [typewriter?.messageId]); // re-run only when a new message starts, not on every tick

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setError(null);
    textareaRef.current?.focus();

    try {
      const { userMessage, assistantMessage, newTitle } = await api.sendMessage(conv.id, text);

      // Add both messages; assistant message starts with empty content (typewriter fills it in)
      setMessages(prev => [...prev, userMessage, { ...assistantMessage, content: '' }]);

      // Start typewriter — track by messageId so we identify the right bubble precisely
      setTypewriter({ messageId: assistantMessage.id, text: assistantMessage.content, displayed: '' });

      // After the typewriter duration, replace the placeholder with the real content
      const wordCount  = assistantMessage.content.split(' ').length;
      const durationMs = Math.ceil(wordCount / 2) * 66 + 300;
      finishTimerRef.current = setTimeout(() => {
        setMessages(prev =>
          prev.map(m => m.id === assistantMessage.id ? assistantMessage : m)
        );
        setTypewriter(null);
      }, durationMs);

      if (newTitle) onTitleUpdate(conv.id, newTitle);
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  // Overlay typewriter text onto the in-progress message, identified by ID
  const displayMessages = messages.map(m => {
    if (typewriter && m.id === typewriter.messageId) {
      return { ...m, content: typewriter.displayed };
    }
    return m;
  });

  const contextLocked = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-200 truncate mr-4">
          {conv.title}
        </h2>
        <button
          onClick={() => !contextLocked && onContextToggle(conv)}
          disabled={contextLocked}
          title={contextLocked ? 'Context is locked once conversation starts' : 'Toggle financial data context'}
          className={`flex items-center gap-2 text-xs transition-colors ${
            contextLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:text-slate-200'
          } ${conv.use_context ? 'text-teal-400' : 'text-slate-500'}`}
        >
          {conv.use_context
            ? <ToggleRight size={18} className="text-teal-400" />
            : <ToggleLeft  size={18} />
          }
          Use my financial data
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingMsgs ? (
          <div className="flex justify-center pt-8"><Spinner size={20} /></div>
        ) : displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare size={32} className="text-slate-600" />
            <p className="text-sm text-slate-500">Start a conversation</p>
            <p className="text-xs text-slate-600 max-w-xs">
              Ask anything about your finances — strategy, scenarios, or just thinking out loud.
            </p>
          </div>
        ) : (
          <>
            {displayMessages.map(m => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {sending && !typewriter && <ThinkingDots />}
          </>
        )}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-700 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your finances…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none bg-slate-700/60 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 disabled:opacity-50 leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="btn-teal p-2.5 rounded-xl disabled:opacity-40 shrink-0"
            title="Send (Ctrl+Enter)"
          >
            {sending ? <Spinner size={16} /> : <Send size={16} />}
          </button>
        </div>

        {/* Subtle suggestions — only visible when input is empty */}
        {!hasMessages && !input && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="text-[11px] text-slate-600 border border-slate-700/50 rounded-full px-2.5 py-1 hover:text-slate-400 hover:border-slate-600 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-600 mt-1.5 text-right">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}

// ─── Main Advisor view ────────────────────────────────────────────────────────

export default function Advisor() {
  const [conversations, setConversations] = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [loadingConvs,  setLoadingConvs]  = useState(true);

  const activeConv = conversations.find(c => c.id === activeId) ?? null;

  async function loadConversations() {
    try {
      const data = await api.getConversations();
      setConversations(data);
      return data;
    } catch {
      setConversations([]);
      return [];
    } finally {
      setLoadingConvs(false);
    }
  }

  useEffect(() => {
    loadConversations().then(data => {
      if (data.length > 0) setActiveId(data[0].id);
    });
  }, []);

  async function handleNew() {
    const conv = await api.createConversation();
    setConversations(prev => [conv, ...prev]);
    setActiveId(conv.id);
  }

  async function handleDelete(id) {
    await api.deleteConversation(id);
    setConversations(prev => prev.filter(c => c.id !== id));
    setActiveId(current => current === id ? null : current);
  }

  // Auto-select the first conversation whenever active is cleared but sessions remain
  useEffect(() => {
    if (activeId === null && conversations.length > 0) {
      setActiveId(conversations[0].id);
    }
  }, [activeId, conversations]);

  async function handleRename(id, title) {
    const updated = await api.patchConversation(id, { title });
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: updated.title } : c));
  }

  async function handleContextToggle(conv) {
    const updated = await api.patchConversation(conv.id, { useContext: conv.use_context === 0 });
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, use_context: updated.use_context } : c));
  }

  function handleTitleUpdate(id, newTitle) {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Session list */}
      <div className="w-56 shrink-0 bg-slate-800/60 border-r border-slate-700 flex flex-col">
        <div className="px-3 py-3 border-b border-slate-700">
          <button
            onClick={handleNew}
            className="w-full btn-teal text-xs flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> New session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loadingConvs ? (
            <div className="flex justify-center pt-6"><Spinner size={16} /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center pt-8">
              <MessageSquare size={24} className="mx-auto text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">No sessions yet</p>
            </div>
          ) : (
            conversations.map(conv => (
              <SessionRow
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={setActiveId}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat */}
      {activeConv ? (
        <ChatPanel
          key={activeConv.id}
          conv={activeConv}
          onContextToggle={handleContextToggle}
          onTitleUpdate={handleTitleUpdate}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <MessageSquare size={40} className="text-slate-700" />
          <p className="text-slate-500 text-sm">No session selected</p>
          <button onClick={handleNew} className="btn-teal text-xs flex items-center gap-1.5 mt-1">
            <Plus size={13} /> Start a new session
          </button>
        </div>
      )}
    </div>
  );
}
