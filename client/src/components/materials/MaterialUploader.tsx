'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  UploadCloud,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';

interface UploadingFile {
  id: string;
  file: globalThis.File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  errorMessage?: string;
}

interface MaterialUploaderProps {
  courseId: string;
  onUploadSuccess: () => void;
}

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.webm',
  '.aac',
  '.flac',
];

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac', '.flac'];

const MAX_DOC_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function MaterialUploader({
  courseId,
  onUploadSuccess,
}: MaterialUploaderProps) {
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([]);

  function validateFile(file: globalThis.File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${file.name}" is not supported. Allowed: PDF, DOCX, TXT, and audio.`;
    }

    const isAudio = AUDIO_EXTENSIONS.includes(ext) || file.type.startsWith('audio/');
    const limit = isAudio ? MAX_AUDIO_SIZE : MAX_DOC_SIZE;
    const limitLabel = isAudio ? '25 MB' : '50 MB';

    if (file.size > limit) {
      return `"${file.name}" exceeds the ${limitLabel} size limit.`;
    }

    return null;
  }

  async function uploadSingleFile(uploadItem: UploadingFile) {
    const token = await getToken();
    if (!token) {
      toast.error('Please sign in to upload files');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadItem.file);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === uploadItem.id ? { ...item, progress: percent } : item
          )
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === uploadItem.id
              ? { ...item, progress: 100, status: 'completed' }
              : item
          )
        );
        toast.success(`Uploaded "${uploadItem.file.name}"`);
        onUploadSuccess();
      } else {
        let errorMsg = 'Upload failed';
        try {
          const parsed = JSON.parse(xhr.responseText);
          errorMsg = parsed.error || errorMsg;
        } catch {
          // fallback
        }
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === uploadItem.id
              ? { ...item, status: 'error', errorMessage: errorMsg }
              : item
          )
        );
        toast.error(`Failed to upload "${uploadItem.file.name}": ${errorMsg}`);
      }
    };

    xhr.onerror = () => {
      setUploadQueue((prev) =>
        prev.map((item) =>
          item.id === uploadItem.id
            ? { ...item, status: 'error', errorMessage: 'Network connection error' }
            : item
        )
      );
      toast.error(`Network error uploading "${uploadItem.file.name}"`);
    };

    xhr.open('POST', `${API_BASE_URL}/api/materials/${courseId}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const newItems: UploadingFile[] = [];

    Array.from(files).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }

      const uploadItem: UploadingFile = {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        progress: 0,
        status: 'uploading',
      };

      newItems.push(uploadItem);
    });

    if (newItems.length > 0) {
      setUploadQueue((prev) => [...newItems, ...prev]);
      newItems.forEach((item) => uploadSingleFile(item));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function removeQueueItem(id: string) {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border bg-card/40 hover:border-primary/50 hover:bg-card/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <UploadCloud className="h-7 w-7" />
        </div>

        <h3 className="font-semibold text-base">
          Drop files here, or click to browse
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          PDF, Word, or text files up to 50 MB. Audio up to 25 MB.
        </p>

        <div className="flex items-center gap-3 mt-4 text-[11px] text-muted-foreground font-medium">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-primary" /> Documents ≤ 50MB
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Music className="h-3.5 w-3.5 text-primary" /> Audio ≤ 25MB
          </span>
        </div>
      </div>

      {/* Upload Progress Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Uploads</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() =>
                setUploadQueue((prev) =>
                  prev.filter((item) => item.status === 'uploading')
                )
              }
            >
              Clear completed
            </Button>
          </div>

          <div className="space-y-2">
            {uploadQueue.map((item) => (
              <Card key={item.id} className="border-border bg-card/60 p-3 shadow-none">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <File className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-xs sm:max-w-md">
                        {item.file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {item.status === 'uploading' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium">
                          {item.progress}%
                        </span>
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    )}
                    {item.status === 'completed' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> Uploaded
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                        <AlertCircle className="h-4 w-4" /> Failed
                      </span>
                    )}
                    {item.status !== 'uploading' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label="Remove from upload queue"
                        onClick={() => removeQueueItem(item.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {item.status === 'uploading' && (
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full bg-primary transition-all duration-200"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                {item.errorMessage && (
                  <p className="text-[11px] text-destructive mt-1">
                    {item.errorMessage}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
