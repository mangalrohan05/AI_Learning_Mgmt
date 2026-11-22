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
      'The AI service is currently experiencing high demand or rate limits. Please try again in a few moments.'
    );
  }
  return new Error(message || 'Failed to communicate with AI service.');
}

/**
 * Helper to invoke Gemini and parse JSON with Zod validation + 1 retry
 */
async function invokeStructuredJson<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodType<T>
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
    const res1 = await chatModel.invoke([
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
      const res2 = await chatModel.invoke([
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
    return 'I could not find any relevant information in the course materials to answer your question.';
  }

  const formattedContexts = contexts
    .map(
      (c, i) =>
        `[Source ${i + 1} - "${c.materialName}"]:\n${c.content.trim()}`
    )
    .join('\n\n---\n\n');

  const systemPrompt = `You are an AI teaching assistant for this course.
Your task is to answer the student's question using ONLY the facts directly mentioned in the provided context snippets.
If the answer cannot be determined from the context, respond clearly:
"Based on the provided course materials, I cannot find an answer to this question."
Do NOT speculate, guess, or incorporate external knowledge not present in the snippets. Keep your tone encouraging, professional, and concise.`;

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

  const systemPrompt = `You are a patient, encouraging, and pedagogically skilled AI tutor for this course.
Guidelines:
1. Explain concepts step by step in clear, accessible language.
2. Provide a short, illustrative example to solidify understanding.
3. Ground your explanation primarily in the provided course materials whenever relevant.
4. You may supplement with general academic knowledge when helpful for conceptual clarity, but you MUST clearly prefix or mark any outside knowledge with "[General Knowledge]".
5. Maintain a supportive, enthusiastic, and approachable tone.`;

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
 * Generates a concise structured summary from material text
 */
export async function summarizeText(content: string): Promise<string> {
  const systemPrompt = `You are an expert academic tutor.
Generate a concise, clear, and structured summary of the provided course material.
Include:
1. Overview / Core Topic
2. Key Concepts & Definitions
3. Essential Takeaways
Format with clean Markdown. Be concise and prioritize high-yield study points.`;

  try {
    const response = await chatModel.invoke([
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

export const QuizQuestionsArraySchema = z.array(QuizQuestionSchema);
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

/**
 * Generates multiple choice quiz questions from course material chunks
 */
export async function generateQuizQuestions(
  contexts: string[],
  numQuestions: number
): Promise<QuizQuestion[]> {
  const clampedNum = Math.min(Math.max(numQuestions, 3), 10);
  const combinedContext = contexts.join('\n\n---\n\n').slice(0, 10000);

  const systemPrompt = `You are an academic assessment expert.
Generate exactly ${clampedNum} multiple-choice questions based on the provided course material.
Each question must have:
- "question": string, unambiguous and focused on important concepts.
- "options": array of exactly 4 strings (plausible options, labeled implicitly 0 to 3).
- "correctAnswer": integer from 0 to 3 pointing to the index of the single correct option.
- "explanation": string, concise rationale for why the answer is correct based on the material.
Output format: JSON array of question objects.`;

  const userPrompt = `Material content:\n${combinedContext}\n\nGenerate ${clampedNum} multiple-choice questions:`;

  return await invokeStructuredJson(
    systemPrompt,
    userPrompt,
    QuizQuestionsArraySchema
  );
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
  const systemPrompt = `You are an academic advisor creating a structured study plan for a student.
Create an achievable, structured study plan.
Output format: JSON object with:
- "title": string (e.g. "4-Week Machine Learning Mastery Plan")
- "overview": string (concise encouraging summary of strategy)
- "weeklySchedule": array of objects:
    - "period": string (e.g. "Week 1: Fundamentals", "Day 1-3")
    - "topic": string (focus area)
    - "tasks": array of strings (actionable items: review note X, practice quiz Y)
    - "estimatedHours": number (allocating student's available hours)
- "tips": array of strings (high-yield exam and retention strategies)`;

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
  const systemPrompt = `You are a fair, thorough academic professor grading an assignment submission.
Evaluate the student's submission against academic standards and course context.
Provide:
- "score": number from 0 to 10 (can include decimals like 8.5)
- "summary": string (overall evaluation summary)
- "strengths": array of 2-4 strings (specific strong aspects)
- "weaknesses": array of 1-3 strings (areas that lacked depth or clarity)
- "suggestions": array of 2-4 strings (concrete steps for improvement)
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
