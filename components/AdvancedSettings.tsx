"use client";

import { useState } from "react";
import {
    ChevronDown, ChevronUp, Info, Zap, FlaskConical,
    Lock, X, Clock, ShieldAlert, Settings2, Dna, Pill, Brain,
} from "lucide-react";
import type {
    PipelineSteps,
    DockingSpeed,
    BindingSiteMode,
    BindingSiteCoords,
    BindingSiteResidues,
    SolubilityFilterMode,
    ADMETTuningConfig,
    ADMETPreset,
} from "@/lib/api";
import { ADMET_PRESET_DEFAULTS } from "@/lib/api";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AdvancedSettingsProps {
    numAnalogues: number;
    onNumAnaloguesChange: (v: number) => void;
    pipelineSteps: PipelineSteps;
    onPipelineStepsChange: (v: PipelineSteps) => void;
    dockingSpeed: DockingSpeed;
    onDockingSpeedChange: (v: DockingSpeed) => void;
    maxDockingCompounds: number;
    onMaxDockingCompoundsChange: (v: number) => void;
    bindingSiteMode: BindingSiteMode;
    onBindingSiteModeChange: (v: BindingSiteMode) => void;
    bindingSiteCoords: BindingSiteCoords;
    onBindingSiteCoordsChange: (v: BindingSiteCoords) => void;
    bindingSiteResidues: BindingSiteResidues;
    onBindingSiteResiduesChange: (v: BindingSiteResidues) => void;
    directScoreOnly: boolean;
    onDirectScoreOnlyChange: (v: boolean) => void;
    mwMin: number;
    mwMax: number;
    onMwMinChange: (v: number) => void;
    onMwMaxChange: (v: number) => void;
    maxLipinskiViolations: number | null;
    onMaxLipinskiViolationsChange: (v: number | null) => void;
    solubilityFilter: SolubilityFilterMode;
    onSolubilityFilterChange: (v: SolubilityFilterMode) => void;
    toxicityReportOnly: boolean;
    onToxicityReportOnlyChange: (v: boolean) => void;
    lockedScaffoldSmarts: string;
    onLockedScaffoldSmartsChange: (v: string) => void;
    admetConfig: ADMETTuningConfig;
    onAdmetConfigChange: (v: ADMETTuningConfig) => void;
}

// ── Static config ─────────────────────────────────────────────────────────────

const STEPS: { key: keyof PipelineSteps; label: string; desc: string; locked?: boolean }[] = [
    { key: "drug_likeness", label: "Drug-likeness Filter", desc: "Lipinski RO5 + ESOL solubility (RDKit)", locked: true },
    { key: "admet", label: "ADMET Toxicity Filter", desc: "hERG, hepatotox, Caco-2, bioavailability (ADMET-AI)" },
    { key: "binding_prefilter", label: "ML Binding Pre-filter", desc: "GNN affinity ranking — sends top N for docking (DeepChem AttentiveFP)" },
    { key: "docking", label: "Molecular Docking", desc: "AutoDock Vina with CNN rescoring" },
    { key: "retrosynthesis", label: "Retrosynthesis", desc: "SA Score + feasibility (AiZynthFinder)" },
];

const DOCKING_SPEEDS: { value: DockingSpeed; label: string; desc: string; minPerCompound: number }[] = [
    { value: "fast", label: "Fast", desc: "exhaustiveness=8 · ~5 min/cpd", minPerCompound: 5 },
    { value: "balanced", label: "Balanced", desc: "exhaustiveness=16 · ~10 min/cpd", minPerCompound: 10 },
    { value: "thorough", label: "Thorough", desc: "exhaustiveness=32 · ~20 min/cpd", minPerCompound: 20 },
];

const DOCKING_COUNT_PRESETS = [10, 25, 50] as const;

const VIOLATION_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "Strict — ≤1 violation (classic RO5)" },
    { value: "2", label: "Relaxed — ≤2 violations" },
    { value: "3", label: "Lenient — ≤3 violations" },
    { value: "null", label: "Disabled — no filter" },
];

const SOLUBILITY_OPTIONS: { value: SolubilityFilterMode; label: string; desc: string }[] = [
    { value: "soluble_only", label: "Soluble only", desc: "logS > −3: aqueous assay-ready" },
    { value: "allow_slightly", label: "Slightly soluble", desc: "logS > −5: may need formulation" },
    { value: "all", label: "No filter", desc: "No solubility restriction" },
];

const SCAFFOLD_PRESETS = [
    { label: "Quinolone", smarts: "c1ccc2cc1C(=O)c1ccccc1N2", hint: "Fluoroquinolone bicyclic ring" },
    { label: "Benzimidazole", smarts: "c1ccc2nHcnc2c1", hint: "Fused benzimidazole core" },
    { label: "Flavone", smarts: "O=c1cc(-c2ccccc2)oc2ccccc12", hint: "2-phenyl-4H-chromen-4-one" },
    { label: "Purine", smarts: "c1nc2nHcnc2n1", hint: "Adenine-like, kinase hinge binder" },
    { label: "Indole", smarts: "c1ccc2nHccc2c1", hint: "Bicyclic indole ring system" },
];

const ANALOGUE_PRESETS = [25, 50, 100, 500, 1000] as const;

const ADMET_PRESETS: { value: ADMETPreset; label: string; desc: string; icon: React.ReactNode }[] = [
    { value: "balanced", label: "Balanced", desc: "Standard early discovery thresholds", icon: <Settings2 className="w-3.5 h-3.5" /> },
    { value: "oral", label: "Oral-focused", desc: "Stricter Caco-2 & bioavailability", icon: <Pill className="w-3.5 h-3.5" /> },
    { value: "cns", label: "CNS-focused", desc: "Higher BBB penetration required", icon: <Brain className="w-3.5 h-3.5" /> },
    { value: "custom", label: "Custom", desc: "Manual threshold adjustments", icon: <Dna className="w-3.5 h-3.5" /> },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDockingTime(compounds: number, minPerCompound: number): string {
    const total = compounds * minPerCompound;
    if (total < 60) return `~${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

function dockingTimeSeverity(compounds: number, minPerCompound: number): "ok" | "warn" | "heavy" {
    const total = compounds * minPerCompound;
    if (total <= 60) return "ok";
    if (total <= 300) return "warn";
    return "heavy";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
            {children}
        </p>
    );
}

function Divider() {
    return <div className="h-px bg-gray-800/70 my-1" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedSettings({
    numAnalogues, onNumAnaloguesChange,
    pipelineSteps, onPipelineStepsChange,
    dockingSpeed, onDockingSpeedChange,
    maxDockingCompounds, onMaxDockingCompoundsChange,
    bindingSiteMode, onBindingSiteModeChange,
    bindingSiteCoords, onBindingSiteCoordsChange,
    bindingSiteResidues, onBindingSiteResiduesChange,
    directScoreOnly, onDirectScoreOnlyChange,
    mwMin, mwMax, onMwMinChange, onMwMaxChange,
    maxLipinskiViolations, onMaxLipinskiViolationsChange,
    solubilityFilter, onSolubilityFilterChange,
    toxicityReportOnly, onToxicityReportOnlyChange,
    lockedScaffoldSmarts, onLockedScaffoldSmartsChange,
    admetConfig, onAdmetConfigChange,
}: AdvancedSettingsProps) {
    const [open, setOpen] = useState(false);
    const [scaffoldPresetOpen, setScaffoldPresetOpen] = useState(false);
    const [dockingCountCustom, setDockingCountCustom] = useState(false);

    const toxOnly = toxicityReportOnly && !directScoreOnly;
    const bothModes = toxicityReportOnly && directScoreOnly;
    const analoguesDisabled = directScoreOnly;

    const toggleStep = (key: keyof PipelineSteps) => {
        if (key === "drug_likeness") return;
        onPipelineStepsChange({ ...pipelineSteps, [key]: !pipelineSteps[key] });
    };

    const violationSelectValue = maxLipinskiViolations === null ? "null" : String(maxLipinskiViolations);
    const handleViolationChange = (raw: string) => {
        onMaxLipinskiViolationsChange(raw === "null" ? null : parseInt(raw, 10));
    };

    const handleAdmetPresetChange = (preset: ADMETPreset) => {
        const defaults = ADMET_PRESET_DEFAULTS[preset];
        onAdmetConfigChange({ ...admetConfig, ...defaults, preset });
    };

    const handleAdmetThresholdChange = (
        endpoint: "herg_inhibition" | "hepatotoxicity",
        field: "cutoff" | "severity_high",
        value: number
    ) => {
        const currentEndpoint = admetConfig[endpoint] || ADMET_PRESET_DEFAULTS.balanced![endpoint]!;
        onAdmetConfigChange({
            ...admetConfig,
            preset: "custom",
            [endpoint]: { ...currentEndpoint, [field]: value },
        });
    };

    const activeSpeed = DOCKING_SPEEDS.find((s) => s.value === dockingSpeed)!;
    const dockingTimeStr = formatDockingTime(maxDockingCompounds, activeSpeed.minPerCompound);
    const dockingTimeSev = dockingTimeSeverity(maxDockingCompounds, activeSpeed.minPerCompound);
    const isCustomCount = !DOCKING_COUNT_PRESETS.includes(maxDockingCompounds as typeof DOCKING_COUNT_PRESETS[number]);

    const activeBadges = [
        directScoreOnly && { label: "Direct Score", color: "bg-violet-900/60 border-violet-700/60 text-violet-300", icon: <Zap className="w-3 h-3" /> },
        toxicityReportOnly && { label: bothModes ? "Tox + Direct" : "Toxicity Only", color: "bg-red-900/60 border-red-700/60 text-red-300", icon: <FlaskConical className="w-3 h-3" /> },
        lockedScaffoldSmarts.trim() && { label: "Scaffold Lock", color: "bg-amber-900/60 border-amber-700/60 text-amber-300", icon: <Lock className="w-3 h-3" /> },
        admetConfig.preset !== "balanced" && { label: `${admetConfig.preset} ADMET`, color: "bg-emerald-900/60 border-emerald-700/60 text-emerald-300", icon: <ShieldAlert className="w-3 h-3" /> },
    ].filter(Boolean) as { label: string; color: string; icon: React.ReactNode }[];

    return (
        <div className="card mt-4">
            {/* ── Header toggle ── */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
                <span className="flex items-center gap-2.5 flex-wrap">
                    <Settings2 className="w-4 h-4 text-gray-500" />
                    <span>Advanced Settings</span>
                    {activeBadges.map((b) => (
                        <span
                            key={b.label}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${b.color}`}
                        >
                            {b.icon} {b.label}
                        </span>
                    ))}
                </span>
                {open
                    ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                }
            </button>

            {open && (
                <div className="mt-8 space-y-10 animate-in fade-in slide-in-from-top-2 duration-200">

                    {/* ── SECTION 1 · Run Mode ── */}
                    <section className="space-y-3">
                        <SectionLabel>Run Mode</SectionLabel>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${directScoreOnly
                                ? "bg-violet-950/30 border-violet-700/50"
                                : "bg-gray-900/30 border-gray-800 hover:border-gray-700 hover:bg-gray-800/30"
                                }`}>
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={directScoreOnly}
                                        onChange={(e) => onDirectScoreOnlyChange(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary focus:ring-offset-gray-900"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
                                        <Zap className="w-4 h-4 text-violet-400" /> Direct Score Only
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                                        Skip analogue generation. Runs the input compound straight through the pipeline as-is.
                                    </p>
                                </div>
                            </label>

                            <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${toxicityReportOnly
                                ? "bg-red-950/30 border-red-700/50"
                                : "bg-gray-900/30 border-gray-800 hover:border-gray-700 hover:bg-gray-800/30"
                                }`}>
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={toxicityReportOnly}
                                        onChange={(e) => onToxicityReportOnlyChange(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary focus:ring-offset-gray-900"
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">
                                        <FlaskConical className="w-4 h-4 text-red-400" /> Toxicity Report Only
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                                        Forces ADMET on all compounds and skips PDB/docking entirely. Fast profiling mode.
                                    </p>
                                </div>
                            </label>
                        </div>
                    </section>

                    <Divider />

                    {/* ── SECTION 2 · Analogue Generation ── */}
                    <section className={`space-y-6 ${analoguesDisabled ? "opacity-40 pointer-events-none select-none" : ""}`}>
                        <div className="flex items-center justify-between">
                            <SectionLabel>Analogue Generation</SectionLabel>
                            {analoguesDisabled && (
                                <span className="text-xs text-violet-400">Disabled — Direct Score mode active</span>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300">Number of Analogues</label>
                                <div className="flex flex-wrap gap-2">
                                    {ANALOGUE_PRESETS.map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => onNumAnaloguesChange(val)}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${numAnalogues === val
                                                ? "bg-primary text-white shadow-sm"
                                                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                                }`}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    min={1}
                                    max={10000}
                                    value={numAnalogues}
                                    onChange={(e) => onNumAnaloguesChange(parseInt(e.target.value) || 25)}
                                    placeholder="Custom number…"
                                    className="input w-full text-sm"
                                />
                                <p className="text-xs text-gray-500">Max 10,000 — larger batches increase compute time.</p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300 flex items-center justify-between">
                                    Lock Core Scaffold (SMARTS)
                                    {lockedScaffoldSmarts && (
                                        <button
                                            type="button"
                                            onClick={() => onLockedScaffoldSmartsChange("")}
                                            className="text-gray-500 hover:text-red-400 transition-colors"
                                            title="Clear scaffold"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </label>
                                <input
                                    type="text"
                                    value={lockedScaffoldSmarts}
                                    onChange={(e) => onLockedScaffoldSmartsChange(e.target.value)}
                                    placeholder="e.g. c1ccc2cc1C(=O)c1ccccc1N2"
                                    className="input font-mono text-xs w-full"
                                />
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setScaffoldPresetOpen(!scaffoldPresetOpen)}
                                        className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
                                    >
                                        Common scaffold presets <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {scaffoldPresetOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-full max-w-sm bg-gray-850 border border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                                            <div className="p-1.5 space-y-0.5">
                                                {SCAFFOLD_PRESETS.map((p) => (
                                                    <button
                                                        key={p.label}
                                                        type="button"
                                                        onClick={() => { onLockedScaffoldSmartsChange(p.smarts); setScaffoldPresetOpen(false); }}
                                                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-700/70 transition-colors group"
                                                    >
                                                        <p className="text-sm font-semibold text-gray-200">{p.label}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">{p.hint}</p>
                                                        <p className="text-xs font-mono text-gray-600 group-hover:text-primary transition-colors mt-0.5 truncate">{p.smarts}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <Divider />

                    {/* ── SECTION 3 · Drug-likeness ── */}
                    <section className="space-y-6">
                        <SectionLabel>Drug-likeness Limits</SectionLabel>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300">Molecular Weight Range (Da)</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" value={mwMin} onChange={(e) => onMwMinChange(Number(e.target.value))} className="input w-full text-sm" placeholder="Min" />
                                    <span className="text-gray-600 shrink-0">–</span>
                                    <input type="number" value={mwMax} onChange={(e) => onMwMaxChange(Number(e.target.value))} className="input w-full text-sm" placeholder="Max" />
                                </div>
                                <p className="text-xs text-gray-500">RO5 default: 200–500 Da</p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300">Lipinski Violation Tolerance</label>
                                <select
                                    value={violationSelectValue}
                                    onChange={(e) => handleViolationChange(e.target.value)}
                                    className="input w-full text-sm"
                                >
                                    {VIOLATION_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300">Solubility Filter (logS)</label>
                                <div className="space-y-2">
                                    {SOLUBILITY_OPTIONS.map((opt) => (
                                        <label
                                            key={opt.value}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${solubilityFilter === opt.value
                                                ? "border-primary/50 bg-primary/10"
                                                : "border-gray-800 bg-gray-900/20 hover:border-gray-700"
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="solubilityFilter"
                                                value={opt.value}
                                                checked={solubilityFilter === opt.value}
                                                onChange={() => onSolubilityFilterChange(opt.value)}
                                                className="text-primary bg-gray-900 border-gray-600 focus:ring-primary"
                                            />
                                            <div>
                                                <p className={`text-sm font-medium ${solubilityFilter === opt.value ? "text-gray-100" : "text-gray-300"}`}>{opt.label}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <Divider />

                    {/* ── SECTION 4 · ADMET Tuning ── */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2.5">
                            <ShieldAlert className="w-4 h-4 text-emerald-400" />
                            <SectionLabel>ADMET Threshold Tuning</SectionLabel>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            {/* Preset column */}
                            <div className="lg:col-span-2 space-y-2">
                                <p className="text-xs font-medium text-gray-300 mb-3">Target Profile Preset</p>
                                {ADMET_PRESETS.map((preset) => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => handleAdmetPresetChange(preset.value)}
                                        className={`w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all ${admetConfig.preset === preset.value
                                            ? "bg-primary/10 border-primary/60 text-white"
                                            : "bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-800/40"
                                            }`}
                                    >
                                        <span className={admetConfig.preset === preset.value ? "text-primary" : "text-gray-500"}>
                                            {preset.icon}
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold leading-tight">{preset.label}</p>
                                            <p className="text-xs mt-0.5 opacity-60 leading-snug">{preset.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Sliders column */}
                            <div className="lg:col-span-3 rounded-xl border border-gray-800 bg-gray-900/30 p-5 space-y-7">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-red-400/80 mb-1">Hard-Fail Limits</p>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        Compounds exceeding these values are removed from the pipeline entirely.
                                        Switch to <span className="text-gray-400 font-medium">Custom</span> preset to save manual changes.
                                    </p>
                                </div>

                                {/* hERG */}
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-100">hERG Inhibition</p>
                                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Cardiac arrhythmia / QT prolongation risk. Lower is safer.</p>
                                        </div>
                                        <span className="shrink-0 text-xs font-mono font-semibold text-red-400 bg-red-950/40 border border-red-900/50 px-2.5 py-1 rounded-lg">
                                            Fail &gt; {(admetConfig.herg_inhibition?.severity_high ?? 0.85).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <input
                                            type="range" min={0.5} max={0.95} step={0.05}
                                            value={admetConfig.herg_inhibition?.severity_high ?? 0.85}
                                            onChange={(e) => handleAdmetThresholdChange("herg_inhibition", "severity_high", parseFloat(e.target.value))}
                                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="flex justify-between text-xs text-gray-600">
                                            <span>Strict (0.50)</span>
                                            <span>Relaxed (0.95)</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Hepatotoxicity */}
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-100">Hepatotoxicity (DILI)</p>
                                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Drug-induced liver injury probability. Lower is safer.</p>
                                        </div>
                                        <span className="shrink-0 text-xs font-mono font-semibold text-red-400 bg-red-950/40 border border-red-900/50 px-2.5 py-1 rounded-lg">
                                            Fail &gt; {(admetConfig.hepatotoxicity?.severity_high ?? 0.85).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        <input
                                            type="range" min={0.5} max={0.95} step={0.05}
                                            value={admetConfig.hepatotoxicity?.severity_high ?? 0.85}
                                            onChange={(e) => handleAdmetThresholdChange("hepatotoxicity", "severity_high", parseFloat(e.target.value))}
                                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="flex justify-between text-xs text-gray-600">
                                            <span>Strict (0.50)</span>
                                            <span>Relaxed (0.95)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <Divider />

                    {/* ── SECTION 5 · Pipeline Steps ── */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <SectionLabel>Active Pipeline Steps</SectionLabel>
                            {toxOnly && <span className="text-xs text-red-400">Overridden by Toxicity Report mode</span>}
                        </div>
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${toxOnly ? "opacity-40 pointer-events-none select-none" : ""}`}>
                            {STEPS.map((step) => {
                                let isChecked = pipelineSteps[step.key];
                                if (toxOnly) {
                                    if (step.key === "admet") isChecked = true;
                                    else if (step.key !== "drug_likeness") isChecked = false;
                                }
                                return (
                                    <label
                                        key={step.key}
                                        className={`flex items-start gap-3.5 p-4 rounded-xl border transition-all ${isChecked
                                            ? "bg-gray-800/50 border-gray-700"
                                            : "bg-transparent border-gray-800/60 hover:bg-gray-900/50"
                                            } ${step.locked ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                                    >
                                        <div className="pt-0.5">
                                            <input
                                                type="checkbox"
                                                disabled={step.locked || toxOnly}
                                                checked={isChecked}
                                                onChange={() => toggleStep(step.key)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary focus:ring-offset-gray-900 disabled:opacity-50"
                                            />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-100">
                                                {step.label}
                                                {step.locked && <span className="ml-2 text-xs text-gray-500 font-normal uppercase tracking-wide">Required</span>}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.desc}</p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    <Divider />

                    {/* ── SECTION 6 · Docking Settings ── */}
                    <section className={`space-y-6 ${toxOnly || !pipelineSteps.docking ? "opacity-40 pointer-events-none select-none" : ""}`}>
                        <SectionLabel>Docking Settings</SectionLabel>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <label className="text-xs font-medium text-gray-300">Max Compounds to Dock (Top N)</label>
                                <div className="flex flex-wrap gap-2">
                                    {DOCKING_COUNT_PRESETS.map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => { setDockingCountCustom(false); onMaxDockingCompoundsChange(val); }}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!dockingCountCustom && maxDockingCompounds === val
                                                ? "bg-primary text-white shadow-sm"
                                                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                                }`}
                                        >
                                            Top {val}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setDockingCountCustom(true)}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dockingCountCustom || isCustomCount
                                            ? "bg-primary text-white shadow-sm"
                                            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                            }`}
                                    >
                                        Custom
                                    </button>
                                </div>

                                {(dockingCountCustom || isCustomCount) && (
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range" min={1} max={50}
                                            value={maxDockingCompounds}
                                            onChange={(e) => onMaxDockingCompoundsChange(parseInt(e.target.value))}
                                            className="flex-1 accent-primary"
                                        />
                                        <span className="text-sm font-mono font-semibold text-gray-200 w-8 text-right">{maxDockingCompounds}</span>
                                    </div>
                                )}

                                <div className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs ${dockingTimeSev === "heavy"
                                    ? "border-red-900/50 bg-red-950/20 text-red-400"
                                    : dockingTimeSev === "warn"
                                        ? "border-yellow-900/50 bg-yellow-950/20 text-yellow-400"
                                        : "border-gray-800 bg-gray-900/30 text-gray-400"
                                    }`}>
                                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold">Estimated compute: {dockingTimeStr}</p>
                                        <p className="mt-0.5 opacity-75">~{activeSpeed.minPerCompound} min/compound · {maxDockingCompounds} compound{maxDockingCompounds !== 1 ? "s" : ""}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-medium text-gray-300">Vina Exhaustiveness</label>
                                <div className="space-y-2">
                                    {DOCKING_SPEEDS.map((speed) => (
                                        <label
                                            key={speed.value}
                                            className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${dockingSpeed === speed.value
                                                ? "bg-primary/10 border-primary/60 text-white"
                                                : "bg-gray-800/30 border-gray-700/60 text-gray-300 hover:bg-gray-800 hover:border-gray-600"
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="radio" name="dockingSpeed" value={speed.value}
                                                    checked={dockingSpeed === speed.value}
                                                    onChange={(e) => onDockingSpeedChange(e.target.value as DockingSpeed)}
                                                    className="text-primary focus:ring-primary bg-gray-900 border-gray-600"
                                                />
                                                <span className="text-sm font-semibold">{speed.label}</span>
                                            </div>
                                            <span className="text-xs text-gray-500 font-mono">{speed.desc}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                </div>
            )}
        </div>
    );
}