'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null;

  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none leading-relaxed break-words text-foreground/90',
        'prose-p:my-1.5 prose-p:leading-relaxed',
        'prose-headings:text-foreground prose-headings:font-bold prose-headings:my-2',
        'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm',
        'prose-ul:my-1.5 prose-ul:pl-4 prose-ul:space-y-1',
        'prose-ol:my-1.5 prose-ol:pl-4 prose-ol:space-y-1',
        'prose-li:my-0',
        'prose-strong:text-foreground prose-strong:font-semibold',
        'prose-blockquote:border-l-2 prose-blockquote:border-primary/60 prose-blockquote:pl-3 prose-blockquote:italic prose-blockquote:text-muted-foreground prose-blockquote:my-2',
        'prose-code:text-primary prose-code:bg-muted/70 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2 prose-pre:overflow-x-auto',
        'prose-table:text-xs prose-table:my-2 prose-table:border prose-table:border-border prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:p-2 prose-td:border prose-td:border-border prose-td:p-2',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-80 transition-opacity"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
