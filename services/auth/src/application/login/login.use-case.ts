import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService, AuthTokens } from '../../infrastructure/token/token.service.js';
import { verifyPassword } from '../../infrastructure/crypto/password.js';

export interface LoginDTO {
  email?: string;
  password?: string;
}

export interface LoginResult {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    name: string;
    roles: readonly string[];
    permissions: readonly string[];
    tenantId?: string;
  };
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService
  ) {}

  async execute(dto: LoginDTO): Promise<LoginResult> {
    if (!dto.email || !dto.password) {
      throw new Error('Email and password are required');
    }

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = verifyPassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    const principal = user.toPrincipal();
    const tokens = this.tokenService.generateTokens({
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      tenantId: principal.tenantId,
      email: user.email,
      name: user.name,
    });

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.getRoleCodes(),
        permissions: user.getEffectivePermissions(),
        tenantId: user.tenantId,
      },
    };
  }
}
