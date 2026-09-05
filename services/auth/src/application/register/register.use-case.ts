import crypto from 'node:crypto';
import { User } from '../../domain/user/user.entity.js';
import { Role } from '../../domain/role/role.entity.js';
import { Permission } from '../../domain/role/permission.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService, AuthTokens } from '../../infrastructure/token/token.service.js';
import { hashPassword } from '../../infrastructure/crypto/password.js';

export interface RegisterDTO {
  email?: string;
  name?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterResult {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    name: string;
    roles: readonly string[];
    permissions: readonly string[];
    metadata?: Record<string, unknown>;
    isActive?: boolean;
    createdAt: string;
  };
  principal: {
    id: string;
    roles: readonly string[];
    permissions?: readonly string[];
    metadata?: Record<string, unknown>;
  };
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService
  ) {}

  async execute(dto: RegisterDTO): Promise<RegisterResult> {
    const email = dto.email?.trim().toLowerCase();
    const name = dto.name?.trim();
    const password = dto.password;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Valid email address is required');
    }

    if (!name || name.length < 2) {
      throw new Error('Name must be at least 2 characters long');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email is already registered');
    }

    const userId = `usr_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = hashPassword(password);

    // Nạp vai trò STUDENT từ DB
    const fetchedRole = this.userRepository.getRoleByCode
      ? await this.userRepository.getRoleByCode('STUDENT')
      : null;

    const studentRole =
      fetchedRole ||
      new Role({
        id: 'role_student',
        code: 'STUDENT',
        name: 'Student',
        description: 'Standard end-user or student',
        isSystem: true,
        permissions: [
          new Permission({ id: 'perm_user_read', code: 'user:read', resource: 'user', action: 'read' }),
          new Permission({ id: 'perm_user_write', code: 'user:write', resource: 'user', action: 'write' }),
        ],
      });

    const meta: Record<string, unknown> = { ...(dto.metadata || {}) };

    const newUser = new User({
      id: userId,
      email,
      name,
      passwordHash,
      roles: [studentRole],
      metadata: meta,
      createdAt: new Date(),
    });

    await this.userRepository.save(newUser);

    const principal = newUser.toPrincipal();
    const tokens = this.tokenService.generateTokens({
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      metadata: principal.metadata,
      email: newUser.email,
      name: newUser.name,
    });

    return {
      tokens,
      user: newUser.toSafeProfile(),
      principal,
    };
  }
}
