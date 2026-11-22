export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  GraduationCap,
  Sparkles,
  MessageSquare,
  FileText,
  BrainCircuit,
  CalendarCheck,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  BookOpen,
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
          <Badge variant="secondary" className="ml-1 text-[10px] hidden sm:inline-flex">
            BE Minor Project
          </Badge>
        </div>

        <nav className="flex items-center gap-3">
          <ThemeToggle />
          <Suspense fallback={<div className="h-8 w-24" />}>
            <Show when="signed-out">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Get Started</Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserButton />
            </Show>
          </Suspense>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-28 px-4 text-center">
        {/* Glow background effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-96 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto space-y-6">
          <Badge variant="outline" className="px-3.5 py-1 text-xs gap-1.5 border-primary/30 bg-primary/5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-Powered Learning Management System
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
            Learn Faster with Your Own{' '}
            <span className="bg-gradient-to-r from-primary via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              AI Study Companion
            </span>
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed">
            Upload course materials, slide decks, and lecture recordings. Chat with your documents using RAG, generate instant practice quizzes, and get tailored study plans.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
            <Suspense fallback={<div className="h-11 w-36" />}>
              <Show when="signed-out">
                <Button size="lg" className="gap-2 shadow-md w-full sm:w-auto" asChild>
                  <Link href="/sign-up">
                    Get Started Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              </Show>
              <Show when="signed-in">
                <Button size="lg" className="gap-2 shadow-md w-full sm:w-auto" asChild>
                  <Link href="/dashboard">
                    Go to Your Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </Show>
            </Suspense>
          </div>

          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Role-Based Access
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              PostgreSQL + Neon pgvector
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Gemini 1.5 Flash + Groq Whisper
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              Clerk Authentication
            </span>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="py-16 px-4 max-w-6xl mx-auto space-y-12 border-t border-border/60">
        <div className="text-center space-y-2">
          <Badge variant="secondary">Platform Capabilities</Badge>
          <h2 className="text-3xl font-bold tracking-tight">Built for Students & Instructors</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Everything you need to organize your college coursework and accelerate exam revision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <MessageSquare className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">PDF Chat & RAG</CardTitle>
              <CardDescription className="text-xs">
                Upload PDFs, DOCX, and text notes. Ask questions and get answers grounded with source page citations.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">24/7 AI Tutor</CardTitle>
              <CardDescription className="text-xs">
                Interactive conceptual explanations, step-by-step problem breakdowns, and smart lecture summaries.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Auto-Generated Quizzes</CardTitle>
              <CardDescription className="text-xs">
                Test your knowledge before exams with multiple-choice questions automatically created from course notes.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Smart Study Planner</CardTitle>
              <CardDescription className="text-xs">
                Dynamic revision roadmaps that prioritize difficult topics and pace your study schedule before tests.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Headphones className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Lecture Audio Transcription</CardTitle>
              <CardDescription className="text-xs">
                Upload audio recordings up to 25 MB. Groq Whisper automatically transcribes speech into indexed study material.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
                <Award className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">Automated Assignment Grading</CardTitle>
              <CardDescription className="text-xs">
                Submit assignments as text or files. Receive instant rubric evaluations, strengths, and actionable feedback.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border py-8 px-6 text-center text-xs text-muted-foreground">
        <p>AI Learning Management System — Bachelor of Engineering (IT) Minor Project</p>
        <p className="mt-1">Powered by Next.js, Express, Neon Lakebase Postgres, and Clerk</p>
      </footer>
    </div>
  );
}
