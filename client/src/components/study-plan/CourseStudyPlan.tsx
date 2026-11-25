'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/ui/markdown';
import {
  CalendarCheck,
  Sparkles,
  Clock,
  Target,
  CheckCircle2,
  Loader2,
  Calendar,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';

interface StudyPlanData {
  id: string;
  courseId: string;
  studentId: string;
  plan: {
    title: string;
    overview: string;
    weeklySchedule: {
      period: string;
      topic: string;
      tasks: string[];
      estimatedHours: number;
    }[];
    tips: string[];
  };
  updatedAt: string;
}

export function CourseStudyPlan({ courseId }: { courseId: string }) {
  const { getToken } = useAuth();
  const [studyPlan, setStudyPlan] = useState<StudyPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form fields
  const [hoursPerWeek, setHoursPerWeek] = useState(6);
  const [examDate, setExamDate] = useState('');
  const [goal, setGoal] = useState('');

  async function loadPlan() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getStudyPlan(token, courseId);
      setStudyPlan(data);
      if (!data) setShowForm(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load study plan');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlan();
  }, [courseId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const data = await api.createStudyPlan(token, courseId, {
        hoursPerWeek: Number(hoursPerWeek),
        examDate: examDate || undefined,
        goal: goal.trim() || undefined,
      });

      setStudyPlan(data);
      setShowForm(false);
      toast.success('Study plan ready');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate study plan');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-2 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Study Plan</h3>
          <p className="text-xs text-muted-foreground">
            Weekly schedule based on your available hours and upcoming exams
          </p>
        </div>
        {studyPlan && !showForm && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setShowForm(true)}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Update Plan</span>
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="border-border bg-card/60 p-5">
          <form onSubmit={handleGenerate} className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              <span>Set your study schedule</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Hours per week
                </label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Exam or deadline (optional)
                </label>
                <Input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Goal or focus areas (optional)
              </label>
              <Textarea
                placeholder="e.g. Finish chapters 3–5 and focus on practice problems before midterms"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={2}
                maxLength={300}
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              {studyPlan && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" size="sm" disabled={generating} className="gap-1.5">
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{generating ? 'Creating plan...' : 'Create Plan'}</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {studyPlan && !showForm && (
        <div className="space-y-5">
          {/* Header Overview Card */}
          <Card className="border-border bg-card/60 p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                {studyPlan.plan.title}
              </h2>
              <Badge variant="outline" className="text-[10px]">
                Updated {new Date(studyPlan.updatedAt).toLocaleDateString()}
              </Badge>
            </div>
            <Markdown
              content={studyPlan.plan.overview}
              className="text-xs text-muted-foreground leading-relaxed"
            />
          </Card>

          {/* Schedule Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Weekly Schedule
            </h4>

            {studyPlan.plan.weeklySchedule.map((item, idx) => (
              <Card key={idx} className="border-border bg-card/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                      {item.period}
                    </span>
                    <span className="text-sm font-semibold">{item.topic}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    ~{item.estimatedHours} hrs
                  </span>
                </div>

                <div className="space-y-1.5 pt-1">
                  {item.tasks.map((task, taskIdx) => (
                    <div key={taskIdx} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{task}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* High-yield Tips */}
          {studyPlan.plan.tips && studyPlan.plan.tips.length > 0 && (
            <Card className="border-border bg-card/60 p-4 space-y-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <span>Study Tips</span>
              </h4>
              <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
                {studyPlan.plan.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
