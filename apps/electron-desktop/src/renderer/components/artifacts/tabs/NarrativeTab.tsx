import React from 'react';
import ReactMarkdown from 'react-markdown';

interface NarrativeTabProps {
  narrative: string | undefined;
}

export function NarrativeTab({ narrative }: NarrativeTabProps): React.ReactElement {
  if (!narrative) {
    return <p style={{ fontSize: '13px', color: 'var(--t2)', padding: '16px' }}>No narrative available</p>;
  }

  return (
    <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '12px',
          fontSize: '11px',
          color: 'var(--t2)',
        }}
      >
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-amber)' }} />
        <span>Auto-generated narrative · Developer audience</span>
      </div>
      <div className="markdown-content" style={{ fontSize: '13px', lineHeight: 1.65, color: 'var(--t0)' }}>
        <ReactMarkdown>{narrative}</ReactMarkdown>
      </div>
    </div>
  );
}
