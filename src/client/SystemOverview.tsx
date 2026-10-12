import type { State, WorkspaceState } from '../shared/types';
import type { Dialog } from './WorkspaceDialog';

import { Mascot } from './Mascot';
import {
  Settings2,
  Activity,
  Server,
  AlertCircle,
  CheckCircle2,
  Shield,
  Pause,
  Play,
  MessageCircle,
  Clock,
  BookOpen,
  Folder,
  ArrowRight,
} from 'lucide-react';
import { decideApproval, approveAndExecuteApproval } from './approval-actions';

interface SystemOverviewProps {
  state?: State;
  workspace?: WorkspaceState;
  setView: (view: 'chat' | 'tasks' | 'memories' | 'space' | 'system') => void;
  setDialog: (dialog: Dialog | undefined) => void;
  error?: string;
}

export function SystemOverview({
  state,
  workspace,
  setView,
  setDialog,
  error,
}: SystemOverviewProps) {
  if (error) {
    return (
      <div className="system-overview main-content">
        <div className="large-empty">
          <AlertCircle size={32} className="error" />
          <h2>Connection Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state || !workspace) {
    return (
      <div className="system-overview main-content">
        <div className="large-empty">
          <Mascot state="working" />
          <h2>Loading System State...</h2>
        </div>
      </div>
    );
  }

  const setup = workspace.setup;
  const pendingApprovals = state.approvals.filter(
    (a) => a.status === 'pending',
  );
  const recentApprovals = state.approvals
    .filter((a) => a.status !== 'pending')
    .slice(0, 5);

  return (
    <div className="system-overview main-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SYSTEM OVERVIEW</span>
          <h1>Server Health & Status</h1>
          <p>
            Real-time metrics, configuration status, and navigation for your
            OpenDots instance.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setDialog({ type: 'settings' })}
        >
          <Settings2 size={16} />
          System Settings
        </button>
      </div>

      <div className="overview-grid">
        <section className="overview-card">
          <div className="card-header">
            <Server size={18} />
            <h2>Connection Status</h2>
          </div>
          <div className="status-list">
            <div className="status-item">
              <span>Intelligence API</span>
              {setup.intelligence ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="error" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Compute Model</span>
              {setup.model ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="error" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Browser Worker</span>
              {setup.browser ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="warning" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Voice Service</span>
              {setup.voice ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="warning" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Slack Integration</span>
              <span
                className={`badge ${setup.slack === 'online' ? 'success' : setup.slack === 'unconfigured' ? 'warning' : 'error'}`}
              >
                {setup.slack.replace('_', ' ')}
              </span>
            </div>
          </div>
          {setup.missing.length > 0 && (
            <div className="notice error">
              Missing required: {setup.missing.join(', ')}
            </div>
          )}
        </section>

        <section className="overview-card">
          <div className="card-header">
            <Activity size={18} />
            <h2>System State & Features</h2>
          </div>
          <div className="status-list">
            <div className="status-item">
              <span>Mode</span>
              <span
                className={`badge ${state.mode === 'live' ? 'success' : 'warning'}`}
              >
                {state.mode.toUpperCase()}
              </span>
            </div>
            <div className="status-item">
              <span>Global Execution</span>
              {state.settings.paused ? (
                <span className="badge warning">
                  <Pause size={12} /> PAUSED
                </span>
              ) : (
                <span className="badge success">
                  <Play size={12} /> RUNNING
                </span>
              )}
            </div>
            <div className="status-item">
              <span>Memory Feature</span>
              {state.settings.memoryAllowed ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="warning" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Research Tools</span>
              {state.settings.researchAllowed ? (
                <CheckCircle2 className="success" size={16} />
              ) : (
                <AlertCircle className="warning" size={16} />
              )}
            </div>
            <div className="status-item">
              <span>Automated Learning</span>
              <span className="badge warning">PARTIAL</span>
            </div>
          </div>
        </section>

        <section className="overview-card feature-nav-card">
          <div className="card-header">
            <Activity size={18} />
            <h2>Quick Navigation</h2>
          </div>
          <div className="feature-links">
            <button className="feature-link" onClick={() => setView('chat')}>
              <div className="feature-icon">
                <MessageCircle size={20} />
              </div>
              <div className="feature-info">
                <strong>Chat Conversations</strong>
                <span>{workspace.conversations.length} active threads</span>
              </div>
              <ArrowRight size={16} />
            </button>
            <button className="feature-link" onClick={() => setView('tasks')}>
              <div className="feature-icon">
                <Clock size={20} />
              </div>
              <div className="feature-info">
                <strong>Scheduled Tasks</strong>
                <span>{state.tasks.length} tasks running</span>
              </div>
              <ArrowRight size={16} />
            </button>
            <button
              className="feature-link"
              onClick={() => setView('memories')}
            >
              <div className="feature-icon">
                <BookOpen size={20} />
              </div>
              <div className="feature-info">
                <strong>Memory Store</strong>
                <span>{state.memories.length} saved contexts</span>
              </div>
              <ArrowRight size={16} />
            </button>
            <button className="feature-link" onClick={() => setView('space')}>
              <div className="feature-icon">
                <Folder size={20} />
              </div>
              <div className="feature-info">
                <strong>Spaces & Pages</strong>
                <span>{workspace.spaces.length} spaces</span>
              </div>
              <ArrowRight size={16} />
            </button>
          </div>
        </section>

        <section className="overview-card approval-card">
          <div className="card-header">
            <Shield size={18} />
            <h2>Security & Approvals</h2>
          </div>

          <div className="approval-section">
            <h3>Pending Approvals ({pendingApprovals.length})</h3>
            {pendingApprovals.length > 0 ? (
              <div className="approval-list">
                {pendingApprovals.map((approval) => {
                  const targetDot = workspace.dots.find(
                    (d) => d.id === approval.target,
                  );
                  return (
                    <div key={approval.id} className="approval-item pending">
                      <div className="approval-info">
                        <strong>{approval.action}</strong>
                        <p>{approval.description}</p>
                        <small>
                          {targetDot?.name || approval.target || 'System'}
                        </small>
                      </div>
                      <div className="approval-actions">
                        <button
                          className="primary small"
                          onClick={() => approveAndExecuteApproval(approval.id)}
                        >
                          Approve
                        </button>
                        <button
                          className="danger small"
                          onClick={() =>
                            decideApproval(approval.id, 'rejected')
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state small">
                <CheckCircle2 size={24} className="success" />
                <p>No pending approvals</p>
              </div>
            )}
          </div>

          <div className="approval-section">
            <h3>Recent History</h3>
            {recentApprovals.length > 0 ? (
              <div className="approval-list">
                {recentApprovals.map((approval) => (
                  <div key={approval.id} className="approval-item">
                    <div className="approval-info">
                      <strong>{approval.action}</strong>
                      <p className="muted">{approval.description}</p>
                    </div>
                    <span
                      className={`badge ${
                        approval.status === 'executed' ||
                        approval.status === 'approved'
                          ? 'success'
                          : approval.status === 'rejected'
                            ? 'error'
                            : 'warning'
                      }`}
                    >
                      {approval.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted text-center">No recent history</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
