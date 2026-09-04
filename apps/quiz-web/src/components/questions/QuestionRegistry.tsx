import React from 'react';
import { QuestionProps, SingleChoiceQuestion } from './SingleChoiceQuestion.js';
import { MultipleChoiceQuestion } from './MultipleChoiceQuestion.js';
import { FillInQuestion } from './FillInQuestion.js';
import { MatchingQuestion } from './MatchingQuestion.js';
import { OrderingQuestion } from './OrderingQuestion.js';
import { NumericQuestion } from './NumericQuestion.js';
import { QuestionType } from '../../types/quiz.types.js';

export const QUESTION_COMPONENTS: Record<QuestionType, React.FC<QuestionProps>> = {
  SINGLE: SingleChoiceQuestion,
  MULTIPLE: MultipleChoiceQuestion,
  FILL_IN: FillInQuestion,
  MATCHING: MatchingQuestion,
  ORDERING: OrderingQuestion,
  NUMERIC: NumericQuestion,
};

export const QuestionRenderer: React.FC<QuestionProps> = (props) => {
  const Component = QUESTION_COMPONENTS[props.question.type];

  if (!Component) {
    return (
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
        Loại câu hỏi chưa được hỗ trợ: <strong>{props.question.type}</strong>
      </div>
    );
  }

  return <Component {...props} />;
};
