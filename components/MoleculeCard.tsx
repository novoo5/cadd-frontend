"use client";

import { useState } from "react";
import {
    ChevronDown, ChevronUp, Copy, CheckCheck,
    FlaskConical, Activity, Dna, GitBranch
} from "lucide-react";
import type { CompoundResult, ScoreBreakdown } from "@/lib/api";
import {
    getScoreColor, getAffinityColor,
    formatProbability, formatDuration, getScoreBreakdown
} from "@/lib/api";

interface MoleculeCardProps {
    compound: CompoundResult;
    jobId: string;
    index: number;
}

export default function MoleculeCard({ compound, jobId, index }: MoleculeCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
    const [breakdownLoading, setBreakdownLoading] = useState(false);

    const score = compound.final_score ?? 0;
    const scoreColor = getScoreColor(score);

    const copySmiles = () => {
        navigator.clipboard.writeText(compound.canonical_smiles);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExpand = async () => {
        setExpanded(!expanded);
        if (!expanded && !breakdown) {
            setBreakdownLoading(true);
            try {
                const data = await getScoreBreakdown(jobId, index);
                setBreakdown(data);
            } catch {
                // breakdown fetch failed — non-critical
            } finally {
                setBreakdownLoading(false);
            }
        }
    };

    // Score ring color based on score
    const ringStyle =
        score >= 70
            ? "border-emerald-500 text-emerald-400"
            : score >= 45
                ? "border-yellow-500 text-yellow-400"
                : "border-red-600 text-red-400";

    return (
        <div className="card-hover animate-fade-in">
            {/* ── Compact row ──────────────────────────────────────────────── */}
            <div className="flex items-center gap-4">

                {/* Rank + score ring */}
                <div className="flex-shrink-0 text-center">
                    <div className={`score-ring ${ringStyle}`}>
                        {score.toFixed(0)}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">#{compound.rank}</p>
                </div>

                {/* SMILES + copy */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="smiles-display">{compound.canonical_smiles}</span>
                        <button
                            onClick={copySmiles}
                            className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
                            title="Copy SMILES"
                        >
                            {copied
                                ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                                : <Copy className="w-3.5 h-3.5" />
                            }
                        </button>
                    </div>

                    {/* Quick stats row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        {compound.lipinski && (
                            <span className={compound.lipinski.passed ? "badge-pass" : "badge-fail"}>
                                Lipinski {compound.lipinski.passed ? "✓" : "✗"}
                            </span>
                        )}
                        {compound.admet && (
                            <span className={compound.admet.passed ? "badge-pass" : "badge-warn"}>
                                ADMET {compound.admet.flags.length === 0 ? "clean" : `${compound.admet.flags.length} flag${compound.admet.flags.length > 1 ? "s" : ""}`}
                            </span>
                        )}
                        {compound.docking && (
                            <span className={`text-xs font-mono font-medium ${getAffinityColor(compound.docking.best_affinity_kcal)}`}>
                                {compound.docking.best_affinity_kcal.toFixed(2)} kcal/mol
                            </span>
                        )}
                        {compound.retrosynthesis && (
                            <span className="text-xs text-gray-500">
                                {compound.retrosynthesis.feasible
                                    ? `${compound.retrosynthesis.num_steps} synthesis steps`
                                    : "synthesis: infeasible"}
                            </span>
                        )}
                    </div>
                </div>

                {/* Expand button */}
                <button
                    onClick={handleExpand}
                    className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors p-1"
                >
                    {expanded
                        ? <ChevronUp className="w-4 h-4" />
                        : <ChevronDown className="w-4 h-4" />
                    }
                </button>
            </div>

            {/* ── Expanded detail ───────────────────────────────────────────── */}
            {expanded && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-5 animate-slide-up">

                    {/* Full SMILES */}
                    <div>
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Canonical SMILES</p>
                        <p className="font-mono text-xs text-emerald-400 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 break-all">
                            {compound.canonical_smiles}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        {/* ── Lipinski detail ─────────────────────────────────────── */}
                        {compound.lipinski && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <FlaskConical className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Drug-likeness</p>
                                </div>
                                <div className="space-y-1">
                                    {[
                                        { label: "Mol. Weight", value: `${compound.lipinski.mw.toFixed(1)} Da`, ok: compound.lipinski.mw <= 500 },
                                        { label: "LogP", value: compound.lipinski.logp.toFixed(2), ok: compound.lipinski.logp <= 5 },
                                        { label: "H-bond donors", value: compound.lipinski.hbd, ok: compound.lipinski.hbd <= 5 },
                                        { label: "H-bond acceptors", value: compound.lipinski.hba, ok: compound.lipinski.hba <= 10 },
                                        { label: "LogS (solubility)", value: compound.lipinski.logs.toFixed(2), ok: compound.lipinski.logs >= -4 },
                                    ].map(({ label, value, ok }) => (
                                        <div key={label} className="flex justify-between text-xs">
                                            <span className="text-gray-500">{label}</span>
                                            <span className={ok ? "text-emerald-400" : "text-yellow-400"}>{value}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-xs pt-1 border-t border-gray-700">
                                        <span className="text-gray-500">Solubility class</span>
                                        <span className="text-gray-300">{compound.lipinski.solubility_class}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── ADMET detail ─────────────────────────────────────────── */}
                        {compound.admet && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Activity className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">ADMET Profile</p>
                                </div>
                                <div className="space-y-1">
                                    {[
                                        { label: "hERG inhibition", value: formatProbability(compound.admet.herg_inhibition), risk: compound.admet.herg_inhibition > 0.5 },
                                        { label: "Hepatotoxicity", value: formatProbability(compound.admet.hepatotoxicity), risk: compound.admet.hepatotoxicity > 0.5 },
                                        { label: "Oral bioavailability", value: formatProbability(compound.admet.oral_bioavailability), risk: compound.admet.oral_bioavailability < 0.3 },
                                        { label: "BBB penetration", value: formatProbability(compound.admet.bbb_penetration), risk: false },
                                        { label: "Caco-2 permeability", value: compound.admet.caco2_permeability.toFixed(2), risk: compound.admet.caco2_permeability < -5.15 },
                                    ].map(({ label, value, risk }) => (
                                        <div key={label} className="flex justify-between text-xs">
                                            <span className="text-gray-500">{label}</span>
                                            <span className={risk ? "text-red-400" : "text-emerald-400"}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                {compound.admet.flags.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
                                        {compound.admet.flags.map((flag) => (
                                            <p key={flag} className="text-xs text-red-400">⚠ {flag}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Docking detail ───────────────────────────────────────── */}
                        {compound.docking && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Dna className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">GNINA Docking</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Best affinity</span>
                                        <span className={`font-mono font-medium ${getAffinityColor(compound.docking.best_affinity_kcal)}`}>
                                            {compound.docking.best_affinity_kcal.toFixed(3)} kcal/mol
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">CNN score</span>
                                        <span className="text-gray-300">{compound.docking.cnn_score.toFixed(3)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Poses generated</span>
                                        <span className="text-gray-300">{compound.docking.poses.length}</span>
                                    </div>
                                </div>
                                {/* Top poses table */}
                                {compound.docking.poses.length > 1 && (
                                    <div className="mt-2 pt-2 border-t border-gray-700">
                                        <p className="text-xs text-gray-600 mb-1">Top poses</p>
                                        <div className="space-y-0.5">
                                            {compound.docking.poses.slice(0, 4).map((pose) => (
                                                <div key={pose.rank} className="flex justify-between text-xs font-mono">
                                                    <span className="text-gray-600">#{pose.rank}</span>
                                                    <span className="text-gray-400">{pose.affinity_kcal.toFixed(2)}</span>
                                                    <span className="text-gray-600">rmsd {pose.rmsd_ub.toFixed(2)}Å</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Retrosynthesis detail ────────────────────────────────── */}
                        {compound.retrosynthesis && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <GitBranch className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Retrosynthesis</p>
                                </div>
                                {compound.retrosynthesis.feasible ? (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Total steps</span>
                                            <span className="text-gray-300">{compound.retrosynthesis.num_steps}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Complexity score</span>
                                            <span className={compound.retrosynthesis.complexity_score < 15 ? "text-emerald-400" : "text-yellow-400"}>
                                                {compound.retrosynthesis.complexity_score.toFixed(1)}
                                            </span>
                                        </div>
                                        {compound.retrosynthesis.route.map((step) => (
                                            <div key={step.step_number} className="mt-2 pt-2 border-t border-gray-700">
                                                <p className="text-xs text-gray-500 mb-1">Step {step.step_number} — confidence {(step.confidence * 100).toFixed(0)}%</p>
                                                <div className="space-y-0.5">
                                                    {step.starting_materials.map((smi, i) => (
                                                        <p key={i} className="font-mono text-xs text-emerald-400 bg-gray-900 px-2 py-0.5 rounded truncate">
                                                            {smi}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-red-400">No feasible synthesis route found.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Score breakdown ───────────────────────────────────────── */}
                    {breakdownLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                            Loading score breakdown...
                        </div>
                    )}
                    {breakdown && !breakdownLoading && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Score Breakdown</p>
                            <div className="space-y-1.5">
                                {Object.entries(breakdown)
                                    .filter(([k]) => k !== "final_score")
                                    .map(([key, val]) => {
                                        if (!val || typeof val !== "object") return null;
                                        const item = val as { raw: string; contribution: number; max_possible: number };
                                        const pct = (item.contribution / item.max_possible) * 100;
                                        return (
                                            <div key={key}>
                                                <div className="flex justify-between text-xs mb-0.5">
                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}</span>
                                                    <span className="text-gray-400 font-mono">
                                                        {item.contribution.toFixed(1)}/{item.max_possible}
                                                    </span>
                                                </div>
                                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-emerald-600 rounded-full transition-all"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-700 mt-0.5">{item.raw}</p>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
