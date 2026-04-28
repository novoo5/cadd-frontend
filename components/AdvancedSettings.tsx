"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Zap, FlaskConical, CheckCircle2, Lock, X, Clock, ShieldAlert } from "lucide-react";
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
    // ← NEW ADMET Config
    admetConfig: ADMETTuningConfig;
    onAdmetConfigChange: (v: ADMETTuningConfig) => void;
}

// ── Static config ─────────────────────────────────────────────────────────────

const STEPS: { key: keyof PipelineSteps; label: string; desc: string; locked?: boolean }[] = [
    { key: "drug_likeness", label: "Drug-likeness Filter", desc: "Lipinski RO5 + ESOL solubility (RDKit)", locked: true },
    { key: "admet", label: "ADMET Toxicity Filter", desc: "hERG, hepatotox, Caco-2, bioavailability (ADMET-AI). flags include severity, implication & redesign tip" },
    { key: "binding_prefilter", label: "ML Binding Pre-filter", desc: "GNN affinity ranking ranks all surviving compounds, sends the top N for docking (DeepChem AttentiveFP). N is controlled by the 'Max Compounds to Dock' setting below." },
    { key: "docking", label: "Molecular Docking", desc: "AutoDock Vina with CNN rescoring (heavy compute)" },
    { key: "retrosynthesis", label: "Retrosynthesis", desc: "SA Score + feasibility (AiZynthFinder route planning)" },
];

const DOCKING_SPEEDS: { value: DockingSpeed; label: string; desc: string; minPerCompound: number }[] = [
    { value: "fast", label: "Fast", desc: "exhaustiveness=8, ~5 min/compound", minPerCompound: 5 },
    { value: "balanced", label: "Balanced", desc: "exhaustiveness=16, ~10 min/compound", minPerCompound: 10 },
    { value: "thorough", label: "Thorough", desc: "exhaustiveness=32, ~20 min/compound", minPerCompound: 20 },
];

const DOCKING_COUNT_PRESETS = [10, 25, 50] as const;

const VIOLATION_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "Strict (≤1 violation, classic RO5)" },
    { value: "2", label: "Relaxed (≤2 violations)" },
    { value: "3", label: "Lenient (≤3 violations)" },
    { value: "null", label: "Ignore completely (no filter)" },
];

const SOLUBILITY_OPTIONS: { value: SolubilityFilterMode; label: string; desc: string; badge: string }[] = [
    { value: "soluble_only", label: "Soluble only", desc: "logS > -3: highly soluble / aqueous assay-ready", badge: "🟢" },
    { value: "allow_slightly", label: "Include slightly soluble", desc: "logS > -5: adds slightly soluble (may need formulation aid)", badge: "🟡" },
    { value: "all", label: "All (no filter)", desc: "No solubility restriction (default behaviour)", badge: "⚪" },
];

const SCAFFOLD_PRESETS = [
    { label: "Quinolone (fluoroquinolones)", smarts: "c1ccc2cc1C(=O)c1ccccc1N2", hint: "Locks the bicyclic quinolone ring (preserves antibiotic pharmacophore)" },
    { label: "Benzimidazole", smarts: "c1ccc2nHcnc2c1", hint: "Locks the fused benzimidazole core" },
    { label: "Flavone (Quercetin core)", smarts: "O=c1cc(-c2ccccc2)oc2ccccc12", hint: "Locks the 2-phenyl-4H-chromen-4-one scaffold" },
    { label: "Purine (kinase hinge)", smarts: "c1nc2nHcnc2n1", hint: "Locks adenine-like purine scaffold (for kinase binding)" },
    { label: "Indole", smarts: "c1ccc2nHccc2c1", hint: "Locks the bicyclic indole ring system" },
];

const ANALOGUE_PRESETS = [25, 50, 100, 500, 1000] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDockingTime(compounds: number, minPerCompound: number): string {
    const total = compounds * minPerCompound;
    if (total < 60) return `${total} min`;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function dockingTimeSeverity(compounds: number, minPerCompound: number): "ok" | "warn" | "heavy" {
    const total = compounds * minPerCompound;
    if (total <= 60) return "ok";
    if (total <= 300) return "warn";
    return "heavy";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedSettings({
    numAnalogues,
    onNumAnaloguesChange,
    pipelineSteps,
    onPipelineStepsChange,
    dockingSpeed,
    onDockingSpeedChange,
    maxDockingCompounds,
    onMaxDockingCompoundsChange,
    bindingSiteMode,
    onBindingSiteModeChange,
    bindingSiteCoords,
    onBindingSiteCoordsChange,
    bindingSiteResidues,
    onBindingSiteResiduesChange,
    directScoreOnly,
    onDirectScoreOnlyChange,
    mwMin,
    mwMax,
    onMwMinChange,
    onMwMaxChange,
    maxLipinskiViolations,
    onMaxLipinskiViolationsChange,
    solubilityFilter,
    onSolubilityFilterChange,
    toxicityReportOnly,
    onToxicityReportOnlyChange,
    lockedScaffoldSmarts,
    onLockedScaffoldSmartsChange,
    admetConfig,
    onAdmetConfigChange,
}: AdvancedSettingsProps) {
    const [open, setOpen] = useState(false);
    const [scaffoldPresetOpen, setScaffoldPresetOpen] = useState(false);
    const [dockingCountCustom, setDockingCountCustom] = useState(false);

    const toxOnly = toxicityReportOnly && !directScoreOnly;
    const bothModes = toxicityReportOnly && directScoreOnly;

    const toggleStep = (key: keyof PipelineSteps) => {
        if (key === "drug_likeness") return;
        onPipelineStepsChange({ ...pipelineSteps, [key]: !pipelineSteps[key] });
    };

    const violationSelectValue = maxLipinskiViolations === null ? "null" : String(maxLipinskiViolations);
    const handleViolationChange = (raw: string) => {
        onMaxLipinskiViolationsChange(raw === "null" ? null : parseInt(raw, 10));
    };

    // ── ADMET Handlers ──────────────────────────────────────────────────────────

    const handleAdmetPresetChange = (preset: ADMETPreset) => {
        const defaults = ADMET_PRESET_DEFAULTS[preset];
        // Merge the selected preset's defaults into the current config, preserving any fields the preset doesn't touch.
        onAdmetConfigChange({
            ...admetConfig,
            ...defaults,
            preset: preset,
        });
    };

    const handleAdmetThresholdChange = (
        endpoint: "herg_inhibition" | "hepatotoxicity",
        field: "cutoff" | "severity_high",
        value: number
    ) => {
        const currentEndpoint = admetConfig[endpoint] || ADMET_PRESET_DEFAULTS.balanced![endpoint]!;
        onAdmetConfigChange({
            ...admetConfig,
            preset: "custom", // Switch to custom if they manually drag a slider
            [endpoint]: {
                ...currentEndpoint,
                [field]: value,
            },
        });
    };

    const analoguesDisabled = directScoreOnly;

    // Time estimate for docking
    const activeSpeed = DOCKING_SPEEDS.find((s) => s.value === dockingSpeed)!;
    const dockingTimeStr = formatDockingTime(maxDockingCompounds, activeSpeed.minPerCompound);
    const dockingTimeSev = dockingTimeSeverity(maxDockingCompounds, activeSpeed.minPerCompound);
    const isCustomCount = !DOCKING_COUNT_PRESETS.includes(maxDockingCompounds as typeof DOCKING_COUNT_PRESETS[number]);

    return (
        <div className="card mt-4">
            {/* Header / toggle button */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <span className="text-gray-500">⚙</span> Advanced Settings
                    {directScoreOnly && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-900/50 border border-violet-700 text-violet-300">
                            <Zap className="w-2.5 h-2.5" /> Direct Score
                        </span>
                    )}
                    {toxicityReportOnly && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/50 border border-red-700 text-red-300">
                            <FlaskConical className="w-2.5 h-2.5" /> {bothModes ? "Tox + Direct" : "Toxicity Only"}
                        </span>
                    )}
                    {lockedScaffoldSmarts.trim() && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-900/50 border border-amber-700 text-amber-300">
                            <Lock className="w-2.5 h-2.5" /> Scaffold Lock
                        </span>
                    )}
                    {pipelineSteps.docking && !toxOnly && maxDockingCompounds !== 10 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-900/50 border border-blue-700 text-blue-300">
                            Top {maxDockingCompounds} docked
                        </span>
                    )}
                    {admetConfig.preset !== "balanced" && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-900/50 border border-emerald-700 text-emerald-300">
                            <ShieldAlert className="w-2.5 h-2.5" /> {admetConfig.preset} ADMET
                        </span>
                    )}
                </span>
                {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            {open && (
                <div className="mt-6 space-y-8 animate-in fade-in slide-in-from-top-2 duration-200">

                    {/* Mode Overrides */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/30 cursor-pointer hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center h-5">
                                <input
                                    type="checkbox"
                                    checked={directScoreOnly}
                                    onChange={(e) => onDirectScoreOnlyChange(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary focus:ring-offset-gray-900"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-200 flex items-center gap-1">
                                    <Zap className="w-3.5 h-3.5 text-violet-400" /> Direct Score Only
                                </span>
                                <span className="text-xs text-gray-500 mt-1">
                                    Skip analogue generation. Runs the base compound straight through the pipeline.
                                </span>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-800 bg-gray-900/30 cursor-pointer hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-center h-5">
                                <input
                                    type="checkbox"
                                    checked={toxicityReportOnly}
                                    onChange={(e) => onToxicityReportOnlyChange(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary focus:ring-primary focus:ring-offset-gray-900"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-200 flex items-center gap-1">
                                    <FlaskConical className="w-3.5 h-3.5 text-red-400" /> Toxicity Report Only
                                </span>
                                <span className="text-xs text-gray-500 mt-1">
                                    Forces ADMET on all compounds and skips PDB/docking entirely. Fast profiling.
                                </span>
                            </div>
                        </label>
                    </div>

                    <div className="h-px bg-gray-800/50" />

                    {/* Analogue Generation & Scaffold */}
                    <div className={`space-y-4 ${analoguesDisabled ? "opacity-50 pointer-events-none" : ""}`}>
                        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                            Analogue Generation
                            {analoguesDisabled && <span className="text-xs text-violet-400 font-normal ml-2">(Disabled by Direct Score mode)</span>}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Number of Analogues (Max 1000)</label>
                                <div className="flex flex-wrap gap-2">
                                    {ANALOGUE_PRESETS.map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => onNumAnaloguesChange(val)}
                                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${numAnalogues === val ? "bg-primary text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                                }`}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                    <div className="relative flex-1 min-w-[100px]">
                                        <input
                                            type="number"
                                            min={1}
                                            max={1000}
                                            value={numAnalogues}
                                            onChange={(e) => onNumAnaloguesChange(parseInt(e.target.value) || 25)}
                                            className="w-full h-full min-h-[32px] px-3 rounded bg-gray-800 border-none text-xs text-gray-200 focus:ring-1 focus:ring-primary placeholder:text-gray-600"
                                            placeholder="Custom..."
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs text-gray-400 flex items-center justify-between">
                                    Lock Core Scaffold (SMARTS)
                                    {lockedScaffoldSmarts && (
                                        <button onClick={() => onLockedScaffoldSmartsChange("")} className="text-gray-500 hover:text-red-400">
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
                                        className="text-[11px] text-primary hover:text-primary-hover flex items-center gap-1"
                                    >
                                        Select common scaffold pattern <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {scaffoldPresetOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 overflow-hidden">
                                            <div className="p-2 space-y-1">
                                                {SCAFFOLD_PRESETS.map((p) => (
                                                    <button
                                                        key={p.label}
                                                        type="button"
                                                        onClick={() => { onLockedScaffoldSmartsChange(p.smarts); setScaffoldPresetOpen(false); }}
                                                        className="w-full text-left p-2 rounded hover:bg-gray-700 group transition-colors"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs font-medium text-gray-200">{p.label}</span>
                                                            <span className="text-[10px] font-mono text-gray-500 group-hover:text-primary transition-colors">{p.smarts}</span>
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 mt-1">{p.hint}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-800/50" />

                    {/* Drug-likeness & Solubility */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-200">Drug-likeness Limits</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Molecular Weight Range (Da)</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={mwMin}
                                        onChange={(e) => onMwMinChange(Number(e.target.value))}
                                        className="input w-full text-xs placeholder:Min"
                                    />
                                    <span className="text-gray-600">-</span>
                                    <input
                                        type="number"
                                        value={mwMax}
                                        onChange={(e) => onMwMaxChange(Number(e.target.value))}
                                        className="input w-full text-xs placeholder:Max"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Lipinski Filter</label>
                                <select
                                    value={violationSelectValue}
                                    onChange={(e) => handleViolationChange(e.target.value)}
                                    className="input w-full text-xs"
                                >
                                    {VIOLATION_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Solubility Filter (logS)</label>
                                <select
                                    value={solubilityFilter}
                                    onChange={(e) => onSolubilityFilterChange(e.target.value as SolubilityFilterMode)}
                                    className="input w-full text-xs"
                                >
                                    {SOLUBILITY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.badge} {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-[11px] text-gray-500">
                                    {SOLUBILITY_OPTIONS.find((o) => o.value === solubilityFilter)?.desc}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-800/50" />

                    {/* NEW: ADMET Thresholds Tuning */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-emerald-400" />
                            ADMET Thresholds Tuning
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Presets */}
                            <div className="lg:col-span-4 space-y-3">
                                <label className="text-xs text-gray-400">Target Profile Preset</label>
                                <div className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => handleAdmetPresetChange("balanced")}
                                        className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${admetConfig.preset === "balanced"
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-600"
                                            }`}
                                    >
                                        <div className="font-medium">Balanced (Default)</div>
                                        <div className="text-[11px] opacity-70 mt-1">Standard safety thresholds suitable for most early discovery projects.</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdmetPresetChange("oral")}
                                        className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${admetConfig.preset === "oral"
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-600"
                                            }`}
                                    >
                                        <div className="font-medium">Oral-focused</div>
                                        <div className="text-[11px] opacity-70 mt-1">Stricter cutoffs for Caco-2 permeability and predicted oral bioavailability.</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdmetPresetChange("cns")}
                                        className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${admetConfig.preset === "cns"
                                                ? "bg-primary/10 border-primary text-primary"
                                                : "bg-gray-900/30 border-gray-800 text-gray-400 hover:border-gray-600"
                                            }`}
                                    >
                                        <div className="font-medium">CNS-focused</div>
                                        <div className="text-[11px] opacity-70 mt-1">Demands higher Blood-Brain Barrier (BBB) penetration scores.</div>
                                    </button>
                                </div>
                            </div>

                            {/* Sliders for Hard Fails */}
                            <div className="lg:col-span-8 space-y-5 bg-gray-900/20 p-4 rounded-xl border border-gray-800/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <h4 className="text-xs font-semibold text-red-400 tracking-wider uppercase">Critical Safety Limits (Hard Fails)</h4>
                                </div>
                                <div className="h-px bg-gray-800 flex-1" />

                                {/* hERG */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-sm font-medium text-gray-200">hERG Inhibition Risk</div>
                                            <div className="text-[11px] text-gray-500">Probability of binding hERG (cardiac arrhythmia risk). Lower is safer.</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-mono text-red-400 bg-red-950/30 px-2 py-1 rounded">
                                                Fail if &gt;{(admetConfig.herg_inhibition?.severity_high?.toFixed(2) ?? 0.85)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative pt-2 pb-6">
                                        <input
                                            type="range"
                                            min={0.5}
                                            max={0.95}
                                            step={0.05}
                                            value={admetConfig.herg_inhibition?.severity_high ?? 0.85}
                                            onChange={(e) => handleAdmetThresholdChange("herg_inhibition", "severity_high", parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="absolute w-full flex justify-between text-[10px] text-gray-600 mt-2 px-1">
                                            <span>Stricter (0.50)</span>
                                            <span>Relaxed (0.95)</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Hepatotoxicity */}
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-sm font-medium text-gray-200">Hepatotoxicity (DILI) Risk</div>
                                            <div className="text-[11px] text-gray-500">Probability of Drug-Induced Liver Injury. Lower is safer.</div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-mono text-red-400 bg-red-950/30 px-2 py-1 rounded">
                                                Fail if &gt;{(admetConfig.hepatotoxicity?.severity_high?.toFixed(2) ?? 0.85)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative pt-2 pb-2">
                                        <input
                                            type="range"
                                            min={0.5}
                                            max={0.95}
                                            step={0.05}
                                            value={admetConfig.hepatotoxicity?.severity_high ?? 0.85}
                                            onChange={(e) => handleAdmetThresholdChange("hepatotoxicity", "severity_high", parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary"
                                        />
                                        <div className="absolute w-full flex justify-between text-[10px] text-gray-600 mt-2 px-1">
                                            <span>Stricter (0.50)</span>
                                            <span>Relaxed (0.95)</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-800/50" />

                    {/* Active Pipeline Steps */}
                    <div className="space-y-4">
                        {toxOnly ? (
                            <div className="opacity-50 pointer-events-none">
                                <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                                    Active Pipeline Steps
                                    <span className="text-xs text-red-400 font-normal ml-2">(Overridden by Toxicity Report mode)</span>
                                </h3>
                            </div>
                        ) : (
                            <h3 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                                Active Pipeline Steps
                            </h3>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {STEPS.map((step) => {
                                let isChecked = pipelineSteps[step.key];
                                if (toxOnly) {
                                    if (step.key === "admet") isChecked = true;
                                    else if (step.key !== "drug_likeness") isChecked = false;
                                }

                                return (
                                    <label
                                        key={step.key}
                                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isChecked ? "bg-gray-800/50 border-gray-700 cursor-pointer" : "bg-transparent border-gray-800/50 hover:bg-gray-900/50 cursor-pointer"
                                            } ${step.locked ? "opacity-70 cursor-not-allowed" : ""}`}
                                    >
                                        <div className="flex items-center h-5">
                                            <input
                                                type="checkbox"
                                                disabled={step.locked || toxOnly}
                                                checked={isChecked}
                                                onChange={() => toggleStep(step.key)}
                                                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary focus:ring-offset-gray-900 disabled:opacity-50"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-gray-200">
                                                {step.label}
                                                {step.locked && (
                                                    <span className="ml-2 text-[10px] text-gray-500 uppercase tracking-wider">Required</span>
                                                )}
                                            </span>
                                            <span className="text-xs text-gray-500 mt-1">{step.desc}</span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="h-px bg-gray-800/50" />

                    {/* Docking Prefilter Tuning */}
                    <div className={`space-y-4 ${toxOnly || !pipelineSteps.docking ? "opacity-50 pointer-events-none" : ""}`}>
                        <h3 className="text-sm font-medium text-gray-200">Docking Pre-filter Tuning</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Max Compounds to Dock (Top N)</label>
                                <div className="flex flex-wrap gap-2">
                                    {DOCKING_COUNT_PRESETS.map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => {
                                                setDockingCountCustom(false);
                                                onMaxDockingCompoundsChange(val);
                                            }}
                                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${!dockingCountCustom && maxDockingCompounds === val ? "bg-primary text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                                }`}
                                        >
                                            Top {val}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setDockingCountCustom(true)}
                                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${dockingCountCustom || isCustomCount ? "bg-primary text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                                            }`}
                                    >
                                        Custom
                                    </button>
                                </div>
                                {(dockingCountCustom || isCustomCount) && (
                                    <div className="mt-2 flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={1}
                                            max={50}
                                            value={maxDockingCompounds}
                                            onChange={(e) => onMaxDockingCompoundsChange(parseInt(e.target.value))}
                                            className="w-full accent-primary"
                                        />
                                        <span className="text-sm font-mono text-gray-300 w-8">{maxDockingCompounds}</span>
                                    </div>
                                )}
                                <div className={`flex items-start gap-2 text-xs mt-2 p-2 rounded bg-gray-900/50 border ${dockingTimeSev === "heavy" ? "border-red-900/50 text-red-400" :
                                        dockingTimeSev === "warn" ? "border-yellow-900/50 text-yellow-400" :
                                            "border-gray-800 text-gray-400"
                                    }`}>
                                    <Clock className="w-4 h-4 shrink-0" />
                                    <div>
                                        <span className="font-medium">Estimated compute time: {dockingTimeStr}</span>
                                        <p className="opacity-80 mt-0.5">Vina runs ~{activeSpeed.minPerCompound} mins per compound on current settings.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs text-gray-400">Vina Exhaustiveness</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {DOCKING_SPEEDS.map((speed) => (
                                        <label
                                            key={speed.value}
                                            className={`flex items-center justify-between p-2.5 rounded border cursor-pointer transition-colors ${dockingSpeed === speed.value
                                                    ? "bg-primary/10 border-primary text-primary"
                                                    : "bg-gray-800/30 border-gray-700 text-gray-300 hover:bg-gray-800"
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="radio"
                                                    name="dockingSpeed"
                                                    value={speed.value}
                                                    checked={dockingSpeed === speed.value}
                                                    onChange={(e) => onDockingSpeedChange(e.target.value as DockingSpeed)}
                                                    className="text-primary focus:ring-primary bg-gray-900 border-gray-600"
                                                />
                                                <span className="text-sm font-medium">{speed.label}</span>
                                            </div>
                                            <span className="text-xs text-gray-500 font-mono">{speed.desc}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}