'use client';

import { useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { api, Course } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, BookOpen, GraduationCap, Users, FileText, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CoursesPage() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create course dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadCourses() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getCourses(token);
      setCourses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch courses');
      toast.error('Could not load courses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourses();
  }, [getToken]);

  const currentUserId = user?.id;
  // A course is owned if ownerId matches, or owner.id matches, or owner.email matches
  const ownedCourses = courses.filter(
    (c) =>
      c.ownerId === currentUserId ||
      c.owner?.id === currentUserId ||
      c.owner?.email === user?.primaryEmailAddress?.emailAddress
  );
  const enrolledCourses = courses.filter((c) => !ownedCourses.includes(c));

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Course title is required');
      return;
    }

    if (trimmedTitle.length > 100) {
      setFormError('Course title must be 100 characters or less');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const created = await api.createCourse(token, {
        title: trimmedTitle,
        description: description.trim() || undefined,
      });

      toast.success(`Course "${created.title}" created successfully!`);
      setTitle('');
      setDescription('');
      setDialogOpen(false);
      // Reload list
      await loadCourses();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create course');
      toast.error(err.message || 'Failed to create course');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">My Courses</h1>
          <p className="text-sm text-muted-foreground">
            Manage your created courses or view courses you are currently enrolled in.
          </p>
        </div>

        {/* Create Course Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Create Course
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <form onSubmit={handleCreateCourse}>
              <DialogHeader>
                <DialogTitle>Create New Course</DialogTitle>
                <DialogDescription>
                  Enter a title and brief overview. You will be set as the course owner.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {formError && (
                  <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="title" className="text-sm font-medium">
                    Course Title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="title"
                    placeholder="e.g. Distributed Operating Systems"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    disabled={submitting}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description <span className="text-xs text-muted-foreground">(Optional)</span>
                  </label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of course topics, prerequisites, or objectives..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    disabled={submitting}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Course'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadCourses}>
            Retry
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="owned" className="space-y-6">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="owned">
            Owned ({ownedCourses.length})
          </TabsTrigger>
          <TabsTrigger value="enrolled">
            Enrolled ({enrolledCourses.length})
          </TabsTrigger>
        </TabsList>

        {/* Owned Courses Tab */}
        <TabsContent value="owned" className="space-y-4">
          {loading ? (
            <CourseSkeletonGrid />
          ) : ownedCourses.length === 0 ? (
            <EmptyState
              title="No courses created yet"
              description="Get started by creating your first course to upload lecture material and study notes."
              action={
                <Button onClick={() => setDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Course
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ownedCourses.map((course) => (
                <CourseCard key={course.id} course={course} isOwner={true} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Enrolled Courses Tab */}
        <TabsContent value="enrolled" className="space-y-4">
          {loading ? (
            <CourseSkeletonGrid />
          ) : enrolledCourses.length === 0 ? (
            <EmptyState
              title="Not enrolled in any course"
              description="Explore courses created by other students or instructors to start learning."
              action={
                <Button asChild className="gap-2">
                  <Link href="/dashboard/explore">
                    <BookOpen className="h-4 w-4" />
                    Browse Courses
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {enrolledCourses.map((course) => (
                <CourseCard key={course.id} course={course} isOwner={false} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CourseCard({ course, isOwner }: { course: Course; isOwner: boolean }) {
  return (
    <Card className="flex flex-col justify-between border-border hover:border-primary/50 transition-all hover:shadow-md">
      <CardHeader>
        <div className="flex justify-between items-start gap-2">
          <Badge variant={isOwner ? 'default' : 'secondary'}>
            {isOwner ? 'Instructor / Owner' : 'Enrolled'}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {course._count?.enrollments ?? 0}
          </span>
        </div>
        <CardTitle className="text-lg line-clamp-1 mt-2">{course.title}</CardTitle>
        <CardDescription className="line-clamp-2 min-h-[2.5rem]">
          {course.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 text-primary" />
          <span>Instructor: {course.owner?.name || 'You'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          <span>{course._count?.materials ?? 0} study materials uploaded</span>
        </div>
      </CardContent>

      <CardFooter className="pt-2 border-t border-border/50">
        <Button variant="secondary" size="sm" className="w-full gap-2 group" asChild>
          <Link href={`/dashboard/courses/${course.id}`}>
            Open Course
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function CourseSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="space-y-4 p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-10 w-full" />
          <div className="pt-4 border-t border-border">
            <Skeleton className="h-8 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">{description}</p>
      {action}
    </div>
  );
}
