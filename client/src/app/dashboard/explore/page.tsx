'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { api, ExploreCourse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Compass, GraduationCap, CheckCircle2, AlertCircle, BookOpen, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function ExploreCoursesPage() {
  const { getToken } = useAuth();
  const [courses, setCourses] = useState<ExploreCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  async function loadExploreCourses() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getExploreCourses(token);
      setCourses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load courses');
      toast.error('Could not load explore courses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExploreCourses();
  }, [getToken]);

  async function handleEnroll(course: ExploreCourse) {
    setEnrollingId(course.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      await api.enrollCourse(token, course.id);
      toast.success(`Enrolled in ${course.title}`);

      // Optimistically remove from explore list
      setCourses((prev) => prev.filter((c) => c.id !== course.id));
    } catch (err: any) {
      toast.error(err.message || 'Failed to enroll');
    } finally {
      setEnrollingId(null);
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCourses = normalizedQuery
    ? courses.filter(
        (c) =>
          c.title.toLowerCase().includes(normalizedQuery) ||
          (c.description && c.description.toLowerCase().includes(normalizedQuery)) ||
          (c.owner?.name && c.owner.name.toLowerCase().includes(normalizedQuery))
      )
    : courses;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Explore Courses</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse available courses and join with one click.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/dashboard/courses" className="gap-2">
            <BookOpen className="h-4 w-4" />
            My Courses
          </Link>
        </Button>
      </div>

      {/* Search Bar */}
      {!loading && courses.length > 0 && (
        <div className="relative max-w-md">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Search courses by title, description, or instructor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadExploreCourses}>
            Retry
          </Button>
        </div>
      )}

      {/* Course List / Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5 space-y-4">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-9 w-full" />
            </Card>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 px-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold">Nothing new to join</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
            You already own or are enrolled in every available course.
          </p>
          <Button asChild>
            <Link href="/dashboard/courses">Go to My Courses</Link>
          </Button>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-14 px-4 text-center">
          <p className="text-sm font-semibold">No courses match &ldquo;{searchQuery.trim()}&rdquo;</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Try a different keyword or clear the search filter.
          </p>
          <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCourses.map((course) => {
            const isEnrolling = enrollingId === course.id;
            return (
              <Card
                key={course.id}
                className="flex flex-col justify-between border-border hover:border-primary/40 transition-all hover:shadow-sm"
              >
                <CardHeader>
                  <div className="flex justify-between items-start gap-2">
                    <Badge variant="outline" className="text-xs">
                      Available to Enroll
                    </Badge>
                  </div>
                  <CardTitle className="text-lg line-clamp-1 mt-2">
                    {course.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {course.description || 'No description provided.'}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="h-3.5 w-3.5 text-primary" />
                    <span>Instructor: {course.owner?.name || 'Instructor'}</span>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t border-border/50">
                  <Button
                    className="w-full gap-2"
                    disabled={isEnrolling}
                    onClick={() => handleEnroll(course)}
                  >
                    {isEnrolling ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enrolling...
                      </>
                    ) : (
                      'Enroll in Course'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
