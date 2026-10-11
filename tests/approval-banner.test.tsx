import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalBanner } from '../src/client/ApprovalBanner';
import type { Approval, Dot } from '../src/shared/types';

describe('ApprovalBanner component', () => {
  const dot: Dot = {
    id: 'dot-1',
    name: 'Research Dot',
    instructions: 'Helpful research',
    researchAllowed: true,
    memoryAllowed: true,
    spaceId: 'space-1',
    spaceIds: ['space-1'],
    createdAt: Date.now(),
  };

  const pendingApproval: Approval = {
    id: 'appr-1',
    action: 'exec',
    target: 'dot-1',
    description: 'Execute shell command',
    params: { command: 'npm test -- --run' },
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  };

  const approvedApproval: Approval = {
    id: 'appr-2',
    action: 'files_delete',
    target: 'dot-1',
    description: 'Delete temporary build files',
    params: { path: 'tmp/build' },
    status: 'approved',
    createdAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  };

  it('renders pending approval with action, target dot, params, and Approve & Run button', () => {
    const html = renderToStaticMarkup(
      <ApprovalBanner
        approvals={[pendingApproval]}
        dots={[dot]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onExecute={vi.fn()}
        onApproveAndExecute={vi.fn()}
      />,
    );

    expect(html).toContain('Approval Required');
    expect(html).toContain('exec');
    expect(html).toContain('Dot: Research Dot');
    expect(html).toContain('Execute shell command');
    expect(html).toContain('npm test -- --run');
    expect(html).toContain('Approve &amp; Run');
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
  });

  it('renders approved approval with Execute Now button', () => {
    const html = renderToStaticMarkup(
      <ApprovalBanner
        approvals={[approvedApproval]}
        dots={[dot]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onExecute={vi.fn()}
        onApproveAndExecute={vi.fn()}
      />,
    );

    expect(html).toContain('Approved (Ready)');
    expect(html).toContain('files_delete');
    expect(html).toContain('Delete temporary build files');
    expect(html).toContain('tmp/build');
    expect(html).toContain('Execute Now');
    expect(html).toContain('Dismiss');
  });

  it('renders nothing when there are no active approvals', () => {
    const executedApproval: Approval = {
      ...pendingApproval,
      status: 'executed',
    };
    const html = renderToStaticMarkup(
      <ApprovalBanner
        approvals={[executedApproval]}
        dots={[dot]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onExecute={vi.fn()}
        onApproveAndExecute={vi.fn()}
      />,
    );

    expect(html).toBe('');
  });
});
