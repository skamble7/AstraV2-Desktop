/**
 * DiagramTab — renders the Mermaid diagram source.
 *
 * Mermaid is lazy-loaded to keep the main bundle small (~500KB saved).
 * Renders a code block while loading or if mermaid initialisation fails.
 */

import React, { useEffect, useRef, useState } from 'react';

interface DiagramTabProps {
  diagram: string | undefined;
}

export function DiagramTab({ diagram }: DiagramTabProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    if (!diagram || !containerRef.current) return;

    setIsRendering(true);
    setRenderError(null);

    // Lazy-load Mermaid
    import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: document.body.classList.contains('light') ? 'default' : 'dark',
          securityLevel: 'loose',
        });

        const id = `mermaid-${Date.now()}`;
        return mermaid.render(id, diagram);
      })
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
        setIsRendering(false);
      })
      .catch((error) => {
        setRenderError(error instanceof Error ? error.message : 'Diagram render failed');
        setIsRendering(false);
      });
  }, [diagram]);

  if (!diagram) {
    return <p style={{ fontSize: '13px', color: 'var(--t2)', padding: '16px' }}>No diagram available</p>;
  }

  return (
    <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
      {isRendering && (
        <p style={{ fontSize: '12px', color: 'var(--t2)', marginBottom: '8px' }}>Rendering diagram…</p>
      )}
      {renderError ? (
        <>
          <p style={{ fontSize: '12px', color: 'var(--accent-amber)', marginBottom: '8px' }}>
            Diagram preview unavailable — showing source
          </p>
          <pre
            style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '12px',
              color: 'var(--t1)',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
            }}
          >
            {diagram}
          </pre>
        </>
      ) : (
        <div
          ref={containerRef}
          style={{
            display: 'flex',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        />
      )}
    </div>
  );
}
