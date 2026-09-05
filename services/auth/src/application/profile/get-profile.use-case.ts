import { IUserRepository } from '../../domain/user/user.repository.port.js';

export interface GetProfileDTO {
  userId: string;
}

export interface GetProfileResult {
  principal: {
    id: string;
    roles: readonly string[];
    permissions?: readonly string[];
    metadata?: Record<string, unknown>;
  };
  profile: {
    id: string;
    email: string;
    name: string;
    roles: readonly string[];
    permissions: readonly string[];
    metadata?: Record<string, unknown>;
    createdAt: string;
  };
}

export class GetProfileUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(dto: GetProfileDTO): Promise<GetProfileResult> {
    if (!dto.userId) {
      throw new Error('User ID is required');
    }

    const user = await this.userRepository.findById(dto.userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      principal: user.toPrincipal(),
      profile: user.toSafeProfile(),
    };
  }
}
