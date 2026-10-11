import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/client/api', () => ({ api: vi.fn() }));
import { api } from '../src/client/api';
import {
  decideApproval,
  executeApproval,
  approveAndExecuteApproval,
  ApprovalActionError,
} from '../src/client/approval-actions';

beforeEach(() => {
  vi.mocked(api).mockReset();
});

describe('approval-actions client API', () => {
  it('submits an approved decision to the decision endpoint', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'appr-1', status: 'approved' });

    const result = await decideApproval('appr-1', 'approved');
    expect(result.status).toBe('approved');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/approvals/appr-1/decision', 'POST', {
      status: 'approved',
    });
  });

  it('submits a rejected decision to the decision endpoint', async () => {
    vi.mocked(api).mockResolvedValueOnce({ id: 'appr-1', status: 'rejected' });

    const result = await decideApproval('appr-1', 'rejected');
    expect(result.status).toBe('rejected');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/approvals/appr-1/decision', 'POST', {
      status: 'rejected',
    });
  });

  it('triggers server execution on an approved request', async () => {
    vi.mocked(api).mockResolvedValueOnce({ ok: true, status: 'executed' });

    const result = await executeApproval('appr-1');
    expect(result.ok).toBe(true);
    expect(result.status).toBe('executed');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/approvals/appr-1/execute', 'POST', {});
  });

  it('atomically decides approved and executes in sequence', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ id: 'appr-1', status: 'approved' })
      .mockResolvedValueOnce({ ok: true, status: 'executed' });

    const result = await approveAndExecuteApproval('appr-1');
    expect(result.ok).toBe(true);
    expect(api).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api).mock.calls[0]).toEqual([
      '/approvals/appr-1/decision',
      'POST',
      { status: 'approved' },
    ]);
    expect(vi.mocked(api).mock.calls[1]).toEqual([
      '/approvals/appr-1/execute',
      'POST',
      {},
    ]);
  });

  it('handles decision failure and does not call execute endpoint', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Decision conflict'));

    const promise = approveAndExecuteApproval('appr-1');
    await expect(promise).rejects.toThrow(ApprovalActionError);
    await expect(promise).rejects.toThrow('Approval failed: Decision conflict');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/approvals/appr-1/decision', 'POST', {
      status: 'approved',
    });
  });

  it('explains that approval succeeded but execution failed when execution errors', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ id: 'appr-1', status: 'approved' })
      .mockRejectedValueOnce(new Error('Shell permissions revoked'));

    const promise = approveAndExecuteApproval('appr-1');
    await expect(promise).rejects.toThrow(ApprovalActionError);
    await expect(promise).rejects.toThrow(
      'Approval succeeded, but execution failed: Shell permissions revoked',
    );
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('wraps execution API errors with execution phase info', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Container not running'));

    try {
      await executeApproval('appr-1');
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalActionError);
      expect((err as ApprovalActionError).phase).toBe('execution');
      expect((err as ApprovalActionError).message).toContain(
        'Container not running',
      );
    }
  });
});
