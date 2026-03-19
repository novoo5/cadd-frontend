"use client";

import { useState } from "react";
import { Download, ArrowUpDown, Trophy } from "lucide-react";
import type { JobResultsResponse, CompoundResult } from "@/lib/api";
import { getScoreColor, getAffinityColor } from "@/lib/api";
import MoleculeCard from "./MoleculeCard";

interface ResultsTableProps {
    results: JobResultsResponse;
}

type SortKey = "rank" | "docking" | "admet" | "score";

export default function ResultsTable({ results }: ResultsTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("rank");
    const [sortAsc, setSortAsc] = useState(true);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) { setSortAsc(!sortAsc); }
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
        const headers = [
            "Rank", "SMILES", "Final Score", "MW", "LogP", "Solubility Class",
            "ADMET Flags", "hERG", "Hepatotox", "Docking (kcal/mol)", "CNN Score", "Synthesis Steps", "Complexity"
        ];
        const rows = results.final_ranked_compounds.map((c) => [
            c.rank ?? "",
            c.canonical_smiles,
            c.final_score?.toFixed(2) ?? "",
            c.lipinski?.mw.toFixed(1) ?? "",
            c.lipinski?.logp.toFixed(2) ?? "",
            c.lipinski?.solubility_class ?? "",
            c.admet?.flags.join("; ") ?? "",
            c.admet?.herg_inhibition.toFixed(3) ?? "",
            c.admet?.hepatotoxicity.toFixed(3) ?? "",
            c.docking?.best_affinity_kcal.toFixed(3) ?? "",
            c.docking?.cnn_score.toFixed(3) ?? "",
            c.retrosynthesis?.num_steps ?? "",
            c.retrosynthesis?.complexity_score.toFixed(1) ?? "",
        ]);
        const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
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

            {/* ── Stats summary ─────────────────────────────────────────────── */}
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

            {/* ── Top compound highlight ────────────────────────────────────── */}
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

            {/* ── Sort controls + download ──────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-600">Sort by:</span>
                    <SortButton label="Rank" k="rank" />
                    <SortButton label="Score" k="score" />
                    <SortButton label="Docking" k="docking" />
                    <SortButton label="ADMET" k="admet" />
                </div>
                <button onClick={downloadCsv} className="btn-secondary text-xs py-1.5 px-3">
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                </button>
            </div>

            {/* ── Compound cards ────────────────────────────────────────────── */}
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
        </div>
    );
}
