import { Controller } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * HTTP surface for user management (served under /api/users).
 *
 * Scaffold stage: no handlers yet. Routes (profile, admin listings) are added
 * with their DTOs once auth exists.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
}
