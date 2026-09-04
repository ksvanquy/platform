import { describe, it, expect } from 'vitest';
import { Quiz } from '../../../src/domain/authoring/quiz.entity.js';
import { QuizVersion, AuthoringQuestion } from '../../../src/domain/authoring/quiz-version.entity.js';
import { QuizPublishInvariantViolationError } from '../../../src/domain/errors/domain-errors.js';

describe('Authoring Sub-Domain: Quiz & QuizVersion & PublishingPolicy', () => {
  const sampleQuestions: AuthoringQuestion[] = [
    {
      id: 'q1',
      type: 'single-choice',
      prompt: 'What is 2 + 2?',
      points: 2,
      options: [
        { id: 'opt1', text: '3', isCorrect: false },
        { id: 'opt2', text: '4', isCorrect: true },
      ],
      explanation: 'Basic arithmetic',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Select even numbers',
      points: 2,
      options: [
        { id: 'optA', text: '2', isCorrect: true },
        { id: 'optB', text: '4', isCorrect: true },
        { id: 'optC', text: '5', isCorrect: false },
      ],
    },
    {
      id: 'q3',
      type: 'true-false',
      prompt: 'The sky is blue',
      points: 1,
      correctAnswer: true,
    },
  ];

  it('should initialize Quiz with DRAFT status by default', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    expect(quiz.status).toBe('DRAFT');
    expect(quiz.code).toBe('MATH101');
    expect(quiz.title).toBe('Math Quiz');
    expect(quiz.currentPublishedVersionId).toBeUndefined();
  });

  it('should transition Quiz from DRAFT to REVIEW', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    quiz.requestReview();
    expect(quiz.status).toBe('REVIEW');
  });

  it('should create immutable QuizVersion snapshot', () => {
    const version = new QuizVersion({
      id: 'ver_1',
      quizId: 'quiz_1',
      versionNumber: 1,
      durationMinutes: 30,
      passingScore: 3,
      maxAttempts: 2,
      questions: sampleQuestions,
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: true, shuffleOptions: true },
    });

    expect(version.totalPoints).toBe(5);
    expect(version.questionCount).toBe(3);
    expect(Object.isFrozen(version)).toBe(true);
    expect(Object.isFrozen(version.questions)).toBe(true);
  });

  it('should successfully publish Quiz when version satisfies all invariants', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    const version = new QuizVersion({
      id: 'ver_1',
      quizId: 'quiz_1',
      versionNumber: 1,
      durationMinutes: 30,
      passingScore: 3,
      questions: sampleQuestions,
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    quiz.publish(version);
    expect(quiz.status).toBe('PUBLISHED');
    expect(quiz.currentPublishedVersionId).toBe('ver_1');
  });

  it('should reject publish if quizId of version does not match quiz ID', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    const version = new QuizVersion({
      id: 'ver_1',
      quizId: 'quiz_different',
      versionNumber: 1,
      durationMinutes: 30,
      passingScore: 3,
      questions: sampleQuestions,
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    expect(() => quiz.publish(version)).toThrow(QuizPublishInvariantViolationError);
  });

  it('should reject publish if version has empty questions', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    const emptyVersion = new QuizVersion({
      id: 'ver_empty',
      quizId: 'quiz_1',
      versionNumber: 1,
      durationMinutes: 30,
      passingScore: 0,
      questions: [],
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    expect(() => quiz.publish(emptyVersion)).toThrow(QuizPublishInvariantViolationError);
  });

  it('should reject publish if single-choice question has no correct option or multiple correct options', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    const invalidVersion = new QuizVersion({
      id: 'ver_invalid',
      quizId: 'quiz_1',
      versionNumber: 1,
      durationMinutes: 10,
      passingScore: 1,
      questions: [
        {
          id: 'q_bad',
          type: 'single-choice',
          prompt: 'Bad question',
          points: 1,
          options: [
            { id: 'o1', text: 'A', isCorrect: false },
            { id: 'o2', text: 'B', isCorrect: false },
          ],
        },
      ],
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    expect(() => quiz.publish(invalidVersion)).toThrow(QuizPublishInvariantViolationError);
  });

  it('should reject publish if true-false question has invalid boolean answer', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    const invalidVersion = new QuizVersion({
      id: 'ver_bad_tf',
      quizId: 'quiz_1',
      versionNumber: 1,
      durationMinutes: 10,
      passingScore: 1,
      questions: [
        {
          id: 'q_tf',
          type: 'true-false',
          prompt: 'Is water dry?',
          points: 1,
          correctAnswer: 'false' as any, // Not a boolean
        },
      ],
      scoringPolicy: { strategyType: 'exact-match' },
      randomizationPolicy: { shuffleQuestions: false, shuffleOptions: false },
    });

    expect(() => quiz.publish(invalidVersion)).toThrow(QuizPublishInvariantViolationError);
  });

  it('should archive quiz and disallow modifications on archived quiz', () => {
    const quiz = new Quiz({
      id: 'quiz_1',
      code: 'MATH101',
      title: 'Math Quiz',
      ownerId: 'teacher_1',
    });

    quiz.archive();
    expect(quiz.status).toBe('ARCHIVED');
    expect(() => quiz.updateDetails('New Title')).toThrow('Cannot update details of an ARCHIVED quiz');
  });
});
