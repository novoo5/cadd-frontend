"use client";

import { useState } from "react";
import {
    ChevronDown, ChevronUp, Copy, CheckCheck,
    FlaskConical, Activity, Dna, GitBranch, Info,
    AlertTriangle, AlertCircle, Lightbulb,
} from "lucide-react";
import type { CompoundResult, ScoreBreakdown, ADMETFlagDetail } from "@/lib/api";
import {
    getScoreColor, getAffinityColor,
    formatProbability, getScoreBreakdown,
    getFlagSeverityColor,
} from "@/lib/api";


interface MoleculeCardProps {
    compound: CompoundResult;
    jobId: string;
    index: number;
}


// ── Simple hover tooltip ──────────────────────────────────────────────────────
const Tip = ({ text }: { text: string }) => (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
        <Info className="w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-colors" />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-300 invisible group-hover:visible z-50 pointer-events-none leading-relaxed shadow-xl">
            {text}
        </span>
    </span>
);


// ── Score breakdown label tooltips ────────────────────────────────────────────
const BREAKDOWN_TIPS: Record<string, string> = {
    docking_affinity: "Max 50pts. Normalized from −4 (no binding) to −12 kcal/mol (exceptional). More negative affinity = more points.",
    admet_safety: "Max 20pts. 0 flags = full score. Each toxicity flag reduces the score. hERG cardiac risk applies an additional penalty.",
    solubility: "Max 10pts. High=10, Medium=7, Low=3, Very Low=0 + global penalty applied. Poor solubility = drug can't dissolve in blood.",
    binding_prefilter: "Max 10pts. GNN-predicted binding affinity × model confidence. Lower confidence = fewer points even if affinity is high.",
    synthesis_ease: "Max 10pts. Based on SA Score complexity. Simpler molecules score higher — complexity < 15 gets near-full points.",
};


// ── Affinity quality label ────────────────────────────────────────────────────
const getAffinityLabel = (kcal: number): { label: string; color: string } => {
    if (kcal <= -9.0) return { label: "Outstanding", color: "text-emerald-300" };
    if (kcal <= -7.0) return { label: "Strong", color: "text-emerald-400" };
    if (kcal <= -5.0) return { label: "Moderate", color: "text-yellow-400" };
    return { label: "Weak", color: "text-red-400" };
};

const getComplexityLabel = (score: number): { label: string; color: string } => {
    if (score < 15) return { label: "Very Easy", color: "text-emerald-400" };
    if (score < 25) return { label: "Moderate", color: "text-yellow-400" };
    if (score < 40) return { label: "Difficult", color: "text-orange-400" };
    return { label: "Infeasible", color: "text-red-400" };
};


// ── Structured ADMET flag card ────────────────────────────────────────────────
// ← NEW: replaces the old `<p key={flag}>⚠ {flag}</p>` that crashed
const ADMETFlagCard = ({ flag }: { flag: ADMETFlagDetail }) => {
    const [open, setOpen] = useState(false);
    const severityClasses = getFlagSeverityColor(flag.severity);

    return (
        <div className={`rounded-lg border px-2.5 py-2 text-xs ${severityClasses}`}>
            <div
                className="flex items-center justify-between gap-2 cursor-pointer"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    {flag.severity === "high"
                        ? <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        : <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    }
                    <span className="font-medium truncate">{flag.property_name}</span>
                    <span className="font-mono opacity-70">
                        {flag.value} ({flag.direction} {flag.threshold})
                    </span>
                </div>
                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${severityClasses}`}>
                    {flag.severity}
                </span>
            </div>

            {open && (
                <div className="mt-2 pt-2 border-t border-current/20 space-y-1.5 animate-slide-up">
                    <div className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
                        <p className="opacity-80">{flag.implication}</p>
                    </div>
                    <div className="flex items-start gap-1.5">
                        <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-60" />
                        <p className="opacity-70">{flag.recommendation}</p>
                    </div>
                </div>
            )}
        </div>
    );
};


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
            } catch { /* non-critical */ }
            finally { setBreakdownLoading(false); }
        }
    };

    const ringStyle =
        score >= 70 ? "border-emerald-500 text-emerald-400" :
            score >= 45 ? "border-yellow-500 text-yellow-400" :
                "border-red-600 text-red-400";

    // ← Use flag_summary (string[]) for the compact badge count
    const flagCount = compound.admet?.flag_summary?.length ?? compound.admet?.flags?.length ?? 0;

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

                {/* SMILES + badges */}
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

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                        {compound.lipinski && (
                            <span className={compound.lipinski.passed ? "badge-pass" : "badge-fail"}>
                                Lipinski {compound.lipinski.passed ? "✓" : "✗"}
                            </span>
                        )}
                        {compound.admet && (
                            <span className={compound.admet.passed ? "badge-pass" : "badge-warn"}>
                                {/* ← safe: only reads count, never renders object */}
                                ADMET {flagCount === 0
                                    ? "clean"
                                    : `${flagCount} flag${flagCount > 1 ? "s" : ""}`
                                }
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
                                    : "synthesis: infeasible"
                                }
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleExpand}
                    className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors p-1"
                >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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

                        {/* ── Drug-likeness ──────────────────────────────────── */}
                        {compound.lipinski && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <FlaskConical className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Drug-likeness</p>
                                    <Tip text="Checks if this molecule has physical properties typical of orally absorbed drugs (Lipinski's Rule of 5). Failures here mean the drug likely can't be taken as a pill." />
                                </div>
                                <div className="space-y-1.5">
                                    {[
                                        { label: "Mol. Weight", value: `${compound.lipinski.mw.toFixed(1)} Da`, ok: compound.lipinski.mw <= 350, tip: "Ideal: ≤350 Da. Heavier molecules struggle to cross cell membranes and absorb from the gut." },
                                        { label: "LogP", value: compound.lipinski.logp.toFixed(2), ok: compound.lipinski.logp <= 4.5, tip: "Ideal: ≤4.5. Measures fat-solubility. Too high = won't dissolve in blood; too low = won't cross membranes." },
                                        { label: "H-bond donors", value: compound.lipinski.hbd, ok: compound.lipinski.hbd <= 5, tip: "Ideal: ≤5. H-bond donors are -OH and -NH groups. Too many prevent absorption through the gut lining." },
                                        { label: "H-bond acceptors", value: compound.lipinski.hba, ok: compound.lipinski.hba <= 10, tip: "Ideal: ≤10. H-bond acceptors are N and O atoms. Too many reduce oral bioavailability." },
                                        { label: "LogS (solubility)", value: compound.lipinski.logs.toFixed(2), ok: compound.lipinski.logs >= -4, tip: "Ideal: > −4. Measures water solubility (ESOL model). More negative = less soluble in blood/gut fluid." },
                                    ].map(({ label, value, ok, tip }) => (
                                        <div key={label} className="flex justify-between text-xs items-center">
                                            <span className="text-gray-500 flex items-center">
                                                {label}<Tip text={tip} />
                                            </span>
                                            <span className={ok ? "text-emerald-400" : "text-yellow-400"}>{value}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-xs pt-1 border-t border-gray-700 items-center">
                                        <span className="text-gray-500 flex items-center">
                                            Solubility class
                                            <Tip text="High (LogS > 0), Medium (−2 to 0), Low (−4 to −2), Very Low (< −4). Very Low solubility applies a score multiplier penalty." />
                                        </span>
                                        <span className={
                                            compound.lipinski.solubility_class === "Very Low" ? "text-red-400" :
                                                compound.lipinski.solubility_class === "Low" ? "text-yellow-400" :
                                                    "text-gray-300"
                                        }>
                                            {compound.lipinski.solubility_class}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── ADMET ──────────────────────────────────────────── */}
                        {compound.admet && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Activity className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">ADMET Profile</p>
                                    <Tip text="Predicts how the drug is Absorbed, Distributed, Metabolized, Excreted, and whether it causes Toxicity. These are the main reasons drugs fail in clinical trials." />
                                </div>
                                <div className="space-y-1.5">
                                    {[
                                        { label: "hERG inhibition", value: formatProbability(compound.admet.herg_inhibition), risk: compound.admet.herg_inhibition > 0.5, tip: "Ideal: <30%. Blocking the hERG channel causes fatal heart arrhythmia — the #1 reason drugs are withdrawn from markets." },
                                        { label: "Hepatotoxicity", value: formatProbability(compound.admet.hepatotoxicity), risk: compound.admet.hepatotoxicity > 0.5, tip: "Ideal: <30%. Probability of liver cell damage. Liver toxicity is the #1 reason drugs fail FDA approval after Phase II trials." },
                                        { label: "Oral bioavailability", value: formatProbability(compound.admet.oral_bioavailability), risk: compound.admet.oral_bioavailability < 0.3, tip: "Ideal: >70%. What percentage of the swallowed dose actually reaches the bloodstream. Low = drug mostly destroyed before reaching target." },
                                        { label: "BBB penetration", value: formatProbability(compound.admet.bbb_penetration), risk: false, tip: "Blood-Brain Barrier penetration. Desirable for brain/CNS drugs, but a liability for non-CNS drugs (may cause neurological side effects)." },
                                        { label: "Caco-2 permeability", value: compound.admet.caco2_permeability.toFixed(2), risk: compound.admet.caco2_permeability < -5.15, tip: "Ideal: > −5.15. Models how well the drug crosses intestinal wall cells (human colon cell line). Key predictor of oral absorption." },
                                    ].map(({ label, value, risk, tip }) => (
                                        <div key={label} className="flex justify-between text-xs items-center">
                                            <span className="text-gray-500 flex items-center">
                                                {label}<Tip text={tip} />
                                            </span>
                                            <span className={risk ? "text-red-400" : "text-emerald-400"}>{value}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* ← FIXED: flags is ADMETFlagDetail[] — use ADMETFlagCard, not <p>{flag}</p> */}
                                {compound.admet.flags.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 space-y-1.5">
                                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">
                                            Flags — click to expand
                                        </p>
                                        {compound.admet.flags.map((flag, i) => (
                                            <ADMETFlagCard key={i} flag={flag} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Docking ────────────────────────────────────────── */}
                        {compound.docking && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <Dna className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Vina Docking</p>
                                    <Tip text="AutoDock Vina simulates the drug physically fitting into the target protein's active site. The affinity score is the estimated binding energy — more negative means stronger binding." />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs items-center">
                                        <span className="text-gray-500 flex items-center">
                                            Best affinity
                                            <Tip text="≤ −9.0 Outstanding · −7.0 to −8.9 Strong · −5.0 to −6.9 Moderate · > −5.0 Weak. Typical approved drugs score −7 to −10 kcal/mol." />
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono font-medium ${getAffinityColor(compound.docking.best_affinity_kcal)}`}>
                                                {compound.docking.best_affinity_kcal.toFixed(3)} kcal/mol
                                            </span>
                                            <span className={`text-xs ${getAffinityLabel(compound.docking.best_affinity_kcal).color}`}>
                                                ({getAffinityLabel(compound.docking.best_affinity_kcal).label})
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500">Poses generated</span>
                                        <span className="text-gray-300">{compound.docking.poses.length}</span>
                                    </div>
                                </div>
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

                        {/* ── Retrosynthesis ─────────────────────────────────── */}
                        {compound.retrosynthesis && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <GitBranch className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Retrosynthesis</p>
                                    <Tip text="Analyses whether this molecule can be synthesized in a chemistry lab, and how many steps it would take. Fewer steps and lower complexity = cheaper and faster to make." />
                                </div>
                                {compound.retrosynthesis.feasible ? (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Total steps</span>
                                            <span className="text-gray-300">{compound.retrosynthesis.num_steps}</span>
                                        </div>
                                        <div className="flex justify-between text-xs items-center">
                                            <span className="text-gray-500 flex items-center">
                                                Complexity score
                                                <Tip text="SA Score: < 15 = Very Easy · 15–25 = Moderate · 25–40 = Difficult · > 40 = Practically infeasible. Most approved oral drugs score under 25." />
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={getComplexityLabel(compound.retrosynthesis.complexity_score).color}>
                                                    {compound.retrosynthesis.complexity_score.toFixed(1)}
                                                </span>
                                                <span className={`text-xs ${getComplexityLabel(compound.retrosynthesis.complexity_score).color}`}>
                                                    ({getComplexityLabel(compound.retrosynthesis.complexity_score).label})
                                                </span>
                                            </div>
                                        </div>
                                        {compound.retrosynthesis.route.map((step) => (
                                            <div key={step.step_number} className="mt-2 pt-2 border-t border-gray-700">
                                                <p className="text-xs text-gray-500 mb-1">
                                                    Step {step.step_number} — confidence {(step.confidence * 100).toFixed(0)}%
                                                </p>
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

                    {/* ── Score breakdown ──────────────────────────────────────── */}
                    {breakdownLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                            Loading score breakdown...
                        </div>
                    )}
                    {breakdown && !breakdownLoading && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Score Breakdown</p>
                            <div className="space-y-2">
                                {Object.entries(breakdown)
                                    .filter(([k]) => k !== "final_score" && k !== "mw_fragment_penalty")
                                    .map(([key, val]) => {
                                        if (!val || typeof val !== "object") return null;
                                        const item = val as { raw: string; contribution: number; max_possible: number };
                                        const pct = (item.contribution / item.max_possible) * 100;
                                        return (
                                            <div key={key}>
                                                <div className="flex justify-between text-xs mb-0.5 items-center">
                                                    <span className="text-gray-500 capitalize flex items-center">
                                                        {key.replace(/_/g, " ")}
                                                        {BREAKDOWN_TIPS[key] && <Tip text={BREAKDOWN_TIPS[key]} />}
                                                    </span>
                                                    <span className="text-gray-400 font-mono">
                                                        {item.contribution.toFixed(1)}/{item.max_possible}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${pct >= 70 ? "bg-emerald-600" :
                                                            pct >= 40 ? "bg-yellow-600" :
                                                                "bg-red-700"
                                                            }`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-600 mt-0.5">{item.raw}</p>
                                            </div>
                                        );
                                    })}
                            </div>
                            {/* Penalty notices */}
                            {breakdown.mw_fragment_penalty === true && (
                                <p className="text-xs text-yellow-500 mt-2">⚠ Fragment penalty applied (MW &lt; 200 Da) — score halved.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
