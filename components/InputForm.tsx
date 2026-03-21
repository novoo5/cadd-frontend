"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Upload, FlaskConical, Loader2, AlertCircle,
    CheckCircle2, ExternalLink, X
} from "lucide-react";
import AdvancedSettings from "./AdvancedSettings";
import {
    submitJob, submitJobWithFile, fetchPdbMetadata, pingBackend,
    type PipelineSteps, type DockingSpeed, type BindingSiteMode,
    type BindingSiteCoords, type BindingSiteResidues,
} from "@/lib/api";


const MYRICETIN_SMILES = "OC1=C(O)C(=CC(=C1)C1=C(O)C(=O)C2=CC(O)=CC(O)=C12)O";


export default function InputForm() {
    const router = useRouter();

    // ── Form state ────────────────────────────────────────────────────────────
    const [smiles, setSmiles] = useState(MYRICETIN_SMILES);
    const [pdbMode, setPdbMode] = useState<"id" | "file">("id");
    const [pdbId, setPdbId] = useState("");
    const [pdbFile, setPdbFile] = useState<File | null>(null);
    const [pdbMeta, setPdbMeta] = useState<{
        title: string; resolution_angstrom: number | null; protein_chains: number
    } | null>(null);
    const [pdbMetaLoading, setPdbMetaLoading] = useState(false);

    // Advanced settings state
    const [numanalogues, setNumanalogues] = useState<10 | 25 | 50>(25);
    const [directScoreOnly, setDirectScoreOnly] = useState(false);  // ← NEW
    const [pipelineSteps, setPipelineSteps] = useState<PipelineSteps>({
        drug_likeness: true, admet: true, binding_prefilter: true,
        docking: true, retrosynthesis: true,
    });
    const [dockingSpeed, setDockingSpeed] = useState<DockingSpeed>("balanced");
    const [bindingSiteMode, setBindingSiteMode] = useState<BindingSiteMode>("auto");
    const [bindingSiteCoords, setBindingSiteCoords] = useState<BindingSiteCoords>({
        x: 0, y: 0, z: 0, box_size: 20,
    });
    const [bindingSiteResidues, setBindingSiteResidues] = useState<BindingSiteResidues>({
        chain: "A", residue_start: 1, residue_end: 100,
    });

    // ── Submission state ──────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [backendAwake, setBackendAwake] = useState<boolean | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdbDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Check backend on mount ────────────────────────────────────────────────
    useEffect(() => {
        pingBackend().then(setBackendAwake);
    }, []);

    // ── Auto-fetch PDB metadata while user types PDB ID ───────────────────────
    useEffect(() => {
        if (pdbDebounceRef.current) clearTimeout(pdbDebounceRef.current);
        setPdbMeta(null);
        if (pdbId.length !== 4) return;

        pdbDebounceRef.current = setTimeout(async () => {
            setPdbMetaLoading(true);
            const meta = await fetchPdbMetadata(pdbId);
            setPdbMeta(meta);
            setPdbMetaLoading(false);
        }, 600);
    }, [pdbId]);

    // ── Submit handler ────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!smiles.trim()) { setError("SMILES string is required."); return; }
        if (pdbMode === "id" && pdbId.trim().length !== 4) {
            setError("PDB ID must be exactly 4 characters (e.g. 1HSG)."); return;
        }
        if (pdbMode === "file" && !pdbFile) {
            setError("Please upload a .pdb file."); return;
        }

        setSubmitting(true);
        try {
            let response;
            if (pdbMode === "file" && pdbFile) {
                response = await submitJobWithFile(smiles, pdbFile, {
                    num_analogues: directScoreOnly ? 0 : numanalogues,  // ← CHANGED
                    docking_speed: dockingSpeed,
                    binding_site_mode: bindingSiteMode,
                    pipeline_steps: pipelineSteps,
                    direct_score_only: directScoreOnly,                  // ← NEW
                });
            } else {
                response = await submitJob({
                    smiles,
                    pdb_id: pdbId.toUpperCase(),
                    num_analogues: directScoreOnly ? 0 : numanalogues,  // ← CHANGED
                    direct_score_only: directScoreOnly,                  // ← NEW
                    pipeline_steps: pipelineSteps,
                    binding_site_mode: bindingSiteMode,
                    binding_site_coords: bindingSiteMode === "coordinates" ? bindingSiteCoords : undefined,
                    binding_site_residues: bindingSiteMode === "residues" ? bindingSiteResidues : undefined,
                    docking_speed: dockingSpeed,
                });
            }
            router.push(`/status/${response.job_id}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Submission failed. Try again.");
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Backend status banner ──────────────────────────────────────── */}
            {backendAwake === false && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-950/30 border border-yellow-800/50">
                    <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                        <p className="text-yellow-300 font-medium">Backend is waking up</p>
                        <p className="text-yellow-600 mt-0.5">
                            The Hugging Face Space may be sleeping. First request takes ~60s.
                            You can still submit — it will queue automatically.
                        </p>
                    </div>
                </div>
            )}

            {/* ── SMILES input ───────────────────────────────────────────────── */}
            <div className="card">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                    Base Compound (SMILES)
                    <span className="ml-2 text-xs text-gray-500 font-normal">required</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                    {directScoreOnly
                        ? "This exact compound will be scored through the full pipeline — no analogues generated."
                        : "Enter the SMILES string of your base compound. Analogues will be generated from this scaffold."
                    }
                </p>
                <div className="relative">
                    <textarea
                        className="input-base font-mono text-xs resize-none h-20"
                        value={smiles}
                        onChange={(e) => setSmiles(e.target.value)}
                        placeholder={MYRICETIN_SMILES}
                        spellCheck={false}
                    />
                    {smiles && (
                        <button
                            type="button"
                            onClick={() => setSmiles("")}
                            className="absolute top-2 right-2 text-gray-600 hover:text-gray-400 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <button
                        type="button"
                        onClick={() => setSmiles(MYRICETIN_SMILES)}
                        className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                        Use myricetin (default)
                    </button>
                    <a
                        href="https://pubchem.ncbi.nlm.nih.gov/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors"
                    >
                        Find SMILES on PubChem
                        <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
            </div>

            {/* ── Target Protein ─────────────────────────────────────────────── */}
            <div className="card">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                    Target Protein
                    <span className="ml-2 text-xs text-gray-500 font-normal">required</span>
                </label>
                <p className="text-xs text-gray-500 mb-3">
                    Provide the protein structure to dock against.
                </p>

                {/* Tab switcher */}
                <div className="flex gap-1 p-1 bg-gray-800 rounded-lg w-fit mb-4">
                    {(["id", "file"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setPdbMode(mode)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${pdbMode === mode
                                    ? "bg-gray-700 text-gray-100"
                                    : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            {mode === "id" ? "PDB ID" : "Upload File"}
                        </button>
                    ))}
                </div>

                {/* PDB ID mode */}
                {pdbMode === "id" && (
                    <div>
                        <div className="relative">
                            <input
                                type="text"
                                className="input-base font-mono uppercase pr-10"
                                value={pdbId}
                                onChange={(e) => setPdbId(e.target.value.toUpperCase().slice(0, 4))}
                                placeholder="e.g. 1HSG"
                                maxLength={4}
                            />
                            {pdbMetaLoading && (
                                <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 animate-spin" />
                            )}
                            {pdbMeta && !pdbMetaLoading && (
                                <CheckCircle2 className="absolute right-3 top-2.5 w-4 h-4 text-emerald-500" />
                            )}
                        </div>

                        {pdbMeta && (
                            <div className="mt-2 p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 animate-slide-up">
                                <p className="text-sm text-emerald-300 font-medium truncate">{pdbMeta.title}</p>
                                <div className="flex gap-4 mt-1">
                                    {pdbMeta.resolution_angstrom && (
                                        <span className="text-xs text-gray-500">
                                            Resolution: <span className="text-gray-400">{pdbMeta.resolution_angstrom}Å</span>
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-500">
                                        Chains: <span className="text-gray-400">{pdbMeta.protein_chains}</span>
                                    </span>
                                    <a
                                        href={`https://www.rcsb.org/structure/${pdbId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-emerald-600 hover:text-emerald-500 flex items-center gap-1"
                                    >
                                        View on RCSB <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        )}

                        {pdbId.length === 4 && !pdbMeta && !pdbMetaLoading && (
                            <p className="mt-1 text-xs text-red-400">
                                PDB ID not found. Check the ID at rcsb.org.
                            </p>
                        )}
                    </div>
                )}

                {/* File upload mode */}
                {pdbMode === "file" && (
                    <div>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${pdbFile
                                    ? "border-emerald-700 bg-emerald-950/20"
                                    : "border-gray-700 hover:border-gray-600 bg-gray-800/20"
                                }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdb"
                                className="hidden"
                                onChange={(e) => setPdbFile(e.target.files?.[0] || null)}
                            />
                            {pdbFile ? (
                                <div className="flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    <div className="text-left">
                                        <p className="text-sm text-emerald-300 font-medium">{pdbFile.name}</p>
                                        <p className="text-xs text-gray-500">{(pdbFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setPdbFile(null); }}
                                        className="ml-2 text-gray-600 hover:text-gray-400"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <Upload className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">Click to upload a .pdb file</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Download from rcsb.org → Format: PDB → Download
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Advanced settings ──────────────────────────────────────────── */}
            <AdvancedSettings
                numanalogues={numanalogues}
                onNumAnaloguesChange={setNumanalogues}
                directScoreOnly={directScoreOnly}           // ← NEW
                onDirectScoreOnlyChange={setDirectScoreOnly} // ← NEW
                pipelineSteps={pipelineSteps}
                onPipelineStepsChange={setPipelineSteps}
                dockingSpeed={dockingSpeed}
                onDockingSpeedChange={setDockingSpeed}
                bindingSiteMode={bindingSiteMode}
                onBindingSiteModeChange={setBindingSiteMode}
                bindingSiteCoords={bindingSiteCoords}
                onBindingSiteCoordsChange={setBindingSiteCoords}
                bindingSiteResidues={bindingSiteResidues}
                onBindingSiteResiduesChange={setBindingSiteResidues}
            />

            {/* ── Error message ──────────────────────────────────────────────── */}
            {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-800/50 animate-slide-up">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-300">{error}</p>
                </div>
            )}

            {/* ── Submit button ──────────────────────────────────────────────── */}
            <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-3 text-base"
            >
                {submitting ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Submitting pipeline job...
                    </>
                ) : directScoreOnly ? (
                    <>
                        <FlaskConical className="w-5 h-5" />
                        Score This Compound Directly
                    </>
                ) : (
                    <>
                        <FlaskConical className="w-5 h-5" />
                        Run CADD Pipeline
                    </>
                )}
            </button>

            <p className="text-xs text-gray-600 text-center">
                {directScoreOnly
                    ? "Direct scoring skips analogue generation — results in ~5–15 minutes."
                    : "Pipeline takes 30–60 minutes depending on settings. You'll get a tracking URL immediately."
                }
            </p>
        </form>
    );
}
