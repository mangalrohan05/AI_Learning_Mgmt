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
  FileText,
  HelpCircle,
  Award,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  Clock,
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
  recentCourses?: {
    id: string;
    title: string;
    description: string | null;
    isOwner: boolean;
    materialsCount: number;
    quizzesCount: number;
  }[];
  courseProgress: {
    courseId: string;
    courseTitle: string;
    totalQuizzes: number;
    completedQuizzes: number;
    materialsCount?: number;
    assignmentsCount?: number;
    completionPercentage: number;
  }[];
}

export default function DashboardOverviewPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    const slowTimer = setTimeout(() => setSlowLoading(true), 4000);
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
        clearTimeout(slowTimer);
        setLoading(false);
        setSlowLoading(false);
      }
    }
    loadProgress();
    return () => clearTimeout(slowTimer);
  }, [getToken]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-card via-card/80 to-primary/10 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Welcome back, {user?.firstName || 'there'}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Your courses, recent quiz scores, and progress at a glance.
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

      {/* Cold-Start Server Wake Notice */}
      {loading && slowLoading && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
          <Clock className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Waking up the backend server — free-tier cold starts can take up to 30 seconds on the first load.
          </span>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Courses</CardTitle>
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
            <CardTitle className="text-xs font-medium">Materials</CardTitle>
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
            <p className="text-[11px] text-muted-foreground mt-1">Files & recordings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Quizzes Taken</CardTitle>
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
            <p className="text-[11px] text-muted-foreground mt-1">Completed attempts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium">Assignments</CardTitle>
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
            <p className="text-[11px] text-muted-foreground mt-1">Graded submissions</p>
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
            <p className="text-[11px] text-muted-foreground mt-1">Across quizzes</p>
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
                  Your last 10 quiz attempts
                </CardDescription>
              </div>
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
                  Take a quiz in any course to see your scores here.
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
                  Course Progress
                </CardTitle>
                <CardDescription className="text-xs">
                  Quizzes tried in each course
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

                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                      <span>{item.materialsCount ?? 0} materials</span>
                      <span>•</span>
                      <span>{item.assignmentsCount ?? 0} assignments</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-border rounded-xl text-center p-6">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold">No courses yet</p>
                <p className="text-xs text-muted-foreground max-w-xs mt-1">
                  Create a course or join one from Explore to track your progress.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Access: Your Courses */}
      {!loading && progress?.recentCourses && progress.recentCourses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Your Courses</h2>
            <Link
              href="/dashboard/courses"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {progress.recentCourses.slice(0, 6).map((course) => (
              <Link
                key={course.id}
                href={`/dashboard/courses/${course.id}`}
                className="group rounded-xl border border-border bg-card/60 p-4 hover:border-primary/50 hover:bg-card/90 transition-all flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={course.isOwner ? 'default' : 'secondary'} className="text-[10px]">
                      {course.isOwner ? 'Owner' : 'Enrolled'}
                    </Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <h3 className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                    {course.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {course.description || 'Open course workspace'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
                  <span>{course.materialsCount} materials</span>
                  <span>•</span>
                  <span>{course.quizzesCount} quizzes</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
