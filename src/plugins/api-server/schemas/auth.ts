import { z } from 'zod';

export const CreateTokenBodySchema = z.object({
  role: z.enum(['admin', 'operator', 'viewer']),
  name: z.string().min(1),
  expire: z.string().regex(/^\d+(h|d|m)$/).default('24h'),
  scopes: z.array(z.string()).optional(),
});

export const RevokeTokenParamSchema = z.object({
  id: z.string().min(1),
});

export const RefreshBodySchema = z.object({
  token: z.string().min(1),
});
