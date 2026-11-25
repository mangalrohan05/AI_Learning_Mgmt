import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { pathToFileURL } from 'url';
import path from 'path';
import mammoth from 'mammoth';
import { prisma } from '../lib/prisma';
import { storageProvider } from './storage/localStorageProvider';
import { embedDocuments } from '../lib/ai';
import { transcribeAudio } from '../lib/transcription';

/**
 * Extracts plain text from a PDF buffer using pdfjs-dist (legacy build).
 * This handles modern PDFs (XRef streams, compressed objects) exported from
 * Word, Chrome, LibreOffice, etc., unlike the deprecated pdf-parse@1.1.1
 * which uses an ancient pdf.js v1.10.100 that chokes on XRef streams.
 *
 * We load pdfjs-dist via dynamic import() because it is an ESM-only package
 * but this TypeScript project compiles to CommonJS.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import of ESM module from CJS context
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // require.resolve finds the actual file path of the worker across monorepo layouts.
  // pathToFileURL() converts it to a file:// URL, which pdfjs-dist requires on Windows.
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  // Resolve standard fonts directory to suppress "standardFontDataUrl" warnings
  const fontsPath = path.resolve(path.dirname(workerPath), '../../standard_fonts');
  const standardFontDataUrl = pathToFileURL(fontsPath).href + '/';

  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    standardFontDataUrl,
  });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    let lastY: number | null = null;
    let pageText = '';
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || typeof (rawItem as any).str !== 'string') {
        continue;
      }
      const item = rawItem as { str: string; transform: number[] };
      const y =
        Array.isArray(item.transform) && typeof item.transform[5] === 'number'
          ? item.transform[5]
          : null;

      if (lastY !== null && y !== null && Math.abs(lastY - y) > 2) {
        pageText += '\n';
      }
      pageText += item.str;
      if (y !== null) {
        lastY = y;
      }
    }
    pageTexts.push(pageText);
    page.cleanup();
  }

  await pdf.cleanup();
  return pageTexts.join('\n\n');
}

export class ProcessingService {
  /**
   * Processes an uploaded document: extracts text, chunks it, generates vector embeddings,
   * stores chunks in DocumentChunk table, and updates Material status to READY or FAILED.
   * Audio materials are skipped and remain in PENDING status.
   */
  public async processMaterial(materialId: string): Promise<void> {
    const material = await prisma.material.findUnique({
      where: { id: materialId },
    });

    if (!material) {
      console.warn(`[ProcessingService] Material not found: ${materialId}`);
      return;
    }

    try {
      // 1. Read file buffer from storage (with transcript fallback for TXT notes on ephemeral disks)
      let buffer: Buffer;
      try {
        buffer = await storageProvider.read(material.storagePath);
      } catch (readErr) {
        if (material.type === 'TXT' && material.transcript) {
          buffer = Buffer.from(material.transcript, 'utf-8');
        } else {
          throw readErr;
        }
      }

      // 2. Extract text according to file type
      let extractedText = '';

      switch (material.type) {
        case 'AUDIO': {
          extractedText = await transcribeAudio(buffer, material.name, material.mimeType);
          // Persist the transcript on the Material
          await prisma.material.update({
            where: { id: materialId },
            data: { transcript: extractedText },
          });
          break;
        }
        case 'PDF': {
          // Use pdfjs-dist (modern, actively maintained) instead of pdf-parse@1.1.1
          // which uses an ancient pdf.js v1.10.100 that chokes on XRef streams
          // from PDFs exported by Word, Chrome, LibreOffice, etc.
          extractedText = await extractPdfText(buffer);
          break;
        }
        case 'DOCX': {
          const docxResult = await mammoth.extractRawText({ buffer });
          extractedText = docxResult.value || '';
          break;
        }
        case 'TXT': {
          extractedText = buffer.toString('utf-8');
          break;
        }
        default:
          throw new Error(`Unsupported material type for processing: ${material.type}`);
      }

      // Clean text
      const cleanedText = extractedText.replace(/\x00/g, '').trim();

      if (!cleanedText) {
        const reason =
          material.type === 'AUDIO'
            ? 'Audio transcription yielded no audible speech'
            : 'Text extraction yielded empty content (possibly a scanned/image-only PDF)';
        console.error(
          `[ProcessingService] FAILED material ${materialId} ("${material.name}"): ${reason}`
        );
        await prisma.material.update({
          where: { id: materialId },
          data: { status: 'FAILED', failureReason: reason },
        });
        return;
      }

      // 3. Chunk text using LangChain RecursiveCharacterTextSplitter
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1500,
        chunkOverlap: 200,
      });

      const chunks = await splitter.splitText(cleanedText);

      if (chunks.length === 0) {
        console.warn(`[ProcessingService] Chunking produced 0 chunks for ${materialId}`);
        await prisma.material.update({
          where: { id: materialId },
          data: { status: 'FAILED', failureReason: 'No readable chunks extracted' },
        });
        return;
      }

      // 4. Generate embeddings via Google Gemini
      const MAX_CHUNKS = 100;
      const targetChunks = chunks.length > MAX_CHUNKS ? chunks.slice(0, MAX_CHUNKS) : chunks;
      if (chunks.length > MAX_CHUNKS) {
        console.log(
          `[ProcessingService] Document generated ${chunks.length} chunks; capped to first ${MAX_CHUNKS} chunks for Gemini free-tier stability.`
        );
      }

      const embeddings = await embedDocuments(targetChunks);

      // 5. Delete any existing chunks for this material (idempotency)
      await prisma.documentChunk.deleteMany({
        where: { materialId },
      });

      // 6. Insert chunks with vector embeddings using raw SQL
      for (let i = 0; i < targetChunks.length; i++) {
        const chunkContent = targetChunks[i];
        const embedding = embeddings[i];
        if (!chunkContent || !embedding || embedding.length === 0) {
          continue;
        }

        const vectorString = `[${embedding.join(',')}]`;
        const chunkId = `chk_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;

        await prisma.$executeRawUnsafe(
          `INSERT INTO "DocumentChunk" ("id", "materialId", "content", "chunkIndex", "embedding", "createdAt")
           VALUES ($1, $2, $3, $4, $5::vector, NOW())`,
          chunkId,
          materialId,
          chunkContent,
          i,
          vectorString
        );
      }

      // 7. Mark material as READY and clear any prior failureReason
      await prisma.material.update({
        where: { id: materialId },
        data: { status: 'READY', failureReason: null },
      });

      console.log(
        `[ProcessingService] Successfully processed material ${materialId} ("${material.name}"): ${targetChunks.length} chunks stored.`
      );
    } catch (error: any) {
      console.error(
        `[ProcessingService] FAILED material ${materialId} ("${material.name}"): ${error?.message || error}`
      );
      if (error?.stack) {
        console.error(`[ProcessingService] Stack:`, error.stack);
      }

      await prisma.material
        .update({
          where: { id: materialId },
          data: {
            status: 'FAILED',
            failureReason: error?.message || 'Processing failed',
          },
        })
        .catch(() => {});
    }
  }
}

export const processingService = new ProcessingService();
