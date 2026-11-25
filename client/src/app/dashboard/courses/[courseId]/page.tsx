'use client';

import React, { useEffect, useState, use } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Course, Material, api } from '@/lib/api';
import { MaterialUploader } from '@/components/materials/MaterialUploader';
import { MaterialList } from '@/components/materials/MaterialList';
import { CourseChat } from '@/components/chat/CourseChat';
import { CourseQuizzes } from '@/components/quizzes/CourseQuizzes';
import { CourseStudyPlan } from '@/components/study-plan/CourseStudyPlan';
import { CourseAssignments } from '@/components/assignments/CourseAssignments';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  GraduationCap,
  Users,
  FileText,
  Edit2,
  Trash2,
  MessageSquare,
  HelpCircle,
  CalendarCheck,
  ShieldAlert,
  AlertCircle,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const resolvedParams = use(params);
  const courseId = resolvedParams.courseId;

  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [dbUserId, setDbUserId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete / Leave course dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leavingCourse, setLeavingCourse] = useState(false);

  async function loadCourseDetails() {
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    try {
      const token = await getToken();
      if (!token) return;

      const [courseData, materialsData, meData] = await Promise.all([
        api.getCourse(token, courseId),
        api.getMaterials(token, courseId),
        api.getMe(token).catch(() => null),
      ]);

      setCourse(courseData);
      setMaterials(materialsData);
      if (meData?.id) setDbUserId(meData.id);
      setEditTitle(courseData.title);
      setEditDescription(courseData.description || '');
    } catch (err: any) {
      setErrorStatus(err.statusCode || 500);
      setErrorMessage(err.message || 'Failed to load course details');
    } finally {
      setLoading(false);
    }
  }

  async function reloadMaterials() {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await api.getMaterials(token, courseId);
      setMaterials(data);
    } catch (err) {
      console.error('Failed to reload materials:', err);
    }
  }

  useEffect(() => {
    loadCourseDetails();
  }, [courseId, getToken]);

  // Pre-Phase 3 Fix 4: Poll materials every 4 seconds while any are PENDING (stops when none are PENDING or after 2 mins)
  useEffect(() => {
    const hasPending = materials.some((m) => m.status === 'PENDING');
    if (!hasPending) return;

    let ticks = 0;
    const maxTicks = 30; // 30 * 4s = 120s = 2 minutes

    const interval = setInterval(async () => {
      ticks += 1;
      if (ticks >= maxTicks) {
        clearInterval(interval);
        return;
      }
      try {
        const token = await getToken();
        if (!token) return;
        const fresh = await api.getMaterials(token, courseId);

        setMaterials((prev) => {
          fresh.forEach((f) => {
            const old = prev.find((p) => p.id === f.id);
            if (old && old.status === 'PENDING') {
              if (f.status === 'READY') {
                toast.success(`${f.name} is ready`);
              } else if (f.status === 'FAILED') {
                toast.error(`${f.name} failed to process`);
              }
            }
          });
          return fresh;
        });

        if (fresh.every((m) => m.status !== 'PENDING')) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [materials, courseId, getToken]);

  const currentUserId = dbUserId || user?.id;
  const isOwner =
    course?.isOwner ??
    (course?.ownerId === currentUserId ||
      course?.owner?.id === currentUserId ||
      course?.owner?.email === user?.primaryEmailAddress?.emailAddress);

  async function handleUpdateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!editTitle.trim()) {
      toast.error('Course title is required');
      return;
    }

    setEditSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const updated = await api.updateCourse(token, courseId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });

      setCourse((prev) => (prev ? { ...prev, ...updated } : updated));
      toast.success('Changes saved');
      setEditDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update course');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteCourse() {
    setDeletingCourse(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      await api.deleteCourse(token, courseId);
      toast.success('Course deleted');
      router.push('/dashboard/courses');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete course');
      setDeletingCourse(false);
    }
  }

  async function handleLeaveCourse() {
    setLeavingCourse(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      await api.unenrollCourse(token, courseId);
      toast.success(`Left "${course?.title}"`);
      router.push('/dashboard/courses');
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave course');
      setLeavingCourse(false);
    }
  }

  // 403 Forbidden Access State
  if (errorStatus === 403) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 px-4 text-center max-w-2xl mx-auto my-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-md">
          You aren&apos;t enrolled in this course yet. Join it from Explore to access its materials.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/dashboard/explore">Browse Explore</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/courses">My Courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 404 Not Found State
  if (errorStatus === 404) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 px-4 text-center max-w-2xl mx-auto my-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4 text-muted-foreground">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold">Course Not Found</h2>
        <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-md">
          This course doesn&apos;t exist or may have been deleted.
        </p>
        <Button asChild>
          <Link href="/dashboard/courses">Return to My Courses</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-36" />
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-24" />
          </div>
        </Card>
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Back Link */}
      <div>
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to My Courses
        </Link>
      </div>

      {/* Course Banner & Actions */}
      <div className="rounded-2xl border border-border bg-gradient-to-r from-card via-card/80 to-primary/5 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isOwner ? 'default' : 'secondary'}>
                {isOwner ? 'Instructor & Owner' : 'Enrolled Student'}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                {course._count?.enrollments ?? 0} Students enrolled
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                {materials.length} Materials
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {course.title}
            </h1>

            <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
              {course.description || 'No description provided for this course.'}
            </p>

            <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span>Created by {course.owner?.name || 'Instructor'}</span>
            </div>
          </div>

          {/* Owner actions (Edit / Delete) or Student Leave Course */}
          {isOwner ? (
            <div className="flex gap-2 shrink-0 self-start">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setEditDialogOpen(true)}
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 shrink-0 self-start">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                onClick={() => setLeaveDialogOpen(true)}
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave Course
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Feature Navigation Tabs (Consolidated to 5 core tabs) */}
      <Tabs defaultValue="materials" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-2 p-1.5 bg-card/60 border border-border">
          <TabsTrigger value="materials" className="gap-2">
            <FileText className="h-4 w-4" />
            Materials ({materials.length})
          </TabsTrigger>

          <TabsTrigger value="ask-ai" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Ask AI
          </TabsTrigger>

          <TabsTrigger value="quizzes" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            Quizzes
          </TabsTrigger>

          <TabsTrigger value="study-plan" className="gap-2">
            <CalendarCheck className="h-4 w-4" />
            Study Plan
          </TabsTrigger>

          <TabsTrigger value="assignments" className="gap-2">
            <FileText className="h-4 w-4" />
            Assignments
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Materials */}
        <TabsContent value="materials" className="space-y-6">
          {/* Uploader / Write Note Card */}
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Add Course Material</h2>
              <p className="text-xs text-muted-foreground">
                Upload PDFs, Word docs, text files, or audio recordings, or write notes manually.
              </p>
            </div>
            <MaterialUploader
              courseId={courseId}
              onUploadSuccess={reloadMaterials}
            />
          </div>

          {/* Materials List Card */}
          <div className="space-y-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Course Materials</h2>
                <p className="text-xs text-muted-foreground">
                  Files, written notes, and recordings shared in this course.
                </p>
              </div>
            </div>

            <MaterialList
              materials={materials}
              loading={loading}
              isCourseOwner={Boolean(isOwner)}
              currentUserId={currentUserId}
              onMaterialDeleted={reloadMaterials}
            />
          </div>
        </TabsContent>

        {/* Tab 2: Ask AI (Unified Notes Q&A + Tutor Mode) */}
        <TabsContent value="ask-ai" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <CourseChat courseId={courseId} materials={materials} />
        </TabsContent>

        {/* Tab 3: Quizzes */}
        <TabsContent value="quizzes" forceMount className="space-y-6 data-[state=inactive]:hidden">
          <CourseQuizzes
            courseId={courseId}
            materials={materials}
            isCourseOwner={Boolean(isOwner)}
          />
        </TabsContent>

        {/* Tab 4: Study Plan */}
        <TabsContent value="study-plan" className="space-y-6">
          <CourseStudyPlan courseId={courseId} />
        </TabsContent>

        {/* Tab 5: Assignments */}
        <TabsContent value="assignments" className="space-y-6">
          <CourseAssignments courseId={courseId} />
        </TabsContent>
      </Tabs>

      {/* Edit Course Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleUpdateCourse}>
            <DialogHeader>
              <DialogTitle>Edit Course</DialogTitle>
              <DialogDescription>
                Update the title or description of this course.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="edit-title" className="text-sm font-medium">
                  Course Title <span className="text-destructive">*</span>
                </label>
                <Input
                  id="edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  required
                  disabled={editSaving}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="edit-desc" className="text-sm font-medium">
                  Description
                </label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  disabled={editSaving}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Leave Course Confirmation Dialog */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Leave Course?</DialogTitle>
            <DialogDescription>
              Are you sure you want to unenroll from{' '}
              <strong className="text-foreground">&ldquo;{course.title}&rdquo;</strong>?
              You can rejoin anytime from Explore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setLeaveDialogOpen(false)}
              disabled={leavingCourse}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveCourse}
              disabled={leavingCourse}
            >
              {leavingCourse ? 'Leaving...' : 'Leave Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Course Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Course?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong className="text-foreground">"{course.title}"</strong>?
              This will remove all associated study materials, enrollments, and data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingCourse}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCourse}
              disabled={deletingCourse}
            >
              {deletingCourse ? 'Deleting...' : 'Delete Course'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
