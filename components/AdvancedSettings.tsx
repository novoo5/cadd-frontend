"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Zap, FlaskConical, CheckCircle2 } from "lucide-react";
import type {
    PipelineSteps,
    DockingSpeed,
    BindingSiteMode,
    BindingSiteCoords,
    BindingSiteResidues,
    SolubilityFilterMode,
} from "@/lib/api";


// ── Props ─────────────────────────────────────────────────────────────────────

interface AdvancedSettingsProps {
    // ← was: 10 | 25 | 50  — now any number 1–1000
    numAnalogues: number;
    onNumAnaloguesChange: (v: number) => void;

    pipelineSteps: PipelineSteps;
    onPipelineStepsChange: (v: PipelineSteps) => void;

    dockingSpeed: DockingSpeed;
    onDockingSpeedChange: (v: DockingSpeed) => void;

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

    // null = "Ignore completely"
    maxLipinskiViolations: number | null;
    onMaxLipinskiViolationsChange: (v: number | null) => void;

    // ← NEW
    solubilityFilter: SolubilityFilterMode;
    onSolubilityFilterChange: (v: SolubilityFilterMode) => void;

    // ← NEW
    toxicityReportOnly: boolean;
    onToxicityReportOnlyChange: (v: boolean) => void;
}


// ── Static config ─────────────────────────────────────────────────────────────

const STEPS: {
    key: keyof PipelineSteps;
    label: string;
    desc: string;
    locked?: boolean;
}[] = [
        {
            key: "drug_likeness",
            label: "Drug-likeness Filter",
            desc: "Lipinski RO5 + ESOL solubility (RDKit)",
            locked: true,
        },
        {
            key: "admet",
            label: "ADMET Toxicity Filter",
            desc: "hERG, hepatotox, Caco-2, bioavailability (ADMET-AI) — flags include severity, implication & redesign tip",
        },
        {
            key: "binding_prefilter",
            label: "ML Binding Pre-filter",
            desc: "GNN affinity ranking, keeps top 10 for docking (DeepChem)",
        },
        {
            key: "docking",
            label: "Molecular Docking",
            desc: "AutoDock Vina with CNN rescoring (heavy compute)",
        },
        {
            key: "retrosynthesis",
            label: "Retrosynthesis",
            desc: "SA Score feasibility + AiZynthFinder route planning",
        },
    ];

const DOCKING_SPEEDS: { value: DockingSpeed; label: string; desc: string }[] = [
    { value: "fast", label: "Fast", desc: "exhaustiveness=8, ~5 min/compound" },
    { value: "balanced", label: "Balanced", desc: "exhaustiveness=16, ~10 min/compound" },
    { value: "thorough", label: "Thorough", desc: "exhaustiveness=32, ~20 min/compound" },
];

const VIOLATION_OPTIONS: { value: string; label: string }[] = [
    { value: "1", label: "Strict — ≤1 violation (classic RO5)" },
    { value: "2", label: "Relaxed — ≤2 violations" },
    { value: "3", label: "Lenient — ≤3 violations" },
    { value: "null", label: "Ignore completely (no filter)" },
];

const SOLUBILITY_OPTIONS: {
    value: SolubilityFilterMode;
    label: string;
    desc: string;
    badge: string;
}[] = [
        {
            value: "soluble_only",
            label: "Soluble only",
            desc: "logS > −3 — highly soluble + soluble (aqueous assay-ready)",
            badge: "🟢",
        },
        {
            value: "allow_slightly",
            label: "Include slightly soluble",
            desc: "logS > −5 — adds slightly soluble (may need formulation aid)",
            badge: "🟡",
        },
        {
            value: "all",
            label: "All (no filter)",
            desc: "No solubility restriction — default behaviour",
            badge: "⚪",
        },
    ];

// Quick-select counts shown as buttons
const ANALOGUE_PRESETS = [25, 50, 100, 250, 500] as const;


// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedSettings({
    numAnalogues,
    onNumAnaloguesChange,
    pipelineSteps,
    onPipelineStepsChange,
    dockingSpeed,
    onDockingSpeedChange,
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
}: AdvancedSettingsProps) {
    const [open, setOpen] = useState(false);

    const toggleStep = (key: keyof PipelineSteps) => {
        if (key === "drug_likeness") return;
        onPipelineStepsChange({ ...pipelineSteps, [key]: !pipelineSteps[key] });
    };

    const violationSelectValue =
        maxLipinskiViolations === null ? "null" : String(maxLipinskiViolations);

    const handleViolationChange = (raw: string) => {
        onMaxLipinskiViolationsChange(raw === "null" ? null : parseInt(raw, 10));
    };

    // Analogues section is disabled in both direct-score and toxicity-only modes
    // (toxicity-only can still use analogues but controlled separately via num_analogues)
    const analoguesDisabled = directScoreOnly;

    return (
        <div className="card mt-4">
            {/* ── Header toggle ───────────────────────────────────────────── */}
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors"
            >
                <span className="flex items-center gap-2">
                    <span className="text-gray-500">⚙</span>
                    Advanced Settings
                    {directScoreOnly && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-900/50 border border-violet-700 text-violet-300">
                            <Zap className="w-2.5 h-2.5" /> Direct Score
                        </span>
                    )}
                    {toxicityReportOnly && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/50 border border-red-700 text-red-300">
                            <FlaskConical className="w-2.5 h-2.5" /> Toxicity Only
                        </span>
                    )}
                </span>
                {open
                    ? <ChevronUp className="w-4 h-4 text-gray-500" />
                    : <ChevronDown className="w-4 h-4 text-gray-500" />
                }
            </button>

            {open && (
                <div className="mt-5 space-y-6 animate-slide-up">

                    {/* ── 1. Toxicity Report Only ──────────────────────────── */}
                    <div className={`p-3 rounded-xl border transition-all ${toxicityReportOnly
                            ? "bg-red-950/30 border-red-700"
                            : "bg-gray-800/30 border-gray-800"
                        }`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-start gap-2">
                                <FlaskConical className={`w-4 h-4 mt-0.5 flex-shrink-0 ${toxicityReportOnly ? "text-red-400" : "text-gray-500"
                                    }`} />
                                <div>
                                    <p className="text-sm font-medium text-gray-200">
                                        Toxicity Report Only
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Skip docking and retrosynthesis entirely. Run only ADMET
                                        toxicity analysis on your compound (and analogues if requested).
                                        No PDB file required — ideal for rapid tox profiling before
                                        committing to a full docking run.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onToxicityReportOnlyChange(!toxicityReportOnly)}
                                className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${toxicityReportOnly ? "bg-red-600" : "bg-gray-700"
                                    }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${toxicityReportOnly ? "translate-x-[1.125rem]" : "translate-x-0"
                                    }`} />
                            </button>
                        </div>
                    </div>

                    {/* ── 2. Direct Score Mode ─────────────────────────────── */}
                    <div className={`p-3 rounded-xl border transition-all ${directScoreOnly
                            ? "bg-violet-950/30 border-violet-700"
                            : "bg-gray-800/30 border-gray-800"
                        }`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-start gap-2">
                                <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${directScoreOnly ? "text-violet-400" : "text-gray-500"
                                    }`} />
                                <div>
                                    <p className="text-sm font-medium text-gray-200">
                                        Direct Score Mode
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Skip analogue generation — score your input SMILES directly
                                        through the full pipeline. Ideal for benchmarking known compounds.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onDirectScoreOnlyChange(!directScoreOnly)}
                                className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${directScoreOnly ? "bg-violet-600" : "bg-gray-700"
                                    }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${directScoreOnly ? "translate-x-[1.125rem]" : "translate-x-0"
                                    }`} />
                            </button>
                        </div>
                    </div>

                    {/* ── 3. Number of analogues (1–1000) ─────────────────── */}
                    <div className={analoguesDisabled ? "opacity-40 pointer-events-none" : ""}>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                            Analogues to Generate
                            {analoguesDisabled && (
                                <span className="ml-2 normal-case text-violet-400 font-normal">
                                    disabled in direct score mode
                                </span>
                            )}
                        </label>

                        {/* Quick-select presets */}
                        <div className="flex gap-2 mb-2">
                            {ANALOGUE_PRESETS.map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => onNumAnaloguesChange(n)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${numAnalogues === n
                                            ? "bg-emerald-900/50 border-emerald-600 text-emerald-300"
                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                                        }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>

                        {/* Custom numeric input */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 flex-shrink-0">
                                Custom (1–1000):
                            </span>
                            <input
                                type="number"
                                min={1}
                                max={1000}
                                value={numAnalogues}
                                onChange={(e) => {
                                    const v = Math.max(1, Math.min(1000, parseInt(e.target.value) || 25));
                                    onNumAnaloguesChange(v);
                                }}
                                className="w-24 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-white focus:outline-none focus:border-emerald-600"
                            />
                            {numAnalogues >= 500 && (
                                <span className="text-[10px] text-yellow-500">
                                    ⚠ Large runs may take 30–90 min
                                </span>
                            )}
                        </div>
                        <p className="mt-1.5 text-xs text-gray-600">
                            Uses 5-strategy exhaustive mutation (BRICS, FG swaps, substituent
                            additions, atom mutations, chain edits) with 2nd-order mutations from
                            accepted analogues. Reliably fills the requested count up to 1000.
                        </p>
                    </div>

                    {/* ── 4. Solubility filter at generation time ──────────── */}
                    {!analoguesDisabled && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">
                                Solubility Filter{" "}
                                <span className="normal-case font-normal text-gray-600">
                                    (applied during generation)
                                </span>
                            </label>
                            <p className="text-xs text-gray-500 mb-2">
                                Uses the Delaney ESOL model to pre-screen analogues before they
                                enter the pipeline. Filters out insoluble compounds at source.
                            </p>
                            <div className="space-y-1.5">
                                {SOLUBILITY_OPTIONS.map(({ value, label, desc, badge }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onSolubilityFilterChange(value)}
                                        className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${solubilityFilter === value
                                                ? "bg-emerald-950/30 border-emerald-700"
                                                : "bg-gray-800/30 border-gray-800 hover:border-gray-700"
                                            }`}
                                    >
                                        <span className="mt-0.5 text-sm flex-shrink-0">{badge}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-medium ${solubilityFilter === value
                                                    ? "text-emerald-300"
                                                    : "text-gray-300"
                                                }`}>
                                                {label}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                                        </div>
                                        {solubilityFilter === value && (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 5. Pipeline steps ────────────────────────────────── */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                            Pipeline Steps
                        </label>
                        <div className="space-y-2">
                            {STEPS.map(({ key, label, desc, locked }) => {
                                // In toxicity-only mode, non-ADMET steps are force-skipped
                                const forceSkipped =
                                    toxicityReportOnly &&
                                    key !== "admet" &&
                                    key !== "drug_likeness";

                                return (
                                    <div
                                        key={key}
                                        className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${forceSkipped
                                                ? "opacity-40 bg-gray-900/20 border-gray-800"
                                                : pipelineSteps[key]
                                                    ? "bg-emerald-950/30 border-emerald-900"
                                                    : "bg-gray-800/30 border-gray-800"
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleStep(key)}
                                            disabled={locked || forceSkipped}
                                            className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${pipelineSteps[key] && !forceSkipped
                                                    ? "bg-emerald-600"
                                                    : "bg-gray-700"
                                                } ${locked || forceSkipped
                                                    ? "opacity-50 cursor-not-allowed"
                                                    : "cursor-pointer"
                                                }`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pipelineSteps[key] && !forceSkipped
                                                    ? "translate-x-[1.125rem]"
                                                    : "translate-x-0"
                                                }`} />
                                        </button>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm text-gray-200">{label}</span>
                                                {locked && (
                                                    <span className="badge-neutral text-[10px]">
                                                        always on
                                                    </span>
                                                )}
                                                {forceSkipped && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800 border border-gray-700 text-gray-500">
                                                        skipped in tox-only mode
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">{desc}</p>

                                            {/* ADMET — show what flags will include */}
                                            {key === "admet" && pipelineSteps.admet && (
                                                <div className="mt-2 p-2 rounded-lg bg-gray-900/60 border border-gray-800">
                                                    <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1">
                                                        Each flag reports
                                                    </p>
                                                    <div className="space-y-0.5">
                                                        {[
                                                            { prop: "hERG Inhibition", thresh: ">0.50", risk: "cardiac arrhythmia" },
                                                            { prop: "Hepatotoxicity", thresh: ">0.50", risk: "liver toxicity (DILI)" },
                                                            { prop: "Caco-2 Permeability", thresh: "<−5.15 log", risk: "poor oral absorption" },
                                                            { prop: "Oral Bioavailability", thresh: "<0.30", risk: "poor systemic exposure" },
                                                            { prop: "BBB Penetration", thresh: "<0.30", risk: "limited CNS exposure (info only)" },
                                                        ].map(({ prop, thresh, risk }) => (
                                                            <div key={prop} className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] text-gray-400 truncate">{prop}</span>
                                                                <span className="text-[10px] text-gray-600 flex-shrink-0">
                                                                    {thresh} → {risk}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-gray-600 mt-1.5">
                                                        Includes: measured value · threshold · severity ·
                                                        clinical implication · redesign recommendation
                                                    </p>
                                                </div>
                                            )}

                                            {/* MW range + Lipinski violations — under drug_likeness */}
                                            {key === "drug_likeness" && (
                                                <div className="mt-3 space-y-3">
                                                    {/* MW range */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex flex-col gap-0.5">
                                                            <label className="text-[10px] text-gray-500">Min MW (Da)</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={mwMax - 1}
                                                                value={mwMin}
                                                                onChange={(e) => onMwMinChange(Number(e.target.value))}
                                                                className="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-white focus:outline-none focus:border-emerald-600"
                                                            />
                                                        </div>
                                                        <span className="text-gray-600 mt-4">—</span>
                                                        <div className="flex flex-col gap-0.5">
                                                            <label className="text-[10px] text-gray-500">Max MW (Da)</label>
                                                            <input
                                                                type="number"
                                                                min={mwMin + 1}
                                                                max={1000}
                                                                value={mwMax}
                                                                onChange={(e) => onMwMaxChange(Number(e.target.value))}
                                                                className="w-20 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-xs text-white focus:outline-none focus:border-emerald-600"
                                                            />
                                                        </div>
                                                        {(mwMin !== 200 || mwMax !== 500) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => { onMwMinChange(200); onMwMaxChange(500); }}
                                                                className="text-[10px] text-gray-500 hover:text-emerald-400 transition-colors mt-4"
                                                            >
                                                                reset
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Max Lipinski violations */}
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                                                            Max Lipinski Violations Allowed
                                                        </label>
                                                        <select
                                                            value={violationSelectValue}
                                                            onChange={(e) => handleViolationChange(e.target.value)}
                                                            className="w-full px-2 py-1.5 rounded bg-gray-800 border border-gray-700 text-xs text-white focus:outline-none focus:border-emerald-600 cursor-pointer"
                                                        >
                                                            {VIOLATION_OPTIONS.map((opt) => (
                                                                <option key={opt.value} value={opt.value}>
                                                                    {opt.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <p className="text-[10px] text-gray-600">
                                                            {maxLipinskiViolations === null
                                                                ? "⚠ All compounds pass — no drug-likeness filtering applied."
                                                                : maxLipinskiViolations === 1
                                                                    ? "Classic Lipinski RO5 — recommended for oral drug candidates."
                                                                    : `Looser filter — allows compounds with up to ${maxLipinskiViolations} rule violations.`
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 6. Docking speed ─────────────────────────────────── */}
                    {pipelineSteps.docking && !toxicityReportOnly && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                                Docking Speed
                            </label>
                            <div className="space-y-2">
                                {DOCKING_SPEEDS.map(({ value, label, desc }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onDockingSpeedChange(value)}
                                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${dockingSpeed === value
                                                ? "bg-emerald-950/30 border-emerald-700 text-emerald-300"
                                                : "bg-gray-800/30 border-gray-800 text-gray-400 hover:border-gray-700"
                                            }`}
                                    >
                                        <span className="text-sm font-medium">{label}</span>
                                        <span className="text-xs text-gray-500">{desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 7. Binding site ───────────────────────────────────── */}
                    {pipelineSteps.docking && !toxicityReportOnly && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                                Binding Site Definition
                            </label>
                            <div className="flex gap-2 mb-3">
                                {(["auto", "coordinates", "residues"] as BindingSiteMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onBindingSiteModeChange(mode)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${bindingSiteMode === mode
                                                ? "bg-emerald-900/50 border-emerald-600 text-emerald-300"
                                                : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600"
                                            }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>

                            {bindingSiteMode === "auto" && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-950/20 border border-blue-900/50">
                                    <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                                    <p className="text-xs text-blue-300">
                                        Auto-detect uses the co-crystallized ligand centroid if present
                                        in the PDB file, otherwise falls back to full-protein blind docking.
                                    </p>
                                </div>
                            )}

                            {bindingSiteMode === "coordinates" && (
                                <div className="grid grid-cols-2 gap-2">
                                    {(["x", "y", "z"] as const).map((axis) => (
                                        <div key={axis}>
                                            <label className="block text-xs text-gray-500 mb-1">
                                                Center {axis.toUpperCase()}
                                            </label>
                                            <input
                                                type="number"
                                                className="input-base"
                                                value={bindingSiteCoords[axis]}
                                                onChange={(e) =>
                                                    onBindingSiteCoordsChange({
                                                        ...bindingSiteCoords,
                                                        [axis]: parseFloat(e.target.value) || 0,
                                                    })
                                                }
                                                placeholder="0.0"
                                                step={0.1}
                                            />
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Box Size</label>
                                        <input
                                            type="number"
                                            className="input-base"
                                            value={bindingSiteCoords.box_size}
                                            onChange={(e) =>
                                                onBindingSiteCoordsChange({
                                                    ...bindingSiteCoords,
                                                    box_size: parseFloat(e.target.value) || 20,
                                                })
                                            }
                                            placeholder="20.0"
                                            step={0.5}
                                            min={10}
                                            max={60}
                                        />
                                    </div>
                                </div>
                            )}

                            {bindingSiteMode === "residues" && (
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Chain ID</label>
                                        <input
                                            type="text"
                                            className="input-base"
                                            value={bindingSiteResidues.chain}
                                            onChange={(e) =>
                                                onBindingSiteResiduesChange({
                                                    ...bindingSiteResidues,
                                                    chain: e.target.value.toUpperCase().slice(0, 1),
                                                })
                                            }
                                            placeholder="A"
                                            maxLength={1}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Residue Start</label>
                                        <input
                                            type="number"
                                            className="input-base"
                                            value={bindingSiteResidues.residue_start}
                                            onChange={(e) =>
                                                onBindingSiteResiduesChange({
                                                    ...bindingSiteResidues,
                                                    residue_start: parseInt(e.target.value) || 1,
                                                })
                                            }
                                            placeholder="1"
                                            min={1}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Residue End</label>
                                        <input
                                            type="number"
                                            className="input-base"
                                            value={bindingSiteResidues.residue_end}
                                            onChange={(e) =>
                                                onBindingSiteResiduesChange({
                                                    ...bindingSiteResidues,
                                                    residue_end: parseInt(e.target.value) || 100,
                                                })
                                            }
                                            placeholder="100"
                                            min={1}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
