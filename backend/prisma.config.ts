import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 configuration. The datasource connection string lives here (used by
// the Prisma CLI for migrate/introspect); the runtime client connects through a
// driver adapter — see src/config/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'node prisma/seed.js',
  },
});
