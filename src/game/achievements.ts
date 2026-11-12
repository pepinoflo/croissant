// Badges. Each one is a pure test on a snapshot of the learner's numbers.

export interface AchievementStats {
  sessions: number;
  perfectSessions: number;
  bestStreak: number;
  itemsSeen: number;
  itemsMastered: number;
  lessonsCompleted: number;
  lessonsMastered: number;
  answers: number;
  sprintBest: number;
  level: number;
}

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  test: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-session', emoji: '🥐', title: 'Premier croissant', description: 'Finish your first session', test: (s) => s.sessions >= 1 },
  { id: 'streak-3', emoji: '🔥', title: 'Trois jours', description: 'A 3-day streak', test: (s) => s.bestStreak >= 3 },
  { id: 'streak-7', emoji: '🗓️', title: 'Une semaine', description: 'A 7-day streak', test: (s) => s.bestStreak >= 7 },
  { id: 'streak-30', emoji: '🌙', title: 'Un mois entier', description: 'A 30-day streak', test: (s) => s.bestStreak >= 30 },
  { id: 'streak-100', emoji: '💯', title: 'Cent jours', description: 'A 100-day streak', test: (s) => s.bestStreak >= 100 },
  { id: 'perfect', emoji: '✨', title: 'Sans faute', description: 'A session with no mistakes', test: (s) => s.perfectSessions >= 1 },
  { id: 'perfect-10', emoji: '💎', title: 'Perfectionniste', description: 'Ten sessions with no mistakes', test: (s) => s.perfectSessions >= 10 },
  { id: 'seen-50', emoji: '🌱', title: 'Cinquante', description: 'Meet 50 words and phrases', test: (s) => s.itemsSeen >= 50 },
  { id: 'seen-150', emoji: '🌿', title: 'Cent cinquante', description: 'Meet 150 words and phrases', test: (s) => s.itemsSeen >= 150 },
  { id: 'seen-300', emoji: '🌳', title: 'Trois cents', description: 'Meet 300 words and phrases', test: (s) => s.itemsSeen >= 300 },
  { id: 'mastered-25', emoji: '🎓', title: 'Bien ancré', description: 'Master 25 items', test: (s) => s.itemsMastered >= 25 },
  { id: 'mastered-100', emoji: '🏛️', title: 'Solide', description: 'Master 100 items', test: (s) => s.itemsMastered >= 100 },
  { id: 'lesson-done', emoji: '📖', title: 'Leçon bouclée', description: 'Meet every item of a lesson', test: (s) => s.lessonsCompleted >= 1 },
  { id: 'lesson-mastered', emoji: '🏅', title: 'Leçon maîtrisée', description: 'Master every item of a lesson', test: (s) => s.lessonsMastered >= 1 },
  { id: 'answers-1000', emoji: '🚀', title: 'Mille réponses', description: 'Answer 1,000 questions', test: (s) => s.answers >= 1000 },
  { id: 'sprint-15', emoji: '⚡', title: 'Éclair', description: 'Score 15 in Vrai ou faux', test: (s) => s.sprintBest >= 15 },
  { id: 'level-10', emoji: '🗼', title: 'Niveau 10', description: 'Reach level 10', test: (s) => s.level >= 10 },
];

/** Ids of achievements that are met but not yet recorded as unlocked. */
export function newlyUnlocked(stats: AchievementStats, unlocked: Record<string, number>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !(a.id in unlocked) && a.test(stats));
}
