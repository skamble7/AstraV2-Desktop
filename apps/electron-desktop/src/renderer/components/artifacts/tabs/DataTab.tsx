/**
 * DataTab — renders the raw artifact data as syntax-highlighted JSON.
 */

import React, { useState } from 'react';

interface DataTabProps {
  data: unknown;
}

function syntaxHighlight(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let partIndex = 0;

    const keyRegex = /"([^"]+)"(?=\s*:)/g;
    const stringValueRegex = /:\s*"([^"]*)"(?=[,\n\r}]|$)/g;
    const numberRegex = /:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    const boolNullRegex = /:\s*(true|false|null)/g;

    // Simple approach: detect pattern in each segment
    const segments = line.split(/((?:"[^"]*"\s*:)|(?::\s*"[^"]*")|(?::\s*-?\d+(?:\.\d+)?)|(?::\s*(?:true|false|null)))/);

    segments.forEach((segment, i) => {
      if (!segment) return;

      if (segment.match(/^"[^"]*"\s*:$/)) {
        const key = segment.replace(/\s*:$/, '');
        parts.push(
          <React.Fragment key={`${lineIndex}-${i}`}>
            <span style={{ color: '#79b8ff' }}>{key}</span>
            <span style={{ color: 'var(--t2)' }}>:</span>
          </React.Fragment>
        );
      } else if (segment.match(/^:\s*"[^"]*"$/)) {
        const colon = ': ';
        const value = segment.replace(/^:\s*/, '');
        parts.push(
          <React.Fragment key={`${lineIndex}-${i}`}>
            <span style={{ color: 'var(--t2)' }}>: </span>
            <span style={{ color: '#9ecbff' }}>{value}</span>
          </React.Fragment>
        );
      } else if (segment.match(/^:\s*-?\d/)) {
        const colon = ': ';
        const num = segment.replace(/^:\s*/, '');
        parts.push(
          <React.Fragment key={`${lineIndex}-${i}`}>
            <span style={{ color: 'var(--t2)' }}>: </span>
            <span style={{ color: 'var(--accent-amber)' }}>{num}</span>
          </React.Fragment>
        );
      } else if (segment.match(/^:\s*(true|false|null)$/)) {
        const val = segment.replace(/^:\s*/, '');
        parts.push(
          <React.Fragment key={`${lineIndex}-${i}`}>
            <span style={{ color: 'var(--t2)' }}>: </span>
            <span style={{ color: 'var(--accent-purple)' }}>{val}</span>
          </React.Fragment>
        );
      } else {
        parts.push(<span key={`${lineIndex}-${i}`} style={{ color: 'var(--t1)' }}>{segment}</span>);
      }
    });

    return (
      <div key={lineIndex} style={{ minHeight: '18px' }}>
        {parts.length > 0 ? parts : <span style={{ color: 'var(--t1)' }}>{line}</span>}
      </div>
    );
  });
}

export function DataTab({ data }: DataTabProps): React.ReactElement {
  const [copied, setCopied] = useState(false);

  if (data === undefined || data === null) {
    return <p style={{ fontSize: '13px', color: 'var(--t2)', padding: '16px' }}>No data available</p>;
  }

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ padding: '12px 16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button
          onClick={handleCopy}
          style={{
            padding: '4px 10px',
            background: 'var(--bg3)',
            border: '0.5px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--t1)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>
      <pre
        style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '0.5px solid var(--border)',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '12px',
          overflow: 'auto',
          lineHeight: 1.5,
          fontFamily: 'monospace',
          margin: 0,
        }}
      >
        {syntaxHighlight(jsonString)}
      </pre>
    </div>
  );
}
