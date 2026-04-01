import React from 'react';

interface FilesTabProps {
  artifactId: string;
}

export function FilesTab({ artifactId: _artifactId }: FilesTabProps): React.ReactElement {
  // File generation is not yet implemented in the backend
  return (
    <div style={{ padding: '16px' }}>
      <p style={{ fontSize: '13px', color: 'var(--t2)' }}>No generated files yet</p>
    </div>
  );
}
