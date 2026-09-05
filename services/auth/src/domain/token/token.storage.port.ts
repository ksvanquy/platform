/**
 * Port lưu trữ và quản trị vòng đời Refresh Token tuân thủ Hexagonal / Clean Architecture.
 * Lưu trữ bền vững 100% trên PostgreSQL qua Drizzle ORM (Zero In-Memory).
 */

export interface TokenRecord {
  userId: string;
  familyId?: string;
  expiresAt: Date;
  revokedAt: Date | null;
  isRevoked: boolean;
  isExpired: boolean;
}

/**
 * Ngoại lệ bảo mật khi phát hiện hành vi tái sử dụng Refresh Token đã bị thu hồi (Token Reuse Attack / Token Theft)
 */
export class RefreshTokenReuseError extends Error {
  readonly code = 'TOKEN_REUSE_DETECTED';

  constructor(
    message = 'Invalid or expired refresh token: Refresh token reuse detected. All active sessions have been revoked for security.'
  ) {
    super(message);
    this.name = 'RefreshTokenReuseError';
  }
}

export interface ITokenStorage {
  /**
   * Lưu refresh token (băm SHA-256 đối với DB) kèm hạn sử dụng và Token Family ID
   */
  saveRefreshToken(token: string, userId: string, expiresAt: Date, familyId?: string): Promise<void> | void;

  /**
   * Kiểm tra refresh token có hợp lệ (chưa hết hạn và chưa bị thu hồi)
   */
  validateRefreshToken(token: string): Promise<{ userId: string; familyId?: string } | null> | { userId: string; familyId?: string } | null;

  /**
   * Truy vấn trạng thái chi tiết của token (hỗ trợ phát hiện Reuse khi token đã bị thu hồi)
   */
  inspectRefreshToken?(token: string): Promise<TokenRecord | null> | TokenRecord | null;

  /**
   * Thu hồi (revoke) refresh token khi đăng xuất hoặc xoay vòng
   */
  revokeRefreshToken(token: string): Promise<boolean> | boolean;

  /**
   * Thu hồi toàn bộ refresh token của một user khi tài khoản bị khóa hoặc bị phát hiện Token Reuse
   */
  revokeAllUserTokens?(userId: string): Promise<void> | void;

  /**
   * Thu hồi toàn bộ chuỗi token trong một Token Family khi phát hiện hành vi Token Reuse
   */
  revokeTokenFamily?(familyId: string): Promise<void> | void;
}
