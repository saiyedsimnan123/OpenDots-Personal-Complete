import { useState } from 'react';
import type { Approval, Dot } from '../shared/types';

export type BusyAction =
  'approve' | 'reject' | 'approveAndRun' | 'execute' | null;

export interface ApprovalFeedback {
  type: 'success' | 'error';
  message: string;
}

export interface ApprovalHandlerProps {
  onApprove: (id: string) => Promise<unknown> | unknown;
  onReject: (id: string) => Promise<unknown> | unknown;
  onExecute: (id: string) => Promise<unknown> | unknown;
  onApproveAndExecute: (id: string) => Promise<unknown> | unknown;
  onDismiss?: (id: string) => void;
}

export interface ApprovalBannerController {
  readonly busyId: string | null;
  readonly busyAction: BusyAction;
  readonly feedback: Record<string, ApprovalFeedback>;
  readonly dismissedIds: Set<string>;
  readonly isGlobalBusy: boolean;
  handleDismiss: (id: string) => void;
  handleApprove: (id: string) => Promise<void>;
  handleReject: (id: string) => Promise<void>;
  handleApproveAndExecute: (id: string) => Promise<void>;
  handleExecute: (id: string) => Promise<void>;
}

export function createApprovalBannerController(
  props: ApprovalHandlerProps,
  initialState?: {
    busyId?: string | null;
    busyAction?: BusyAction;
    feedback?: Record<string, ApprovalFeedback>;
    dismissedIds?: Set<string>;
    onChange?: () => void;
  },
): ApprovalBannerController {
  let busyId: string | null = initialState?.busyId ?? null;
  let busyAction: BusyAction = initialState?.busyAction ?? null;
  let feedback: Record<string, ApprovalFeedback> = {
    ...(initialState?.feedback ?? {}),
  };
  let dismissedIds: Set<string> = new Set(initialState?.dismissedIds ?? []);

  const notify = () => {
    initialState?.onChange?.();
  };

  const handleDismiss = (id: string) => {
    dismissedIds = new Set(dismissedIds);
    dismissedIds.add(id);
    props.onDismiss?.(id);
    notify();
  };

  const handleApprove = async (id: string) => {
    if (busyId) return;
    busyId = id;
    busyAction = 'approve';
    notify();
    try {
      await props.onApprove(id);
      feedback = {
        ...feedback,
        [id]: {
          type: 'success',
          message: 'Approved. Action is ready for execution.',
        },
      };
    } catch (err) {
      feedback = {
        ...feedback,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Approval failed.',
        },
      };
    } finally {
      busyId = null;
      busyAction = null;
      notify();
    }
  };

  const handleReject = async (id: string) => {
    if (busyId) return;
    busyId = id;
    busyAction = 'reject';
    notify();
    try {
      await props.onReject(id);
      feedback = {
        ...feedback,
        [id]: {
          type: 'success',
          message: 'Approval rejected.',
        },
      };
    } catch (err) {
      feedback = {
        ...feedback,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Rejection failed.',
        },
      };
    } finally {
      busyId = null;
      busyAction = null;
      notify();
    }
  };

  const handleApproveAndExecute = async (id: string) => {
    if (busyId) return;
    busyId = id;
    busyAction = 'approveAndRun';
    notify();
    try {
      await props.onApproveAndExecute(id);
      feedback = {
        ...feedback,
        [id]: {
          type: 'success',
          message: 'Approved and executed successfully.',
        },
      };
    } catch (err) {
      feedback = {
        ...feedback,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Action failed.',
        },
      };
    } finally {
      busyId = null;
      busyAction = null;
      notify();
    }
  };

  const handleExecute = async (id: string) => {
    if (busyId) return;
    busyId = id;
    busyAction = 'execute';
    notify();
    try {
      await props.onExecute(id);
      feedback = {
        ...feedback,
        [id]: {
          type: 'success',
          message: 'Action executed successfully.',
        },
      };
    } catch (err) {
      feedback = {
        ...feedback,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Execution failed.',
        },
      };
    } finally {
      busyId = null;
      busyAction = null;
      notify();
    }
  };

  return {
    get busyId() {
      return busyId;
    },
    get busyAction() {
      return busyAction;
    },
    get feedback() {
      return feedback;
    },
    get dismissedIds() {
      return dismissedIds;
    },
    get isGlobalBusy() {
      return busyId !== null;
    },
    handleDismiss,
    handleApprove,
    handleReject,
    handleApproveAndExecute,
    handleExecute,
  };
}

export function useApprovalBannerController(
  props: ApprovalHandlerProps,
  externalController?: ApprovalBannerController,
): ApprovalBannerController {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<Record<string, ApprovalFeedback>>(
    {},
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  if (externalController) {
    return externalController;
  }

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    props.onDismiss?.(id);
  };

  const handleApprove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setBusyAction('approve');
    try {
      await props.onApprove(id);
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'success',
          message: 'Approved. Action is ready for execution.',
        },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Approval failed.',
        },
      }));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleReject = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setBusyAction('reject');
    try {
      await props.onReject(id);
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'success',
          message: 'Approval rejected.',
        },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Rejection failed.',
        },
      }));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleApproveAndExecute = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setBusyAction('approveAndRun');
    try {
      await props.onApproveAndExecute(id);
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'success',
          message: 'Approved and executed successfully.',
        },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Action failed.',
        },
      }));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleExecute = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setBusyAction('execute');
    try {
      await props.onExecute(id);
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'success',
          message: 'Action executed successfully.',
        },
      }));
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [id]: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Execution failed.',
        },
      }));
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  return {
    busyId,
    busyAction,
    feedback,
    dismissedIds,
    isGlobalBusy: busyId !== null,
    handleDismiss,
    handleApprove,
    handleReject,
    handleApproveAndExecute,
    handleExecute,
  };
}

export interface ApprovalBannerProps extends ApprovalHandlerProps {
  approvals?: Approval[];
  dots?: Dot[];
  controller?: ApprovalBannerController;
}

export function ApprovalBanner({
  approvals,
  dots,
  onApprove,
  onReject,
  onExecute,
  onApproveAndExecute,
  onDismiss,
  controller: externalController,
}: ApprovalBannerProps) {
  const controller = useApprovalBannerController(
    {
      onApprove,
      onReject,
      onExecute,
      onApproveAndExecute,
      onDismiss,
    },
    externalController,
  );

  const {
    busyId,
    busyAction,
    feedback,
    dismissedIds,
    isGlobalBusy,
    handleDismiss,
    handleApprove,
    handleReject,
    handleApproveAndExecute,
    handleExecute,
  } = controller;

  const activeApprovals = (approvals ?? []).filter((item) => {
    if (dismissedIds.has(item.id)) return false;
    if (item.status === 'pending' || item.status === 'approved') return true;
    if (feedback[item.id]) return true;
    return false;
  });

  if (activeApprovals.length === 0) return null;

  return (
    <div className="approvals-container" aria-label="Action Approvals">
      {activeApprovals.map((item) => {
        const dotName = dots?.find((d) => d.id === item.target)?.name;
        const isApproved = item.status === 'approved';
        const isExecuted = item.status === 'executed';
        const isFailed = item.status === 'failed';
        const isPending = item.status === 'pending';
        const isCurrentBusy = busyId === item.id;
        const now = Date.now();
        const minutesLeft = Math.max(
          0,
          Math.round((item.expiresAt - now) / 60000),
        );
        const itemFeedback = feedback[item.id];

        const badgeLabel = isExecuted
          ? 'Executed'
          : isFailed
            ? 'Execution Failed'
            : isApproved
              ? 'Approved (Ready)'
              : 'Approval Required';

        return (
          <div
            className={`approval-banner ${
              isApproved
                ? 'approval-approved'
                : isExecuted
                  ? 'approval-executed'
                  : isFailed
                    ? 'approval-failed'
                    : 'approval-pending'
            }`}
            key={item.id}
            role="alert"
          >
            <div className="approval-banner-content">
              <div className="approval-header-line">
                <span className="approval-badge">{badgeLabel}</span>
                <span className="approval-action-badge">{item.action}</span>
                {dotName && (
                  <span className="approval-target">Dot: {dotName}</span>
                )}
                {isPending && (
                  <small className="approval-expires">
                    Expires in {minutesLeft}m
                  </small>
                )}
              </div>
              <strong className="approval-description">
                {item.description}
              </strong>
              {item.params && Object.keys(item.params).length > 0 && (
                <pre className="approval-params-code">
                  {JSON.stringify(item.params, null, 2)}
                </pre>
              )}
              {itemFeedback && (
                <div
                  className={`approval-feedback ${
                    itemFeedback.type === 'error'
                      ? 'feedback-error'
                      : 'feedback-success'
                  }`}
                  role={itemFeedback.type === 'error' ? 'alert' : 'status'}
                >
                  {itemFeedback.message}
                </div>
              )}
            </div>
            <div className="approval-banner-actions">
              {isApproved ? (
                <>
                  <button
                    className="primary execute-btn"
                    disabled={isGlobalBusy}
                    onClick={() => void handleExecute(item.id)}
                  >
                    {isCurrentBusy && busyAction === 'execute'
                      ? 'Executing…'
                      : 'Execute Now'}
                  </button>
                  <button
                    className="secondary dismiss-btn"
                    disabled={isGlobalBusy}
                    onClick={() => handleDismiss(item.id)}
                  >
                    Dismiss
                  </button>
                </>
              ) : isPending ? (
                <>
                  <button
                    className="primary approve-btn"
                    disabled={isGlobalBusy}
                    onClick={() => void handleApproveAndExecute(item.id)}
                  >
                    {isCurrentBusy && busyAction === 'approveAndRun'
                      ? 'Running…'
                      : 'Approve & Run'}
                  </button>
                  <button
                    className="secondary approve-only-btn"
                    disabled={isGlobalBusy}
                    onClick={() => void handleApprove(item.id)}
                  >
                    {isCurrentBusy && busyAction === 'approve'
                      ? 'Approving…'
                      : 'Approve'}
                  </button>
                  <button
                    className="secondary reject-btn"
                    disabled={isGlobalBusy}
                    onClick={() => void handleReject(item.id)}
                  >
                    {isCurrentBusy && busyAction === 'reject'
                      ? 'Rejecting…'
                      : 'Reject'}
                  </button>
                </>
              ) : (
                <button
                  className="secondary dismiss-btn"
                  disabled={isGlobalBusy}
                  onClick={() => handleDismiss(item.id)}
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
