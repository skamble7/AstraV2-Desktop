/**
 * PlanApprovalPrompt — shown inline in the chat after planning completes.
 *
 * Displays the assembled plan steps and Approve / Cancel buttons.
 * Execution is suspended until the user responds.
 */

import React from 'react';
import { useAppStore } from '../../store/index.js';

export function PlanApprovalPrompt(): React.ReactElement | null {
  const planApprovalRequest = useAppStore((state) => state.planApprovalRequest);
  const submitPlanApproval = useAppStore((state) => state.submitPlanApproval);

  if (!planApprovalRequest) return null;

  const { token, steps } = planApprovalRequest;

  const handleApprove = (): void => {
    void submitPlanApproval(token, true);
  };

  const handleCancel = (): void => {
    void submitPlanApproval(token, false);
  };

  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'rgba(100, 180, 255, 0.06)',
        border: '0.5px solid rgba(100, 180, 255, 0.25)',
        borderRadius: '8px',
        marginBottom: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--accent-blue, #60a5fa)', fontSize: '12px' }}>●</span>
        <span style={{ fontSize: '13px', color: 'var(--t1)', fontWeight: 500 }}>
          Ready to run {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Step list */}
      <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {steps.map((step, i) => (
          <li key={step.id} style={{ fontSize: '12px', color: 'var(--t2)' }}>
            <span style={{ color: 'var(--t1)' }}>{step.name}</span>
            {step.skill_id && (
              <span style={{ marginLeft: '6px', color: 'var(--t2)', opacity: 0.6 }}>
                ({step.skill_id})
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
        <button
          onClick={handleApprove}
          style={{
            padding: '6px 14px',
            background: 'var(--accent-green, #4ade80)',
            border: 'none',
            borderRadius: '6px',
            color: '#000',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Run plan
        </button>
        <button
          onClick={handleCancel}
          style={{
            padding: '6px 14px',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--t1)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
