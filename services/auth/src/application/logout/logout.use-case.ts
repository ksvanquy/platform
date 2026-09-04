import { TokenService } from '../../infrastructure/token/token.service.js';

export interface LogoutDTO {
  refreshToken?: string;
}

export class LogoutUseCase {
  constructor(private readonly tokenService: TokenService) {}

  async execute(dto: LogoutDTO): Promise<{ success: boolean; message: string }> {
    if (dto.refreshToken) {
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
    }
    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
