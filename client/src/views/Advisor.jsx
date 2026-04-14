import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, MessageSquare, Check, X } from 'lucide-react';
import { api } from '../lib/api';
import Spinner from '../components/Spinner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeDate(isoStr) {
  const d     = new Date(isoStr);
  const now   = new Date();
  const diffMs = now - d;
  const days  = Math.floor(diffMs / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SessionRow({ conv, isActive, onSelect, onDelete, onRename }) {
  const [editing, setEditing]   = useState(false);
  const [title, setTitle]       = useState(conv.title);
  const [confirming, setConfirm] = useState(false);
  const inputRef                = useRef(null);

  useEffect(() => { setTitle(conv.title); }, [conv.title]);

  function handleDoubleClick() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

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
          onDoubleClick={handleDoubleClick}
          className="text-xs font-medium text-slate-200 truncate pr-5 leading-snug"
        >
          {conv.title}
        </p>
      )}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-slate-500">{relativeDate(conv.updated_at)}</span>
        {conv.message_count > 0 && (
          <span className="text-[10px] text-slate-600">· {Math.floor(conv.message_count / 2)} msg{Math.floor(conv.message_count / 2) !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Delete button — hover only */}
      {!editing && (
        confirming ? (
          <div
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { onDelete(conv.id); setConfirm(false); }}
              className="p-0.5 rounded text-red-400 hover:bg-red-500/20"
              title="Confirm delete"
            >
              <Check size={11} />
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="p-0.5 rounded text-slate-400 hover:bg-slate-600"
              title="Cancel"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setConfirm(true); }}
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

// ─── Chat panel placeholder — replaced in Task 9 ────────────────────────────

export default function Advisor() {
  const [conversations, setConversations] = useState([]);
  const [activeId,      setActiveId]      = useState(null);
  const [loadingConvs,  setLoadingConvs]  = useState(true);

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
      if (data.length > 0 && !activeId) setActiveId(data[0].id);
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
    if (activeId === id) {
      const remaining = conversations.filter(c => c.id !== id);
      setActiveId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  async function handleRename(id, title) {
    const updated = await api.patchConversation(id, { title });
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: updated.title } : c));
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Session list panel */}
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

      {/* Chat panel placeholder — replaced in Task 9 */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">
          {activeId ? `Chat for session ${activeId} goes here` : 'Select or create a session'}
        </p>
      </div>
    </div>
  );
}
