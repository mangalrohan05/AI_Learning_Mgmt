'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Material, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  MessageSquare,
  Send,
  Loader2,
  FileText,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

type ChatMode = 'strict' | 'tutor';

interface ChatMessage {
  id: string;
  question: string;
  answer: string;
  mode: ChatMode;
  sources: {
    materialName: string;
    snippet: string;
  }[];
  timestamp: Date;
  cached?: boolean;
}

interface CourseChatProps {
  courseId: string;
  materials: Material[];
}

export function CourseChat({ courseId, materials }: CourseChatProps) {
  const { getToken } = useAuth();
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('all');
  const [mode, setMode] = useState<ChatMode>('strict');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const readyMaterials = materials.filter((m) => m.status === 'READY');
  const hasReadyMaterials = readyMaterials.length > 0;

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages.length, loading]);

  function toggleSources(messageId: string) {
    setExpandedSources((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  }

  async function handleSendQuestion(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const trimmed = question.trim();
    if (!trimmed) return;

    if (!hasReadyMaterials) {
      toast.error('No ready materials available to query.');
      return;
    }

    if (trimmed.length > 1000) {
      toast.error('Question is too long (maximum 1000 characters).');
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Send bounded recent conversation turns so follow-ups feel natural
      const recentHistory = messages.slice(-4).flatMap((m) => [
        { role: 'user' as const, content: m.question.slice(0, 1500) },
        { role: 'assistant' as const, content: m.answer.slice(0, 1500) },
      ]);

      const payload = {
        question: trimmed,
        materialId: selectedMaterialId === 'all' ? undefined : selectedMaterialId,
        mode,
        history: mode === 'tutor' && recentHistory.length > 0 ? recentHistory : undefined,
      };

      const response = await api.chatCourse(token, courseId, payload);

      const newMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        question: trimmed,
        answer: response.answer,
        mode,
        sources: response.sources || [],
        timestamp: new Date(),
        cached: response.cached,
      };

      setMessages((prev) => [...prev, newMessage]);
      setQuestion('');
    } catch (err: any) {
      const errorMsg =
        err.message || 'Failed to get answer. Please check rate limits or try again.';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Controls: Mode Toggle + Material Scope Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card/60">
        <div className="flex flex-wrap items-center gap-3">
          {/* Answer Style Mode */}
          <div className="inline-flex rounded-lg border border-border bg-background/80 p-0.5">
            <button
              type="button"
              onClick={() => setMode('strict')}
              disabled={loading}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'strict'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Notes Only
            </button>
            <button
              type="button"
              onClick={() => setMode('tutor')}
              disabled={loading}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === 'tutor'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" />
              Tutor Mode
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <span>Scope:</span>
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary max-w-[220px]"
              disabled={!hasReadyMaterials || loading}
            >
              <option value="all">All materials ({readyMaterials.length})</option>
              {readyMaterials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground hover:text-foreground self-start md:self-auto"
          >
            Clear conversation
          </Button>
        )}
      </div>

      {/* Guardrail Notice: No Ready Materials */}
      {!hasReadyMaterials && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">No processed materials yet</p>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-1 leading-relaxed">
              Upload a file or write notes in the <strong>Materials</strong> tab.
              Once processing completes (<strong>READY</strong>), you can ask questions or study with Tutor Mode here.
            </p>
          </div>
        </div>
      )}

      {/* Conversation History Stream (oldest to newest) */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-3 bg-card/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === 'strict'
                ? 'Ask strictly from your course notes'
                : 'Learn step-by-step with Tutor Mode'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {mode === 'strict'
                ? 'Replies cite exact passages from your selected materials so answers stay grounded.'
                : 'Get intuitive breakdowns, analogies, and follow-up guidance anchored to your course materials.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSourcesOpen = !!expandedSources[msg.id];

            return (
              <Card key={msg.id} className="border-border bg-card/60 overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  {/* Question */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold shrink-0 mt-0.5">
                        You
                      </div>
                      <div className="font-medium text-sm text-foreground pt-0.5 whitespace-pre-wrap">
                        {msg.question}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0 text-muted-foreground border-border/60"
                    >
                      {msg.mode === 'tutor' ? 'Tutor Mode' : 'Notes Only'}
                    </Badge>
                  </div>

                  {/* AI Answer */}
                  <div className="flex items-start gap-2.5 pt-3 border-t border-border/40">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold shrink-0 mt-0.5 ${
                        msg.mode === 'tutor'
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      AI
                    </div>
                    <div className="space-y-3 text-sm text-foreground/90 leading-relaxed min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Markdown content={msg.answer} className="flex-1 text-sm" />
                        {msg.cached && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-muted-foreground border-border/60 bg-muted/40 shrink-0"
                          >
                            cached
                          </Badge>
                        )}
                      </div>

                      {/* Cited Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => toggleSources(msg.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>
                              {msg.sources.length}{' '}
                              {msg.sources.length === 1 ? 'source' : 'sources'}
                            </span>
                            {isSourcesOpen ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>

                          {isSourcesOpen && (
                            <div className="mt-2.5 space-y-2 border-l-2 border-primary/30 pl-3">
                              {msg.sources.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-lg bg-background/60 p-2.5 text-xs space-y-1 border border-border/50"
                                >
                                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 font-normal"
                                    >
                                      Source {idx + 1}
                                    </Badge>
                                    <span className="truncate">{s.materialName}</span>
                                  </div>
                                  <p className="text-muted-foreground italic leading-relaxed">
                                    &ldquo;{s.snippet}&rdquo;
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Question Input Box (pinned below conversation for natural chat flow) */}
      <Card className="border-border bg-card/80 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <form onSubmit={handleSendQuestion} className="space-y-3">
            <div className="relative">
              <Textarea
                placeholder={
                  !hasReadyMaterials
                    ? 'Add and process a material first to ask questions'
                    : mode === 'tutor'
                      ? 'Ask Tutor Mode to explain a concept step-by-step or follow up...'
                      : 'Ask a factual question grounded in your notes...'
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuestion();
                  }
                }}
                disabled={!hasReadyMaterials || loading}
                rows={3}
                maxLength={1000}
                className="resize-none pr-16 bg-background/80 text-sm"
              />
              <div className="absolute right-3 bottom-2.5 text-[11px] text-muted-foreground">
                {question.length}/1000
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {mode === 'tutor'
                  ? 'Tutor Mode includes your recent conversation turns for follow-ups.'
                  : 'Notes Only stays strictly anchored to selected materials.'}
              </span>

              <Button
                type="submit"
                size="sm"
                disabled={!question.trim() || !hasReadyMaterials || loading}
                className="gap-1.5 min-w-[95px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Thinking...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Ask</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
