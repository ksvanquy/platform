import {
  AuthoringRepositoryPort,
  DeliveryRepositoryPort,
} from '../../domain/ports/assessment.repository.ports.js';
import { DrizzleAuthoringRepository } from './drizzle-authoring.repository.js';
import { DrizzleDeliveryRepository } from './drizzle-delivery.repository.js';
import { isQuizDbConfigured } from '../db/connection.js';

export function createAuthoringRepository(db?: any): AuthoringRepositoryPort {
  if (db) {
    return new DrizzleAuthoringRepository(db);
  }
  if (!isQuizDbConfigured()) {
    throw new Error(
      'FATAL: QUIZ_DATABASE_URL is not configured. ' +
      'In-Memory fallback is strictly forbidden. Please configure quiz_db PostgreSQL connection.'
    );
  }
  return new DrizzleAuthoringRepository();
}

export function createDeliveryRepository(db?: any): DeliveryRepositoryPort {
  if (db) {
    return new DrizzleDeliveryRepository(db);
  }
  if (!isQuizDbConfigured()) {
    throw new Error(
      'FATAL: QUIZ_DATABASE_URL is not configured. ' +
      'In-Memory fallback is strictly forbidden. Please configure quiz_db PostgreSQL connection.'
    );
  }
  return new DrizzleDeliveryRepository();
}
