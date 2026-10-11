import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalBanner,
  createApprovalBannerController,
} from '../src/client/ApprovalBanner';
import type { Approval, Dot } from '../src/shared/types';

describe('ApprovalBanner component and controller', () => {
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

  describe('UI rendering with renderToStaticMarkup', () => {
    it('renders pending approval with action, target dot, params, and action buttons', () => {
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

    it('renders approved approval with Execute Now and Dismiss buttons', () => {
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

    it('renders disabled buttons and dynamic busy labels when an operation is in flight', () => {
      const controller = createApprovalBannerController(
        {
          onApprove: vi.fn(),
          onReject: vi.fn(),
          onExecute: vi.fn(),
          onApproveAndExecute: vi.fn(),
        },
        {
          busyId: 'appr-1',
          busyAction: 'approveAndRun',
        },
      );

      const html = renderToStaticMarkup(
        <ApprovalBanner
          approvals={[pendingApproval]}
          dots={[dot]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onExecute={vi.fn()}
          onApproveAndExecute={vi.fn()}
          controller={controller}
        />,
      );

      expect(html).toContain('Running…');
      // Ensure all buttons have the disabled attribute
      expect(html).toContain('disabled=""');
    });

    it('renders contextual feedback for success and error messages', () => {
      const successController = createApprovalBannerController(
        {
          onApprove: vi.fn(),
          onReject: vi.fn(),
          onExecute: vi.fn(),
          onApproveAndExecute: vi.fn(),
        },
        {
          feedback: {
            'appr-1': {
              type: 'success',
              message: 'Approved and executed successfully.',
            },
          },
        },
      );

      const successHtml = renderToStaticMarkup(
        <ApprovalBanner
          approvals={[pendingApproval]}
          dots={[dot]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onExecute={vi.fn()}
          onApproveAndExecute={vi.fn()}
          controller={successController}
        />,
      );

      expect(successHtml).toContain('approval-feedback feedback-success');
      expect(successHtml).toContain('Approved and executed successfully.');
      expect(successHtml).toContain('role="status"');

      const errorController = createApprovalBannerController(
        {
          onApprove: vi.fn(),
          onReject: vi.fn(),
          onExecute: vi.fn(),
          onApproveAndExecute: vi.fn(),
        },
        {
          feedback: {
            'appr-1': {
              type: 'error',
              message:
                'Approval succeeded, but execution failed: Container terminated',
            },
          },
        },
      );

      const errorHtml = renderToStaticMarkup(
        <ApprovalBanner
          approvals={[pendingApproval]}
          dots={[dot]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onExecute={vi.fn()}
          onApproveAndExecute={vi.fn()}
          controller={errorController}
        />,
      );

      expect(errorHtml).toContain('approval-feedback feedback-error');
      expect(errorHtml).toContain(
        'Approval succeeded, but execution failed: Container terminated',
      );
      expect(errorHtml).toContain('role="alert"');
    });

    it('hides dismissed approvals from rendered markup', () => {
      const controller = createApprovalBannerController(
        {
          onApprove: vi.fn(),
          onReject: vi.fn(),
          onExecute: vi.fn(),
          onApproveAndExecute: vi.fn(),
        },
        {
          dismissedIds: new Set(['appr-2']),
        },
      );

      const html = renderToStaticMarkup(
        <ApprovalBanner
          approvals={[approvedApproval]}
          dots={[dot]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onExecute={vi.fn()}
          onApproveAndExecute={vi.fn()}
          controller={controller}
        />,
      );

      expect(html).toBe('');
    });

    it('renders executed approvals when active feedback is present', () => {
      const executedApproval: Approval = {
        ...pendingApproval,
        status: 'executed',
      };
      const controller = createApprovalBannerController(
        {
          onApprove: vi.fn(),
          onReject: vi.fn(),
          onExecute: vi.fn(),
          onApproveAndExecute: vi.fn(),
        },
        {
          feedback: {
            'appr-1': {
              type: 'success',
              message: 'Approved and executed successfully.',
            },
          },
        },
      );

      const html = renderToStaticMarkup(
        <ApprovalBanner
          approvals={[executedApproval]}
          dots={[dot]}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onExecute={vi.fn()}
          onApproveAndExecute={vi.fn()}
          controller={controller}
        />,
      );

      expect(html).toContain('Executed');
      expect(html).toContain('Approved and executed successfully.');
    });
  });

  describe('ApprovalBannerController interactions and logic', () => {
    it('executes handleApprove, invokes onApprove, and records success feedback', async () => {
      const onApprove = vi.fn().mockResolvedValue(undefined);
      const onReject = vi.fn();
      const controller = createApprovalBannerController({
        onApprove,
        onReject,
        onExecute: vi.fn(),
        onApproveAndExecute: vi.fn(),
      });

      await controller.handleApprove('appr-1');

      expect(onApprove).toHaveBeenCalledWith('appr-1');
      expect(onReject).not.toHaveBeenCalled();
      expect(controller.feedback['appr-1']).toEqual({
        type: 'success',
        message: 'Approved. Action is ready for execution.',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('executes handleReject, invokes onReject, and records success feedback', async () => {
      const onApprove = vi.fn();
      const onReject = vi.fn().mockResolvedValue(undefined);
      const controller = createApprovalBannerController({
        onApprove,
        onReject,
        onExecute: vi.fn(),
        onApproveAndExecute: vi.fn(),
      });

      await controller.handleReject('appr-1');

      expect(onReject).toHaveBeenCalledWith('appr-1');
      expect(onApprove).not.toHaveBeenCalled();
      expect(controller.feedback['appr-1']).toEqual({
        type: 'success',
        message: 'Approval rejected.',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('executes handleApproveAndExecute, invokes callback, and records success feedback', async () => {
      const onApproveAndExecute = vi.fn().mockResolvedValue(undefined);
      const controller = createApprovalBannerController({
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onExecute: vi.fn(),
        onApproveAndExecute,
      });

      await controller.handleApproveAndExecute('appr-1');

      expect(onApproveAndExecute).toHaveBeenCalledWith('appr-1');
      expect(controller.feedback['appr-1']).toEqual({
        type: 'success',
        message: 'Approved and executed successfully.',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('executes handleExecute on approved approval, invokes onExecute, and records success', async () => {
      const onExecute = vi.fn().mockResolvedValue(undefined);
      const controller = createApprovalBannerController({
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onExecute,
        onApproveAndExecute: vi.fn(),
      });

      await controller.handleExecute('appr-2');

      expect(onExecute).toHaveBeenCalledWith('appr-2');
      expect(controller.feedback['appr-2']).toEqual({
        type: 'success',
        message: 'Action executed successfully.',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('truthfully dismisses approved action via onDismiss and NEVER invokes onReject', () => {
      const onDismiss = vi.fn();
      const onReject = vi.fn();
      const controller = createApprovalBannerController({
        onApprove: vi.fn(),
        onReject,
        onExecute: vi.fn(),
        onApproveAndExecute: vi.fn(),
        onDismiss,
      });

      controller.handleDismiss('appr-2');

      expect(onDismiss).toHaveBeenCalledWith('appr-2');
      expect(onReject).not.toHaveBeenCalled();
      expect(controller.dismissedIds.has('appr-2')).toBe(true);
    });

    it('captures error feedback when onApprove fails', async () => {
      const onApprove = vi
        .fn()
        .mockRejectedValue(new Error('Permission denied'));
      const controller = createApprovalBannerController({
        onApprove,
        onReject: vi.fn(),
        onExecute: vi.fn(),
        onApproveAndExecute: vi.fn(),
      });

      await controller.handleApprove('appr-1');

      expect(controller.feedback['appr-1']).toEqual({
        type: 'error',
        message: 'Permission denied',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('captures error feedback when onExecute fails', async () => {
      const onExecute = vi.fn().mockRejectedValue(new Error('Process timeout'));
      const controller = createApprovalBannerController({
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onExecute,
        onApproveAndExecute: vi.fn(),
      });

      await controller.handleExecute('appr-2');

      expect(controller.feedback['appr-2']).toEqual({
        type: 'error',
        message: 'Process timeout',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('captures compound error feedback when execution fails after approval', async () => {
      const onApproveAndExecute = vi
        .fn()
        .mockRejectedValue(
          new Error(
            'Approval succeeded, but execution failed: Connection reset',
          ),
        );
      const controller = createApprovalBannerController({
        onApprove: vi.fn(),
        onReject: vi.fn(),
        onExecute: vi.fn(),
        onApproveAndExecute,
      });

      await controller.handleApproveAndExecute('appr-1');

      expect(controller.feedback['appr-1']).toEqual({
        type: 'error',
        message: 'Approval succeeded, but execution failed: Connection reset',
      });
      expect(controller.isGlobalBusy).toBe(false);
    });

    it('prevents concurrent operations and duplicate clicks while busy', async () => {
      let finishApprove: () => void = () => {};
      const pendingPromise = new Promise<void>((resolve) => {
        finishApprove = resolve;
      });

      const onApprove = vi.fn().mockReturnValue(pendingPromise);
      const onReject = vi.fn();
      const controller = createApprovalBannerController({
        onApprove,
        onReject,
        onExecute: vi.fn(),
        onApproveAndExecute: vi.fn(),
      });

      // Start initial async action
      const approvePromise = controller.handleApprove('appr-1');

      expect(controller.isGlobalBusy).toBe(true);
      expect(controller.busyId).toBe('appr-1');
      expect(controller.busyAction).toBe('approve');

      // Attempt second operation concurrently
      await controller.handleReject('appr-1');
      await controller.handleApprove('appr-1');

      // Second operations should have returned immediately without triggering callbacks
      expect(onReject).not.toHaveBeenCalled();
      expect(onApprove).toHaveBeenCalledTimes(1);

      // Finish first operation
      finishApprove();
      await approvePromise;

      expect(controller.isGlobalBusy).toBe(false);
      expect(controller.feedback['appr-1'].type).toBe('success');
    });
  });
});
