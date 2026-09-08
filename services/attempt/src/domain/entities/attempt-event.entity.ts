import type { AntiCheatEventType, AntiCheatEventDTO } from '@platform/contracts';

export interface AttemptEventProps {
  id: string;
  attemptId: string;
  userId: string;
  eventType: AntiCheatEventType;
  clientTimestamp: Date;
  serverTimestamp?: Date;
  metadata?: Record<string, unknown>;
}

export class AttemptEvent {
  readonly id: string;
  readonly attemptId: string;
  readonly userId: string;
  readonly eventType: AntiCheatEventType;
  readonly clientTimestamp: Date;
  readonly serverTimestamp: Date;
  readonly metadata: Record<string, unknown>;

  constructor(props: AttemptEventProps) {
    if (!props.id) throw new Error('Event ID is required');
    if (!props.attemptId) throw new Error('Attempt ID is required');
    if (!props.userId) throw new Error('User ID is required');
    if (!props.eventType) throw new Error('Event type is required');

    this.id = props.id;
    this.attemptId = props.attemptId;
    this.userId = props.userId;
    this.eventType = props.eventType;
    this.clientTimestamp = props.clientTimestamp;
    this.serverTimestamp = props.serverTimestamp ?? new Date();
    this.metadata = props.metadata ? Object.freeze({ ...props.metadata }) : {};
  }

  toDTO(): AntiCheatEventDTO {
    return {
      id: this.id,
      attemptId: this.attemptId,
      userId: this.userId,
      eventType: this.eventType,
      clientTimestamp: this.clientTimestamp.toISOString(),
      serverTimestamp: this.serverTimestamp.toISOString(),
      metadata: this.metadata,
    };
  }
}
