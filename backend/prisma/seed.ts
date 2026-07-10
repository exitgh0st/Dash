import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/crypto/password.util';

/**
 * Seed the first admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Idempotent: if an account with that email already exists we leave it
 * untouched (never overwrite an existing password). The password itself is
 * never logged.
 */
async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the first admin',
    );
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} already exists — skipping.`);
      return;
    }
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role: 'admin' },
    });
    console.log(`Created admin ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
