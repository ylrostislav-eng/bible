export interface ChapterCheckQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface StartChapterCheckResponse {
  sessionId: string;
  bookId: number;
  chapter: number;
  totalQuestions: number;
  questionNumber: number;
  question: ChapterCheckQuestion;
  timeLimitSeconds: number;
}

export interface ChapterCheckSummary {
  correctCount: number;
  totalQuestions: number;
  ratingEarned: number;
  xpEarned: number;
  coinsEarned: number;
  streak: {
    current: number;
    longest: number;
    increased: boolean;
  };
}

export interface SubmitChapterCheckAnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string;
  timeExpired: boolean;
  correctCount: number;
  questionNumber: number;
  nextQuestion: ChapterCheckQuestion | null;
  finished: boolean;
  summary: ChapterCheckSummary | null;
}
