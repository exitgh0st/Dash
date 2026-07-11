import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password.util';

/**
 * Owns all persistence and business logic for Dash users. Controllers stay thin
 * and delegate here; passwords are hashed in this layer, never above it.
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
   * Look up a user by id (used by auth for /me and refresh).
   * @returns the matching user, or null if none exists.
   */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * List all users, oldest first (admin listing), each with a count of the
   * Reddit accounts they own. The count is a cheap DB aggregate — no Reddit call.
   */
  async findAll(): Promise<
    Array<User & { _count: { redditAccounts: number } }>
  > {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { redditAccounts: true } } },
    });
  }

  /**
   * Create a user with a hashed password.
   * @param data.role defaults to `shiller`; only the seed passes `admin`.
   * @returns the created user.
   * @throws ConflictException if the email is already registered (Prisma P2002).
   */
  async create(data: {
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<User> {
    const passwordHash = await hashPassword(data.password);
    try {
      return await this.prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role ?? 'shiller',
        },
      });
    } catch (e) {
      // P2002 = unique constraint violation (email already in use).
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw e;
    }
  }

  /**
   * Update a user's email and/or password (admin edit of a shiller profile).
   * Only the provided fields change; a password is re-hashed before storage.
   * @throws NotFoundException if no user has that id.
   * @throws ConflictException if the new email is already registered (P2002).
   */
  async update(
    id: string,
    data: {
      email?: string;
      password?: string;
      weeklyCommentQuota?: number;
      weeklyPostQuota?: number;
    },
  ): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Build a partial update so absent fields are left untouched.
    const patch: Prisma.UserUpdateInput = {};
    if (data.email !== undefined) {
      patch.email = data.email;
    }
    if (data.password !== undefined) {
      patch.passwordHash = await hashPassword(data.password);
    }
    if (data.weeklyCommentQuota !== undefined) {
      patch.weeklyCommentQuota = data.weeklyCommentQuota;
    }
    if (data.weeklyPostQuota !== undefined) {
      patch.weeklyPostQuota = data.weeklyPostQuota;
    }

    try {
      return await this.prisma.user.update({ where: { id }, data: patch });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already in use');
      }
      throw e;
    }
  }

  /**
   * Delete a user. Deleting a shiller cascades to their Reddit accounts and
   * refresh tokens (see schema `onDelete: Cascade`).
   *
   * Guardrail: admins cannot be deleted — this both protects other admins and,
   * since every caller of this route is an admin, blocks self-deletion.
   *
   * @throws NotFoundException if no user has that id.
   * @throws ForbiddenException if the target user is an admin.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.role === 'admin') {
      throw new ForbiddenException('Admins cannot be deleted.');
    }
    await this.prisma.user.delete({ where: { id } });
  }
}
