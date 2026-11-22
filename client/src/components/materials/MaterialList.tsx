'use client';

import React, { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Material, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  FileCode,
  Music,
  Download,
  Trash2,
  FileQuestion,
  Loader2,
  Calendar,
  User,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialListProps {
  materials: Material[];
  loading: boolean;
  isCourseOwner: boolean;
  currentUserId?: string;
  onMaterialDeleted: () => void;
}

export function MaterialList({
  materials,
  loading,
  isCourseOwner,
  currentUserId,
  onMaterialDeleted,
}: MaterialListProps) {
  const { getToken } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteMaterial, setConfirmDeleteMaterial] = useState<Material | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  // Summary dialog state
  const [summaryMaterial, setSummaryMaterial] = useState<Material | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState(false);

  async function handleReprocess(material: Material) {
    setReprocessingId(material.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await api.reprocessMaterial(token, material.id);
      toast.success(`Reprocessing "${material.name}" — status will update shortly.`);
      // Refresh the list so FAILED badge transitions to PENDING immediately
      onMaterialDeleted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start reprocessing');
    } finally {
      setReprocessingId(null);
    }
  }

  async function handleSummarize(material: Material) {
    setSummaryMaterial(material);
    setSummaryLoading(true);
    setSummaryText(null);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const data = await api.summarizeMaterial(token, material.id);
      setSummaryText(data.summary);
      setSummaryCached(data.cached);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate summary');
      setSummaryMaterial(null);
    } finally {
      setSummaryLoading(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatDate(dateString: string): string {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getFileIcon(type: string) {
    switch (type) {
      case 'PDF':
        return <FileText className="h-5 w-5 text-rose-400 shrink-0" />;
      case 'DOCX':
        return <FileText className="h-5 w-5 text-blue-400 shrink-0" />;
      case 'TXT':
        return <FileCode className="h-5 w-5 text-amber-400 shrink-0" />;
      case 'AUDIO':
        return <Music className="h-5 w-5 text-purple-400 shrink-0" />;
      default:
        return <FileQuestion className="h-5 w-5 text-muted-foreground shrink-0" />;
    }
  }

  async function handleDownload(material: Material) {
    setDownloadingId(material.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      await api.downloadMaterial(token, material.id, material.name);
      toast.success(`Downloaded "${material.name}"`);
    } catch (err: any) {
      toast.error(err.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteMaterial) return;
    setDeletingId(confirmDeleteMaterial.id);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      await api.deleteMaterial(token, confirmDeleteMaterial.id);
      toast.success(`Deleted "${confirmDeleteMaterial.name}"`);
      setConfirmDeleteMaterial(null);
      onMaterialDeleted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete material');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-border p-4 bg-card/40"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3 text-muted-foreground">
          <FileText className="h-6 w-6" />
        </div>
        <h4 className="text-sm font-semibold">No materials uploaded yet</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Upload PDF notes, Word docs, text summaries, or lecture audio above to make them available for studying.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2.5 pt-2">
        {materials.map((m) => {
          const canDelete = isCourseOwner || m.uploaderId === currentUserId;
          const isDownloading = downloadingId === m.id;

          return (
            <Card
              key={m.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-border bg-card/60 hover:bg-card/90 transition-colors"
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 shrink-0">
                  {getFileIcon(m.type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground truncate max-w-xs sm:max-w-md">
                      {m.name}
                    </span>
                    <Badge
                      variant={
                        m.status === 'READY'
                          ? 'outline'
                          : m.status === 'PENDING'
                          ? 'secondary'
                          : 'destructive'
                      }
                      className="text-[10px] uppercase font-mono px-1.5 py-0"
                    >
                      {m.status}
                    </Badge>
                    {m.status === 'FAILED' && m.failureReason && (
                      <span className="text-[11px] text-destructive/90 font-normal">
                        {m.failureReason}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>{formatFileSize(m.size)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(m.createdAt)}
                    </span>
                    {m.uploader?.name && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {m.uploader.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {m.status === 'READY' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
                    onClick={() => handleSummarize(m)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Summarize</span>
                  </Button>
                )}

                {m.status === 'FAILED' && canDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    disabled={reprocessingId === m.id}
                    onClick={() => handleReprocess(m)}
                  >
                    {reprocessingId === m.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    <span>{reprocessingId === m.id ? 'Retrying…' : 'Retry'}</span>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                  disabled={isDownloading}
                  onClick={() => handleDownload(m)}
                >
                  {isDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>Download</span>
                </Button>

                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteMaterial(m)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteMaterial}
        onOpenChange={(open) => !open && setConfirmDeleteMaterial(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Study Material?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong className="text-foreground">
                "{confirmDeleteMaterial?.name}"
              </strong>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteMaterial(null)}
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={deletingId !== null}
            >
              {deletingId ? 'Deleting...' : 'Delete Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Summary Dialog */}
      <Dialog
        open={!!summaryMaterial}
        onOpenChange={(open) => !open && setSummaryMaterial(null)}
      >
        <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-semibold">
                    Document Summary
                  </DialogTitle>
                  {summaryCached && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Cached
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs truncate max-w-sm mt-0.5">
                  {summaryMaterial?.name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 py-3">
            {summaryLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">
                  Reading document chunks and synthesizing summary with Gemini 1.5 Flash...
                </p>
              </div>
            ) : summaryText ? (
              <div className="rounded-xl border border-border/80 bg-background/50 p-4 text-sm text-foreground/90 whitespace-pre-line leading-relaxed space-y-3">
                {summaryText}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No summary generated yet.
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSummaryMaterial(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
