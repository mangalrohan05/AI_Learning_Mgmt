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
  Trash2,
  Eye,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

interface PendingQuizJob {
  tempId: string;
  title: string;
  numQuestions: number;
  difficulty: 'any' | 'easy' | 'medium' | 'hard';
  startedAt: number;
}

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
  isCourseOwner = false,
}: {
  courseId: string;
  materials: Material[];
  isCourseOwner?: boolean;
}) {
  const { getToken } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingQuizId, setOpeningQuizId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteQuiz, setConfirmDeleteQuiz] = useState<QuizItem | null>(null);

  // Generate Dialog & Background Jobs State
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pendingQuizzes, setPendingQuizzes] = useState<PendingQuizJob[]>([]);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('all');
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<'any' | 'easy' | 'medium' | 'hard'>('any');
  const [topic, setTopic] = useState('');

  // Taking Quiz State
  const [takingQuiz, setTakingQuiz] = useState<TakingQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // Results State
  const [attemptResult, setAttemptResult] = useState<AttemptResult | null>(null);

  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update elapsed timer while background quiz generation jobs are running
  useEffect(() => {
    if (pendingQuizzes.length === 0) return;
    setNowTs(Date.now());
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendingQuizzes.length]);

  const readyMaterials = materials.filter((m) => m.status === 'READY');

  async function loadQuizzes(silent = false) {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getCourseQuizzes(token, courseId);
      if (isMountedRef.current) {
        setQuizzes(data);
      }
    } catch (err: any) {
      if (!silent) {
        toast.error(err.message || 'Failed to load quizzes');
      }
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadQuizzes();
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const clampedCount = Math.min(25, Math.max(1, Number(numQuestions) || 5));
    const currentMaterialId = selectedMaterialId;
    const currentDifficulty = difficulty;
    const trimmedTopic = topic.trim();

    const baseName =
      currentMaterialId === 'all'
        ? 'Course'
        : readyMaterials
            .find((m) => m.id === currentMaterialId)
            ?.name.replace(/\.[^/.]+$/, '') || 'Material';
    const previewTitle = trimmedTopic
      ? `${baseName}: ${trimmedTopic}`
      : `${baseName} Practice Quiz`;

    const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const job: PendingQuizJob = {
      tempId,
      title: previewTitle,
      numQuestions: clampedCount,
      difficulty: currentDifficulty,
      startedAt: Date.now(),
    };

    // Collapse modal immediately and display live generating card in background
    setPendingQuizzes((prev) => [job, ...prev]);
    setGenerateOpen(false);
    setTopic('');

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const payload = {
        materialId: currentMaterialId === 'all' ? undefined : currentMaterialId,
        numQuestions: clampedCount,
        difficulty: currentDifficulty === 'any' ? undefined : currentDifficulty,
        topic: trimmedTopic || undefined,
      };

      const created = await api.generateQuiz(token, courseId, payload);
      const freshList = await api.getCourseQuizzes(token, courseId).catch(() => null);

      if (isMountedRef.current) {
        if (freshList) {
          setQuizzes(freshList);
        }
        setPendingQuizzes((prev) => prev.filter((p) => p.tempId !== tempId));
      }

      toast.success(`"${created.title}" is ready (${created.totalQuestions} questions)`);
    } catch (err: any) {
      if (isMountedRef.current) {
        setPendingQuizzes((prev) => prev.filter((p) => p.tempId !== tempId));
      }
      toast.error(err.message || 'Failed to generate quiz');
    }
  }

  async function viewLastReview(quizId: string) {
    setOpeningQuizId(quizId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const review = await api.getLatestQuizReview(token, quizId);
      setAttemptResult(review);
      setTakingQuiz(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load past quiz review');
    } finally {
      setOpeningQuizId(null);
    }
  }

  async function handleDeleteQuizConfirmed() {
    if (!confirmDeleteQuiz) return;
    setDeletingId(confirmDeleteQuiz.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await api.deleteQuiz(token, confirmDeleteQuiz.id);
      toast.success(`Deleted "${confirmDeleteQuiz.title}"`);
      setConfirmDeleteQuiz(null);
      loadQuizzes(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete quiz');
    } finally {
      setDeletingId(null);
    }
  }

  async function startQuiz(quizId: string) {
    setOpeningQuizId(quizId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const quizData = await api.getQuizForTaking(token, quizId);
      if (!quizData.questions || quizData.questions.length === 0) {
        toast.error('This quiz has no questions. Try generating a fresh quiz.');
        return;
      }
      setTakingQuiz(quizData);
      setAnswers({});
      setAttemptResult(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load quiz');
    } finally {
      setOpeningQuizId(null);
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
      loadQuizzes(true);
      toast.success(`Quiz finished — you scored ${result.score}%`);
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
                res.isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {res.isCorrect ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-rose-500" />
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
                        style = 'border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold';
                      } else if (isSelected && !isRight) {
                        style = 'border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300 line-through';
                      }

                      return (
                        <div
                          key={optIdx}
                          className={`p-2.5 rounded-lg border ${style} flex items-center justify-between`}
                        >
                          <span>{opt}</span>
                          {isRight && <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Correct</span>}
                          {isSelected && !isRight && <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">Your Answer</span>}
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
            Choose an option for each question, or leave questions blank to skip.
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">Practice Quizzes</h3>
              <p className="text-xs text-muted-foreground">
                Multiple-choice questions pulled from your course files
              </p>
            </div>
            {pendingQuizzes.length > 0 && (
              <Badge
                variant="secondary"
                className="gap-1.5 text-[11px] border border-primary/30 bg-primary/10 text-primary"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating {pendingQuizzes.length} in background
              </Badge>
            )}
          </div>
          <Button
            onClick={() => setGenerateOpen(true)}
            size="sm"
            disabled={readyMaterials.length === 0}
            className="gap-1.5 h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Quiz</span>
          </Button>
        </div>

        {readyMaterials.length === 0 && (
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 text-center text-xs text-muted-foreground">
            Upload and process a file in Materials first to create quizzes.
          </div>
        )}

        {loading && pendingQuizzes.length === 0 ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : quizzes.length === 0 && pendingQuizzes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
              <HelpCircle className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold">No quizzes yet</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Generate a practice quiz from your uploaded notes to test yourself.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Live Background-Generating Quiz Cards */}
            {pendingQuizzes.map((job) => {
              const elapsedSec = Math.max(0, Math.floor((nowTs - job.startedAt) / 1000));
              const stageText =
                elapsedSec < 4
                  ? 'Reading course material chunks...'
                  : elapsedSec < 11
                    ? 'Drafting questions & explanations with AI...'
                    : 'Finalizing question set...';

              return (
                <Card
                  key={job.tempId}
                  className="p-4 border-primary/40 bg-primary/5 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        <span className="font-semibold text-sm truncate text-foreground">
                          {job.title}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">
                        {job.numQuestions} Questions
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{stageText}</span>
                      <span className="ml-auto font-mono text-[11px]">{elapsedSec}s</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="h-2 w-full rounded-full bg-primary/15 overflow-hidden">
                      <div className="h-full w-2/3 rounded-full bg-primary/60 animate-pulse" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Generating in background — you can continue browsing while it builds.
                    </p>
                  </div>
                </Card>
              );
            })}

            {quizzes.map((q) => {
              const isEmptyQuiz = q.questionCount === 0;
              const isOpeningThis = openingQuizId === q.id;

              return (
                <Card
                  key={q.id}
                  className="p-4 border-border bg-card/60 hover:bg-card/90 transition-colors flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-sm truncate">{q.title}</span>
                      <Badge
                        variant={isEmptyQuiz ? 'destructive' : 'outline'}
                        className="text-[10px] shrink-0"
                      >
                        {isEmptyQuiz ? 'Empty' : `${q.questionCount} Questions`}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(q.createdAt).toLocaleDateString()}
                      </span>
                      {q.latestAttempt && (
                        <span className="font-semibold text-primary">
                          Last score: {q.latestAttempt.score}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between gap-2">
                    <div>
                      {isCourseOwner && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Delete quiz"
                          onClick={() => setConfirmDeleteQuiz(q)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {q.latestAttempt && !isEmptyQuiz && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={openingQuizId !== null}
                          className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          onClick={() => viewLastReview(q.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Last Results</span>
                        </Button>
                      )}
                      {!isEmptyQuiz && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={openingQuizId !== null}
                          className="h-8 text-xs gap-1.5"
                          onClick={() => startQuiz(q.id)}
                        >
                          {isOpeningThis && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <span>{q.latestAttempt ? 'Retake' : 'Start'} Quiz</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Quiz Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteQuiz}
        onOpenChange={(open) => !open && setConfirmDeleteQuiz(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete quiz?</DialogTitle>
            <DialogDescription>
              Delete{' '}
              <strong className="text-foreground">
                &ldquo;{confirmDeleteQuiz?.title}&rdquo;
              </strong>{' '}
              and all associated attempts?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDeleteQuiz(null)}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteQuizConfirmed}
              disabled={deletingId !== null}
            >
              {deletingId ? 'Deleting...' : 'Delete Quiz'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Quiz Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>New Practice Quiz</DialogTitle>
            <DialogDescription>
              Creates 1 to 25 multiple-choice questions drawn across your course files.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerate} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Based on
              </label>
              <select
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              >
                <option value="all">All materials</option>
                {readyMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-foreground">
                  Number of questions (1–25)
                </label>
                <span className="text-xs font-semibold text-primary">
                  {numQuestions}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                {[5, 10, 15, 20, 25].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNumQuestions(preset)}
                    className={`flex-1 h-7 rounded-md border text-xs font-medium transition-colors ${
                      numQuestions === preset
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                max={25}
                value={numQuestions}
                onChange={(e) =>
                  setNumQuestions(Math.min(25, Math.max(1, Number(e.target.value) || 1)))
                }
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Difficulty
                </label>
                <select
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as 'any' | 'easy' | 'medium' | 'hard')
                  }
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="any">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Topic focus (optional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Scheduling, TCP"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGenerateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate Quiz</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
