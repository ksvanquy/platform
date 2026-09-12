import { apiClient } from './client.js';

/**
 * Quiz API - Hợp nhất trực tiếp với apiClient.delivery từ @platform/api-client.
 * Dọn dẹp toàn bộ wrapper thừa giữa apps/web/api và packages/api-client,
 * đảm bảo 100% tương thích ngược cho các views và hooks hiện hành.
 */
export const quizApi = apiClient.delivery;
