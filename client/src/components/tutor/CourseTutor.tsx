'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import {
  GraduationCap,
  Send,
  Loader2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { materialName: string; snippet: string }[];
  timestamp: Date;
}

export function CourseTutor({ courseId }: { courseId: string }) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I am your AI Course Tutor. Ask me any conceptual question, and I'll explain it step by step with concrete examples. If I share general concepts outside your course notes, I will clearly label them as [General Knowledge].",
      timestamp: new Date(),
    },
  ]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    if (trimmed.length > 500) {
      toast.error('Question is too long (maximum 500 characters)');
      return;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Send recent history (last 6 messages)
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.askTutor(token, courseId, {
        question: trimmed,
        history: historyPayload,
      });

      const tutorMsg: Message = {
        id: `tutor-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, tutorMsg]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to get tutor answer');
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            err.message ||
            'I encountered an error communicating with the AI service. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleSources(msgId: string) {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  return (
    <div className="flex flex-col h-[650px] border border-border rounded-2xl bg-card/40 overflow-hidden">
      {/* Top Banner */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/80 bg-card/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              AI Course Tutor
              <Badge variant="outline" className="text-[10px] font-mono">
                Interactive
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Patient step-by-step explanations with illustrative examples
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-1 rounded-lg">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Keeps in-browser conversation memory</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isSourcesOpen = !!expandedSources[msg.id];

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
                  ? 'bg-primary text-primary-foreground rounded-br-none'
                  : 'bg-card border border-border/80 text-foreground rounded-bl-none shadow-sm'
                  }`}
              >
                {!isUser && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1">
                    <GraduationCap className="h-3.5 w-3.5" />
                    <span>Tutor</span>
                  </div>
                )}
                {isUser ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <Markdown content={msg.content} className="text-sm" />
                )}

                {/* Sources collapsible */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-border/40">
                    <button
                      type="button"
                      onClick={() => toggleSources(msg.id)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>
                        {msg.sources.length} Referenced Course Material
                        {msg.sources.length > 1 ? 's' : ''}
                      </span>
                      {isSourcesOpen ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>

                    {isSourcesOpen && (
                      <div className="mt-2 space-y-2">
                        {msg.sources.map((src, idx) => (
                          <div
                            key={idx}
                            className="text-xs p-2.5 rounded-lg bg-muted/40 border border-border/60"
                          >
                            <span className="font-semibold text-primary block mb-0.5">
                              {src.materialName}
                            </span>
                            <span className="text-muted-foreground">
                              "{src.snippet}"
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground px-1 mt-1">
                {msg.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-2">
            <div className="bg-card border border-border/80 rounded-2xl rounded-bl-none px-4 py-3 text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-muted-foreground">
                Thinking step-by-step with examples...
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-border/80 bg-card/60">
        <div className="relative">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Ask a conceptual question (e.g. 'Explain gradient descent step by step with an intuitive analogy')..."
            rows={2}
            className="pr-14 resize-none text-sm bg-background/80"
            maxLength={500}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send question to tutor"
            disabled={!question.trim() || loading}
            className="absolute right-2 bottom-2 h-8 w-8 rounded-lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 mt-1.5">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>{question.length}/500</span>
        </div>
      </form>
    </div>
  );
}
