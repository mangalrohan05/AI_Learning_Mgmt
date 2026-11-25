'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

interface AssignmentItem {
  id: string;
  courseId: string;
  studentId: string;
  title: string;
  content?: string;
  score: number;
  feedback: {
    score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  } | null;
  createdAt: string;
}

export function CourseAssignments({ courseId }: { courseId: string }) {
  const { getToken } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selected assignment for detailed modal / expanded view
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [showSubmittedContent, setShowSubmittedContent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteAssignment(assignmentId: string) {
    setDeletingId(assignmentId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await api.deleteAssignment(token, courseId, assignmentId);
      toast.success('Submission deleted');
      const remaining = assignments.filter((a) => a.id !== assignmentId);
      setAssignments(remaining);
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment(remaining[0] || null);
        setShowSubmittedContent(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete assignment');
    } finally {
      setDeletingId(null);
    }
  }

  async function loadAssignments() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getCourseAssignments(token, courseId);
      setAssignments(data);
      if (data.length > 0 && !selectedAssignment) {
        setSelectedAssignment(data[0]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignments();
  }, [courseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !selectedFile) {
      toast.error('Please enter assignment text or attach a document file');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const result = await api.submitAssignment(token, courseId, {
        title: title.trim() || undefined,
        text: text.trim() || undefined,
        file: selectedFile || undefined,
      });

      toast.success(`Graded: ${result.score}/10`);
      setTitle('');
      setText('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      await loadAssignments();
      setSelectedAssignment(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to evaluate assignment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Submission Form */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Submit Assignment</h3>
            <p className="text-xs text-muted-foreground">
              Paste your draft or attach a document for rubric feedback
            </p>
          </div>

          <Card className="border-border bg-card/60 p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Title (optional)
                </label>
                <Input
                  placeholder="e.g. Week 4 Essay on Gradient Descent"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Your work
                </label>
                <Textarea
                  placeholder="Paste your essay, write-up, or answers here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Or attach a file (PDF, DOCX, TXT)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 text-muted-foreground"
                />
                {selectedFile && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                    Attached: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || (!text.trim() && !selectedFile)}
                className="w-full gap-2 h-9 text-xs"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>{submitting ? 'Grading...' : 'Submit for grading'}</span>
              </Button>
            </form>
          </Card>
        </div>

        {/* Right: Feedback & Past Submissions */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Feedback</h3>
            <p className="text-xs text-muted-foreground">
              Score breakdown and revision notes
            </p>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : selectedAssignment && selectedAssignment.feedback ? (
            <div className="space-y-4">
              {/* Score Card */}
              <Card className="border-border bg-card/60 p-5">
                <div className="flex items-start justify-between pb-3 border-b border-border/60 gap-3">
                  <div>
                    <h4 className="text-base font-bold">{selectedAssignment.title}</h4>
                    <span className="text-[11px] text-muted-foreground">
                      Submitted on {new Date(selectedAssignment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-2xl font-black text-primary">
                        {selectedAssignment.score}
                      </span>
                      <span className="text-xs text-muted-foreground"> / 10</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === selectedAssignment.id}
                      aria-label="Delete submission"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteAssignment(selectedAssignment.id)}
                    >
                      {deletingId === selectedAssignment.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <Markdown
                  content={selectedAssignment.feedback.summary}
                  className="text-sm text-foreground/90 leading-relaxed mt-3"
                />

                {selectedAssignment.content && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => setShowSubmittedContent((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      {showSubmittedContent ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          <span>Hide Submitted Work</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" />
                          <span>View Submitted Work</span>
                        </>
                      )}
                    </button>
                    {showSubmittedContent && (
                      <div className="mt-2 rounded-lg bg-muted/30 p-3 border border-border/40 max-h-56 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans text-xs text-foreground/85 leading-relaxed">
                          {selectedAssignment.content}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <h5 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Strengths</span>
                  </h5>
                  <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                    {selectedAssignment.feedback.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </Card>

                <Card className="border-rose-500/30 bg-rose-500/5 p-4 space-y-2">
                  <h5 className="text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>What to improve</span>
                  </h5>
                  <ul className="space-y-1 text-xs text-foreground/80 list-disc list-inside">
                    {selectedAssignment.feedback.weaknesses.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Card>
              </div>

              {/* Concrete Suggestions */}
              {selectedAssignment.feedback.suggestions && (
                <Card className="border-border bg-card/60 p-4 space-y-2">
                  <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    <span>Suggestions</span>
                  </h5>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {selectedAssignment.feedback.suggestions.map((sug, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        <span>{sug}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Submissions Switcher */}
              {assignments.length > 1 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-muted-foreground block mb-2">
                    Past Submissions ({assignments.length})
                  </span>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {assignments.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedAssignment(item);
                          setShowSubmittedContent(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left shrink-0 w-48 text-xs transition-colors ${
                          selectedAssignment.id === item.id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card/40 hover:bg-card/80 text-foreground'
                        }`}
                      >
                        <p className="font-semibold truncate">{item.title}</p>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                          <span className="font-bold text-foreground">Score: {item.score}/10</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
                <FileText className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold">No submissions yet</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Submit your work on the left to see your score and revision notes here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
