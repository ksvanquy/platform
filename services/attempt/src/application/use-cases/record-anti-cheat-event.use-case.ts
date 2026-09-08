import crypto from 'node:crypto';
import type { AntiCheatEventType, AntiCheatEventDTO } from '@platform/contracts';
import { AttemptEvent } from '../../domain/entities/attempt-event.entity.js';
import type { AttemptRepositoryPort } from '../../domain/ports/attempt.repository.port.js';
import { AttemptNotFoundError } from '../../domain/errors/attempt-domain.errors.js';

export interface RecordAntiCheatEventInput {
  attemptId: string;
  userId: string;
  eventType: AntiCheatEventType;
  clientTimestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
}

export class RecordAntiCheatEventUseCase {
  constructor(private readonly attemptRepo: AttemptRepositoryPort) {}

  async execute(input: RecordAntiCheatEventInput): Promise<AntiCheatEventDTO> {
    const { attemptId, userId, eventType, clientTimestamp, metadata = {} } = input;

    const attempt = await this.attemptRepo.findAttemptById(attemptId);
    if (!attempt) {
      throw new AttemptNotFoundError(attemptId);
    }

    let parsedClientTime: Date;
    if (!clientTimestamp) {
      parsedClientTime = new Date();
    } else if (clientTimestamp instanceof Date) {
      parsedClientTime = clientTimestamp;
    } else if (typeof clientTimestamp === 'number') {
      parsedClientTime = new Date(clientTimestamp);
    } else {
      parsedClientTime = new Date(clientTimestamp);
    }

    const eventId = `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const event = new AttemptEvent({
      id: eventId,
      attemptId,
      userId,
      eventType,
      clientTimestamp: parsedClientTime,
      serverTimestamp: new Date(),
      metadata,
    });

    await this.attemptRepo.saveEvent(event);
    return event.toDTO();
  }
}
