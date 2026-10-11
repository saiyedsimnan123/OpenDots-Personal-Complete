import { api } from './api';
import type { Approval } from '../shared/types';

export interface ExecuteResult {
  ok: boolean;
  status: string;
  result?: unknown;
}

export class ApprovalActionError extends Error {
  constructor(
    message: string,
    public readonly phase: 'decision' | 'execution',
    public readonly causeError?: Error,
  ) {
    super(message);
    this.name = 'ApprovalActionError';
  }
}

/**
 * Submit an owner decision ('approved' or 'rejected') on a pending approval.
 */
export async function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
): Promise<Approval> {
  try {
    return await api<Approval>(`/approvals/${id}/decision`, 'POST', {
      status: decision,
    });
  } catch (err) {
    const actionLabel = decision === 'approved' ? 'approve' : 'reject';
    const msg =
      err instanceof Error ? err.message : `Could not ${actionLabel} action.`;
    throw new ApprovalActionError(
      `${decision === 'approved' ? 'Approval' : 'Rejection'} failed: ${msg}`,
      'decision',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Trigger server-side execution of an already approved request.
 */
export async function executeApproval(id: string): Promise<ExecuteResult> {
  try {
    return await api<ExecuteResult>(`/approvals/${id}/execute`, 'POST', {});
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Could not execute approved action.';
    throw new ApprovalActionError(
      `Execution failed: ${msg}`,
      'execution',
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Atomically submit 'approved' decision and immediately trigger execution.
 * If approval succeeds but execution fails, this specifically reports
 * that approval succeeded while execution failed.
 */
export async function approveAndExecuteApproval(
  id: string,
): Promise<ExecuteResult> {
  try {
    await api<Approval>(`/approvals/${id}/decision`, 'POST', {
      status: 'approved',
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Could not approve action.';
    throw new ApprovalActionError(
      `Approval failed: ${msg}`,
      'decision',
      err instanceof Error ? err : undefined,
    );
  }

  try {
    return await api<ExecuteResult>(`/approvals/${id}/execute`, 'POST', {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Execution failed.';
    throw new ApprovalActionError(
      `Approval succeeded, but execution failed: ${msg}`,
      'execution',
      err instanceof Error ? err : undefined,
    );
  }
}
