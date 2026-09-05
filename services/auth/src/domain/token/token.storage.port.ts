/**
 * Port lưu trữ và quản trị vòng đời Refresh Token tuân thủ Hexagonal / Clean Architecture.
 * Lưu trữ bền vững 100% trên PostgreSQL qua Drizzle ORM (Zero In-Memory).
 */
export interface ITokenStorage {
  /**
   * Lưu refresh token (băm SHA-256 đối với DB) kèm hạn sử dụng
   */
  saveRefreshToken(token: string, userId: string, expiresAt: Date): Promise<void> | void;

  /**
   * Kiểm tra refresh token có hợp lệ (chưa hết hạn và chưa bị thu hồi)
   */
  validateRefreshToken(token: string): Promise<{ userId: string } | null> | { userId: string } | null;

  /**
   * Thu hồi (revoke) refresh token khi đăng xuất hoặc xoay vòng
   */
  revokeRefreshToken(token: string): Promise<boolean> | boolean;

  /**
   * Thu hồi toàn bộ refresh token của một user khi tài khoản bị khóa/vô hiệu hóa
   */
  revokeAllUserTokens?(userId: string): Promise<void> | void;
}
