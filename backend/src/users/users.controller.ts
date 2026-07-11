import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { PublicUser, toPublicUser } from './public-user';

/**
 * User management under `/api/users`. Every route is admin-only — shiller
 * accounts are created here, and the first admin comes from the seed script.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Admin creates a shiller account. Role is fixed to `shiller` server-side.
   * @returns the created user without its password hash.
   */
  @Post()
  @Roles('admin')
  async create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    const user = await this.usersService.create(dto);
    return toPublicUser(user);
  }

  /** Admin lists all Dash users (no password hashes), each with an account count. */
  @Get()
  @Roles('admin')
  async findAll(): Promise<PublicUser[]> {
    const users = await this.usersService.findAll();
    return users.map((u) => toPublicUser(u, u._count.redditAccounts));
  }
}
