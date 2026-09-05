import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService, AuthTokens } from '../../infrastructure/token/token.service.js';

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

    const validation = await this.tokenService.validateRefreshToken(dto.refreshToken);
    if (!validation) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await this.userRepository.findById(validation.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive) {
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
      await this.tokenService.revokeAllUserTokens?.(user.id);
      throw new Error('Account is deactivated');
    }

    // Xoá refresh token cũ (token rotation)
    await this.tokenService.revokeRefreshToken(dto.refreshToken);

    const principal = user.toPrincipal();
    const newTokens = this.tokenService.generateTokens({
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      metadata: principal.metadata,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
    });

    return { tokens: newTokens };
  }
}
