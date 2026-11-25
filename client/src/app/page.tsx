export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  GraduationCap,
  MessageSquare,
  FileText,
  BrainCircuit,
  CalendarCheck,
  CheckCircle,
  ArrowRight,
  Headphones,
  Award,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2.5 font-bold text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span>AI LMS</span>
        </div>

        <nav className="flex items-center gap-3">
          <ThemeToggle />
          <Suspense fallback={<div className="h-8 w-24" />}>
            <Show when="signed-out">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Sign up</Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard">Open Dashboard</Link>
              </Button>
              <UserButton />
            </Show>
          </Suspense>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-28 px-4 text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto space-y-6">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Course & Study Workspace
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
            Study directly from your{' '}
            <span className="bg-gradient-to-r from-primary via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              own course files
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
            Keep lecture notes, PDFs, slides, and recorded talks in one place. Search across your materials with citations, work through hard topics step by step, and practice before exams.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Suspense fallback={<div className="h-11 w-36" />}>
              <Show when="signed-out">
                <Button size="lg" className="gap-2 shadow-md w-full sm:w-auto" asChild>
                  <Link href="/sign-up">
                    Get started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              </Show>
              <Show when="signed-in">
                <Button size="lg" className="gap-2 shadow-md w-full sm:w-auto" asChild>
                  <Link href="/dashboard">
                    Go to dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Show>
            </Suspense>
          </div>

          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Source-cited answers
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Audio lecture transcripts
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Practice quizzes & plans
            </span>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="py-16 px-4 max-w-6xl mx-auto space-y-12 border-t border-border/60">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Everything for your coursework</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Built for instructors sharing material and students preparing for exams.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <MessageSquare className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Ask Your Materials</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Upload PDFs, Word docs, or plain text notes and get answers backed by excerpts from your files.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Step-by-Step Tutor</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Break down difficult concepts with worked examples grounded in your course syllabus.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Practice Quizzes</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Turn your notes into multiple-choice quizzes and review short explanations for every question.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Study Schedule</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Set your weekly study hours and exam date to map out topics week by week.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Headphones className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Lecture Transcripts</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Upload audio recordings under 25 MB to transcribe them and include them in search and summaries.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Award className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Assignment Feedback</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Submit drafts as text or documents for a quick rubric score and notes on what to improve.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        <p>AI LMS — Coursework & Study Workspace</p>
      </footer>
    </div>
  );
}
