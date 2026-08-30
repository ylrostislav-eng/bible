/** One chapter-comprehension question, authored once and seeded into both
 * `ChapterQuestion` (the "Изучение" per-chapter check) and `Question` (the
 * free-form trivia bank used by solo games and duels) — see
 * `seed-chapter-questions.ts`. */
export interface ChapterQuestionSeed {
  chapter: number;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  /** e.g. "1:5–6" — reused as `Question.verses` for the reveal screen. */
  verses: string;
}

export interface BookQuestionSeed {
  bookId: number;
  questions: ChapterQuestionSeed[];
}
