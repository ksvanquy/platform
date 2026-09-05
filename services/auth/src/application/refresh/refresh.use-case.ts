import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService, AuthTokens } from '../../infrastructure/token/token.service.js';
import { RefreshTokenReuseError } from '../../domain/token/token.storage.port.js';

export { RefreshTokenReuseError };

export interface RefreshDTO {
  refreshToken?: string;
}

export class RefreshUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService
  ) {}

  async execute(dto: RefreshDTO): Promise<{ tokens: AuthTokens }> {
    if (!dto.refreshToken) {
      throw new Error('Refresh token is required');
    }

    // 1. Kiểm tra trạng thái chi tiết của Refresh Token (hỗ trợ phát hiện Token Reuse)
    const inspection = await this.tokenService.inspectRefreshToken(dto.refreshToken);
    if (!inspection) {
      throw new Error('Invalid or expired refresh token');
    }

    // 2. PHÁT HIỆN REUSE: Token đã bị thu hồi trước đó nhưng lại được gửi lên để refresh!
    // Đây là dấu hiệu của Token Theft (kẻ tấn công hoặc nạn nhân đang dùng token cũ).
    // Hệ thống kích hoạt Token Family Revocation: Thu hồi toàn bộ token của family và tất cả phiên của user.
    if (inspection.isRevoked) {
      if (inspection.familyId) {
        await this.tokenService.revokeTokenFamily(inspection.familyId);
      }
      await this.tokenService.revokeAllUserTokens(inspection.userId);

      throw new RefreshTokenReuseError(
        'Invalid or expired refresh token: Refresh token reuse detected. All active sessions have been revoked for security.'
      );
    }

    if (inspection.isExpired) {
      throw new Error('Invalid or expired refresh token');
    }

    // 3. Token hợp lệ -> Kiểm tra User
    const user = await this.userRepository.findById(inspection.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive) {
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
      await this.tokenService.revokeAllUserTokens?.(user.id);
      throw new Error('Account is deactivated');
    }

    // 4. Token Rotation: Thu hồi refresh token hiện tại
    await this.tokenService.revokeRefreshToken(dto.refreshToken);

    // 5. Phát hành cặp token mới giữ nguyên Token Family
    const principal = user.toPrincipal();
    const newTokens = this.tokenService.generateTokens(
      {
        sub: principal.id,
        roles: principal.roles,
        permissions: principal.permissions,
        metadata: principal.metadata,
        email: user.email,
        name: user.name,
        isActive: user.isActive,
      },
      {
        familyId: inspection.familyId,
      }
    );

    return { tokens: newTokens };
  }
}
