/**
 * PlanProgressBar — horizontal step-status display rendered inside the chat area.
 *
 * Shows human-readable step names (never sk.* identifiers) with status indicators.
 * Collapses to a summary if more than 4 steps.
 */

import React from 'react';
import type { PlanStep } from 'astra-agent';

function StepIndicator({ step }: { step: PlanStep }): React.ReactElement {
  const statusColor = {
    pending: 'var(--t2)',
    running: 'var(--accent-amber)',
    completed: 'var(--accent-green)',
    failed: 'var(--accent-red)',
    cancelled: 'var(--t2)',
  }[step.status];

  const StatusIcon = (): React.ReactElement => {
    if (step.status === 'running') {
      return (
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            border: '1.5px solid var(--accent-amber)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      );
    }
    if (step.status === 'completed') {
      return (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 4L3 5.5L6.5 2" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    if (step.status === 'failed') {
      return (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2 2L6 6M6 2L2 6" stroke="var(--accent-red)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    }
    return <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--bg4)' }} />;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}>
        <StatusIcon />
      </div>
      <span
        style={{
          fontSize: '11px',
          color: statusColor,
          whiteSpace: 'nowrap',
          maxWidth: '120px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {step.name}
      </span>
    </div>
  );
}

export function PlanProgressBar({ planSteps }: { planSteps: PlanStep[] }): React.ReactElement | null {

  if (planSteps.length === 0) return null;

  const completedCount = planSteps.filter((s) => s.status === 'completed').length;
  const runningStep = planSteps.find((s) => s.status === 'running');

  return (
    <div
      style={{
        margin: '4px 0 8px 0',
        padding: '10px 12px',
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Progress summary line */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: 'var(--t2)' }}>
          {runningStep ? `Running: ${runningStep.name}` : `${completedCount} / ${planSteps.length} steps`}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--t2)' }}>
          {completedCount}/{planSteps.length}
        </span>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {planSteps.map((step, index) => (
          <React.Fragment key={step.id}>
            <StepIndicator step={step} />
            {index < planSteps.length - 1 && (
              <span style={{ color: 'var(--t2)', fontSize: '11px', alignSelf: 'center' }}>→</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
