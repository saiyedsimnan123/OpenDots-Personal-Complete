import { computerRoutes } from './computer-routes.js';
import { isConsequentialAction } from '../shared/types.js';
import type { ComputerAction } from '../shared/computer-types.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.js';
import { Runner } from './runner.js';
import { configured, type Config } from './research.js';
import type { Platform } from './platform.js';
import { VoiceService } from './voice.js';
import { workspaceRoutes } from './workspace-routes.js';
const interval = z.number().int().min(60).max(31_536_000).nullable();
export interface AppOptions {
  store: Store;
  runner: Runner;
  config: Config;
  ownerToken?: string;
  origin?: string;
  platform?: Platform;
}
export function createApp({
  store,
  runner,
  config,
  ownerToken,
  origin,
  platform,
}: AppOptions) {
  const app = new Hono();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1_000_000,
      onError: (c) => c.json({ error: 'Request is too large.' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    const requestUrl = new URL(c.req.url);
    const allowedHosts = new Set([
      'localhost',
      '127.0.0.1',
      '[::1]',
      ...(origin ? [new URL(origin).hostname] : []),
    ]);
    if (!ownerToken && !allowedHosts.has(requestUrl.hostname))
      return c.json({ error: 'Unrecognized host.' }, 403);
    const requestOrigin = c.req.header('origin');
    const expectedOrigin = origin ?? new URL(c.req.url).origin;
    if (requestOrigin && requestOrigin !== expectedOrigin)
      return c.json({ error: 'Cross-origin requests are not allowed.' }, 403);
    if (c.req.header('sec-fetch-site') === 'cross-site')
      return c.json({ error: 'Cross-site requests are not allowed.' }, 403);
    if (ownerToken) {
      const expected = Buffer.from(ownerToken);
      const supplied = Buffer.from(
        c.req.header('authorization')?.replace(/^Bearer /, '') ?? '',
      );
      if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      )
        return c.json(
          { error: 'Enter your owner access token to unlock OpenDots.' },
          401,
        );
    }
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      !c.req.header('content-type')?.includes('application/json')
    )
      return c.json({ error: 'Use application/json.' }, 415);
    await next();
  });
  app.get('/health', (c) => c.json({ status: 'ok' }));
  if (platform) app.route('/api', computerRoutes(platform.computers, store));
  const voice = platform ? new VoiceService(platform) : undefined;
  if (platform && voice) app.route('/api', workspaceRoutes(platform, voice));
  app.get('/api/state', (c) =>
    c.json({
      settings: store.settings(),
      tasks: store.tasks(),
      memories: store.memories(),
      approvals: store.approvals(),
      mode: config.mode,
      configured: configured(config),
    }),
  );
  app.post('/api/tasks', async (c) => {
    const parsed = z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        intervalSeconds: interval.optional(),
        threadId: z.string().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        {
          error:
            'Enter a request between 3 and 4,000 characters; repeat intervals must be at least 60 seconds.',
        },
        400,
      );
    if (!store.settings().researchAllowed)
      return c.json({ error: 'Research is disabled in Settings.' }, 403);
    if (platform) {
      if (platform.setup().missing.length)
        return c.json(
          { error: `Setup required: ${platform.setup().missing.join(', ')}.` },
          503,
        );
      if (!parsed.data.threadId)
        return c.json(
          { error: 'Select a conversation for this scheduled task.' },
          400,
        );
      try {
        platform.workspace.requireThread(parsed.data.threadId);
      } catch {
        return c.json(
          { error: 'Conversation is not owned by this workspace.' },
          403,
        );
      }
    }
    const task = store.createTask(
      parsed.data.prompt,
      parsed.data.intervalSeconds,
    );
    if (platform && parsed.data.threadId)
      platform.workspace.bindTask(task.id, parsed.data.threadId);
    return c.json(task, 201);
  });
  app.get('/api/tasks/:id', (c) => {
    const detail = store.detail(c.req.param('id'));
    return detail ? c.json(detail) : c.json({ error: 'Task not found.' }, 404);
  });
  app.post('/api/tasks/:id/actions', async (c) => {
    const parsed = z
      .object({ action: z.enum(['run', 'pause', 'cancel']) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Unknown task action.' }, 400);
    if (parsed.data.action === 'run' && !store.settings().researchAllowed)
      return c.json({ error: 'Research is disabled in Settings.' }, 403);
    const task = store.action(c.req.param('id'), parsed.data.action);
    if (parsed.data.action !== 'run') runner.abort(c.req.param('id'));
    return task ? c.json(task) : c.json({ error: 'Task not found.' }, 404);
  });
  app.put('/api/tasks/:id/schedule', async (c) => {
    const parsed = z
      .object({ intervalSeconds: interval })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Repeat interval must be 60 seconds to one year, or null.' },
        400,
      );
    const task = store.schedule(c.req.param('id'), parsed.data.intervalSeconds);
    return task ? c.json(task) : c.json({ error: 'Task not found.' }, 404);
  });
  app.patch('/api/settings', async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        paused: z.boolean().optional(),
        researchAllowed: z.boolean().optional(),
        memoryAllowed: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid settings.' }, 400);
    const previous = store.settings();
    const settings = store.updateSettings(parsed.data);
    if (
      settings.paused ||
      !settings.researchAllowed ||
      previous.memoryAllowed !== settings.memoryAllowed
    )
      runner.abortAll();
    if (settings.paused) voice?.abortAll();
    else void voice?.resumePending();
    return c.json(settings);
  });
  app.post('/api/memories', async (c) => {
    const parsed = z
      .object({ text: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Memory must be between 1 and 2,000 characters.' },
        400,
      );
    return c.json(store.saveMemory(parsed.data.text), 201);
  });
  app.put('/api/memories/:id', async (c) => {
    const parsed = z
      .object({ text: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Memory must be between 1 and 2,000 characters.' },
        400,
      );
    if (!store.memories().some((m) => m.id === c.req.param('id')))
      return c.json({ error: 'Memory not found.' }, 404);
    return c.json(store.saveMemory(parsed.data.text, c.req.param('id')));
  });
  app.delete('/api/memories/:id', (c) =>
    store.deleteMemory(c.req.param('id'))
      ? c.json({ ok: true })
      : c.json({ error: 'Memory not found.' }, 404),
  );
  app.get('/api/approvals', (c) => c.json(store.approvals()));
  app.get('/api/approvals/:id', (c) => {
    const approval = store.approval(c.req.param('id'));
    return approval
      ? c.json(approval)
      : c.json({ error: 'Approval not found.' }, 404);
  });
  app.post('/api/approvals', async (c) => {
    const parsed = z
      .object({
        action: z.string().trim().min(1).max(100),
        target: z.string().trim().max(100).optional(),
        description: z.string().trim().min(1).max(2000),
        params: z.record(z.string(), z.unknown()).nullable().optional(),
        expiresAt: z.number().int(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Invalid approval request.' }, 400);
    try {
      const approval = store.createApproval(
        parsed.data.action,
        parsed.data.description,
        parsed.data.expiresAt,
        parsed.data.target ?? '',
        parsed.data.params ?? null,
      );
      return c.json(approval, 201);
    } catch (e) {
      return c.json(
        {
          error: e instanceof Error ? e.message : 'Could not create approval.',
        },
        400,
      );
    }
  });
  app.post('/api/approvals/:id/decision', async (c) => {
    if (c.req.header('x-actor') === 'agent' || c.req.header('x-agent-call')) {
      return c.json(
        { error: 'AI agents cannot approve consequential actions.' },
        403,
      );
    }
    const parsed = z
      .object({
        status: z.enum(['approved', 'rejected']),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Invalid decision status.' }, 400);
    const existing = store.approval(c.req.param('id'));
    if (!existing) return c.json({ error: 'Approval not found.' }, 404);
    if (existing.status !== 'pending')
      return c.json({ error: `Approval is already ${existing.status}.` }, 409);
    const updated = store.updateApprovalStatus(
      c.req.param('id'),
      parsed.data.status,
    );
    return c.json(updated);
  });
  app.post('/api/approvals/:id/execute', async (c) => {
    const id = c.req.param('id');
    const existing = store.approval(id);
    if (!existing) return c.json({ error: 'Approval not found.' }, 404);
    if (existing.status === 'executed')
      return c.json(
        { error: 'Approval request has already been executed.' },
        409,
      );
    if (existing.status === 'expired')
      return c.json({ error: 'Approval request has expired.' }, 403);
    if (existing.status === 'rejected')
      return c.json(
        { error: 'Approval request was rejected by the owner.' },
        403,
      );
    if (existing.status !== 'approved')
      return c.json(
        { error: 'Approval request is pending human decision.' },
        403,
      );

    // Revalidate user's authorization and permissions immediately before execution
    if (platform && isConsequentialAction(existing.action)) {
      if (!existing.target)
        return c.json({ error: 'Approval target is required.' }, 400);
      const dot = platform.workspace.dot(existing.target);
      if (!dot) return c.json({ error: 'Target Dot not found.' }, 404);
      const perms = platform.workspace.computers.permissions(existing.target);
      if (!perms.enabled)
        return c.json(
          { error: 'Computer permissions are disabled for this Dot.' },
          403,
        );
      if (existing.action === 'exec' && !perms.shell)
        return c.json(
          { error: 'Shell permission is disabled for this Dot.' },
          403,
        );
      if (existing.action === 'files_delete' && !perms.files)
        return c.json(
          { error: 'Files permission is disabled for this Dot.' },
          403,
        );
    }

    const consumed = store.consumeApproval(
      id,
      existing.action,
      existing.target,
      existing.params,
    );
    if (!consumed.ok) return c.json({ error: consumed.error }, consumed.code);

    if (platform && isConsequentialAction(existing.action)) {
      try {
        const result = await platform.computers.action(
          existing.target!,
          existing.action as ComputerAction,
          existing.params,
          'owner',
          c.req.raw.signal,
        );
        return c.json({ ok: true, status: 'executed', result });
      } catch (err) {
        store.markApprovalFailed(id);
        return c.json(
          { error: err instanceof Error ? err.message : 'Execution failed.' },
          500,
        );
      }
    }

    return c.json({ ok: true, status: 'executed' });
  });
  app.onError((error, c) => {
    console.error('API request failed:', error.name);
    return c.json(
      {
        error:
          'The server could not complete this request. Check server logs and database access.',
      },
      500,
    );
  });
  return app;
}
