"use client";

import { useState } from "react";
import { Download, ArrowUpDown, Trophy, BookOpen, X } from "lucide-react";
import type { JobResultsResponse, CompoundResult, ADMETFlagDetail } from "@/lib/api";
import { getScoreColor, getAffinityColor } from "@/lib/api";
import MoleculeCard from "./MoleculeCard";


interface ResultsTableProps {
    results: JobResultsResponse;
}

type SortKey = "rank" | "docking" | "admet" | "score";


// ── Scoring guide (unchanged) ─────────────────────────────────────────────────

const SCORING_GUIDE = [
    {
        metric: "Overall Score (0–100)",
        description: "A weighted composite of binding strength, safety, solubility, and synthesizability.",
        ranges: [
            { range: "80–100", label: "Exceptional", color: "text-emerald-400", note: "Ready for in-vitro testing" },
            { range: "60–79", label: "Strong", color: "text-yellow-400", note: "Minor optimization needed" },
            { range: "40–59", label: "Moderate", color: "text-orange-400", note: "Significant issues present" },
            { range: "0–39", label: "Poor", color: "text-red-400", note: "Fails critical drug-like criteria" },
        ],
    },
    {
        metric: "Docking Affinity (kcal/mol)",
        description: "How tightly the drug molecule binds to the target protein's active site. More negative = stronger binding. Calculated using AutoDock Vina molecular simulation.",
        ranges: [
            { range: "≤ −9.0", label: "Outstanding", color: "text-emerald-400", note: "Exceptionally strong binder" },
            { range: "−7.0 to −8.9", label: "Strong", color: "text-emerald-400", note: "Good clinical candidate" },
            { range: "−5.0 to −6.9", label: "Moderate", color: "text-yellow-400", note: "Needs optimization" },
            { range: "> −5.0", label: "Weak", color: "text-red-400", note: "Poor to no binding" },
        ],
    },
    {
        metric: "Synthesis Complexity (SA Score)",
        description: "How difficult and expensive it will be to manufacture this molecule in a lab. Based on the SA Score algorithm which analyses ring systems, stereocenters, and functional groups.",
        ranges: [
            { range: "< 15", label: "Very Easy", color: "text-emerald-400", note: "Cheap, 1–2 steps, standard reagents" },
            { range: "15–25", label: "Moderate", color: "text-yellow-400", note: "Standard for most oral drugs" },
            { range: "25–40", label: "Difficult", color: "text-orange-400", note: "Many steps, expensive reagents" },
            { range: "> 40", label: "Infeasible", color: "text-red-400", note: "Practically unsynthesizable" },
        ],
    },
    {
        metric: "Aqueous Solubility (LogS)",
        description: "How well the drug dissolves in water/blood. Poor solubility is a top reason drugs fail in clinical trials. Estimated using the ESOL (Delaney) model.",
        ranges: [
            { range: "> 0.0", label: "High", color: "text-emerald-400", note: "Dissolves freely in blood" },
            { range: "0.0 to −2.0", label: "Medium", color: "text-yellow-400", note: "Adequate for most formulations" },
            { range: "−2.0 to −4.0", label: "Low", color: "text-orange-400", note: "May need special formulation" },
            { range: "< −4.0", label: "Very Low", color: "text-red-400", note: "High absorption failure risk" },
        ],
    },
    {
        metric: "hERG Inhibition",
        description: "Probability the drug blocks the hERG potassium channel in the heart. This is the most common cause of fatal drug withdrawals from markets worldwide.",
        ranges: [
            { range: "< 30%", label: "Safe", color: "text-emerald-400", note: "No cardiac risk signal" },
            { range: "30–50%", label: "Caution", color: "text-yellow-400", note: "Monitor in trials" },
            { range: "> 50%", label: "High Risk", color: "text-red-400", note: "Likely cardiotoxic — avoid" },
        ],
    },
    {
        metric: "Hepatotoxicity",
        description: "Probability the drug damages liver cells (hepatocytes). Liver toxicity is the #1 reason drugs are rejected by the FDA after Phase II trials.",
        ranges: [
            { range: "< 30%", label: "Safe", color: "text-emerald-400", note: "Low liver damage risk" },
            { range: "30–50%", label: "Moderate Risk", color: "text-yellow-400", note: "Needs monitoring" },
            { range: "> 50%", label: "Toxic", color: "text-red-400", note: "Likely hepatotoxic" },
        ],
    },
    {
        metric: "Oral Bioavailability",
        description: "What percentage of the drug actually reaches the bloodstream after swallowing a pill.",
        ranges: [
            { range: "> 70%", label: "Excellent", color: "text-emerald-400", note: "Most drug reaches target" },
            { range: "30–70%", label: "Moderate", color: "text-yellow-400", note: "Acceptable for most drugs" },
            { range: "< 30%", label: "Poor", color: "text-red-400", note: "Drug barely absorbed orally" },
        ],
    },
    {
        metric: "Caco-2 Permeability",
        description: "Measures how well the drug can pass through intestinal wall cells. A key predictor of oral absorption.",
        ranges: [
            { range: "> −5.15", label: "High Permeability", color: "text-emerald-400", note: "Crosses gut wall easily" },
            { range: "< −5.15", label: "Low Permeability", color: "text-red-400", note: "Poorly absorbed from gut" },
        ],
    },
];


// ── CSV helpers ───────────────────────────────────────────────────────────────

function cell(v: string | number | boolean | null | undefined, dp?: number): string {
    if (v == null) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return dp != null ? v.toFixed(dp) : String(v);
    // escape for CSV: wrap in quotes if value contains comma / quote / pipe / newline
    const s = String(v);
    return /[",|\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function flagSeverity(flags: ADMETFlagDetail[], propName: string): string {
    return flags.find((f) => f.property_name === propName)?.severity ?? "none";
}

function buildCSV(results: JobResultsResponse): string {
    // ── Headers ───────────────────────────────────────────────────────────────
    const headers = [
        // identity
        "rank", "smiles", "canonical_smiles", "final_score",

        // drug-likeness
        "lipinski_passed", "mw_da", "logp", "hbd", "hba", "logs", "solubility_class",

        // ADMET — raw values
        "admet_passed",
        "herg_inhibition", "herg_severity",
        "caco2_permeability", "caco2_severity",
        "bbb_penetration", "bbb_severity",
        "hepatotoxicity", "hepatotox_severity",
        "oral_bioavailability", "oral_bioavail_severity",

        // ADMET — flag detail (pipe-separated multi-value cells)
        "admet_total_flags", "admet_high_severity_flags",
        "admet_flag_names",
        "admet_flag_implications",
        "admet_recommendations",

        // ML pre-filter
        "prefilter_passed", "prefilter_affinity_kcal", "prefilter_confidence",

        // docking
        "docking_passed", "docking_best_affinity_kcal", "docking_cnn_score",
        "pose1_affinity", "pose1_rmsd_lb", "pose1_rmsd_ub",
        "pose2_affinity", "pose2_rmsd_lb", "pose2_rmsd_ub",
        "pose3_affinity", "pose3_rmsd_lb", "pose3_rmsd_ub",

        // retrosynthesis
        "retro_feasible", "retro_num_steps", "retro_complexity_score",
        "retro_step1_smarts", "retro_step1_confidence",
        "retro_step2_smarts", "retro_step2_confidence",
        "retro_step3_smarts", "retro_step3_confidence",
        "retro_all_starting_materials",
    ];

    const rows = results.final_ranked_compounds.map((c: CompoundResult) => {
        const lip = c.lipinski;
        const adm = c.admet;
        const pre = c.binding_prefilter;
        const dock = c.docking;
        const ret = c.retrosynthesis;

        const flags = adm?.flags ?? [];
        const highFlags = flags.filter((f) => f.severity === "high");
        const poses = dock?.poses ?? [];
        const steps = ret?.route ?? [];

        const poseCol = (i: number, key: "affinity_kcal" | "rmsd_lb" | "rmsd_ub") =>
            cell(poses[i]?.[key], 3);
        const stepCol = (i: number, key: "reaction_smarts" | "confidence") =>
            cell(steps[i]?.[key], key === "confidence" ? 3 : undefined);

        const allStartingMats = steps
            .flatMap((s) => s.starting_materials)
            .join(" | ");

        return [
            // identity
            cell(c.rank), cell(c.smiles), cell(c.canonical_smiles), cell(c.final_score, 4),

            // drug-likeness
            cell(lip?.passed), cell(lip?.mw, 2), cell(lip?.logp, 3),
            cell(lip?.hbd), cell(lip?.hba), cell(lip?.logs, 3), cell(lip?.solubility_class),

            // ADMET raw
            cell(adm?.passed),
            cell(adm?.herg_inhibition, 4), flagSeverity(flags, "hERG Inhibition"),
            cell(adm?.caco2_permeability, 4), flagSeverity(flags, "Caco-2 Permeability"),
            cell(adm?.bbb_penetration, 4), flagSeverity(flags, "BBB Penetration"),
            cell(adm?.hepatotoxicity, 4), flagSeverity(flags, "Hepatotoxicity"),
            cell(adm?.oral_bioavailability, 4), flagSeverity(flags, "Oral Bioavailability"),

            // ADMET flags
            cell(flags.length), cell(highFlags.length),
            `"${flags.map((f) => f.property_name).join(" | ")}"`,
            `"${flags.map((f) => f.implication).join(" | ")}"`,
            `"${flags.map((f) => f.recommendation).join(" | ")}"`,

            // pre-filter
            cell(pre?.passed), cell(pre?.predicted_affinity_kcal, 3), cell(pre?.confidence, 3),

            // docking
            cell(dock?.passed), cell(dock?.best_affinity_kcal, 3), cell(dock?.cnn_score, 4),
            poseCol(0, "affinity_kcal"), poseCol(0, "rmsd_lb"), poseCol(0, "rmsd_ub"),
            poseCol(1, "affinity_kcal"), poseCol(1, "rmsd_lb"), poseCol(1, "rmsd_ub"),
            poseCol(2, "affinity_kcal"), poseCol(2, "rmsd_lb"), poseCol(2, "rmsd_ub"),

            // retrosynthesis
            cell(ret?.feasible), cell(ret?.num_steps), cell(ret?.complexity_score, 3),
            stepCol(0, "reaction_smarts"), stepCol(0, "confidence"),
            stepCol(1, "reaction_smarts"), stepCol(1, "confidence"),
            stepCol(2, "reaction_smarts"), stepCol(2, "confidence"),
            `"${allStartingMats}"`,
        ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsTable({ results }: ResultsTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("rank");
    const [sortAsc, setSortAsc] = useState(true);
    const [guideOpen, setGuideOpen] = useState(false);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(true); }
    };

    const sorted = [...results.final_ranked_compounds].sort((a, b) => {
        let va = 0, vb = 0;
        if (sortKey === "rank") { va = a.rank ?? 999; vb = b.rank ?? 999; }
        if (sortKey === "score") { va = a.final_score ?? 0; vb = b.final_score ?? 0; }
        if (sortKey === "docking") { va = a.docking?.best_affinity_kcal ?? 0; vb = b.docking?.best_affinity_kcal ?? 0; }
        if (sortKey === "admet") { va = a.admet?.flags.length ?? 99; vb = b.admet?.flags.length ?? 99; }
        return sortAsc ? va - vb : vb - va;
    });

    const downloadCsv = () => {
        const csv = buildCSV(results);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cadd_results_${results.job_id.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const SortButton = ({ label, k }: { label: string; k: SortKey }) => (
        <button
            onClick={() => handleSort(k)}
            className={`flex items-center gap-1 text-xs uppercase tracking-wider transition-colors ${sortKey === k ? "text-emerald-400" : "text-gray-500 hover:text-gray-300"
                }`}
        >
            {label}
            <ArrowUpDown className="w-3 h-3" />
        </button>
    );

    return (
        <div className="space-y-5">

            {/* ── Stats summary ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Analogues Generated", value: results.total_analogues_generated },
                    { label: "After Drug-likeness", value: results.compounds_after_lipinski },
                    { label: "After ADMET", value: results.compounds_after_admet },
                    { label: "Docked", value: results.compounds_docked },
                ].map(({ label, value }) => (
                    <div key={label} className="card text-center">
                        <p className="text-2xl font-bold text-gray-100">{value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* ── Top compound highlight ──────────────────────────────────────── */}
            {sorted[0] && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border border-emerald-800/40">
                    <div className="flex items-center gap-2 mb-1">
                        <Trophy className="w-4 h-4 text-yellow-400" />
                        <p className="text-sm font-medium text-gray-200">Top Candidate</p>
                        <span className={`text-sm font-bold ${getScoreColor(sorted[0].final_score ?? 0)}`}>
                            {sorted[0].final_score?.toFixed(1)} / 100
                        </span>
                    </div>
                    {sorted[0].docking && (
                        <p className="text-xs text-gray-400">
                            Best docking affinity:{" "}
                            <span className={`font-mono font-medium ${getAffinityColor(sorted[0].docking.best_affinity_kcal)}`}>
                                {sorted[0].docking.best_affinity_kcal.toFixed(3)} kcal/mol
                            </span>
                            {sorted[0].retrosynthesis?.feasible && (
                                <span className="ml-3 text-gray-500">
                                    {sorted[0].retrosynthesis.num_steps}-step synthesis
                                </span>
                            )}
                        </p>
                    )}
                </div>
            )}

            {/* ── Sort controls + actions ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-600">Sort by:</span>
                    <SortButton label="Rank" k="rank" />
                    <SortButton label="Score" k="score" />
                    <SortButton label="Docking" k="docking" />
                    <SortButton label="ADMET" k="admet" />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setGuideOpen(true)}
                        className="btn-secondary text-xs py-1.5 px-3"
                    >
                        <BookOpen className="w-3.5 h-3.5" />
                        Scoring Guide
                    </button>
                    <button
                        onClick={downloadCsv}
                        className="btn-secondary text-xs py-1.5 px-3"
                        title="Exports all pipeline data: ADMET values + severities, docking poses, retrosynthesis routes, flag implications and redesign recommendations"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                    </button>
                </div>
            </div>

            {/* ── Compound cards ──────────────────────────────────────────────── */}
            <div className="space-y-3">
                {sorted.map((compound, i) => (
                    <MoleculeCard
                        key={compound.canonical_smiles}
                        compound={compound}
                        jobId={results.job_id}
                        index={i}
                    />
                ))}
            </div>

            {/* ── Scoring Guide Modal ─────────────────────────────────────────── */}
            {guideOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="relative w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl my-8">
                        <div className="flex items-center justify-between p-5 border-b border-gray-800">
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-emerald-400" />
                                <h2 className="text-sm font-semibold text-gray-100">Scoring Guide</h2>
                            </div>
                            <button
                                onClick={() => setGuideOpen(false)}
                                className="text-gray-600 hover:text-gray-400 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-5 pt-4 pb-2">
                            <p className="text-xs text-gray-500 leading-relaxed">
                                This pipeline evaluates drug candidates across multiple dimensions. Below is a plain-English
                                explanation of every metric and what the values mean for drug viability.
                            </p>
                        </div>

                        <div className="px-5 pb-5 space-y-5">
                            {SCORING_GUIDE.map((item) => (
                                <div key={item.metric} className="p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                                    <p className="text-sm font-medium text-gray-200 mb-1">{item.metric}</p>
                                    <p className="text-xs text-gray-500 mb-3 leading-relaxed">{item.description}</p>
                                    <div className="space-y-1.5">
                                        {item.ranges.map((r) => (
                                            <div key={r.range} className="flex items-center gap-3 text-xs">
                                                <span className="font-mono text-gray-400 w-24 flex-shrink-0">{r.range}</span>
                                                <span className={`font-medium w-24 flex-shrink-0 ${r.color}`}>{r.label}</span>
                                                <span className="text-gray-600">{r.note}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}