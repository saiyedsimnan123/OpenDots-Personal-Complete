import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { Runner } from '../src/server/runner.js';
import type { Config } from '../src/server/research.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';
const stores: Store[] = [];
const workspaces: WorkspaceStore[] = [];
const config: Config = { mode: 'sample', baseUrl: 'https://api.openai.com/v1' };
function fixture(token?: string, withPlatform = false) {
  const store = new Store(':memory:');
  stores.push(store);
  const runner = new Runner(store, config);
  let platform: Platform | undefined;
  let ws: WorkspaceStore | undefined;
  if (withPlatform) {
    ws = new WorkspaceStore(':memory:', 'owner');
    workspaces.push(ws);
    platform = new Platform(store, ws, {
      baseUrl: config.baseUrl,
      voiceName: 'marin',
      slackUsers: [],
      runtimeUrl: '',
    });
  }
  return {
    store,
    runner,
    ws,
    platform,
    app: createApp({ store, runner, config, ownerToken: token, platform }),
  };
}
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
  workspaces.splice(0).forEach((ws) => ws.close());
});
describe('API boundaries', () => {
  it('requires owner token for state and mutations when configured', async () => {
    const { app } = fixture('private-token');
    expect((await app.request('/api/state')).status).toBe(401);
    expect(
      (
        await app.request('/api/state', {
          headers: { Authorization: 'Bearer private-token' },
        })
      ).status,
    ).toBe(200);
  });
  it('blocks browser cross-origin requests and form posts', async () => {
    const { app } = fixture();
    expect(
      (
        await app.request('/api/tasks', {
          ...json({ prompt: 'test' }),
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://evil.example',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/tasks', {
          method: 'POST',
          body: 'prompt=hello',
        })
      ).status,
    ).toBe(415);
  });
  it('validates inputs and enforces research permissions on the server', async () => {
    const { app, store } = fixture();
    expect(
      (await app.request('/api/tasks', json({ prompt: 'x' }))).status,
    ).toBe(400);
    expect(
      (
        await app.request(
          '/api/tasks',
          json({ prompt: 'Research', intervalSeconds: 1 }),
        )
      ).status,
    ).toBe(400);
    store.updateSettings({ researchAllowed: false });
    expect(
      (await app.request('/api/tasks', json({ prompt: 'Research' }))).status,
    ).toBe(403);
    expect(store.claim()).toBeNull();
  });
  it('runs a sample job from the durable queue and retains its result', async () => {
    const { app, store, runner } = fixture();
    const response = await app.request(
      '/api/tasks',
      json({ prompt: 'Plan a quiet weekend' }),
    );
    expect(response.status).toBe(201);
    await runner.tick();
    const task = store.tasks()[0];
    expect(task.status).toBe('completed');
    expect(store.detail(task.id)?.runs[0].result?.sample).toBe(true);
  });
  it('persists memory edits and deletes', async () => {
    const { app, store } = fixture();
    await app.request('/api/memories', json({ text: 'Prefer short briefs' }));
    const memory = store.memories()[0];
    const updated = await app.request(`/api/memories/${memory.id}`, {
      ...json({ text: 'Prefer deep briefs' }),
      method: 'PUT',
    });
    expect(updated.status).toBe(200);
    expect(store.memories()[0].text).toBe('Prefer deep briefs');
    await app.request(`/api/memories/${memory.id}`, {
      ...json({}),
      method: 'DELETE',
    });
    expect(store.memories()).toHaveLength(0);
  });
  it('manages human approval requests and decisions via api', async () => {
    const { app, store } = fixture();
    const stateRes = await app.request('/api/state');
    expect(stateRes.status).toBe(200);
    const stateBody = (await stateRes.json()) as { approvals: unknown[] };
    expect(Array.isArray(stateBody.approvals)).toBe(true);

    const now = Date.now();
    const createRes = await app.request(
      '/api/approvals',
      json({
        action: 'publish_report',
        description: 'Publish quarterly summary',
        expiresAt: now + 300_000,
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; status: string };
    expect(created.status).toBe('pending');

    const getRes = await app.request(`/api/approvals/${created.id}`);
    expect(getRes.status).toBe(200);

    const decisionRes = await app.request(
      `/api/approvals/${created.id}/decision`,
      json({ status: 'approved' }),
    );
    expect(decisionRes.status).toBe(200);
    const decided = (await decisionRes.json()) as { status: string };
    expect(decided.status).toBe('approved');
    expect(store.approval(created.id)?.status).toBe('approved');

    // Duplicate decision should return 409 conflict
    const conflictRes = await app.request(
      `/api/approvals/${created.id}/decision`,
      json({ status: 'rejected' }),
    );
    expect(conflictRes.status).toBe(409);
  });
  it('blocks AI agents from deciding approvals', async () => {
    const { app, store } = fixture();
    const approval = store.createApproval(
      'exec',
      'Run shell command',
      Date.now() + 60_000,
    );

    const agentHeaderRes = await app.request(
      `/api/approvals/${approval.id}/decision`,
      {
        ...json({ status: 'approved' }),
        headers: { 'Content-Type': 'application/json', 'x-actor': 'agent' },
      },
    );
    expect(agentHeaderRes.status).toBe(403);
    const agentHeaderBody = (await agentHeaderRes.json()) as { error: string };
    expect(agentHeaderBody.error).toBe(
      'AI agents cannot approve consequential actions.',
    );
    expect(store.approval(approval.id)?.status).toBe('pending');

    const agentCallRes = await app.request(
      `/api/approvals/${approval.id}/decision`,
      {
        ...json({ status: 'approved' }),
        headers: { 'Content-Type': 'application/json', 'x-agent-call': 'true' },
      },
    );
    expect(agentCallRes.status).toBe(403);
    expect(store.approval(approval.id)?.status).toBe('pending');
  });
  it('enforces approvals on computer actions endpoint with replay and parameter binding', async () => {
    const { app, store, ws, platform } = fixture(undefined, true);
    const dot = ws!.dots()[0];
    ws!.computers.patch(dot.id, { enabled: true, shell: true });
    const spy = vi
      .spyOn(platform!.computers, 'action')
      .mockResolvedValue({ text: 'echoed' });

    // 1. Consequential action without approvalId is rejected
    const noApprovalRes = await app.request(
      `/api/dots/${dot.id}/computer/actions`,
      json({ action: 'exec', input: { command: 'ls -la' } }),
    );
    expect(noApprovalRes.status).toBe(403);
    const noApprovalBody = (await noApprovalRes.json()) as { error: string };
    expect(noApprovalBody.error).toContain('requires explicit human approval');

    // 2. Read-only action proceeds directly without approval
    const readRes = await app.request(
      `/api/dots/${dot.id}/computer/actions`,
      json({ action: 'read', input: {} }),
    );
    expect(readRes.status).toBe(200);

    // 3. Create approval and approve it
    const appReq = store.createApproval(
      'exec',
      'Run ls',
      Date.now() + 60_000,
      dot.id,
      { command: 'ls -la' },
    );
    store.updateApprovalStatus(appReq.id, 'approved');

    // 4. Mismatched arguments are rejected
    const mismatchRes = await app.request(
      `/api/dots/${dot.id}/computer/actions`,
      json({
        action: 'exec',
        input: { command: 'rm -rf /' },
        approvalId: appReq.id,
      }),
    );
    expect(mismatchRes.status).toBe(403);
    const mismatchBody = (await mismatchRes.json()) as { error: string };
    expect(mismatchBody.error).toContain('arguments mismatch');

    // 5. Mismatched target dot is rejected
    const wrongDotRes = await app.request(
      `/api/dots/other-dot/computer/actions`,
      json({
        action: 'exec',
        input: { command: 'ls -la' },
        approvalId: appReq.id,
      }),
    );
    expect(wrongDotRes.status).toBe(403);
    const wrongDotBody = (await wrongDotRes.json()) as { error: string };
    expect(wrongDotBody.error).toContain('target mismatch');

    // 6. Valid execution succeeds
    const validRes = await app.request(
      `/api/dots/${dot.id}/computer/actions`,
      json({
        action: 'exec',
        input: { command: 'ls -la' },
        approvalId: appReq.id,
      }),
    );
    expect(validRes.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    expect(store.approval(appReq.id)?.status).toBe('executed');

    // 7. Replay attempt returns 409 Conflict
    const replayRes = await app.request(
      `/api/dots/${dot.id}/computer/actions`,
      json({
        action: 'exec',
        input: { command: 'ls -la' },
        approvalId: appReq.id,
      }),
    );
    expect(replayRes.status).toBe(409);
  });
  it('revalidates permissions and executes approved requests via approvals execute endpoint', async () => {
    const { app, store, ws, platform } = fixture(undefined, true);
    const dot = ws!.dots()[0];
    vi.spyOn(platform!.computers, 'action').mockResolvedValue({
      stdout: 'done',
    });

    // Case A: Cannot execute pending approval
    const pending = store.createApproval(
      'exec',
      'Run something',
      Date.now() + 60_000,
      dot.id,
      { command: 'uptime' },
    );
    const execPendingRes = await app.request(
      `/api/approvals/${pending.id}/execute`,
      json({}),
    );
    expect(execPendingRes.status).toBe(403);

    // Case B: Cannot execute rejected approval
    const rejected = store.createApproval(
      'exec',
      'Run something',
      Date.now() + 60_000,
      dot.id,
      { command: 'uptime' },
    );
    store.updateApprovalStatus(rejected.id, 'rejected');
    const execRejectedRes = await app.request(
      `/api/approvals/${rejected.id}/execute`,
      json({}),
    );
    expect(execRejectedRes.status).toBe(403);

    // Case C: Target Dot permissions disabled
    const approved = store.createApproval(
      'exec',
      'Run something',
      Date.now() + 60_000,
      dot.id,
      { command: 'uptime' },
    );
    store.updateApprovalStatus(approved.id, 'approved');
    ws!.computers.patch(dot.id, { enabled: false });
    const disabledRes = await app.request(
      `/api/approvals/${approved.id}/execute`,
      json({}),
    );
    expect(disabledRes.status).toBe(403);
    const disabledBody = (await disabledRes.json()) as { error: string };
    expect(disabledBody.error).toContain('Computer permissions are disabled');

    // Case D: Shell permission disabled
    ws!.computers.patch(dot.id, { enabled: true, shell: false });
    const noShellRes = await app.request(
      `/api/approvals/${approved.id}/execute`,
      json({}),
    );
    expect(noShellRes.status).toBe(403);
    const noShellBody = (await noShellRes.json()) as { error: string };
    expect(noShellBody.error).toContain('Shell permission is disabled');

    // Case E: Enabled and permitted -> executes successfully
    ws!.computers.patch(dot.id, { enabled: true, shell: true });
    const validExecRes = await app.request(
      `/api/approvals/${approved.id}/execute`,
      json({}),
    );
    expect(validExecRes.status).toBe(200);
    const validBody = (await validExecRes.json()) as { status: string };
    expect(validBody.status).toBe('executed');
    expect(store.approval(approved.id)?.status).toBe('executed');

    // Case F: Replay execution returns 409 Conflict
    const replayExecRes = await app.request(
      `/api/approvals/${approved.id}/execute`,
      json({}),
    );
    expect(replayExecRes.status).toBe(409);
  });
});

it('provides a health check endpoint', async () => {
  const { app } = fixture();
  const response = await app.request('/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
it('rejects DNS-rebinding Host even with a matching hostile Origin', async () => {
  const { app } = fixture();
  const response = await app.request('http://attacker.example/api/tasks', {
    ...json({ prompt: 'Sneaky task' }),
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://attacker.example',
      'Sec-Fetch-Site': 'same-origin',
    },
  });
  expect(response.status).toBe(403);
});
