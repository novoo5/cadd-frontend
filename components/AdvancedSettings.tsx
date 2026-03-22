"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info, Zap } from "lucide-react";
import type {
    PipelineSteps,
    DockingSpeed,
    BindingSiteMode,
    BindingSiteCoords,
    BindingSiteResidues,
} from "@/lib/api";

interface AdvancedSettingsProps {
    numAnalogues: 10 | 25 | 50;
    onNumAnaloguesChange: (v: 10 | 25 | 50) => void;
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
}

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
}: AdvancedSettingsProps) {
    const [open, setOpen] = useState(false);

    const toggleStep = (key: keyof PipelineSteps) => {
        if (key === "drug_likeness") return;
        onPipelineStepsChange({ ...pipelineSteps, [key]: !pipelineSteps[key] });
    };

    const STEPS: { key: keyof PipelineSteps; label: string; desc: string; locked?: boolean }[] = [
        { key: "drug_likeness", label: "Drug-likeness Filter", desc: "Lipinski RO5 + ESOL solubility (RDKit)", locked: true },
        { key: "admet", label: "ADMET Toxicity Filter", desc: "hERG, hepatotox, bioavailability (ADMET-AI)" },
        { key: "binding_prefilter", label: "ML Binding Pre-filter", desc: "GNN affinity ranking, keeps top 5 for docking (DeepChem)" },
        { key: "docking", label: "Molecular Docking", desc: "GNINA 1.3 with CNN rescoring (heavy compute)" },
        { key: "retrosynthesis", label: "Retrosynthesis", desc: "Synthesis route planning, top 3 only (AiZynthFinder)" },
    ];

    const DOCKING_SPEEDS: { value: DockingSpeed; label: string; desc: string }[] = [
        { value: "fast", label: "Fast", desc: "exhaustiveness=8, ~5 min/compound" },
        { value: "balanced", label: "Balanced", desc: "exhaustiveness=16, ~10 min/compound" },
        { value: "thorough", label: "Thorough", desc: "exhaustiveness=32, ~20 min/compound" },
    ];

    // Dropdown options — value stored as string for <select>, converted on change
    const VIOLATION_OPTIONS: { value: string; label: string }[] = [
        { value: "1", label: "Strict — ≤1 violation (classic RO5)" },
        { value: "2", label: "Relaxed — ≤2 violations" },
        { value: "3", label: "Lenient — ≤3 violations" },
        { value: "null", label: "Ignore completely (no filter)" },
    ];

    const violationSelectValue =
        maxLipinskiViolations === null ? "null" : String(maxLipinskiViolations);

    const handleViolationChange = (raw: string) => {
        onMaxLipinskiViolationsChange(raw === "null" ? null : parseInt(raw, 10));
    };

    return (
        <div className="card mt-4">
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
                </span>
                {open ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                )}
            </button>

            {open && (
                <div className="mt-5 space-y-6 animate-slide-up">

                    {/* ── Direct Score Mode ─────────────────────────────── */}
                    <div className={`p-3 rounded-xl border transition-all ${directScoreOnly ? "bg-violet-950/30 border-violet-700" : "bg-gray-800/30 border-gray-800"}`}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-start gap-2">
                                <Zap className={`w-4 h-4 mt-0.5 flex-shrink-0 ${directScoreOnly ? "text-violet-400" : "text-gray-500"}`} />
                                <div>
                                    <p className="text-sm font-medium text-gray-200">Direct Score Mode</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Skip analogue generation — score your input SMILES directly through the full pipeline. Ideal for benchmarking known compounds.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onDirectScoreOnlyChange(!directScoreOnly)}
                                className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${directScoreOnly ? "bg-violet-600" : "bg-gray-700"}`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${directScoreOnly ? "translate-x-[1.125rem]" : "translate-x-0"}`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* ── Number of analogues ───────────────────────────── */}
                    <div className={directScoreOnly ? "opacity-40 pointer-events-none" : ""}>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                            Analogues to Generate
                            {directScoreOnly && (
                                <span className="ml-2 normal-case text-violet-400 font-normal">disabled in direct mode</span>
                            )}
                        </label>
                        <div className="flex gap-2">
                            {([10, 25, 50] as const).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => onNumAnaloguesChange(n)}
                                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${numAnalogues === n
                                            ? "bg-emerald-900/50 border-emerald-600 text-emerald-300"
                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                                        }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-gray-600">
                            More analogues = broader chemical space explored, but slower total pipeline time.
                        </p>
                    </div>

                    {/* ── Pipeline steps ────────────────────────────────── */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                            Pipeline Steps
                        </label>
                        <div className="space-y-2">
                            {STEPS.map(({ key, label, desc, locked }) => (
                                <div
                                    key={key}
                                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${pipelineSteps[key]
                                            ? "bg-emerald-950/30 border-emerald-900"
                                            : "bg-gray-800/30 border-gray-800"
                                        }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleStep(key)}
                                        disabled={locked}
                                        className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${pipelineSteps[key] ? "bg-emerald-600" : "bg-gray-700"
                                            } ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                                    >
                                        <span
                                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pipelineSteps[key] ? "translate-x-[1.125rem]" : "translate-x-0"
                                                }`}
                                        />
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-200">{label}</span>
                                            {locked && (
                                                <span className="badge-neutral text-[10px]">always on</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>

                                        {/* MW range + Lipinski violations — only under drug_likeness */}
                                        {key === "drug_likeness" && (
                                            <div className="mt-3 space-y-3">

                                                {/* MW range inputs */}
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

                                                {/* ── Max Lipinski Violations dropdown ── */}
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
                                                                : `Looser filter — allows compounds with up to ${maxLipinskiViolations} rule violations.`}
                                                    </p>
                                                </div>

                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Docking speed ─────────────────────────────────── */}
                    {pipelineSteps.docking && (
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

                    {/* ── Binding site ──────────────────────────────────── */}
                    {pipelineSteps.docking && (
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
                                        Auto-detect uses the co-crystallized ligand centroid if present in the PDB file, otherwise falls back to full-protein blind docking.
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
