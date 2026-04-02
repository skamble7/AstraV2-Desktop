/**
 * CustomizePanel — full-width overlay that replaces the workspace shell layout.
 *
 * Three-column layout:
 *   NavCol (156px) | ListCol (194px) | DetailCol (flex)
 *
 * Nav items: Workspace, Orbits, Skills, Models, Connectors
 * All orbit/pack/model data is static mock data until backend is wired up.
 */

import React, { useState } from 'react';
import { useAppStore } from '../../store/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = 'workspace' | 'orbits' | 'skills' | 'models' | 'connectors';
type WsSection = 'identity' | 'model' | 'skillpacks' | 'connections' | 'kinds' | 'planner';

interface InheritableValue<T> {
  value: T;
  inherited: boolean; // true = from workspace, false = orbit-specific
}

interface OrbitConnection {
  name: string;
  inherited: boolean;
}

interface OrbitData {
  id: string;
  name: string;
  abbr: string;
  color: { bg: string; fg: string };
  domain: string;
  desc: string;
  enabled: boolean;
  model: InheritableValue<string>;
  defaultPack: InheritableValue<string>;
  packs: string[];
  connections: OrbitConnection[];
  artifactKinds: InheritableValue<string[]>;
  plannerConf: InheritableValue<number>;
  plannerMode: InheritableValue<string>;
}

interface SkillPack {
  id: string;
  name: string;
  version: string;
  desc: string;
  domain: string;
}

interface ModelConfig {
  id: string;
  name: string;
  note: string;
}

interface Domain {
  id: string;
  label: string;
  hint: string;
  pack: string | null;
  model: string | null;
  color: { bg: string; fg: string };
}

interface WizState {
  name: string;
  desc: string;
  domain: string | null;
  pack: string | null;
  packInherited: boolean;
  model: string | null;
  modelInherited: boolean;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PACKS: SkillPack[] = [
  { id: 'raina-microservices-arch@v1.2', name: 'raina-microservices-arch', version: 'v1.2', desc: 'Architecture discovery for microservices', domain: 'arch' },
  { id: 'zeta-cobol-learn@v2.1', name: 'zeta-cobol-learn', version: 'v2.1', desc: 'Learn from legacy COBOL codebases', domain: 'legacy' },
  { id: 'saba-agile-author@v1.0', name: 'saba-agile-author', version: 'v1.0', desc: 'Author agile delivery artifacts', domain: 'agile' },
  { id: 'astra-data-discover@v1.0', name: 'astra-data-discover', version: 'v1.0', desc: 'Discover data pipelines and schemas', domain: 'data' },
];

const MOCK_MODELS: ModelConfig[] = [
  { id: 'dev.llm.openai.gpt4o', name: 'GPT-4o', note: 'General purpose · High capability' },
  { id: 'dev.llm.openai.gpt4o-mini', name: 'GPT-4o mini', note: 'General purpose · Fast' },
  { id: 'dev.llm.bedrock.cobol-ft', name: 'Bedrock COBOL', note: 'Fine-tuned · Legacy specialist' },
  { id: 'dev.llm.bedrock.claude3', name: 'Claude 3 Sonnet', note: 'General purpose · Strong reasoning' },
];

const MOCK_DOMAINS: Domain[] = [
  { id: 'arch', label: 'Architecture discovery', hint: 'Service models, APIs, domains', pack: 'raina-microservices-arch@v1.2', model: 'dev.llm.openai.gpt4o', color: { bg: '#1e3a5f', fg: '#60a5fa' } },
  { id: 'legacy', label: 'Legacy modernization', hint: 'COBOL, JCL, business entities', pack: 'zeta-cobol-learn@v2.1', model: 'dev.llm.bedrock.cobol-ft', color: { bg: '#1a3320', fg: '#4ade80' } },
  { id: 'agile', label: 'Agile authoring', hint: 'Epics, features, user stories', pack: 'saba-agile-author@v1.0', model: 'dev.llm.openai.gpt4o-mini', color: { bg: '#2d1f4e', fg: '#c084fc' } },
  { id: 'data', label: 'Data engineering', hint: 'Pipelines, schemas, lineage', pack: 'astra-data-discover@v1.0', model: 'dev.llm.openai.gpt4o', color: { bg: '#2a1f10', fg: '#fb923c' } },
  { id: 'custom', label: 'Custom', hint: 'Configure manually', pack: null, model: null, color: { bg: '#27272b', fg: '#9ca3af' } },
];

const INITIAL_ORBITS: OrbitData[] = [
  {
    id: 'orbit-arch',
    name: 'Architecture',
    abbr: 'AR',
    color: { bg: '#1e3a5f', fg: '#60a5fa' },
    domain: 'Architecture discovery',
    desc: 'Discovers and models system architecture from requirements and agile artifacts.',
    enabled: true,
    model: { value: 'dev.llm.openai.gpt4o', inherited: true },
    defaultPack: { value: 'raina-microservices-arch@v1.2', inherited: false },
    packs: ['raina-microservices-arch@v1.2', 'raina-domain-model@v1.0'],
    connections: [
      { name: 'MCP · Diagram Generator', inherited: true },
      { name: 'MCP · API Discovery Server', inherited: false },
    ],
    artifactKinds: { value: ['cam.architecture.service_contract', 'cam.architecture.domain_model', 'cam.architecture.bounded_context'], inherited: false } as InheritableValue<string[]>,
    plannerConf: { value: 70, inherited: false },
    plannerMode: { value: 'Interactive', inherited: true },
  },
  {
    id: 'orbit-legacy',
    name: 'Legacy',
    abbr: 'LG',
    color: { bg: '#1a3320', fg: '#4ade80' },
    domain: 'Legacy modernization',
    desc: 'Learns from legacy COBOL and JCL codebases and produces structured learning artifacts.',
    enabled: true,
    model: { value: 'dev.llm.bedrock.cobol-ft', inherited: false },
    defaultPack: { value: 'zeta-cobol-learn@v2.1', inherited: false },
    packs: ['zeta-cobol-learn@v2.1', 'zeta-jcl-analysis@v1.3'],
    connections: [
      { name: 'MCP · COBOL Parser', inherited: true },
      { name: 'MCP · Diagram Generator', inherited: true },
    ],
    artifactKinds: { value: ['cam.legacy.application_workflow', 'cam.legacy.business_entity', 'cam.data.data_dictionary'], inherited: false } as InheritableValue<string[]>,
    plannerConf: { value: 65, inherited: true },
    plannerMode: { value: 'Auto-approve', inherited: false },
  },
  {
    id: 'orbit-agile',
    name: 'Agile',
    abbr: 'AG',
    color: { bg: '#2d1f4e', fg: '#c084fc' },
    domain: 'Agile authoring',
    desc: 'Authors agile delivery artifacts from intent or upstream architecture outputs.',
    enabled: false,
    model: { value: 'dev.llm.openai.gpt4o-mini', inherited: false },
    defaultPack: { value: 'saba-agile-author@v1.0', inherited: false },
    packs: ['saba-agile-author@v1.0'],
    connections: [
      { name: 'MCP · Jira Writer', inherited: false },
    ],
    artifactKinds: { value: ['cam.agile.epic', 'cam.agile.feature', 'cam.agile.user_story', 'cam.agile.task'], inherited: false } as InheritableValue<string[]>,
    plannerConf: { value: 65, inherited: true },
    plannerMode: { value: 'Interactive', inherited: true },
  },
];

const WS_DEFAULT_MODEL = 'dev.llm.openai.gpt4o';
const WS_PLANNER_CONF = 65;
const WS_PLANNER_MODE = 'Interactive';

// ─── Small helpers ────────────────────────────────────────────────────────────

function getAbbr(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function WorkspaceBadge(): React.ReactElement {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '10px', color: 'var(--t2)',
      border: '0.5px solid var(--border-strong)', borderRadius: '4px',
      padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 8V2M2 5l3-3 3 3"/>
      </svg>
      workspace
    </span>
  );
}

function OrbitBadge(): React.ReactElement {
  return (
    <span style={{
      display: 'inline-flex', fontSize: '10px', color: 'var(--accent-blue)',
      border: '0.5px solid var(--accent-blue)', borderRadius: '4px',
      padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0, opacity: 0.85,
    }}>
      orbit
    </span>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '36px', height: '20px', borderRadius: '10px',
        background: on ? 'var(--accent-blue)' : 'var(--bg4)',
        border: 'none', cursor: 'pointer', position: 'relative',
        flexShrink: 0, transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: on ? '19px' : '3px',
        width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s', display: 'block',
      }} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p style={{
      fontSize: '10px', color: 'var(--t2)', letterSpacing: '0.06em',
      textTransform: 'uppercase', marginBottom: '6px',
    }}>
      {children}
    </p>
  );
}

function KindChip({ label, blue }: { label: string; blue?: boolean }): React.ReactElement {
  return (
    <span style={{
      fontSize: '11px', padding: '2px 7px', borderRadius: '20px',
      border: `0.5px solid ${blue ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
      color: blue ? 'var(--accent-blue)' : 'var(--t1)',
      opacity: blue ? 0.85 : 1,
    }}>
      {label}
    </span>
  );
}

function EditLink({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, marginTop: '6px', display: 'block',
        opacity: 0.85,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'underline'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = 'none'; }}
    >
      {label} ↗
    </button>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '3px 0' }}>
      <span style={{ fontSize: '12px', color: 'var(--t1)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Nav column icons ────────────────────────────────────────────────────────

const NAV_ICONS: Record<NavItem, string> = {
  workspace: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 7h12"/><path d="M6 3v4"/>',
  orbits: '<circle cx="8" cy="8" r="2"/><ellipse cx="8" cy="8" rx="6" ry="3" transform="rotate(-35 8 8)"/><ellipse cx="8" cy="8" rx="6" ry="3" transform="rotate(35 8 8)"/>',
  skills: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 7h6M5 10h4"/>',
  models: '<path d="M8 2L14 5.5v5L8 14 2 10.5v-5L8 2z"/><circle cx="8" cy="8" r="2"/>',
  connectors: '<path d="M3 8h2m6 0h2M7 5l-2 3 2 3M9 5l2 3-2 3"/>',
};

// ─── NavCol ───────────────────────────────────────────────────────────────────

function NavCol({ active, onSelect }: { active: NavItem; onSelect: (n: NavItem) => void }): React.ReactElement {
  const items: Array<{ id: NavItem; label: string } | 'sep' | 'grp'> = [
    { id: 'workspace', label: 'Workspace' },
    'sep',
    'grp',
    { id: 'orbits', label: 'Orbits' },
    { id: 'skills', label: 'Skills' },
    { id: 'models', label: 'Models' },
    { id: 'connectors', label: 'Connectors' },
  ];

  return (
    <div style={{
      width: '156px', minWidth: '156px',
      borderRight: '0.5px solid var(--border)',
      padding: '7px', overflow: 'auto', flexShrink: 0,
    }}>
      {items.map((item, i) => {
        if (item === 'sep') {
          return <div key={`sep-${i}`} style={{ height: '0.5px', background: 'var(--border)', margin: '5px 7px' }} />;
        }
        if (item === 'grp') {
          return (
            <p key="grp" style={{ fontSize: '10px', color: 'var(--t2)', letterSpacing: '0.06em', padding: '5px 9px 3px', textTransform: 'uppercase' }}>
              In this workspace
            </p>
          );
        }
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '7px 9px', borderRadius: '7px',
              border: 'none', cursor: 'pointer', fontSize: '13px',
              background: isActive ? 'var(--bg3)' : 'none',
              color: isActive ? 'var(--t0)' : 'var(--t1)',
              fontWeight: isActive ? 500 : 400,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'; }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
              dangerouslySetInnerHTML={{ __html: NAV_ICONS[item.id] }}
              style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}
            />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── ListCol header ───────────────────────────────────────────────────────────

function ListColHeader({ title, onAdd }: { title: string; onAdd?: () => void }): React.ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 11px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
    }}>
      <span style={{ fontSize: '11px', color: 'var(--t1)', fontWeight: 500 }}>{title}</span>
      {onAdd && (
        <button
          onClick={onAdd}
          style={{
            width: '20px', height: '20px', borderRadius: '5px',
            border: '0.5px solid var(--border-strong)', background: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--t1)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 1v8M1 5h8"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Workspace config sections list ──────────────────────────────────────────

const WS_SECTIONS: Array<{ id: WsSection; label: string; iconPath: string }> = [
  { id: 'identity', label: 'Identity', iconPath: '<path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6c0-2.2 2.2-4 5-4s5 1.8 5 4"/>' },
  { id: 'model', label: 'Default model', iconPath: '<path d="M8 2L14 5.5v5L8 14 2 10.5v-5L8 2z"/><circle cx="8" cy="8" r="2"/>' },
  { id: 'skillpacks', label: 'Skill packs', iconPath: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5 7h6M5 10h4"/>' },
  { id: 'connections', label: 'Connections', iconPath: '<path d="M3 8h2m6 0h2M7 5l-2 3 2 3M9 5l2 3-2 3"/>' },
  { id: 'kinds', label: 'Artifact kinds', iconPath: '<path d="M4 2h8l2 3v9H2V5z"/><path d="M4 2v3h8V2"/>' },
  { id: 'planner', label: 'Planner defaults', iconPath: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 9h4M5 12h2"/>' },
];

// ─── Workspace detail views ───────────────────────────────────────────────────

function WsIdentityDetail({ workspaceName }: { workspaceName: string }): React.ReactElement {
  const domains = ['Legacy modernization', 'Architecture discovery', 'Agile authoring', 'Data engineering'];
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>{workspaceName}</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Workspace identity</p>
      </div>
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Name</SectionLabel>
        <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t0)' }}>{workspaceName}</p>
      </div>
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Description</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.5 }}>
          Core workspace for the Retail Checkout Platform modernization initiative.
        </p>
        <EditLink label="Edit" onClick={() => {}} />
      </div>
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Available domains</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
          {domains.map((d) => <KindChip key={d} label={d} />)}
        </div>
        <EditLink label="Add domain" onClick={() => {}} />
      </div>
    </>
  );
}

function WsModelDetail(): React.ReactElement {
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>Default model</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Fallback for all orbits that don't override</p>
      </div>
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>LLM config ref</SectionLabel>
        <FieldRow label="Config ref">
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)', fontFamily: 'monospace' }}>{WS_DEFAULT_MODEL}</span>
        </FieldRow>
        <EditLink label="Change" onClick={() => {}} />
      </div>
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Note</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.5 }}>
          Orbits that do not specify their own model inherit this config ref at runtime via the ConfigForge cascade.
        </p>
      </div>
    </>
  );
}

function WsSkillPacksDetail(): React.ReactElement {
  const packs = ['raina-microservices-arch@v1.2', 'zeta-cobol-learn@v2.1', 'saba-agile-author@v1.0'];
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>Skill packs</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Available workspace-wide; orbits choose a default</p>
      </div>
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Registered packs</SectionLabel>
        {packs.map((p) => (
          <FieldRow key={p} label={p}>
            <span style={{ fontSize: '11px', color: 'var(--accent-green)' }}>● active</span>
          </FieldRow>
        ))}
        <EditLink label="Add skill pack" onClick={() => {}} />
      </div>
    </>
  );
}

function WsConnectionsDetail(): React.ReactElement {
  const conns = ['MCP · Diagram Generator', 'MCP · COBOL Parser', 'MCP · Jira Writer'];
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>Connections</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Shared MCP servers — inherited by all orbits</p>
      </div>
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>MCP servers</SectionLabel>
        {conns.map((c) => (
          <FieldRow key={c} label={c}>
            <span style={{ fontSize: '11px', color: 'var(--accent-green)' }}>● connected</span>
          </FieldRow>
        ))}
        <EditLink label="Add connection" onClick={() => {}} />
      </div>
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Note</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.5 }}>
          Orbits inherit all workspace connections automatically. An orbit may register additional connections on top.
        </p>
      </div>
    </>
  );
}

function WsKindsDetail(): React.ReactElement {
  const families = ['cam.architecture.*', 'cam.legacy.*', 'cam.agile.*', 'cam.data.*'];
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>Artifact kinds</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Ceiling set — orbits filter to a subset</p>
      </div>
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Enabled families</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
          {families.map((f) => <KindChip key={f} label={f} />)}
        </div>
        <EditLink label="Add family" onClick={() => {}} />
      </div>
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Note</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.5 }}>
          A kind not in this set cannot be used by any orbit in this workspace, even if declared in the global registry.
        </p>
      </div>
    </>
  );
}

function WsPlannerDetail(): React.ReactElement {
  return (
    <>
      <div style={{ padding: '13px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>Planner defaults</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>Applied when no orbit overrides</p>
      </div>
      <div style={{ padding: '11px 17px' }}>
        <FieldRow label="Confidence threshold">
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)' }}>{WS_PLANNER_CONF}%</span>
        </FieldRow>
        <FieldRow label="Approval mode">
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)' }}>{WS_PLANNER_MODE}</span>
        </FieldRow>
        <EditLink label="Edit" onClick={() => {}} />
      </div>
    </>
  );
}

// ─── Orbit detail view ────────────────────────────────────────────────────────

function OrbitDetail({ orbit, onToggle }: { orbit: OrbitData; onToggle: () => void }): React.ReactElement {
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: '13px 17px', borderBottom: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
      }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>{orbit.name}</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', marginTop: '2px' }}>{orbit.domain}</p>
        </div>
        <Toggle on={orbit.enabled} onToggle={onToggle} />
      </div>

      {/* Identity */}
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Identity</SectionLabel>
        <p style={{ fontSize: '12px', color: 'var(--t1)', lineHeight: 1.5 }}>{orbit.desc}</p>
        <EditLink label="Edit" onClick={() => {}} />
      </div>

      {/* Model */}
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Model</SectionLabel>
        <FieldRow label="LLM config ref">
          <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t0)', fontFamily: 'monospace' }}>{orbit.model.value}</span>
          {orbit.model.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
        </FieldRow>
        <EditLink label="Change" onClick={() => {}} />
      </div>

      {/* Skill packs */}
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Skill packs</SectionLabel>
        <FieldRow label="Default pack">
          {orbit.defaultPack.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
        </FieldRow>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          {orbit.packs.map((p) => <KindChip key={p} label={p} blue />)}
        </div>
        <EditLink label="Add pack" onClick={() => {}} />
      </div>

      {/* Connections */}
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Connections</SectionLabel>
        {orbit.connections.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--t2)', fontStyle: 'italic' }}>No connections</p>
        ) : (
          orbit.connections.map((c, i) => (
            <FieldRow key={i} label={c.name}>
              {c.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
            </FieldRow>
          ))
        )}
        <EditLink label="Add connection" onClick={() => {}} />
      </div>

      {/* Artifact kinds */}
      <div style={{ padding: '11px 17px', borderBottom: '0.5px solid var(--border)' }}>
        <SectionLabel>Artifact kinds</SectionLabel>
        <FieldRow label="Kind filter">
          {orbit.artifactKinds.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
        </FieldRow>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          {orbit.artifactKinds.value.map((k) => <KindChip key={k} label={k} blue />)}
        </div>
        <EditLink label="Edit" onClick={() => {}} />
      </div>

      {/* Planner */}
      <div style={{ padding: '11px 17px' }}>
        <SectionLabel>Planner</SectionLabel>
        <FieldRow label="Confidence threshold">
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)' }}>{orbit.plannerConf.value}%</span>
          {orbit.plannerConf.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
        </FieldRow>
        <FieldRow label="Approval mode">
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)' }}>{orbit.plannerMode.value}</span>
          {orbit.plannerMode.inherited ? <WorkspaceBadge /> : <OrbitBadge />}
        </FieldRow>
        <EditLink label="Edit" onClick={() => {}} />
      </div>
    </div>
  );
}

// ─── New orbit wizard ─────────────────────────────────────────────────────────

function WizardStepBar({ step }: { step: 1 | 2 | 3 | 4 }): React.ReactElement {
  const steps = ['Identity', 'Skill pack', 'Model', 'Review'];
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '11px 17px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
    }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const isDone = idx < step;
        const isActive = idx === step;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <div style={{
                flex: 1, height: '0.5px',
                background: isDone ? 'var(--accent-green)' : 'var(--border)',
                margin: '0 7px',
              }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 500,
                background: isActive ? 'var(--accent-blue)' : isDone ? 'rgba(61,203,122,0.15)' : 'none',
                border: isActive ? 'none' : isDone ? '0.5px solid var(--accent-green)' : '0.5px solid var(--border-strong)',
                color: isActive ? '#fff' : isDone ? 'var(--accent-green)' : 'var(--t2)',
              }}>
                {isDone ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 5l2.5 2.5L8 2"/>
                  </svg>
                ) : idx}
              </div>
              <span style={{
                fontSize: '12px',
                color: isActive ? 'var(--t0)' : isDone ? 'var(--t1)' : 'var(--t2)',
                fontWeight: isActive ? 500 : 400,
              }}>
                {label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface WizardProps {
  step: 1 | 2 | 3 | 4;
  data: WizState;
  onChange: (updates: Partial<WizState>) => void;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
  onComplete: () => void;
}

function Wizard({ step, data, onChange, onNext, onBack: wizBack, onCancel, onComplete }: WizardProps): React.ReactElement {
  const domain = MOCK_DOMAINS.find((d) => d.id === data.domain) ?? null;

  const canContinue = (): boolean => {
    if (step === 1) return data.name.trim().length > 0 && data.domain !== null;
    if (step === 2) return data.pack !== null || data.packInherited;
    if (step === 3) return data.model !== null || data.modelInherited;
    return true;
  };

  const btnStyles = {
    secondary: {
      padding: '6px 13px', fontSize: '13px', borderRadius: '7px',
      border: '0.5px solid var(--border-strong)', background: 'none',
      color: 'var(--t1)', cursor: 'pointer',
    } as React.CSSProperties,
    primary: {
      padding: '6px 15px', fontSize: '13px', fontWeight: 500, borderRadius: '7px',
      border: 'none', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer',
    } as React.CSSProperties,
    primaryDisabled: {
      padding: '6px 15px', fontSize: '13px', fontWeight: 500, borderRadius: '7px',
      border: 'none', background: 'var(--bg4)', color: 'var(--t2)', cursor: 'not-allowed',
    } as React.CSSProperties,
  };

  const renderStep = (): React.ReactElement => {
    if (step === 1) {
      return (
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)', marginBottom: '3px' }}>Name this orbit</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', marginBottom: '16px', lineHeight: 1.5 }}>
            Give it a name and pick its domain. The domain pre-selects suggested defaults in the next steps.
          </p>

          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '11px', color: 'var(--t1)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Name <span style={{ textTransform: 'none', color: 'var(--t2)' }}>· required</span>
            </p>
            <input
              type="text"
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g. Architecture, Legacy Core…"
              style={{
                width: '100%', padding: '7px 10px', fontSize: '13px',
                borderRadius: '7px', border: '0.5px solid var(--border-strong)',
                background: 'var(--bg2)', color: 'var(--t0)', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '11px', color: 'var(--t1)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Description <span style={{ textTransform: 'none', color: 'var(--t2)' }}>· optional</span>
            </p>
            <textarea
              value={data.desc}
              onChange={(e) => onChange({ desc: e.target.value })}
              placeholder="What will this orbit be used for?"
              rows={2}
              style={{
                width: '100%', padding: '7px 10px', fontSize: '13px',
                borderRadius: '7px', border: '0.5px solid var(--border-strong)',
                background: 'var(--bg2)', color: 'var(--t0)', outline: 'none',
                resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
            />
          </div>

          <div>
            <p style={{ fontSize: '11px', color: 'var(--t1)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '5px' }}>
              Domain <span style={{ textTransform: 'none', color: 'var(--t2)' }}>· required</span>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {MOCK_DOMAINS.map((d) => {
                const selected = data.domain === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      const updates: Partial<WizState> = { domain: d.id };
                      if (d.pack && !data.pack && !data.packInherited) updates.pack = d.pack;
                      if (d.model && !data.model && !data.modelInherited) updates.model = d.model;
                      onChange(updates);
                    }}
                    style={{
                      padding: '8px 10px', borderRadius: '7px', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                      background: selected ? 'rgba(74,158,255,0.1)' : 'var(--bg3)',
                      outline: selected ? '1px solid var(--accent-blue)' : '1px solid transparent',
                    }}
                  >
                    <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)' }}>{d.label}</p>
                    <p style={{ fontSize: '10px', color: 'var(--t2)', marginTop: '2px' }}>{d.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (step === 2) {
      const sugPack = domain?.pack ?? null;
      return (
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)', marginBottom: '3px' }}>Choose a default skill pack</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', marginBottom: '14px', lineHeight: 1.5 }}>
            Pre-selected in the chat dropdown when this orbit is open. Users can always switch packs mid-session.
          </p>

          {MOCK_PACKS.map((p) => {
            const selected = data.pack === p.id && !data.packInherited;
            return (
              <button
                key={p.id}
                onClick={() => onChange({ pack: p.id, packInherited: false })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 11px', borderRadius: '7px', border: 'none',
                  cursor: 'pointer', marginBottom: '6px',
                  background: selected ? 'rgba(74,158,255,0.1)' : 'var(--bg3)',
                  outline: selected ? '1px solid var(--accent-blue)' : '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t0)' }}>{p.name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {sugPack === p.id && (
                      <span style={{ fontSize: '10px', color: 'var(--accent-blue)', border: '0.5px solid var(--accent-blue)', borderRadius: '20px', padding: '1px 5px' }}>
                        suggested
                      </span>
                    )}
                    <span style={{ fontSize: '10px', color: 'var(--t1)', border: '0.5px solid var(--border-strong)', borderRadius: '20px', padding: '1px 5px' }}>
                      {p.version}
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--t1)', marginTop: '3px' }}>{p.desc}</p>
              </button>
            );
          })}

          <button
            onClick={() => onChange({ packInherited: true, pack: null })}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 11px', borderRadius: '7px',
              border: `0.5px dashed ${data.packInherited ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
              cursor: 'pointer', marginBottom: '6px',
              background: data.packInherited ? 'rgba(74,158,255,0.08)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)' }}>Inherit from workspace</span>
              <WorkspaceBadge />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '3px' }}>
              No default — user picks from the full workspace list each session
            </p>
          </button>
        </div>
      );
    }

    if (step === 3) {
      const sugModel = domain?.model ?? null;
      return (
        <div>
          <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)', marginBottom: '3px' }}>Choose a model</p>
          <p style={{ fontSize: '12px', color: 'var(--t1)', marginBottom: '14px', lineHeight: 1.5 }}>
            The LLM this orbit's agent uses. Fine-tuned models perform best for specialist domains like legacy COBOL analysis.
          </p>

          {MOCK_MODELS.map((m) => {
            const selected = data.model === m.id && !data.modelInherited;
            return (
              <button
                key={m.id}
                onClick={() => onChange({ model: m.id, modelInherited: false })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 11px', borderRadius: '7px', border: 'none',
                  cursor: 'pointer', marginBottom: '6px',
                  background: selected ? 'rgba(74,158,255,0.1)' : 'var(--bg3)',
                  outline: selected ? '1px solid var(--accent-blue)' : '1px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t0)' }}>{m.name}</span>
                  {sugModel === m.id && (
                    <span style={{ fontSize: '10px', color: 'var(--accent-blue)', border: '0.5px solid var(--accent-blue)', borderRadius: '20px', padding: '1px 5px' }}>
                      suggested
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--t1)', fontFamily: 'monospace', marginTop: '2px', marginBottom: '2px' }}>{m.id}</p>
                <p style={{ fontSize: '11px', color: 'var(--t1)' }}>{m.note}</p>
              </button>
            );
          })}

          <button
            onClick={() => onChange({ modelInherited: true, model: null })}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 11px', borderRadius: '7px',
              border: `0.5px dashed ${data.modelInherited ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
              cursor: 'pointer', marginBottom: '6px',
              background: data.modelInherited ? 'rgba(74,158,255,0.08)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--t1)' }}>Inherit from workspace</span>
              <WorkspaceBadge />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '3px' }}>
              Uses workspace default: <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{WS_DEFAULT_MODEL}</span>
            </p>
          </button>
        </div>
      );
    }

    // Step 4 — Review
    const selectedPack = MOCK_PACKS.find((p) => p.id === data.pack);
    const selectedModel = MOCK_MODELS.find((m) => m.id === data.model);
    const initials = getAbbr(data.name);
    const domainColor = domain?.color ?? { bg: '#27272b', fg: '#9ca3af' };

    return (
      <div>
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)', marginBottom: '3px' }}>Review and create</p>
        <p style={{ fontSize: '12px', color: 'var(--t1)', marginBottom: '14px', lineHeight: 1.5 }}>
          Everything set? Artifact kinds and connections can be configured after creation.
        </p>

        {/* Preview badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px',
          padding: '9px 11px', background: 'var(--bg3)',
          border: '0.5px solid var(--border-strong)', borderRadius: '8px', marginBottom: '12px',
        }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '7px',
            background: domainColor.bg, color: domainColor.fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 500, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)' }}>{data.name}</p>
            <p style={{ fontSize: '12px', color: 'var(--t1)' }}>{domain?.label ?? ''}</p>
          </div>
        </div>

        {/* Summary cards */}
        {([
          {
            label: 'Identity',
            rows: [
              { k: 'Name', v: data.name },
              { k: 'Domain', v: domain?.label ?? '—' },
              ...(data.desc ? [{ k: 'Description', v: data.desc }] : []),
            ],
          },
          {
            label: 'Skill pack',
            rows: [{ k: 'Default pack', v: data.packInherited ? null : (selectedPack?.name ?? data.pack ?? '—'), badge: data.packInherited ? 'ws' : null }],
          },
          {
            label: 'Model',
            rows: [{ k: 'LLM config ref', v: data.modelInherited ? null : (selectedModel?.id ?? data.model ?? '—'), badge: data.modelInherited ? 'ws' : null }],
          },
        ] as Array<{ label: string; rows: Array<{ k: string; v: string | null; badge?: string | null }> }>).map((card) => (
          <div key={card.label} style={{ marginBottom: '9px' }}>
            <SectionLabel>{card.label}</SectionLabel>
            <div style={{
              background: 'var(--bg3)', border: '0.5px solid var(--border-strong)',
              borderRadius: '7px', padding: '9px 12px',
            }}>
              {card.rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '3px 0',
                    borderBottom: i < card.rows.length - 1 ? '0.5px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--t1)' }}>{row.k}</span>
                  {row.badge === 'ws' ? (
                    <WorkspaceBadge />
                  ) : (
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--t0)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.v}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <p style={{ fontSize: '11px', color: 'var(--t2)', lineHeight: 1.5, marginTop: '6px' }}>
          Artifact kinds, connections, and planner settings can be configured from the Customize panel after creation.
        </p>
      </div>
    );
  };

  return (
    <>
      <WizardStepBar step={step} />
      <div style={{ flex: 1, overflow: 'auto', padding: '15px 17px' }}>
        {renderStep()}
      </div>
      <div style={{
        padding: '11px 17px', borderTop: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <button
          onClick={step > 1 ? wizBack : onCancel}
          style={btnStyles.secondary}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          {step > 1 ? 'Back' : 'Cancel'}
        </button>
        <button
          onClick={step === 4 ? onComplete : onNext}
          disabled={!canContinue()}
          style={canContinue() ? btnStyles.primary : btnStyles.primaryDisabled}
        >
          {step === 4 ? 'Create orbit' : 'Continue'}
        </button>
      </div>
    </>
  );
}

// ─── Success screen after orbit creation ──────────────────────────────────────

function OrbitCreatedSuccess({ name, onOpenOrbit }: { name: string; onOpenOrbit: () => void }): React.ReactElement {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', gap: '8px', textAlign: 'center',
    }}>
      <div style={{
        width: '38px', height: '38px', borderRadius: '50%',
        background: 'rgba(61,203,122,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px',
      }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--accent-green)" strokeWidth="1.5">
          <path d="M4 10l4 4 8-8"/>
        </svg>
      </div>
      <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--t0)' }}>{name} orbit created</p>
      <p style={{ fontSize: '13px', color: 'var(--t1)' }}>Configure artifact kinds and connections from the orbit detail view.</p>
      <div style={{ display: 'flex', gap: '7px', marginTop: '10px' }}>
        <button
          onClick={onOpenOrbit}
          style={{
            padding: '6px 15px', fontSize: '13px', fontWeight: 500, borderRadius: '7px',
            border: 'none', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer',
          }}
        >
          Open orbit
        </button>
      </div>
    </div>
  );
}

// ─── Placeholder for Skills / Models / Connectors nav items ──────────────────

function PlaceholderDetail({ navItem }: { navItem: NavItem }): React.ReactElement {
  const label = navItem.charAt(0).toUpperCase() + navItem.slice(1);
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '6px',
    }}>
      <p style={{ fontSize: '13px', color: 'var(--t2)', textAlign: 'center' }}>
        Workspace-wide {label.toLowerCase()}<br />configuration coming soon.
      </p>
    </div>
  );
}

// ─── Main CustomizePanel ──────────────────────────────────────────────────────

interface CustomizePanelProps {
  onBack: () => void;
}

export function CustomizePanel({ onBack }: CustomizePanelProps): React.ReactElement {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const workspaceName = activeWorkspace?.name ?? 'Workspace';

  // Navigation state
  const [activeNav, setActiveNav] = useState<NavItem>('workspace');
  const [activeWsSection, setActiveWsSection] = useState<WsSection>('identity');
  const [activeOrbitIdx, setActiveOrbitIdx] = useState(0);

  // Orbits (mutable: toggle enable, add new)
  const [orbits, setOrbits] = useState<OrbitData[]>(INITIAL_ORBITS);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizStep, setWizStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizData, setWizData] = useState<WizState>({
    name: '', desc: '', domain: null,
    pack: null, packInherited: false,
    model: null, modelInherited: false,
  });
  // After creation: show success view
  const [createdOrbitIdx, setCreatedOrbitIdx] = useState<number | null>(null);

  const openWizard = (): void => {
    setShowWizard(true);
    setWizStep(1);
    setWizData({ name: '', desc: '', domain: null, pack: null, packInherited: false, model: null, modelInherited: false });
    setCreatedOrbitIdx(null);
  };

  const handleWizardComplete = (): void => {
    const domain = MOCK_DOMAINS.find((d) => d.id === wizData.domain) ?? MOCK_DOMAINS[MOCK_DOMAINS.length - 1]!;
    const newOrbit: OrbitData = {
      id: `orbit-${Date.now()}`,
      name: wizData.name,
      abbr: getAbbr(wizData.name),
      color: domain.color,
      domain: domain.label,
      desc: wizData.desc || `${domain.label} orbit for this workspace.`,
      enabled: true,
      model: {
        value: wizData.modelInherited ? WS_DEFAULT_MODEL : (wizData.model ?? WS_DEFAULT_MODEL),
        inherited: wizData.modelInherited,
      },
      defaultPack: {
        value: wizData.packInherited ? '(workspace default)' : (wizData.pack ?? ''),
        inherited: wizData.packInherited,
      },
      packs: wizData.packInherited ? [] : (wizData.pack ? [wizData.pack] : []),
      connections: [],
      artifactKinds: { value: [], inherited: false },
      plannerConf: { value: WS_PLANNER_CONF, inherited: true },
      plannerMode: { value: WS_PLANNER_MODE, inherited: true },
    };
    const newIdx = orbits.length;
    setOrbits((prev) => [...prev, newOrbit]);
    setCreatedOrbitIdx(newIdx);
    setShowWizard(false);
  };

  const toggleOrbit = (idx: number): void => {
    setOrbits((prev) => prev.map((o, i) => i === idx ? { ...o, enabled: !o.enabled } : o));
  };

  // ── Render list column content ──

  const renderListCol = (): React.ReactElement => {
    if (activeNav === 'workspace') {
      return (
        <>
          <ListColHeader title="Configuration" />
          <div style={{ flex: 1, overflow: 'auto', padding: '4px' }}>
            {WS_SECTIONS.map((s) => {
              const isActive = activeWsSection === s.id && !showWizard;
              return (
                <button
                  key={s.id}
                  onClick={() => { setActiveWsSection(s.id); setShowWizard(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '7px 9px', borderRadius: '7px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isActive ? 'var(--bg3)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  {/* Icon box */}
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: isActive ? 'var(--bg4)' : 'var(--bg2)',
                    border: '0.5px solid var(--border-strong)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={isActive ? 'var(--t0)' : 'var(--t1)'} strokeWidth="1.3"
                      dangerouslySetInnerHTML={{ __html: s.iconPath }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--t0)' : 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.label}
                    </p>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--t2)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                    <path d="M4 2l4 4-4 4"/>
                  </svg>
                </button>
              );
            })}
          </div>
        </>
      );
    }

    if (activeNav === 'orbits') {
      return (
        <>
          <ListColHeader title="Orbits" onAdd={openWizard} />
          <div style={{ flex: 1, overflow: 'auto', padding: '4px' }}>
            {orbits.map((orbit, i) => {
              const isActive = activeOrbitIdx === i && !showWizard && createdOrbitIdx === null;
              return (
                <button
                  key={orbit.id}
                  onClick={() => { setActiveOrbitIdx(i); setShowWizard(false); setCreatedOrbitIdx(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '7px 9px', borderRadius: '7px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isActive ? 'var(--bg3)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: orbit.color.bg, color: orbit.color.fg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 500, flexShrink: 0,
                  }}>
                    {orbit.abbr}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--t0)' : 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {orbit.name}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {orbit.domain}
                    </p>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--t2)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                    <path d="M4 2l4 4-4 4"/>
                  </svg>
                </button>
              );
            })}

            {/* New orbit dashed button */}
            <button
              onClick={openWizard}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '7px 9px', margin: '3px 0',
                borderRadius: '7px',
                border: `0.5px dashed ${showWizard ? 'var(--accent-blue)' : 'var(--border-strong)'}`,
                cursor: 'pointer', fontSize: '12px',
                color: showWizard ? 'var(--accent-blue)' : 'var(--t2)',
                background: showWizard ? 'rgba(74,158,255,0.05)' : 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 1v10M1 6h10"/>
              </svg>
              New orbit
            </button>
          </div>
        </>
      );
    }

    // Skills / Models / Connectors — placeholders
    const label = activeNav.charAt(0).toUpperCase() + activeNav.slice(1);
    return (
      <>
        <ListColHeader title={label} />
        <div style={{ flex: 1, overflow: 'auto', padding: '9px 11px' }}>
          <p style={{ fontSize: '12px', color: 'var(--t2)' }}>
            Workspace-wide {activeNav}. Select an item to configure.
          </p>
        </div>
      </>
    );
  };

  // ── Render detail column content ──

  const renderDetailCol = (): React.ReactElement => {
    // Wizard takes priority over everything when in orbits nav
    if (activeNav === 'orbits' && showWizard) {
      return (
        <Wizard
          step={wizStep}
          data={wizData}
          onChange={(updates) => setWizData((prev) => ({ ...prev, ...updates }))}
          onNext={() => setWizStep((s) => (s < 4 ? (s + 1) as 1 | 2 | 3 | 4 : s))}
          onBack={() => setWizStep((s) => (s > 1 ? (s - 1) as 1 | 2 | 3 | 4 : s))}
          onCancel={() => setShowWizard(false)}
          onComplete={handleWizardComplete}
        />
      );
    }

    // Show success view after orbit creation
    if (activeNav === 'orbits' && createdOrbitIdx !== null) {
      const created = orbits[createdOrbitIdx];
      return (
        <OrbitCreatedSuccess
          name={created?.name ?? 'New'}
          onOpenOrbit={() => {
            setActiveOrbitIdx(createdOrbitIdx);
            setCreatedOrbitIdx(null);
          }}
        />
      );
    }

    if (activeNav === 'workspace') {
      const content = (): React.ReactElement => {
        switch (activeWsSection) {
          case 'identity': return <WsIdentityDetail workspaceName={workspaceName} />;
          case 'model': return <WsModelDetail />;
          case 'skillpacks': return <WsSkillPacksDetail />;
          case 'connections': return <WsConnectionsDetail />;
          case 'kinds': return <WsKindsDetail />;
          case 'planner': return <WsPlannerDetail />;
        }
      };
      return <div style={{ flex: 1, overflow: 'auto' }}>{content()}</div>;
    }

    if (activeNav === 'orbits') {
      const orbit = orbits[activeOrbitIdx];
      if (!orbit) {
        return (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '13px', color: 'var(--t2)' }}>Select an orbit</p>
          </div>
        );
      }
      return (
        <OrbitDetail
          orbit={orbit}
          onToggle={() => toggleOrbit(activeOrbitIdx)}
        />
      );
    }

    return <PlaceholderDetail navItem={activeNav} />;
  };

  // ── Main render ──

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: 'var(--bg1)', overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', borderBottom: '0.5px solid var(--border)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '13px', color: 'var(--t1)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t0)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)'; }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 12L6 8l4-4"/>
          </svg>
        </button>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--t0)' }}>Customize</span>
      </div>

      {/* Three-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Nav column */}
        <NavCol active={activeNav} onSelect={(n) => { setActiveNav(n); setShowWizard(false); setCreatedOrbitIdx(null); }} />

        {/* List column */}
        <div style={{
          width: '194px', minWidth: '194px',
          borderRight: '0.5px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {renderListCol()}
        </div>

        {/* Detail column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {renderDetailCol()}
        </div>
      </div>
    </div>
  );
}
