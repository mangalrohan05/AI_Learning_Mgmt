/**
 * Typed API client for communicating with the Express backend.
 * Automatically attaches Clerk session token and parses error responses.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  public statusCode: number;
  public details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface FetchOptions extends RequestInit {
  token?: string | null;
}

export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { token, headers = {}, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
  });

  const contentType = response.headers.get('content-type');
  let data: any = null;

  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    let errorMessage = data?.error || response.statusText || 'Request failed';
    if (data?.details) {
      if (typeof data.details === 'string') {
        errorMessage = `${errorMessage}: ${data.details}`;
      } else if (Array.isArray(data.details)) {
        errorMessage = `${errorMessage}: ${data.details.join(', ')}`;
      } else if (typeof data.details === 'object') {
        const detailParts: string[] = [];
        for (const [key, value] of Object.entries(data.details)) {
          if (Array.isArray(value)) {
            detailParts.push(`${key}: ${value.join(', ')}`);
          } else if (value) {
            detailParts.push(`${key}: ${value}`);
          }
        }
        if (detailParts.length > 0) {
          errorMessage = `${errorMessage} (${detailParts.join('; ')})`;
        }
      }
    }
    throw new ApiError(response.status, errorMessage, data?.details);
  }

  return data as T;
}

// ── Types ─────────────────────────────────────────────────────

export interface CourseOwner {
  id?: string;
  name: string;
  email?: string;
}

export type MaterialType = 'PDF' | 'DOCX' | 'TXT' | 'AUDIO';
export type MaterialStatus = 'PENDING' | 'READY' | 'FAILED';

export interface Material {
  id: string;
  courseId: string;
  uploaderId: string;
  name: string;
  type: MaterialType;
  status: MaterialStatus;
  storagePath: string;
  mimeType: string;
  size: number;
  summary?: string | null;
  transcript?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
  uploader?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  ownerId?: string;
  isOwner?: boolean;
  owner?: CourseOwner;
  createdAt?: string;
  updatedAt?: string;
  materials?: Material[];
  enrollments?: { userId: string; enrolledAt?: string }[];
  _count?: {
    materials?: number;
    enrollments?: number;
  };
}

export interface ExploreCourse {
  id: string;
  title: string;
  description: string | null;
  owner: {
    name: string;
  };
}

export interface UserProfile {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'INSTRUCTOR';
  createdAt: string;
}

// ── API Functions ─────────────────────────────────────────────

export const api = {
  // Auth
  getMe: (token: string) => apiClient<UserProfile>('/api/auth/me', { token }),

  // Courses
  getCourses: (token: string) => apiClient<Course[]>('/api/courses', { token }),

  getExploreCourses: (token: string) =>
    apiClient<ExploreCourse[]>('/api/courses/explore', { token }),

  createCourse: (
    token: string,
    data: { title: string; description?: string }
  ) =>
    apiClient<Course>('/api/courses', {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCourse: (token: string, courseId: string) =>
    apiClient<Course>(`/api/courses/${courseId}`, { token }),

  updateCourse: (
    token: string,
    courseId: string,
    data: { title?: string; description?: string }
  ) =>
    apiClient<Course>(`/api/courses/${courseId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),

  deleteCourse: (token: string, courseId: string) =>
    apiClient<{ success: boolean; message: string }>(`/api/courses/${courseId}`, {
      method: 'DELETE',
      token,
    }),

  enrollCourse: (token: string, courseId: string) =>
    apiClient<{ id: string; courseId: string; userId: string }>(
      `/api/courses/${courseId}/enroll`,
      {
        method: 'POST',
        token,
      }
    ),

  unenrollCourse: (token: string, courseId: string) =>
    apiClient<{ success: boolean; message: string }>(
      `/api/courses/${courseId}/enroll`,
      {
        method: 'DELETE',
        token,
      }
    ),

  // Materials
  getMaterials: (token: string, courseId: string) =>
    apiClient<Material[]>(`/api/materials/${courseId}`, { token }),

  createTextMaterial: (
    token: string,
    courseId: string,
    data: { title: string; content: string }
  ) =>
    apiClient<Material>(`/api/materials/${courseId}/text`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  deleteMaterial: (token: string, materialId: string) =>
    apiClient<{ success: boolean; message: string }>(`/api/materials/${materialId}`, {
      method: 'DELETE',
      token,
    }),

  downloadMaterial: async (token: string, materialId: string, fileName: string) => {
    const url = `${API_BASE_URL}/api/materials/file/${materialId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let errorMsg = 'Failed to download file';
      try {
        const errorJson = await response.json();
        errorMsg = errorJson.error || errorMsg;
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  },

  // AI & Ask AI (unified RAG notes mode + guided tutor mode)
  chatCourse: (
    token: string,
    courseId: string,
    data: {
      question: string;
      materialId?: string;
      mode?: 'strict' | 'tutor';
      history?: { role: 'user' | 'assistant'; content: string }[];
    }
  ) =>
    apiClient<{
      answer: string;
      sources: { materialName: string; snippet: string }[];
      cached?: boolean;
    }>(`/api/courses/${courseId}/chat`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  summarizeMaterial: (token: string, materialId: string, force = false) =>
    apiClient<{ summary: string; cached: boolean }>(
      `/api/materials/${materialId}/summary`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ force }),
      }
    ),

  reprocessMaterial: (token: string, materialId: string) =>
    apiClient<{ success: boolean; message: string; status: string }>(
      `/api/materials/${materialId}/reprocess`,
      {
        method: 'POST',
        token,
      }
    ),

  // ── Phase 3: Quizzes ────────────────────────────────────────
  generateQuiz: (
    token: string,
    courseId: string,
    data: {
      materialId?: string;
      numQuestions?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      topic?: string;
    }
  ) =>
    apiClient<{
      id: string;
      title: string;
      courseId: string;
      totalQuestions: number;
      createdAt: string;
    }>(`/api/courses/${courseId}/quizzes/generate`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getCourseQuizzes: (token: string, courseId: string) =>
    apiClient<
      {
        id: string;
        courseId: string;
        title: string;
        questionCount: number;
        createdAt: string;
        latestAttempt: {
          id: string;
          score: number;
          completedAt: string;
        } | null;
      }[]
    >(`/api/courses/${courseId}/quizzes`, { token }),

  getQuizForTaking: (token: string, quizId: string) =>
    apiClient<{
      id: string;
      courseId: string;
      courseTitle: string;
      title: string;
      totalQuestions: number;
      questions: {
        index: number;
        question: string;
        options: string[];
      }[];
    }>(`/api/quizzes/${quizId}`, { token }),

  submitQuizAttempt: (token: string, quizId: string, answers: number[]) =>
    apiClient<{
      attemptId: string;
      quizId: string;
      quizTitle: string;
      score: number;
      totalQuestions: number;
      correctCount: number;
      results: {
        questionIndex: number;
        question: string;
        options: string[];
        selectedAnswer: number;
        correctAnswer: number;
        isCorrect: boolean;
        explanation: string;
      }[];
      completedAt: string;
    }>(`/api/quizzes/${quizId}/attempt`, {
      method: 'POST',
      token,
      body: JSON.stringify({ answers }),
    }),

  getLatestQuizReview: (token: string, quizId: string) =>
    apiClient<{
      attemptId: string;
      quizId: string;
      quizTitle: string;
      score: number;
      totalQuestions: number;
      correctCount: number;
      results: {
        questionIndex: number;
        question: string;
        options: string[];
        selectedAnswer: number;
        correctAnswer: number;
        isCorrect: boolean;
        explanation: string;
      }[];
      completedAt: string;
    }>(`/api/quizzes/${quizId}/attempt/latest`, { token }),

  deleteQuiz: (token: string, quizId: string) =>
    apiClient<{ success: boolean; message: string }>(`/api/quizzes/${quizId}`, {
      method: 'DELETE',
      token,
    }),

  // ── Phase 3: Study Planner ──────────────────────────────────
  createStudyPlan: (
    token: string,
    courseId: string,
    data: { hoursPerWeek: number; examDate?: string; goal?: string }
  ) =>
    apiClient<{
      id: string;
      courseId: string;
      studentId: string;
      plan: {
        title: string;
        overview: string;
        weeklySchedule: {
          period: string;
          topic: string;
          tasks: string[];
          estimatedHours: number;
        }[];
        tips: string[];
      };
      updatedAt: string;
    }>(`/api/courses/${courseId}/study-plan`, {
      method: 'POST',
      token,
      body: JSON.stringify(data),
    }),

  getStudyPlan: (token: string, courseId: string) =>
    apiClient<{
      id: string;
      courseId: string;
      studentId: string;
      plan: {
        title: string;
        overview: string;
        weeklySchedule: {
          period: string;
          topic: string;
          tasks: string[];
          estimatedHours: number;
        }[];
        tips: string[];
      };
      updatedAt: string;
    } | null>(`/api/courses/${courseId}/study-plan`, { token }),

  // ── Phase 3: Assignment Evaluation ──────────────────────────
  submitAssignment: async (
    token: string,
    courseId: string,
    payload: { title?: string; text?: string; file?: globalThis.File }
  ) => {
    let body: any;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    if (payload.file) {
      const formData = new FormData();
      if (payload.title) formData.append('title', payload.title);
      formData.append('file', payload.file);
      body = formData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        title: payload.title,
        text: payload.text,
      });
    }

    const res = await fetch(`${API_BASE_URL}/api/courses/${courseId}/assignments`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new ApiError(res.status, data.error || 'Failed to evaluate assignment');
    }
    return data;
  },

  getCourseAssignments: (token: string, courseId: string) =>
    apiClient<
      {
        id: string;
        courseId: string;
        studentId: string;
        title: string;
        content?: string;
        score: number;
        feedback: {
          score: number;
          summary: string;
          strengths: string[];
          weaknesses: string[];
          suggestions: string[];
        } | null;
        createdAt: string;
      }[]
    >(`/api/courses/${courseId}/assignments`, { token }),

  deleteAssignment: (token: string, courseId: string, assignmentId: string) =>
    apiClient<{ success: boolean; message: string }>(
      `/api/courses/${courseId}/assignments/${assignmentId}`,
      {
        method: 'DELETE',
        token,
      }
    ),

  // ── Phase 3: Progress Analytics ─────────────────────────────
  getUserProgress: (token: string) =>
    apiClient<{
      counts: {
        courses: number;
        materialsUploaded: number;
        quizzesAttempted: number;
        assignmentsEvaluated: number;
      };
      averageQuizScore: number;
      recentScores: {
        id: string;
        name: string;
        quizTitle: string;
        courseTitle: string;
        score: number;
        date: string;
      }[];
      recentCourses?: {
        id: string;
        title: string;
        description: string | null;
        isOwner: boolean;
        materialsCount: number;
        quizzesCount: number;
      }[];
      courseProgress: {
        courseId: string;
        courseTitle: string;
        totalQuizzes: number;
        completedQuizzes: number;
        materialsCount?: number;
        assignmentsCount?: number;
        completionPercentage: number;
      }[];
    }>('/api/progress', { token }),
};
