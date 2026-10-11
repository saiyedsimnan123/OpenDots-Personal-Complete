import { useState } from 'react';
import type { Approval, Dot } from '../shared/types';

interface ApprovalBannerProps {
  approvals?: Approval[];
  dots?: Dot[];
  onApprove: (id: string) => Promise<void> | void;
  onReject: (id: string) => Promise<void> | void;
  onExecute: (id: string) => Promise<void> | void;
  onApproveAndExecute: (id: string) => Promise<void> | void;
}

export function ApprovalBanner({
  approvals,
  dots,
  onApprove,
  onReject,
  onExecute,
  onApproveAndExecute,
}: ApprovalBannerProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeApprovals = (approvals ?? []).filter(
    (item) => item.status === 'pending' || item.status === 'approved',
  );

  if (activeApprovals.length === 0) return null;

  return (
    <div className="approvals-container" aria-label="Action Approvals">
      {activeApprovals.map((item) => {
        const dotName = dots?.find((d) => d.id === item.target)?.name;
        const isApproved = item.status === 'approved';
        const isBusy = busyId === item.id;
        const now = Date.now();
        const minutesLeft = Math.max(
          0,
          Math.round((item.expiresAt - now) / 60000),
        );

        return (
          <div
            className={`approval-banner ${isApproved ? 'approval-approved' : 'approval-pending'}`}
            key={item.id}
            role="alert"
          >
            <div className="approval-banner-content">
              <div className="approval-header-line">
                <span className="approval-badge">
                  {isApproved ? 'Approved (Ready)' : 'Approval Required'}
                </span>
                <span className="approval-action-badge">{item.action}</span>
                {dotName && (
                  <span className="approval-target">Dot: {dotName}</span>
                )}
                <small className="approval-expires">
                  Expires in {minutesLeft}m
                </small>
              </div>
              <strong className="approval-description">
                {item.description}
              </strong>
              {item.params && Object.keys(item.params).length > 0 && (
                <pre className="approval-params-code">
                  {JSON.stringify(item.params, null, 2)}
                </pre>
              )}
            </div>
            <div className="approval-banner-actions">
              {isApproved ? (
                <>
                  <button
                    className="primary execute-btn"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(item.id);
                      try {
                        await onExecute(item.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {isBusy ? 'Running…' : 'Execute Now'}
                  </button>
                  <button
                    className="secondary reject-btn"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(item.id);
                      try {
                        await onReject(item.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="primary approve-btn"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(item.id);
                      try {
                        await onApproveAndExecute(item.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    {isBusy ? 'Running…' : 'Approve & Run'}
                  </button>
                  <button
                    className="secondary approve-only-btn"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(item.id);
                      try {
                        await onApprove(item.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary reject-btn"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(item.id);
                      try {
                        await onReject(item.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
