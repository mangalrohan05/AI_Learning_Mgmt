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
import { Markdown } from '@/components/ui/markdown';
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
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Check,
  AlignLeft,
} from 'lucide-react';
import { toast } from 'sonner';

interface MaterialListProps {
  materials: Material[];
  loading: boolean;
  isCourseOwner: boolean;
  currentUserId?: string;
  onMaterialDeleted: () => void;
}

interface SummaryState {
  expanded: boolean;
  loading: boolean;
  text?: string;
  cached?: boolean;
  error?: string;
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

  // Per-material inline summary state & note/transcript viewer state
  const [summaryStates, setSummaryStates] = useState<Record<string, SummaryState>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function toggleNoteViewer(materialId: string) {
    setExpandedNotes((prev) => ({
      ...prev,
      [materialId]: !prev[materialId],
    }));
  }

  async function handleCopyText(materialId: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(materialId);
      setTimeout(() => setCopiedId((prev) => (prev === materialId ? null : prev)), 2000);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy text');
    }
  }

  async function handleReprocess(material: Material) {
    setReprocessingId(material.id);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await api.reprocessMaterial(token, material.id);
      toast.success(`Reprocessing "${material.name}" — status will update shortly.`);
      onMaterialDeleted();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start reprocessing');
    } finally {
      setReprocessingId(null);
    }
  }

  function toggleSummary(material: Material) {
    const current = summaryStates[material.id];
    if (current?.expanded) {
      setSummaryStates((prev) => ({
        ...prev,
        [material.id]: { ...prev[material.id], expanded: false },
      }));
    } else {
      if (current?.text || material.summary) {
        setSummaryStates((prev) => ({
          ...prev,
          [material.id]: {
            expanded: true,
            loading: false,
            text: current?.text || material.summary || '',
            cached: current?.cached ?? true,
          },
        }));
      } else {
        fetchSummary(material);
      }
    }
  }

  async function fetchSummary(material: Material, force = false) {
    setSummaryStates((prev) => ({
      ...prev,
      [material.id]: {
        expanded: true,
        loading: true,
        text: force ? prev[material.id]?.text : undefined,
        error: undefined,
      },
    }));

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const data = await api.summarizeMaterial(token, material.id, force);
      setSummaryStates((prev) => ({
        ...prev,
        [material.id]: {
          expanded: true,
          loading: false,
          text: data.summary,
          cached: data.cached,
        },
      }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate summary');
      setSummaryStates((prev) => ({
        ...prev,
        [material.id]: {
          expanded: true,
          loading: false,
          error: err.message || 'Failed to generate summary',
        },
      }));
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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
          <FileText className="h-6 w-6" />
        </div>
        <h3 className="font-semibold text-base text-foreground">No materials yet</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          {isCourseOwner
            ? 'Upload notes, slides, or audio recordings above to get started.'
            : 'Nothing has been uploaded to this course yet.'}
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
          const summaryState = summaryStates[m.id];
          const hasSummary = !!(m.summary || summaryState?.text);

          return (
            <Card
              key={m.id}
              className="flex flex-col p-4 border-border bg-card/60 hover:bg-card/90 transition-all duration-200"
            >
              {/* Material Row Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                        className="text-[10px] px-1.5 py-0"
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
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 flex-wrap justify-end">
                  {m.transcript && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => toggleNoteViewer(m.id)}
                    >
                      <AlignLeft className="h-3.5 w-3.5" />
                      <span>
                        {expandedNotes[m.id]
                          ? 'Hide'
                          : m.type === 'AUDIO'
                            ? 'Transcript'
                            : 'View Note'}
                      </span>
                    </Button>
                  )}

                  {m.status === 'READY' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => toggleSummary(m)}
                    >
                      {summaryState?.expanded ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" />
                          <span>Hide Summary</span>
                        </>
                      ) : hasSummary ? (
                        <>
                          <FileText className="h-3.5 w-3.5" />
                          <span>View Summary</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Summarize</span>
                        </>
                      )}
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
                      aria-label="Delete material"
                      onClick={() => setConfirmDeleteMaterial(m)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Inline Note / Transcript Viewer */}
              {m.transcript && expandedNotes[m.id] && (
                <div className="mt-4 pt-3.5 border-t border-border/60 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <AlignLeft className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        {m.type === 'AUDIO' ? 'Audio Transcript' : 'Saved Note Text'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopyText(m.id, m.transcript || '')}
                      >
                        {copiedId === m.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleNoteViewer(m.id)}
                      >
                        Collapse
                      </Button>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3.5 border border-border/40 max-h-80 overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
                      {m.transcript}
                    </pre>
                  </div>
                </div>
              )}

              {/* Inline Expandable Summary */}
              {summaryState?.expanded && (
                <div className="mt-4 pt-3.5 border-t border-border/60 transition-all">
                  <div className="flex items-center justify-between mb-2.5 gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Study Summary
                      </span>
                      {summaryState.cached && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Cached
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={summaryState.loading}
                        className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => fetchSummary(m, true)}
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${summaryState.loading ? 'animate-spin' : ''}`}
                        />
                        <span>Regenerate</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSummary(m)}
                      >
                        Collapse
                      </Button>
                    </div>
                  </div>

                  {summaryState.loading ? (
                    <div className="space-y-2 py-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>Generating detailed study summary...</span>
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-4 w-4/6" />
                    </div>
                  ) : summaryState.error ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
                      <span className="text-destructive">{summaryState.error}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => fetchSummary(m, true)}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-4 border border-border/40 text-sm leading-relaxed">
                      <Markdown content={summaryState.text || ''} />
                    </div>
                  )}
                </div>
              )}
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
            <DialogTitle>Delete material?</DialogTitle>
            <DialogDescription>
              Delete{' '}
              <strong className="text-foreground">
                &ldquo;{confirmDeleteMaterial?.name}&rdquo;
              </strong>
              ? This can&apos;t be undone.
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
    </>
  );
}
