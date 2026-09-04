import crypto from 'node:crypto';
import { User } from '../../domain/user/user.entity.js';
import { Role } from '../../domain/role/role.entity.js';
import { Permission } from '../../domain/role/permission.entity.js';
import { IUserRepository } from '../../domain/user/user.repository.port.js';
import { TokenService, AuthTokens } from '../../infrastructure/token/token.service.js';
import { hashPassword } from '../../infrastructure/persistence/in-memory-user.repository.js';

export interface RegisterDTO {
  email?: string;
  name?: string;
  password?: string;
  tenantId?: string;
}

export interface RegisterResult {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    name: string;
    roles: readonly string[];
    permissions: readonly string[];
    tenantId?: string;
    createdAt: string;
  };
  principal: {
    id: string;
    roles: readonly string[];
    permissions?: readonly string[];
    tenantId?: string;
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
    const tenantId = dto.tenantId?.trim() || 'tenant_default';

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
        description: 'Student or examinee taking quizzes',
        isSystem: true,
        permissions: [
          new Permission({ id: 'perm_quiz_read', code: 'quiz:read', resource: 'quiz', action: 'read' }),
          new Permission({ id: 'perm_attempt_create', code: 'attempt:create', resource: 'attempt', action: 'create' }),
          new Permission({ id: 'perm_attempt_submit', code: 'attempt:submit', resource: 'attempt', action: 'submit' }),
        ],
      });

    const newUser = new User({
      id: userId,
      email,
      name,
      passwordHash,
      roles: [studentRole],
      tenantId,
      createdAt: new Date(),
    });

    await this.userRepository.save(newUser);

    const principal = newUser.toPrincipal();
    const tokens = this.tokenService.generateTokens({
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      tenantId: principal.tenantId,
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
