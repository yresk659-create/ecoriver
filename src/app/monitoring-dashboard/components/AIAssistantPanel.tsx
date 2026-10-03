'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, X, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';
import { useAuth } from '@/lib/authContext';

interface AssistantApiResponse {
  answer?: unknown;
  sources?: unknown;
  timestamp?: unknown;
  error?: unknown;
}

function timestampForDisplay(value: unknown): string {
  const date = typeof value === 'string' ? new Date(value) : new Date();
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function AIAssistantPanel() {
  const { refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPanel = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  // Smooth open/close: mount then animate in, animate out then unmount.
  const handleToggle = () => {
    if (open) {
      setVisible(false);
      setTimeout(() => setOpen(false), 260);
      return;
    }
    openPanel();
  };

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => setOpen(false), 260);
  }, []);

  useEffect(() => {
    if (open && visible) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      inputRef.current?.focus();
    }
  }, [messages, open, visible]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, open]);

  useEffect(() => {
    const handleOpenAssistant = () => openPanel();
    window.addEventListener('riverwatch:open-assistant', handleOpenAssistant);
    return () => window.removeEventListener('riverwatch:open-assistant', handleOpenAssistant);
  }, [openPanel]);

  const sendMessage = async (text?: string) => {
    const content = text ?? input.trim();
    if (!content || loading) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    };
    setMessages((p) => [...p, userMsg]);
    setLoading(true);

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      if (response.status === 401) {
        await refreshSession();
      }
      const payload = (await response.json().catch(() => ({}))) as AssistantApiResponse;
      const answer =
        response.ok && typeof payload.answer === 'string'
          ? payload.answer
          : typeof payload.error === 'string'
            ? payload.error
            : 'Assistant belum dapat memproses pertanyaan saat ini.';
      const sources = Array.isArray(payload.sources)
        ? payload.sources.filter((source): source is string => typeof source === 'string')
        : [];
      const aiMsg: ChatMessage = {
        id: `msg-a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        timestamp: timestampForDisplay(payload.timestamp),
        sources,
      };
      setMessages((previous) => [...previous, aiMsg]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: `msg-a-${Date.now()}`,
          role: 'assistant',
          content: 'Koneksi ke AI gagal. Silakan coba lagi.',
          timestamp: timestampForDisplay(undefined),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) =>
    text.split('\n').map((line, index) => (
      <span key={`line-${index}`} className="block">
        {line || '\u00a0'}
      </span>
    ));

  return (
    <>
      {/* Floating Button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`fixed bottom-5 right-4 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-[var(--shadow-soft)] transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-out sm:bottom-6 sm:right-6
          active:scale-[0.97]
          ${open ? 'border border-border bg-muted text-muted-foreground hover:bg-muted/80' : 'button-primary'}
        `}
        aria-expanded={open}
        aria-controls="riverwatch-assistant"
        aria-label={open ? 'Tutup asisten AI' : 'Buka asisten AI'}
      >
        <span
          className="transition-transform duration-300"
          style={{
            display: 'inline-flex',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          {open ? <X size={18} /> : <Bot size={18} />}
        </span>
        <span className="text-sm font-semibold">{open ? 'Tutup' : 'RiverWatch AI'}</span>
        {!open && <Sparkles size={14} className="opacity-70" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          id="riverwatch-assistant"
          className="fixed bottom-[4.75rem] right-3 z-50 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-lifted)] sm:bottom-20 sm:right-6 sm:max-w-[calc(100vw-3rem)]"
          style={{
            height: 'min(520px, calc(100dvh - 7rem))',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
            transition: 'opacity 0.26s cubic-bezier(0.16,1,0.3,1), transform 0.26s cubic-bezier(0.16,1,0.3,1)',
            transformOrigin: 'bottom right',
          }}
          role="dialog"
          aria-labelledby="assistant-panel-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-gradient-to-r from-primary/10 to-accent/5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Bot size={16} className="text-primary" />
              </div>
              <div>
                <p id="assistant-panel-title" className="text-sm font-semibold text-foreground">RiverWatch AI</p>
                <span className="text-xs text-muted-foreground">Asisten umum</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="icon-button h-9 w-9 border-transparent bg-transparent"
              aria-label="Tutup asisten AI"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">Halo! Saya RiverWatch AI</p>
                <p className="text-xs text-muted-foreground mt-1">Anda dapat bertanya tentang apa saja. Data perangkat hanya digunakan bila benar-benar terhubung.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={`chat-${msg.id}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1 mr-2">
                    <Bot size={12} className="text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                  ${msg.role === 'user' ?'bg-primary text-primary-foreground rounded-tr-sm' :'bg-muted text-foreground rounded-tl-sm'
                  }
                `}>
                  <div className="text-sm leading-relaxed">{renderContent(msg.content)}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground mb-1">Konteks:</p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s) => (
                          <span key={`src-${msg.id}-${s}`} className="text-xs bg-background/50 px-1.5 py-0.5 rounded text-muted-foreground">
                            {s === 'ecoriver-hardware' ? 'Perangkat EcoRiver' : s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs opacity-50 mt-1 text-right font-tabular">{msg.timestamp}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1 mr-2">
                  <Bot size={12} className="text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground pulse-dot" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground pulse-dot" style={{ animationDelay: '200ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground pulse-dot" style={{ animationDelay: '400ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
            <div className="field-control flex items-center gap-2 px-3 py-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Tanyakan sesuatu..."
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                aria-label="Pesan untuk asisten AI"
              />
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="button-primary h-9 w-9 rounded-lg disabled:opacity-40"
                aria-label="Kirim pesan"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
