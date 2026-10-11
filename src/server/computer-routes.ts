import { Hono } from 'hono';
import { z } from 'zod';
import type { ComputerService } from './computer-service.js';
import type { ComputerAction } from '../shared/computer-types.js';
import type { Store } from './store.js';
import { isConsequentialAction } from '../shared/types.js';
export function computerRoutes(computers: ComputerService, store?: Store) {
  const app = new Hono();
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Invalid computer request.'
            : error.message,
      },
      400,
    ),
  );
  app.get('/dots/:id/computer', async (c) =>
    c.json(await computers.status(c.req.param('id'))),
  );
  app.patch('/dots/:id/computer/permissions', async (c) =>
    c.json(await computers.permissions(c.req.param('id'), await c.req.json())),
  );
  app.post('/dots/:id/computer/start', async (c) =>
    c.json(await computers.start(c.req.param('id'))),
  );
  app.post('/dots/:id/computer/stop', async (c) =>
    c.json(await computers.stop(c.req.param('id'))),
  );
  app.post('/dots/:id/computer/take', async (c) =>
    c.json(await computers.control(c.req.param('id'), 'take')),
  );
  app.post('/dots/:id/computer/release', async (c) =>
    c.json(await computers.control(c.req.param('id'), 'release')),
  );
  app.post('/dots/:id/computer/actions', async (c) => {
    const dotId = c.req.param('id');
    const body = z
      .object({
        action: z.string(),
        input: z.unknown(),
        approvalId: z.string().optional(),
      })
      .strict()
      .parse(await c.req.json());

    if (isConsequentialAction(body.action)) {
      if (!body.approvalId) {
        return c.json(
          {
            error: `Consequential action '${body.action}' requires explicit human approval.`,
          },
          403,
        );
      }
      if (store) {
        const consumed = store.consumeApproval(
          body.approvalId,
          body.action,
          dotId,
          body.input,
        );
        if (!consumed.ok) {
          return c.json({ error: consumed.error }, consumed.code);
        }
      }
    }

    return c.json(
      await computers.action(
        dotId,
        body.action as ComputerAction,
        body.input,
        'owner',
        c.req.raw.signal,
      ),
    );
  });
  return app;
}
