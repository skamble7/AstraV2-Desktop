/**
 * SkillPackDock — skill pack selector shown above the chat input area.
 * Displays pack titles (never internal pack_key identifiers).
 * Selecting a pack + clicking "Run pack" starts a pack-driven run.
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../../store/index.js';

interface SkillPackDockProps {
  onRunPack: (packKey: string, packVersion: string) => void;
  conversationId: string | null;
}

export function SkillPackDock({ onRunPack, conversationId }: SkillPackDockProps): React.ReactElement {
  const skillPacks = useAppStore((state) => state.skillPacks);
  const selectedPackId = useAppStore((state) => state.selectedPackId);
  const selectPack = useAppStore((state) => state.selectPack);
  const fetchSkillPacks = useAppStore((state) => state.fetchSkillPacks);
  const isAgentStreaming = useAppStore((state) =>
    conversationId
      ? (state.conversationAgentState[conversationId]?.isStreaming ?? false)
      : false
  );

  useEffect(() => {
    void fetchSkillPacks();
  }, [fetchSkillPacks]);

  const selectedPack = skillPacks.find((p) => p.key === selectedPackId);

  if (skillPacks.length === 0) return <></>;

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg1)',
      }}
    >
      <select
        value={selectedPackId ?? ''}
        onChange={(e) => selectPack(e.target.value || null)}
        style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '0.5px solid var(--border)',
          borderRadius: '7px',
          padding: '5px 8px',
          color: selectedPackId ? 'var(--t0)' : 'var(--t2)',
          fontSize: '12px',
          outline: 'none',
        }}
      >
        <option value="">Select a skill pack…</option>
        {skillPacks.map((pack) => (
          <option key={pack.key} value={pack.key}>
            {pack.title}
          </option>
        ))}
      </select>

      {selectedPack && (
        <button
          disabled={isAgentStreaming}
          onClick={() => onRunPack(selectedPack.key, selectedPack.version)}
          style={{
            padding: '5px 12px',
            background: isAgentStreaming ? 'var(--bg4)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: '7px',
            color: isAgentStreaming ? 'var(--t2)' : '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: isAgentStreaming ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Run pack
        </button>
      )}
    </div>
  );
}
