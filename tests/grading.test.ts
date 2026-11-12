import { describe, expect, it } from 'vitest';
import { checkAnswer, fold, gradeFor, levenshtein, normalize } from '../src/srs/grading';

describe('normalize', () => {
  it('ignores case, punctuation, spacing and apostrophe style', () => {
    expect(normalize("  Qu’est-ce   que tu vas manger ? ")).toBe("qu'est-ce que tu vas manger");
    expect(normalize("J' ai besoin de pain.")).toBe("j'ai besoin de pain");
  });
  it('fold also ignores accents, ligatures and hyphens', () => {
    expect(fold('Œufs')).toBe('oeufs');
    expect(fold('Où vas-tu ?')).toBe('ou vas tu');
    expect(fold('préfères')).toBe('preferes');
  });
});

describe('checkAnswer', () => {
  it('accepts the exact answer', () => {
    expect(checkAnswer('une Poêle', ['poêle'], { nounGender: 'f' }).verdict).toBe('exact');
    expect(checkAnswer('poêle', ['poêle']).verdict).toBe('exact');
  });

  it('accepts a missing accent, flagged so the right spelling can be shown', () => {
    const r = checkAnswer('prefere', ['préfère']);
    expect(r.verdict).toBe('accent');
    expect(r.expected).toBe('préfère');
    expect(checkAnswer('oeuf', ['œuf']).verdict).toBe('accent');
    expect(checkAnswer('peut etre', ['peut-être']).verdict).toBe('accent');
  });

  it('forgives one slip in a longer word only when typos are allowed', () => {
    expect(checkAnswer('boulangrie', ['boulangerie'], { allowTypos: true }).verdict).toBe('typo');
    expect(checkAnswer('boulangrie', ['boulangerie']).verdict).toBe('wrong');
    // Short answers get no tolerance: one letter changes the word.
    expect(checkAnswer('pain', ['bain'], { allowTypos: true }).verdict).toBe('wrong');
  });

  it('is strict for grammar, where one letter is the whole point', () => {
    expect(checkAnswer('parlera', ['parleras']).verdict).toBe('wrong');
    expect(checkAnswer('vas', ['va']).verdict).toBe('wrong');
    expect(checkAnswer('leurs', ['leur']).verdict).toBe('wrong');
  });

  it('accepts any listed alternative', () => {
    expect(checkAnswer('patate', ['pomme de terre', 'patate'], { nounGender: 'f' }).verdict).toBe('exact');
  });

  it('checks the article when one is typed with a noun', () => {
    expect(checkAnswer('un poireau', ['poireau'], { nounGender: 'm' }).verdict).toBe('exact');
    expect(checkAnswer('le poireau', ['poireau'], { nounGender: 'm' }).verdict).toBe('exact');
    expect(checkAnswer('une poireau', ['poireau'], { nounGender: 'm' }).verdict).toBe('gender');
    expect(checkAnswer('du confiture', ['confiture'], { nounGender: 'f' }).verdict).toBe('gender');
    expect(checkAnswer("l'école", ['école'], { nounGender: 'f' }).verdict).toBe('exact');
    expect(checkAnswer('des pâtes', ['pâtes'], { nounGender: 'f' }).verdict).toBe('exact');
    expect(checkAnswer('une comptable', ['comptable'], { nounGender: 'mf' }).verdict).toBe('exact');
  });

  it('ignores a subject pronoun typed before a verb form', () => {
    expect(checkAnswer('nous irons', ['irons'], { allowPronoun: true }).verdict).toBe('exact');
    expect(checkAnswer("j'irai", ['irai'], { allowPronoun: true }).verdict).toBe('exact');
    expect(checkAnswer('je me couche', ['me couche'], { allowPronoun: true }).verdict).toBe('exact');
    expect(checkAnswer('nous nous couchons', ['nous couchons'], { allowPronoun: true }).verdict).toBe('exact');
    expect(checkAnswer('nous couchons', ['nous couchons'], { allowPronoun: true }).verdict).toBe('exact');
    expect(checkAnswer('nous irez', ['irons'], { allowPronoun: true }).verdict).toBe('wrong');
  });

  it('rejects wrong and empty answers, and says what was expected', () => {
    expect(checkAnswer('', ['pain']).verdict).toBe('wrong');
    const r = checkAnswer('fromage', ['pain', 'baguette']);
    expect(r.verdict).toBe('wrong');
    expect(r.expected).toBe('pain');
  });
});

describe('gradeFor', () => {
  it('maps outcomes to review grades', () => {
    expect(gradeFor('wrong', { production: true, elapsedMs: 1000 })).toBe('again');
    expect(gradeFor('accent', { production: true, elapsedMs: 1000 })).toBe('hard');
    expect(gradeFor('typo', { production: true, elapsedMs: 1000 })).toBe('hard');
    expect(gradeFor('gender', { production: true, elapsedMs: 1000 })).toBe('hard');
    expect(gradeFor('exact', { production: true, elapsedMs: 3000 })).toBe('easy');
    expect(gradeFor('exact', { production: true, elapsedMs: 30000 })).toBe('good');
  });
  it('never calls a multiple-choice answer easy: it could be a guess', () => {
    expect(gradeFor('exact', { production: false, elapsedMs: 500 })).toBe('good');
  });
  it('treats a quick right answer on something never shown before as already known', () => {
    expect(gradeFor('exact', { production: false, elapsedMs: 3000, firstSight: true })).toBe('easy');
    expect(gradeFor('exact', { production: false, elapsedMs: 20000, firstSight: true })).toBe('good');
    expect(gradeFor('wrong', { production: false, elapsedMs: 3000, firstSight: true })).toBe('again');
  });
  it('allows longer answers more time', () => {
    expect(gradeFor('exact', { production: true, elapsedMs: 9000, answerWords: 5 })).toBe('easy');
    expect(gradeFor('exact', { production: true, elapsedMs: 9000, answerWords: 1 })).toBe('good');
  });
});

describe('levenshtein', () => {
  it('counts edits', () => {
    expect(levenshtein('chat', 'chat')).toBe(0);
    expect(levenshtein('chat', 'chats')).toBe(1);
    expect(levenshtein('maison', 'raison')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});
