import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/store.js';

const resources: { store: Store; dir: string }[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'opendots-'));
  const path = join(dir, 'test.sqlite');
  const store = new Store(path);
  resources.push({ store, dir });
  return { store, path };
}
afterEach(() =>
  resources.splice(0).forEach(({ store, dir }) => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }),
);
describe('durable task lifecycle', () => {
  it('persists tasks and settings across connections', () => {
    const { store, path } = fixture();
    const task = store.createTask('Compare the sample notebooks', 60);
    store.updateSettings({ name: 'Sam' });
    const reopened = new Store(path);
    expect(reopened.task(task.id)?.prompt).toBe(task.prompt);
    expect(reopened.settings().name).toBe('Sam');
    reopened.close();
  });
  it('claims each due job once even through separate database connections', () => {
    const { store, path } = fixture();
    store.createTask('Research one');
    const second = new Store(path);
    const firstClaim = store.claim(1000);
    expect(firstClaim).toBeTruthy();
    expect(second.claim(1000)).toBeNull();
    second.close();
  });
  it('never overwrites a cancellation with a late result', () => {
    const { store } = fixture();
    const task = store.createTask('Research one');
    const claim = store.claim(Date.now())!;
    store.action(task.id, 'cancel');
    expect(
      store.finish(claim, { text: 'Late result', sources: [], sample: true }),
    ).toBe(false);
    expect(store.task(task.id)?.status).toBe('cancelled');
  });
  it('keeps recurring history and schedules only after completion', () => {
    const { store } = fixture();
    const task = store.createTask('Recurring research', 60);
    const now = Date.now();
    const claim = store.claim(now)!;
    store.finish(
      claim,
      { text: 'First result', sources: [], sample: true },
      now,
    );
    expect(store.claim(now + 59_000)).toBeNull();
    expect(store.claim(now + 60_001)?.id).toBe(task.id);
    expect(store.detail(task.id)?.runs).toHaveLength(2);
  });
  it('global pause invalidates running leases and blocks queued jobs', () => {
    const { store } = fixture();
    const task = store.createTask('Research one');
    const claim = store.claim(Date.now())!;
    store.updateSettings({ paused: true });
    expect(store.claim(Date.now())).toBeNull();
    expect(
      store.finish(claim, { text: 'Late result', sources: [], sample: true }),
    ).toBe(false);
    store.updateSettings({ paused: false });
    expect(store.claim(Date.now())?.id).toBe(task.id);
  });
  it('recovers expired work after restart without duplicate completion', () => {
    const { store } = fixture();
    store.createTask('Recover me');
    const now = Date.now();
    const old = store.claim(now)!;
    const recovered = store.claim(now + 180_001)!;
    expect(recovered.id).toBe(old.id);
    expect(recovered.lease).not.toBe(old.lease);
    expect(store.finish(old, { text: 'Old', sources: [], sample: true })).toBe(
      false,
    );
    expect(
      store.finish(recovered, { text: 'New', sources: [], sample: true }),
    ).toBe(true);
  });
});

describe('user approvals lifecycle', () => {
  it('creates approvals with future expiration', () => {
    const { store } = fixture();
    const now = Date.now();
    const approval = store.createApproval(
      'send_external_message',
      'Send email to client',
      now + 60_000,
    );
    expect(approval.action).toBe('send_external_message');
    expect(approval.description).toBe('Send email to client');
    expect(approval.status).toBe('pending');
    expect(approval.expiresAt).toBe(now + 60_000);
    expect(store.approval(approval.id)?.status).toBe('pending');
  });

  it('rejects expiration times that are not in the future', () => {
    const { store } = fixture();
    const now = Date.now();
    expect(() =>
      store.createApproval('delete_data', 'Purge audit log', now - 1000),
    ).toThrow('Approval expiry must be in the future.');
  });

  it('updates status from pending to approved or rejected', () => {
    const { store } = fixture();
    const now = Date.now();
    const approval = store.createApproval(
      'execute_command',
      'Run deployment script',
      now + 30_000,
    );
    const approved = store.updateApprovalStatus(approval.id, 'approved');
    expect(approved?.status).toBe('approved');
    expect(store.approval(approval.id)?.status).toBe('approved');

    // Attempting to transition already approved approval does not alter it
    const redecided = store.updateApprovalStatus(approval.id, 'rejected');
    expect(redecided?.status).toBe('approved');
  });

  it('marks overdue pending approvals as expired on retrieval', () => {
    const { store } = fixture();
    const now = Date.now();
    const approval = store.createApproval(
      'quick_action',
      'Expiring shortly',
      now + 5,
    );
    expect(approval.status).toBe('pending');

    // Wait 10ms so it passes expiry
    const start = Date.now();
    while (Date.now() - start < 15) {
      /* wait */
    }

    const fetched = store.approval(approval.id);
    expect(fetched?.status).toBe('expired');

    const all = store.approvals();
    expect(all[0]?.status).toBe('expired');
  });

  it('binds approvals to exact action, target, and arguments upon consumption', () => {
    const { store } = fixture();
    const now = Date.now();
    const approval = store.createApproval(
      'exec',
      'Run command',
      now + 60_000,
      'dot-123',
      { command: 'cat safe.txt' },
    );
    store.updateApprovalStatus(approval.id, 'approved');

    // Mismatched action
    const wrongAction = store.consumeApproval(
      approval.id,
      'files_delete',
      'dot-123',
      { command: 'cat safe.txt' },
    );
    expect(wrongAction.ok).toBe(false);
    if (!wrongAction.ok) {
      expect(wrongAction.code).toBe(403);
      expect(wrongAction.error).toContain('action mismatch');
    }

    // Mismatched target
    const wrongTarget = store.consumeApproval(
      approval.id,
      'exec',
      'dot-other',
      { command: 'cat safe.txt' },
    );
    expect(wrongTarget.ok).toBe(false);
    if (!wrongTarget.ok) {
      expect(wrongTarget.code).toBe(403);
      expect(wrongTarget.error).toContain('target mismatch');
    }

    // Tampered arguments
    const tamperedArgs = store.consumeApproval(approval.id, 'exec', 'dot-123', {
      command: 'rm -rf /',
    });
    expect(tamperedArgs.ok).toBe(false);
    if (!tamperedArgs.ok) {
      expect(tamperedArgs.code).toBe(403);
      expect(tamperedArgs.error).toContain('arguments mismatch');
    }

    // Valid consumption succeeds
    const valid = store.consumeApproval(approval.id, 'exec', 'dot-123', {
      command: 'cat safe.txt',
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.approval.status).toBe('executed');
      expect(valid.approval.executedAt).toBeGreaterThan(0);
    }

    // Replay attempt fails with 409
    const replay = store.consumeApproval(approval.id, 'exec', 'dot-123', {
      command: 'cat safe.txt',
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.code).toBe(409);
      expect(replay.error).toContain('already been executed');
    }
  });

  it('rejects consumption of pending, rejected, or expired approvals', () => {
    const { store } = fixture();
    const now = Date.now();

    // 1. Pending approval cannot be consumed
    const pending = store.createApproval('exec', 'Pending run', now + 60_000);
    const consumePending = store.consumeApproval(pending.id, 'exec');
    expect(consumePending.ok).toBe(false);
    if (!consumePending.ok) expect(consumePending.code).toBe(403);

    // 2. Rejected approval cannot be consumed
    const rejected = store.createApproval('exec', 'Rejected run', now + 60_000);
    store.updateApprovalStatus(rejected.id, 'rejected');
    const consumeRejected = store.consumeApproval(rejected.id, 'exec');
    expect(consumeRejected.ok).toBe(false);
    if (!consumeRejected.ok) expect(consumeRejected.code).toBe(403);

    // 3. Expired approval cannot be consumed
    const expired = store.createApproval(
      'exec',
      'Expired run',
      Date.now() + 15,
    );
    store.updateApprovalStatus(expired.id, 'approved');
    const start = Date.now();
    while (Date.now() - start < 30) {
      /* wait */
    }
    const consumeExpired = store.consumeApproval(expired.id, 'exec');
    expect(consumeExpired.ok).toBe(false);
    if (!consumeExpired.ok) expect(consumeExpired.code).toBe(403);
  });
});
