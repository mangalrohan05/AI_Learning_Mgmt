'use client';

import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BookOpen,
  GraduationCap,
  Sparkles,
  FileText,
  HelpCircle,
  Award,
  TrendingUp,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface ProgressData {
  counts: {
    courses: number;
    materialsUploaded: number;
    quizzesAttempted: number;
    assignmentsEvaluated: number;
  };
  averageQuizScore: number;
  recentScores: {
    id: string;
    name: string;
    quizTitle: string;
    courseTitle: string;
    score: number;
    date: string;
  }[];
  courseProgress: {
    courseId: string;
    courseTitle: string;
    totalQuizzes: number;
    completedQuizzes: number;
    completionPercentage: number;
  }[];
}

export default function DashboardOverviewPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProgress() {
      try {
        const token = await getToken();
        if (token) {
          const res = await api.getUserProgress(token);
          setProgress(res);
        }
      } catch (err) {
        console.error('Failed to load dashboard progress:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProgress();
  }, [getToken]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-card via-card/80 to-primary/10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="default" className="text-[10px]">
                AI-Powered Learning
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">
                AI Tutor • Quizzes • Study Planner • Assignments
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Welcome back, {user?.firstName || 'Student'}! 👋
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Track your quiz performances, monitor course completion, and use AI study tools.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Button asChild>
              <Link href="/dashboard/courses">My Courses</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/explore">Browse Courses</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Active Courses</CardTitle>
            <GraduationCap className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">{progress?.counts.courses ?? 0}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Owned & enrolled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Materials Uploaded</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {progress?.counts.materialsUploaded ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Documents & notes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Quizzes Attempted</CardTitle>
            <HelpCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {progress?.counts.quizzesAttempted ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Practice sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Assignments Evaluated</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold">
                {progress?.counts.assignmentsEvaluated ?? 0}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">AI graded submissions</p>
          </CardContent>
        </Card>

        <Card className="col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Average Score</CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {progress?.averageQuizScore ?? 0}%
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">Across all quizzes</p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics: Bar Chart & Per-Course Completion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Recharts Bar Chart of Recent Quiz Scores */}
        <Card className="lg:col-span-7 border-border bg-card/60 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Recent Quiz Scores
                </CardTitle>
                <CardDescription className="text-xs">
                  Score trends across your last 10 quiz attempts
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Last 10 Attempts
              </Badge>
            </div>

            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
            ) : progress?.recentScores && progress.recentScores.length > 0 ? (
              <div className="h-64 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={progress.recentScores} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-border bg-card p-3 shadow-lg text-xs">
                              <p className="font-bold text-foreground">{data.quizTitle}</p>
                              <p className="text-[11px] text-muted-foreground">{data.courseTitle}</p>
                              <p className="text-primary font-black mt-1">Score: {data.score}%</p>
                              <p className="text-[10px] text-muted-foreground">{data.date}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="score"
                      fill="#6366f1"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border rounded-xl text-center p-6">
                <TrendingUp className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold">No quiz attempts yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Take a practice quiz in any of your courses to view your score trends and retention insights!
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Right: Per-Course Progress Bars */}
        <Card className="lg:col-span-5 border-border bg-card/60 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Course Quiz Completion
                </CardTitle>
                <CardDescription className="text-xs">
                  Quizzes attempted at least once per course
                </CardDescription>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : progress?.courseProgress && progress.courseProgress.length > 0 ? (
              <div className="space-y-4">
                {progress.courseProgress.map((item) => (
                  <div
                    key={item.courseId}
                    className="p-3 rounded-xl border border-border/80 bg-background/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/dashboard/courses/${item.courseId}`}
                        className="text-xs font-semibold hover:text-primary transition-colors truncate"
                      >
                        {item.courseTitle}
                      </Link>
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                        {item.completedQuizzes} / {item.totalQuizzes} ({item.completionPercentage}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${item.completionPercentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border rounded-xl text-center p-6">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold">No courses found</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Enroll in a course from the Explore catalog to track your learning journey.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
