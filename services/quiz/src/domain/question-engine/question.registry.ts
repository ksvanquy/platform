import { QuestionTypeHandler } from './question-handler.interface.js';
import { SingleChoiceHandler } from './handlers/single-choice.handler.js';
import { MultipleChoiceHandler } from './handlers/multiple-choice.handler.js';
import { TrueFalseHandler } from './handlers/true-false.handler.js';

export class QuestionRegistry {
  private static defaultInstance: QuestionRegistry | null = null;
  private handlers = new Map<string, QuestionTypeHandler>();

  constructor() {
    this.register(new SingleChoiceHandler());
    this.register(new MultipleChoiceHandler());
    this.register(new TrueFalseHandler());
  }

  static getInstance(): QuestionRegistry {
    if (!QuestionRegistry.defaultInstance) {
      QuestionRegistry.defaultInstance = new QuestionRegistry();
    }
    return QuestionRegistry.defaultInstance;
  }

  register(handler: QuestionTypeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  get(type: string): QuestionTypeHandler | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  getAll(): QuestionTypeHandler[] {
    return Array.from(this.handlers.values());
  }
}
