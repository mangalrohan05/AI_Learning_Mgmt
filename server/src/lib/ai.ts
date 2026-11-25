import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../config/env';

// Hardcoded Google Gemini configuration
export const chatModel = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-flash-lite',
  apiKey: env.GEMINI_API_KEY,
  temperature: 0.2,
  maxOutputTokens: 2048,
  maxRetries: 1,
});

const longOutputModel = new ChatGoogleGenerativeAI({
  model: 'gemini-3.1-flash-lite',
  apiKey: env.GEMINI_API_KEY,
  temperature: 0.2,
  maxOutputTokens: 4096,
  maxRetries: 1,
});

export const embeddingsModel = new GoogleGenerativeAIEmbeddings({
  model: 'gemini-embedding-001',
  apiKey: env.GEMINI_API_KEY,
  outputDimensionality: 768,
  maxRetries: 1,
});

/**
 * Normalizes error messages from Gemini API to provide friendly rate limit feedback
 */
export function handleAiError(error: any): Error {
  const message = error?.message || '';
  if (
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('Quota exceeded') ||
    message.includes('rate limit')
  ) {
    return new Error(
      'Rate limit reached right now — please wait a few seconds and try again.'
    );
  }
  if (
    message.includes('503') ||
    message.includes('Service Unavailable') ||
    message.includes('UNAVAILABLE') ||
    message.includes('high demand') ||
    message.includes('overloaded')
  ) {
    return new Error(
      'The AI service is busy right now — please try again in a few seconds.'
    );
  }
  return new Error(message || "Couldn't reach the AI service right now. Please try again.");
}

/**
 * Helper to invoke Gemini and parse JSON with Zod validation + 1 retry
 */
async function invokeStructuredJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>,
  model: ChatGoogleGenerativeAI = chatModel
): Promise<T> {
  const parseJson = (text: string) => {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(cleaned);
  };

  try {
    const res1 = await model.invoke([
      new SystemMessage(
        `${systemPrompt}\nIMPORTANT: Respond strictly with valid JSON conforming to the schema. Do not include markdown codeblocks, backticks, or preamble.`
      ),
      new HumanMessage(userPrompt),
    ]);
    const raw1 = typeof res1.content === 'string' ? res1.content : JSON.stringify(res1.content);
    return schema.parse(parseJson(raw1));
  } catch (err1) {
    // Retry once with an explicit correction prompt
    try {
      const res2 = await model.invoke([
        new SystemMessage(
          `${systemPrompt}\nYour previous response was not valid JSON. You MUST return strictly valid raw JSON conforming to the schema. No markdown formatting.`
        ),
        new HumanMessage(userPrompt),
      ]);
      const raw2 = typeof res2.content === 'string' ? res2.content : JSON.stringify(res2.content);
      return schema.parse(parseJson(raw2));
    } catch (err2) {
      throw handleAiError(err2);
    }
  }
}

/**
 * Generate embedding vector (768 dimensions) for a single query text
 */
export async function embedQuery(text: string): Promise<number[]> {
  try {
    return await embeddingsModel.embedQuery(text);
  } catch (error) {
    throw handleAiError(error);
  }
}

/**
 * Generate embeddings for multiple document chunks (batched for reliability)
 */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  try {
    const batchSize = 20;
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      if (i > 0) {
        // Pause 1 second between batches to stay safely within free-tier rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }
      const batch = texts.slice(i, i + batchSize);
      const batchEmbeddings = await embeddingsModel.embedDocuments(batch);
      results.push(...batchEmbeddings);
    }
    return results;
  } catch (error) {
    throw handleAiError(error);
  }
}

/**
 * Answers a question strictly based on retrieved context snippets (PDF Chat)
 */
export async function answerWithContext(
  question: string,
  contexts: { materialName: string; content: string }[]
): Promise<string> {
  if (contexts.length === 0) {
    return "I couldn't find anything about that in your uploaded course materials.";
  }

  const formattedContexts = contexts
    .map(
      (c, i) =>
        `[Source ${i + 1} - "${c.materialName}"]:\n${c.content.trim()}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `You are a teaching assistant for this course.
Answer the student's question using ONLY the facts directly stated in the provided excerpts.
If the excerpts don't cover the answer, reply directly:
"I couldn't find an answer to that in the provided course materials."
Do NOT guess or add external knowledge. Keep your tone natural, direct, and concise.`;

  const userPrompt = `Context from course materials:
${formattedContexts}

Student question:
${question}

Answer:`;

  try {
    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  } catch (error) {
    throw handleAiError(error);
  }
}

/**
 * Patient AI Tutor answering step-by-step with examples and optional chat history.
 * Clearly tags external general knowledge with [General Knowledge].
 */
export async function answerAsTutor(
  question: string,
  contexts: { materialName: string; content: string }[],
  history?: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  const formattedContexts = contexts
    .map(
      (c, i) =>
        `[Course Material ${i + 1} - "${c.materialName}"]:\n${c.content.trim()}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `You are a patient, helpful tutor for this course.
Guidelines:
1. Explain concepts step by step in plain, clear language.
2. Include a short, concrete example to make the idea stick.
3. Base your explanation on the provided course materials whenever relevant.
4. You may include outside academic facts when needed for clarity, but clearly prefix them with "[General Knowledge]".
5. Write naturally like a human tutor — direct, clear, and without empty filler praise.`;

  const messages: BaseMessage[] = [new SystemMessage(systemPrompt)];

  // Attach last up to 6 messages of history
  if (history && history.length > 0) {
    const recentHistory = history.slice(-6);
    for (const msg of recentHistory) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content.slice(0, 500)));
      } else {
        messages.push(new AIMessage(msg.content.slice(0, 1000)));
      }
    }
  }

  const currentPrompt = `Relevant Course Materials:
${formattedContexts || 'No specific course material snippets found.'}

Student's Question:
${question}

Tutor Explanation:`;

  messages.push(new HumanMessage(currentPrompt));

  try {
    const response = await chatModel.invoke(messages);
    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  } catch (error) {
    throw handleAiError(error);
  }
}

/**
 * Generates a thorough, well-structured study summary from material text
 */
export async function summarizeText(content: string): Promise<string> {
  const systemPrompt = `Create thorough, well-organized study notes from the provided course material using clean Markdown.
Structure your summary into clear sections:
## Overview
Briefly explain the main topic and scope of this material.

## Core Concepts & Details
Break down each major topic, mechanism, formula, or argument in detail with clear bullet points or subheadings so a student can actually study from this without losing important context.

## Key Terms & Definitions
Define important terminology, algorithms, or theorems mentioned.

## Key Takeaways
List the most important points worth remembering for exams or assignments.

Write clearly and cover all major sections present in the text — do not reduce a multi-section document to a tiny blurb.`;

  try {
    const response = await longOutputModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Material text to summarize:\n\n${content}`),
    ]);

    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  } catch (error) {
    throw handleAiError(error);
  }
}

// ── Phase 3 Schemas & AI Functions ────────────────────────────

export const QuizQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).length(4),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export const QuizQuestionsArraySchema = z.array(QuizQuestionSchema).min(1);
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

/**
 * Generates multiple choice quiz questions from course material chunks (supports 1 to 25)
 */
export async function generateQuizQuestions(
  contexts: string[],
  numQuestions: number,
  options?: { difficulty?: 'easy' | 'medium' | 'hard'; topic?: string }
): Promise<QuizQuestion[]> {
  const clampedNum = Math.min(Math.max(numQuestions, 1), 25);
  const combinedContext = contexts.join('\n\n---\n\n').slice(0, 24000);

  const difficultyNote = options?.difficulty
    ? `Target difficulty: ${options.difficulty}.`
    : 'Include a balanced mix of recall and applied conceptual questions.';
  const topicNote = options?.topic?.trim()
    ? `Prioritize concepts related to: "${options.topic.trim()}".`
    : 'Spread questions across all sections of the material.';

  const makeBatch = async (count: number, excludeQuestions: string[]) => {
    const avoidClause =
      excludeQuestions.length > 0
        ? `\nDo NOT repeat or rephrase any of these already-generated questions:\n${excludeQuestions.map((q) => `- ${q}`).join('\n')}`
        : '';

    const systemPrompt = `You are an academic assessment expert.
Generate exactly ${count} unique multiple-choice questions based on the provided course material.
${difficultyNote}
${topicNote}${avoidClause}
Each question must have:
- "question": string, unambiguous and focused on important concepts.
- "options": array of exactly 4 strings (plausible options, labeled implicitly 0 to 3).
- "correctAnswer": integer from 0 to 3 pointing to the index of the single correct option.
- "explanation": string, concise rationale for why the answer is correct based on the material.
Output format: JSON array of exactly ${count} question objects.`;

    const userPrompt = `Material content:\n${combinedContext}\n\nGenerate ${count} multiple-choice questions:`;

    return await invokeStructuredJson(
      systemPrompt,
      userPrompt,
      QuizQuestionsArraySchema,
      longOutputModel
    );
  };

  if (clampedNum <= 13) {
    const batch = await makeBatch(clampedNum, []);
    return batch.slice(0, clampedNum);
  }

  // Split larger quizzes into two batches so output never truncates
  const firstCount = Math.ceil(clampedNum / 2);
  const secondCount = clampedNum - firstCount;
  const firstBatch = await makeBatch(firstCount, []);
  const secondBatch = await makeBatch(
    secondCount,
    firstBatch.map((q) => q.question)
  );

  return [...firstBatch, ...secondBatch].slice(0, clampedNum);
}

export const StudyPlanSchema = z.object({
  title: z.string(),
  overview: z.string(),
  weeklySchedule: z.array(
    z.object({
      period: z.string(),
      topic: z.string(),
      tasks: z.array(z.string()),
      estimatedHours: z.number(),
    })
  ),
  tips: z.array(z.string()),
});
export type StudyPlanData = z.infer<typeof StudyPlanSchema>;

/**
 * Builds a structured day-by-day or week-by-week study plan
 */
export async function generateStudyPlan(
  materialTopics: string[],
  weakTopics: string[],
  options: { hoursPerWeek: number; examDate?: string; goal?: string }
): Promise<StudyPlanData> {
  const systemPrompt = `You are an academic advisor building a practical weekly study plan for a student.
Output format: JSON object with:
- "title": string (e.g. "4-Week Machine Learning Study Plan")
- "overview": string (short, practical summary of the plan)
- "weeklySchedule": array of objects:
    - "period": string (e.g. "Week 1: Fundamentals", "Day 1-3")
    - "topic": string (focus area)
    - "tasks": array of strings (concrete study tasks like reviewing notes or taking practice quizzes)
    - "estimatedHours": number (matching the student's weekly hours)
- "tips": array of strings (practical study tips)`;

  const userPrompt = `Student Study Parameters:
- Target Hours per Week: ${options.hoursPerWeek || 5} hours
- Exam Date / Deadline: ${options.examDate || 'Self-paced'}
- Personal Learning Goal: ${options.goal || 'Master course materials and prepare for assessments'}
- Course Material Focus Areas: ${materialTopics.join(', ') || 'Core syllabus'}
- Identified Weak Topics (from previous quizzes): ${weakTopics.length > 0 ? weakTopics.join(', ') : 'None identified yet'}

Generate JSON study plan:`;

  return await invokeStructuredJson(systemPrompt, userPrompt, StudyPlanSchema);
}

export const AssignmentFeedbackSchema = z.object({
  score: z.number().min(0).max(10),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
});
export type AssignmentFeedback = z.infer<typeof AssignmentFeedbackSchema>;

/**
 * Evaluates an assignment submission and produces rubric-based feedback and score out of 10
 */
export async function evaluateAssignmentText(
  submissionText: string,
  courseContext: string
): Promise<AssignmentFeedback> {
  const systemPrompt = `You are a professor grading a student assignment.
Review the work fairly against college standards and the course context. Write naturally and specifically, without generic filler.
Provide:
- "score": number from 0 to 10 (decimals like 8.5 allowed)
- "summary": string (clear, concise overall feedback)
- "strengths": array of 2-4 strings (what worked well)
- "weaknesses": array of 1-3 strings (what was missing or unclear)
- "suggestions": array of 2-4 strings (specific ways to improve the work)
Output format: JSON object matching this schema strictly.`;

  const userPrompt = `Course Context:
${courseContext.slice(0, 4000) || 'General college-level coursework'}

Student Assignment Submission:
${submissionText.slice(0, 10000)}

Generate JSON evaluation:`;

  return await invokeStructuredJson(
    systemPrompt,
    userPrompt,
    AssignmentFeedbackSchema
  );
}
