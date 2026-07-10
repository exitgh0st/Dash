import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Owns all persistence and business logic for Dash users.
 *
 * Scaffold stage: method signatures are stubbed so the auth feature can fill in
 * hashing/validation without restructuring. Controllers must stay thin and
 * delegate here.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a user by email (used by auth for login).
   * @returns the matching user, or null if none exists.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /**
   * Create a new user record.
   * TODO(auth): accept a validated DTO and a pre-hashed password.
   * @returns the created user.
   */
  async create(data: { email: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
