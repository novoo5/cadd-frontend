"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Home, ArrowLeft, Loader2 } from "lucide-react";
import ResultsTable from "@/components/ResultsTable";
import { getJobResults, type JobResultsResponse } from "@/lib/api";

export default function ResultsPage() {
    const { jobId } = useParams<{ jobId: string }>();
    const router = useRouter();

    const [results, setResults] = useState<JobResultsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await getJobResults(jobId);
                if (data === null) {
                    // Job still running — redirect back to status page
                    router.replace(`/status/${jobId}`);
                    return;
                }
                setResults(data);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to load results.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [jobId, router]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-64 gap-4">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                <p className="text-sm text-gray-500">Loading results...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="card">
                    <p className="text-red-400 text-sm mb-4">{error}</p>
                    <div className="flex gap-2">
                        <button onClick={() => router.push(`/status/${jobId}`)} className="btn-secondary text-sm">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Status
                        </button>
                        <button onClick={() => router.push("/")} className="btn-secondary text-sm">
                            <Home className="w-4 h-4" />
                            New Job
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!results) return null;

    return (
        <div className="space-y-6">

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div>
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                    <a href="/" className="hover:text-gray-400 transition-colors flex items-center gap-1">
                        <Home className="w-3 h-3" /> Home
                    </a>
                    <span>/</span>
                    <a
                        href={`/status/${jobId}`}
                        className="hover:text-gray-400 transition-colors"
                    >
                        Status
                    </a>
                    <span>/</span>
                    <span className="text-gray-500">Results</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-100">Pipeline Results</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {results.final_ranked_compounds.length} compounds ranked ·{" "}
                            <span className="font-mono text-xs text-gray-600">
                                Base: {results.base_smiles.slice(0, 30)}
                                {results.base_smiles.length > 30 ? "..." : ""}
                            </span>
                        </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => router.push(`/status/${jobId}`)}
                            className="btn-secondary text-xs py-1.5"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            Status
                        </button>
                        <button
                            onClick={() => router.push("/")}
                            className="btn-secondary text-xs py-1.5"
                        >
                            <Home className="w-3.5 h-3.5" />
                            New Job
                        </button>
                    </div>
                </div>

                {/* Timing info */}
                <div className="flex gap-4 mt-3 text-xs text-gray-600">
                    <span>Started: {new Date(results.created_at).toLocaleString()}</span>
                    <span>·</span>
                    <span>Completed: {new Date(results.completed_at).toLocaleString()}</span>
                    <span>·</span>
                    <span>
                        Duration:{" "}
                        {Math.round(
                            (new Date(results.completed_at).getTime() -
                                new Date(results.created_at).getTime()) / 60000
                        )} min
                    </span>
                </div>
            </div>

            {/* ── Results table ────────────────────────────────────────────────── */}
            <ResultsTable results={results} />
        </div>
    );
}
