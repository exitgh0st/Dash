import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

  /**
   * Admin fetches a single user by id (e.g. to prefill the edit dialog).
   * @throws NotFoundException if no user has that id.
   */
  @Get(':id')
  @Roles('admin')
  async findOne(@Param('id') id: string): Promise<PublicUser> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  /**
   * Admin updates a shiller's email and/or password. Role is not editable here.
   * @returns the updated user without its password hash.
   */
  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<PublicUser> {
    const user = await this.usersService.update(id, dto);
    return toPublicUser(user);
  }

  /**
   * Admin deletes a shiller (cascades their Reddit accounts + tokens). Admins
   * cannot be deleted, which also blocks self-deletion (see UsersService).
   */
  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.usersService.remove(id);
  }
}
