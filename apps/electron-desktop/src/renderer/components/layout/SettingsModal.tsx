/**
 * SettingsModal — app-wide settings accessible via the gear icon in TopBar.
 *
 * Sections:
 * - Theme Style: VS Code | Newspaper
 * - Color Scheme: Dark | Light
 */

import React, { useEffect } from 'react';
import { useAppStore } from '../../store/index.js';
import type { ThemeStyle } from '../../store/slices/themeSlice.js';

interface SettingsModalProps {
  onClose: () => void;
}

// ─── Theme Style Card ─────────────────────────────────────────────────────────

function ThemeCard({
  style,
  label,
  description,
  preview,
  selected,
  onSelect,
}: {
  style: ThemeStyle;
  label: string;
  description: string;
  preview: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onSelect}
      style={{
        flex: 1,
        background: selected ? 'rgba(74,158,255,0.08)' : 'var(--bg2)',
        border: `1.5px solid ${selected ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
        borderRadius: '10px',
        padding: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Mini preview */}
      <div
        style={{
          borderRadius: '6px',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          height: '80px',
          display: 'flex',
          flexDirection: 'column',
          background: style === 'newspaper' ? '#211e16' : '#18181b',
        }}
      >
        {preview}
      </div>

      {/* Label + description */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: selected ? 'var(--accent-blue)' : 'var(--t0)',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {label}
          </span>
          {selected && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--accent-blue)',
                background: 'rgba(74,158,255,0.15)',
                padding: '1px 6px',
                borderRadius: '999px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              Active
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--t2)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          {description}
        </span>
      </div>
    </button>
  );
}

// ─── VS Code Preview ──────────────────────────────────────────────────────────

function VsCodePreview(): React.ReactElement {
  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {/* Assistant bubble */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#4a9eff', flexShrink: 0, marginTop: '1px' }} />
        <div style={{ background: '#1e1e21', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: '2px 6px 6px 6px', padding: '4px 6px', fontSize: '9px', color: '#f0f0f2', lineHeight: 1.4, maxWidth: '80%', fontFamily: '-apple-system, sans-serif' }}>
          Here's the analysis…
        </div>
      </div>
      {/* User bubble */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
        <div style={{ background: 'rgba(74,158,255,0.12)', border: '0.5px solid rgba(74,158,255,0.3)', borderRadius: '6px 2px 6px 6px', padding: '4px 6px', fontSize: '9px', color: '#f0f0f2', lineHeight: 1.4, maxWidth: '80%', fontFamily: '-apple-system, sans-serif' }}>
          Run the tests
        </div>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#313135', flexShrink: 0, marginTop: '1px' }} />
      </div>
    </div>
  );
}

// ─── Newspaper Preview ────────────────────────────────────────────────────────

function NewspaperPreview(): React.ReactElement {
  return (
    <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Assistant editorial entry */}
      <div style={{ borderLeft: '2px solid #7ca4c4', paddingLeft: '7px' }}>
        <div style={{ fontSize: '8px', fontWeight: 600, color: '#7ca4c4', letterSpacing: '0.06em', fontFamily: 'Georgia, serif', marginBottom: '2px' }}>ASTRA</div>
        <div style={{ fontSize: '9px', color: '#e8e0c8', lineHeight: 1.5, fontFamily: 'Georgia, serif' }}>Here's the analysis…</div>
      </div>
      {/* User editorial entry */}
      <div style={{ borderLeft: '2px solid rgba(232,224,200,0.2)', paddingLeft: '7px' }}>
        <div style={{ fontSize: '8px', fontWeight: 600, color: '#b0a080', letterSpacing: '0.06em', fontFamily: 'Georgia, serif', marginBottom: '2px' }}>YOU</div>
        <div style={{ fontSize: '9px', color: '#b0a080', lineHeight: 1.5, fontFamily: 'Georgia, serif' }}>Run the tests</div>
      </div>
    </div>
  );
}

// ─── Color Scheme Toggle ──────────────────────────────────────────────────────

function ColorSchemeToggle(): React.ReactElement {
  const isLightTheme = useAppStore((s) => s.isLightTheme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {[
        { label: 'Dark', icon: '🌙', value: false },
        { label: 'Light', icon: '☀', value: true },
      ].map(({ label, icon, value }) => {
        const active = isLightTheme === value;
        return (
          <button
            key={label}
            onClick={() => { if (!active) toggleTheme(); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: active ? 'rgba(74,158,255,0.1)' : 'var(--bg2)',
              border: `1.5px solid ${active ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
              borderRadius: '8px',
              cursor: active ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span style={{ fontSize: '14px' }}>{icon}</span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: active ? 'var(--accent-blue)' : 'var(--t1)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── SettingsModal ────────────────────────────────────────────────────────────

export function SettingsModal({ onClose }: SettingsModalProps): React.ReactElement {
  const themeStyle = useAppStore((s) => s.themeStyle);
  const setThemeStyle = useAppStore((s) => s.setThemeStyle);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg1)',
          border: '1px solid var(--border-strong)',
          borderRadius: '14px',
          width: '460px',
          maxWidth: 'calc(100vw - 40px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '0.5px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--t0)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--t2)',
              padding: '4px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t0)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t2)')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Theme Style */}
          <section>
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                Theme Style
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <ThemeCard
                style="vscode"
                label="VS Code"
                description="Compact, high-contrast. Great for deep work."
                preview={<VsCodePreview />}
                selected={themeStyle === 'vscode'}
                onSelect={() => setThemeStyle('vscode')}
              />
              <ThemeCard
                style="newspaper"
                label="Newspaper"
                description="Editorial serif layout. Easy on long reads."
                preview={<NewspaperPreview />}
                selected={themeStyle === 'newspaper'}
                onSelect={() => setThemeStyle('newspaper')}
              />
            </div>
          </section>

          {/* Color Scheme */}
          <section>
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
                Color Scheme
              </span>
            </div>
            <ColorSchemeToggle />
          </section>

        </div>
      </div>
    </div>
  );
}
