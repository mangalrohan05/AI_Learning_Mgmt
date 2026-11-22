'use client';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Material, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  FileText,
  AlertCircle,
  HelpCircle,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  question: string;
  answer: string;
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
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const readyMaterials = materials.filter((m) => m.status === 'READY');
  const hasReadyMaterials = readyMaterials.length > 0;

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

    if (trimmed.length > 500) {
      toast.error('Question is too long (maximum 500 characters).');
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const payload = {
        question: trimmed,
        materialId: selectedMaterialId === 'all' ? undefined : selectedMaterialId,
      };

      const response = await api.chatCourse(token, courseId, payload);

      const newMessage: ChatMessage = {
        id: `msg_${Date.now()}`,
        question: trimmed,
        answer: response.answer,
        sources: response.sources || [],
        timestamp: new Date(),
        cached: (response as any).cached,
      };

      setMessages((prev) => [newMessage, ...prev]);
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
    <div className="space-y-6">
      {/* Top Controls: Material Scope Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card/60">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 text-primary" />
          <span>Source Scope:</span>
          <select
            value={selectedMaterialId}
            onChange={(e) => setSelectedMaterialId(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={!hasReadyMaterials || loading}
          >
            <option value="all">All Course Materials ({readyMaterials.length} ready)</option>
            {readyMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            className="text-xs text-muted-foreground hover:text-foreground self-start sm:self-auto"
          >
            Clear Conversation
          </Button>
        )}
      </div>

      {/* Guardrail Notice: No Ready Materials */}
      {!hasReadyMaterials && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-100">No ready materials yet</p>
            <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
              Upload PDF, DOCX, or TXT study materials in the <strong>Materials</strong> tab.
              Once the background vector processing completes (status becomes <strong>READY</strong>),
              you can ask questions directly against your course content!
            </p>
          </div>
        </div>
      )}

      {/* Question Input Box */}
      <Card className="border-border bg-card/80 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <form onSubmit={handleSendQuestion} className="space-y-3">
            <div className="relative">
              <Textarea
                placeholder={
                  hasReadyMaterials
                    ? 'Ask a question about the concepts in your course materials...'
                    : 'Upload ready materials first to enable course Q&A'
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
                maxLength={500}
                className="resize-none pr-16 bg-background/80 text-sm"
              />
              <div className="absolute right-3 bottom-2.5 text-[11px] text-muted-foreground">
                {question.length}/500
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Powered by Gemini 1.5 Flash + pgvector</span>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={!question.trim() || !hasReadyMaterials || loading}
                className="gap-1.5 min-w-[90px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Ask AI</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Answers / Conversation Stream */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 p-8 text-center space-y-3 bg-card/20">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              Ask anything about this course
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Questions are answered strictly using retrieved excerpts from your course materials.
              Sources are cited with exact snippets.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSourcesOpen = !!expandedSources[msg.id];

            return (
              <Card key={msg.id} className="border-border bg-card/60 overflow-hidden">
                <CardContent className="p-5 space-y-4">
                  {/* Question */}
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-semibold shrink-0 mt-0.5">
                      Q
                    </div>
                    <div className="font-medium text-sm text-foreground pt-0.5">
                      {msg.question}
                    </div>
                  </div>

                  {/* AI Answer */}
                  <div className="flex items-start gap-2.5 pt-2 border-t border-border/40">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold shrink-0 mt-0.5">
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
                              {msg.sources.length} Referenced Context{' '}
                              {msg.sources.length === 1 ? 'Source' : 'Sources'}
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
      </div>
    </div>
  );
}
