// All communication between the Next.js frontend and the FastAPI backend lives here.
// Never call fetch() directly from a component — always go through this module.

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// ── Types (mirror backend Pydantic schemas) ───────────────────────────────────

export type DockingSpeed = "fast" | "balanced" | "thorough";
export type BindingSiteMode = "auto" | "coordinates" | "residues";
export type StepStatus = "waiting" | "running" | "done" | "skipped" | "failed";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface PipelineSteps {
    drug_likeness: boolean;
    admet: boolean;
    binding_prefilter: boolean;
    docking: boolean;
    retrosynthesis: boolean;
}

export interface BindingSiteCoords {
    x: number;
    y: number;
    z: number;
    box_size: number;
}

export interface BindingSiteResidues {
    chain: string;
    residue_start: number;
    residue_end: number;
}

export interface JobRequest {
    smiles: string;
    pdb_id?: string;
    pdb_content?: string;
    num_analogues: 10 | 25 | 50;
    pipeline_steps: PipelineSteps;
    binding_site_mode: BindingSiteMode;
    binding_site_coords?: BindingSiteCoords;
    binding_site_residues?: BindingSiteResidues;
    docking_speed: DockingSpeed;
}

export interface JobSubmitResponse {
    job_id: string;
    message: string;
    status_url: string;
    results_url: string;
}

export interface PipelineStepInfo {
    name: string;
    status: StepStatus;
    message?: string;
    duration_seconds?: number;
}

export interface JobStatusResponse {
    job_id: string;
    status: JobStatus;
    created_at: string;
    updated_at: string;
    steps: PipelineStepInfo[];
    error?: string;
}

export interface LipinskiResult {
    passed: boolean;
    mw: number;
    logp: number;
    hbd: number;
    hba: number;
    logs: number;
    solubility_class: string;
}

export interface ADMETResult {
    passed: boolean;
    herg_inhibition: number;
    caco2_permeability: number;
    bbb_penetration: number;
    hepatotoxicity: number;
    oral_bioavailability: number;
    flags: string[];
}

export interface BindingPrefilterResult {
    passed: boolean;
    predicted_affinity_kcal: number;
    confidence: number;
}

export interface DockingPose {
    rank: number;
    affinity_kcal: number;
    rmsd_lb: number;
    rmsd_ub: number;
}

export interface DockingResult {
    passed: boolean;
    best_affinity_kcal: number;
    cnn_score: number;
    poses: DockingPose[];
}

export interface RetrosynthesisStep {
    step_number: number;
    reaction_smarts: string;
    starting_materials: string[];
    confidence: number;
}

export interface RetrosynthesisResult {
    feasible: boolean;
    num_steps: number;
    route: RetrosynthesisStep[];
    complexity_score: number;
}

export interface CompoundResult {
    smiles: string;
    canonical_smiles: string;
    rank?: number;
    final_score?: number;
    lipinski?: LipinskiResult;
    admet?: ADMETResult;
    binding_prefilter?: BindingPrefilterResult;
    docking?: DockingResult;
    retrosynthesis?: RetrosynthesisResult;
}

export interface JobResultsResponse {
    job_id: string;
    base_smiles: string;
    total_analogues_generated: number;
    compounds_after_lipinski: number;
    compounds_after_admet: number;
    compounds_after_prefilter: number;
    compounds_docked: number;
    final_ranked_compounds: CompoundResult[];
    created_at: string;
    completed_at: string;
}

export interface ScoreBreakdownItem {
    raw: string;
    contribution: number;
    max_possible: number;
}

export interface ScoreBreakdown {
    docking_affinity?: ScoreBreakdownItem;
    cnn_score?: ScoreBreakdownItem;
    admet_safety?: ScoreBreakdownItem;
    solubility?: ScoreBreakdownItem;
    synthesis_ease?: ScoreBreakdownItem;
    final_score?: number;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Submits a pipeline job via JSON body (PDB ID mode).
 */
export async function submitJob(request: JobRequest): Promise<JobSubmitResponse> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error?.detail || `Job submission failed with status ${response.status}`
        );
    }

    return response.json();
}

/**
 * Submits a pipeline job via multipart form (file upload mode).
 */
export async function submitJobWithFile(
    smiles: string,
    pdbFile: File,
    options: {
        num_analogues: 10 | 25 | 50;
        docking_speed: DockingSpeed;
        binding_site_mode: BindingSiteMode;
    }
): Promise<JobSubmitResponse> {
    const formData = new FormData();
    formData.append("smiles", smiles);
    formData.append("pdb_file", pdbFile);
    formData.append("num_analogues", String(options.num_analogues));
    formData.append("docking_speed", options.docking_speed);
    formData.append("binding_site_mode", options.binding_site_mode);

    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/upload`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
            error?.detail || `File upload failed with status ${response.status}`
        );
    }

    return response.json();
}

/**
 * Polls job status. Call this every 8 seconds from the status page.
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/${jobId}/status`, {
        cache: "no-store",
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`Job '${jobId}' not found. It may have expired.`);
        }
        throw new Error(`Status fetch failed: HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Fetches final results. Only call once status === "done".
 * Returns null if job is still running (202 response).
 */
export async function getJobResults(
    jobId: string
): Promise<JobResultsResponse | null> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/${jobId}/results`, {
        cache: "no-store",
    });

    if (response.status === 202) return null; // still running
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.detail || `Results fetch failed: HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Fetches detailed score breakdown for a specific compound by index.
 */
export async function getScoreBreakdown(
    jobId: string,
    compoundIndex: number
): Promise<ScoreBreakdown> {
    const response = await fetch(
        `${BACKEND_URL}/api/v1/jobs/${jobId}/score-breakdown/${compoundIndex}`,
        { cache: "no-store" }
    );

    if (!response.ok) {
        throw new Error(`Score breakdown fetch failed: HTTP ${response.status}`);
    }

    return response.json();
}

/**
 * Lightweight ping to check if backend is awake before submitting.
 * Returns true if backend responds, false if sleeping/down.
 */
export async function pingBackend(): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/health/ping`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Fetches PDB metadata from the backend (which calls RCSB GraphQL).
 * Used to show protein name/resolution after user types a PDB ID.
 */
export async function fetchPdbMetadata(
    pdbId: string
): Promise<{ title: string; resolution_angstrom: number | null; protein_chains: number } | null> {
    try {
        // We call RCSB directly from the frontend for metadata (no backend needed)
        const query = `
    {
      entry(entry_id: "${pdbId.toUpperCase()}") {
        struct { title }
        rcsb_entry_info {
          resolution_combined
          polymer_entity_count_protein
        }
      }
    }`;

        const response = await fetch("https://data.rcsb.org/graphql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const entry = data?.data?.entry;
        if (!entry) return null;

        return {
            title: entry.struct?.title || "Unknown protein",
            resolution_angstrom: entry.rcsb_entry_info?.resolution_combined?.[0] || null,
            protein_chains: entry.rcsb_entry_info?.polymer_entity_count_protein || 0,
        };
    } catch {
        return null;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns CSS color class based on a score 0–100 */
export function getScoreColor(score: number): string {
    if (score >= 70) return "text-emerald-400";
    if (score >= 45) return "text-yellow-400";
    return "text-red-400";
}

/** Returns CSS color class based on a docking affinity (kcal/mol) */
export function getAffinityColor(affinity: number): string {
    if (affinity <= -8.0) return "text-emerald-400";
    if (affinity <= -6.0) return "text-yellow-400";
    return "text-red-400";
}

/** Formats a probability (0–1) as a colored percentage label */
export function formatProbability(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

/** Formats elapsed seconds into a human-readable string */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}
