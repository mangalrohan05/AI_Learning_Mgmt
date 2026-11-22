'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api, Material } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/ui/markdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HelpCircle,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowLeft,
  Award,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface QuizItem {
  id: string;
  courseId: string;
  title: string;
  questionCount: number;
  createdAt: string;
  latestAttempt: {
    id: string;
    score: number;
    completedAt: string;
  } | null;
}

interface TakingQuiz {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  totalQuestions: number;
  questions: {
    index: number;
    question: string;
    options: string[];
  }[];
}

interface AttemptResult {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  results: {
    questionIndex: number;
    question: string;
    options: string[];
    selectedAnswer: number;
    correctAnswer: number;
    isCorrect: boolean;
    explanation: string;
  }[];
  completedAt: string;
}

export function CourseQuizzes({
  courseId,
  materials,
}: {
  courseId: string;
  materials: Material[];
}) {
  const { getToken } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate Dialog State
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('all');
  const [numQuestions, setNumQuestions] = useState<number>(5);

  // Taking Quiz State
  const [takingQuiz, setTakingQuiz] = useState<TakingQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Results State
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);

  const readyMaterials = materials.filter((m) => m.status === 'READY');

  async function loadQuizzes() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getCourseQuizzes(token, courseId);
      setQuizzes(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuizzes();
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const payload = {
        materialId: selectedMaterialId === 'all' ? undefined : selectedMaterialId,
        numQuestions,
      };

      await api.generateQuiz(token, courseId, payload);
      toast.success('Quiz generated successfully!');
      setGenerateOpen(false);
      loadQuizzes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate quiz');
    } finally {
      setGenerating(false);
    }
  }

  async function startQuiz(quizId: string) {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const quizData = await api.getQuizForTaking(token, quizId);
      setTakingQuiz(quizData);
      setAnswers({});
      setAttemptResult(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load quiz');
    } finally {
      setLoading(false);
    }
  }

  // Ref to guarantee submit cannot fire twice concurrently
  const isSubmittingRef = React.useRef(false);

  async function handleSubmitAttempt() {
    if (!takingQuiz) return;

    // Check unanswered questions
    const totalQuestions = takingQuiz.questions.length;
    const answeredCount = takingQuiz.questions.filter(
      (q) => answers[q.index] !== undefined && answers[q.index] >= 0
    ).length;
    const unansweredCount = totalQuestions - answeredCount;

    if (unansweredCount > 0) {
      const confirmed = window.confirm(
        `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}. Unanswered questions will be marked incorrect. Submit anyway?`
      );
      if (!confirmed) return;
    }

    if (isSubmittingRef.current || submitting) return;
    isSubmittingRef.current = true;
    setSubmitting(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      // Map to selected option index, or -1 for unanswered
      const answersArray = takingQuiz.questions.map((q) =>
        answers[q.index] !== undefined && answers[q.index] >= 0 ? answers[q.index] : -1
      );

      const result = await api.submitQuizAttempt(token, takingQuiz.id, answersArray);
      setAttemptResult(result);
      setTakingQuiz(null);
      loadQuizzes();
      toast.success(`Quiz completed! You scored ${result.score}%`);
    } catch (err: any) {
      // Surface detailed server validation message in toast
      let msg = err.message || 'Failed to submit quiz attempt';
      if (err.details && typeof err.details === 'object' && !msg.includes('(')) {
        const detailsStr = Object.entries(err.details)
          .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(', ')}` : `${k}: ${v}`))
          .join('; ');
        if (detailsStr) {
          msg = `${msg} (${detailsStr})`;
        }
      }
      toast.error(msg);
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  // ── Render Results View ───────────────────────────────────────
  if (attemptResult) {
    return (
      <div className="space-y-6 pt-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAttemptResult(null)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Quizzes</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => startQuiz(attemptResult.quizId)}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Retake Quiz</span>
          </Button>
        </div>

        {/* Score Header */}
        <Card className="border-border bg-card/60 p-6 text-center">
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Award className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold">{attemptResult.quizTitle}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-extrabold text-foreground">
                {attemptResult.score}%
              </span>
              <Badge
                variant={
                  attemptResult.score >= 80
                    ? 'default'
                    : attemptResult.score >= 50
                    ? 'secondary'
                    : 'destructive'
                }
                className="text-xs px-2 py-0.5"
              >
                {attemptResult.correctCount} / {attemptResult.totalQuestions} Correct
              </Badge>
            </div>
          </div>
        </Card>

        {/* Questions Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Detailed Review
          </h3>
          {attemptResult.results.map((res, i) => (
            <Card
              key={i}
              className={`p-4 border ${
                res.isCorrect ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-rose-500/30 bg-rose-950/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {res.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-400" />
                  )}
                </div>
                <div className="space-y-2 min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {i + 1}. {res.question}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    {res.options.map((opt, optIdx) => {
                      const isSelected = res.selectedAnswer === optIdx;
                      const isRight = res.correctAnswer === optIdx;

                      let style = 'border-border/60 bg-card/40 text-muted-foreground';
                      if (isRight) {
                        style = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 font-semibold';
                      } else if (isSelected && !isRight) {
                        style = 'border-rose-500/60 bg-rose-500/10 text-rose-300 line-through';
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-lg border ${style} flex items-center justify-between`}
                        >
                          <span>{opt}</span>
                          {isRight && <span className="text-[10px] uppercase font-bold text-emerald-400">Correct</span>}
                          {isSelected && !isRight && <span className="text-[10px] uppercase font-bold text-rose-400">Your Answer</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 text-xs text-muted-foreground border-t border-border/40">
                    <strong className="text-foreground block mb-1">Explanation:</strong>
                    <Markdown content={res.explanation} className="text-xs" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Render Taking Quiz View ───────────────────────────────────
  if (takingQuiz) {
    const totalQuestions = takingQuiz.questions.length;
    const answeredCount = takingQuiz.questions.filter(
      (q) => answers[q.index] !== undefined && answers[q.index] >= 0
    ).length;
    const unansweredCount = totalQuestions - answeredCount;
    const allAnswered = totalQuestions > 0 && unansweredCount === 0;

    return (
      <div className="space-y-6 pt-2 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTakingQuiz(null)}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Exit Quiz</span>
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {answeredCount} of {totalQuestions} Answered
            </span>
            {!allAnswered && (
              <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                {unansweredCount} remaining
              </Badge>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold">{takingQuiz.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select an answer for each question. All questions must be answered before submitting.
          </p>
        </div>

        <div className="space-y-5">
          {takingQuiz.questions.map((q) => (
            <Card key={q.index} className="p-4 border-border bg-card/60">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-sm font-medium">
                  {q.index + 1}. {q.question}
                </p>
                {answers[q.index] === undefined ? (
                  <Badge variant="outline" className="text-[10px] text-amber-500/80 border-amber-500/20 shrink-0">
                    Unanswered
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20 shrink-0">
                    Answered
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {q.options.map((opt, optIdx) => {
                  const isSelected = answers[q.index] === optIdx;
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [q.index]: optIdx }))
                      }
                      className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40'
                          : 'border-border/80 bg-background/50 hover:bg-card/90 text-foreground/90'
                      }`}
                    >
                      <span className="inline-block w-5 font-bold text-muted-foreground">
                        {String.fromCharCode(65 + optIdx)}.
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3 pt-4 pb-8 border-t border-border/40">
          <div>
            {!allAnswered ? (
              <p className="text-xs text-amber-500 font-medium flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {answeredCount} of {totalQuestions} answered ({unansweredCount} unanswered)
                </span>
              </p>
            ) : (
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>All {totalQuestions} questions answered</span>
              </p>
            )}
          </div>

          <Button
            onClick={handleSubmitAttempt}
            disabled={submitting}
            className="gap-2 px-6"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>Submit Quiz</span>
          </Button>
        </div>
      </div>
    );
  }

  // ── Render Quiz List View ─────────────────────────────────────
  return (
    <>
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Course Quizzes</h3>
            <p className="text-xs text-muted-foreground">
              Test your mastery with AI-generated practice questions
            </p>
          </div>
          <Button
            onClick={() => setGenerateOpen(true)}
            size="sm"
            disabled={readyMaterials.length === 0}
            className="gap-1.5 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Generate Quiz</span>
          </Button>
        </div>

        {readyMaterials.length === 0 && (
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 text-center text-xs text-muted-foreground">
            Upload and process course materials first to unlock automated quiz generation.
          </div>
        )}

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold">No quizzes created yet</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Click "Generate Quiz" above to create an automated practice quiz from your course materials.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {quizzes.map((q) => (
              <Card
                key={q.id}
                className="p-4 border-border bg-card/60 hover:bg-card/90 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-sm truncate">{q.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {q.questionCount} Questions
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(q.createdAt).toLocaleDateString()}
                    </span>
                    {q.latestAttempt && (
                      <span className="font-semibold text-primary">
                        Best Score: {q.latestAttempt.score}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => startQuiz(q.id)}
                  >
                    <span>{q.latestAttempt ? 'Retake' : 'Start'} Quiz</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generate Quiz Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Generate Practice Quiz</DialogTitle>
            <DialogDescription>
              Gemini will generate multiple-choice questions grounded in your course materials.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerate} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Source Material
              </label>
              <select
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              >
                <option value="all">All course materials</option>
                {readyMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Number of Questions (3 - 10)
              </label>
              <input
                type="number"
                min={3}
                max={10}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGenerateOpen(false)}
                disabled={generating}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={generating} className="gap-1.5">
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>{generating ? 'Generating...' : 'Create Quiz'}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
