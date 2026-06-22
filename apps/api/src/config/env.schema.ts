import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().int().default(5001),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ADMIN_BEARER: z.string().min(32),

  /** Comma-separated list of npm package names that export a default SignatureVerifier
   *  (or a named export with id `<package-suffix>`). The api dynamic-imports each on boot. */
  WEBHOOK_GATEWAY_PLUGINS: z.string().default('@webhook-gateway/plugin-hmac'),

  INGRESS_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576), // 1 MiB
});

export type Env = z.infer<typeof envSchema>;
