import { z } from 'zod';

export const ExecuteCommandBodySchema = z.object({
  command: z.string().min(1),
  sessionId: z.string().optional(),
});
