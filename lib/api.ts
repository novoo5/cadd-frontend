// All communication between the Next.js frontend and the FastAPI backend lives here.
// Never call fetch() directly from a component — always go through this module.

const BACKEND_URL = "https://novoo5-cadd-backend.hf.space";


// ── Enums / union types ───────────────────────────────────────────────────────

export type DockingSpeed = "fast" | "balanced" | "thorough";
export type BindingSiteMode = "auto" | "coordinates" | "residues";
export type StepStatus = "waiting" | "running" | "done" | "skipped" | "failed";
export type JobStatus = "queued" | "running" | "done" | "failed";

// ← NEW
export type SolubilityFilterMode = "soluble_only" | "allow_slightly" | "all";


// ── Pipeline config types ─────────────────────────────────────────────────────

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


// ── Job request ───────────────────────────────────────────────────────────────

export interface JobRequest {
    smiles: string;
    pdb_id?: string;
    pdb_content?: string;

    // ← was: 0 | 10 | 25 | 50  — now any integer 0–1000
    num_analogues: number;

    direct_score_only?: boolean;

    // ← NEW: solubility filter applied at analogue generation time
    solubility_filter?: SolubilityFilterMode;

    // ← NEW: skip everything except ADMET — no PDB required
    toxicity_report_only?: boolean;

    pipeline_steps: PipelineSteps;
    binding_site_mode: BindingSiteMode;
    binding_site_coords?: BindingSiteCoords;
    binding_site_residues?: BindingSiteResidues;
    docking_speed: DockingSpeed;
    mw_min?: number;
    mw_max?: number;
    // null = "Ignore completely" — all compounds pass regardless of violations
    max_lipinski_violations?: number | null;
}


// ── Response types ────────────────────────────────────────────────────────────

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


// ── Pipeline result types ─────────────────────────────────────────────────────

export interface LipinskiResult {
    passed: boolean;
    mw: number;
    logp: number;
    hbd: number;
    hba: number;
    logs: number;
    solubility_class: string;
}

// ← NEW: structured ADMET flag object (was plain string)
export interface ADMETFlagDetail {
    property_name: string;   // e.g. "hERG Inhibition"
    value: number;   // e.g. 0.87
    threshold: string;   // e.g. ">0.50"
    direction: string;   // "above" | "below"
    severity: "high" | "moderate" | "low";
    implication: string;   // e.g. "cardiac arrhythmia / QT prolongation risk"
    recommendation: string;   // redesign suggestion
}

// ← flags changed from string[] to ADMETFlagDetail[]
// ← flag_summary added as plain-English one-liners for badges
export interface ADMETResult {
    passed: boolean;
    herg_inhibition: number;
    caco2_permeability: number;
    bbb_penetration: number;
    hepatotoxicity: number;
    oral_bioavailability: number;
    flags: ADMETFlagDetail[];
    flag_summary: string[];
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

export interface BindingSiteInfo {
    detection_mode: "native_ligand" | "protein_centroid" | "user_coordinates" | "user_residues";
    detected_ligand_name: string | null;
    center_x: number;
    center_y: number;
    center_z: number;
    box_size: number;
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
    binding_site_info?: BindingSiteInfo | null;
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

export async function submitJob(request: JobRequest): Promise<JobSubmitResponse> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.detail || `Job submission failed with status ${response.status}`);
    }
    return response.json();
}


export async function submitJobWithFile(
    smiles: string,
    // ← pdbFile is now nullable — not required when toxicity_report_only=true
    pdbFile: File | null,
    options: {
        num_analogues: number;             // ← was 0|10|25|50, now any number
        docking_speed: DockingSpeed;
        binding_site_mode: BindingSiteMode;
        pipeline_steps: PipelineSteps;
        direct_score_only?: boolean;
        mw_min?: number;
        mw_max?: number;
        // null = "Ignore completely"; sent as -1, backend converts back to None
        max_lipinski_violations?: number | null;
        // ← NEW
        solubility_filter?: SolubilityFilterMode;
        toxicity_report_only?: boolean;
    }
): Promise<JobSubmitResponse> {
    const formData = new FormData();

    formData.append("smiles", smiles);
    // Only attach pdb_file if provided (toxicity_report_only jobs don't need it)
    if (pdbFile !== null) {
        formData.append("pdb_file", pdbFile);
    }
    formData.append("num_analogues", String(options.num_analogues));
    formData.append("docking_speed", options.docking_speed);
    formData.append("binding_site_mode", options.binding_site_mode);
    formData.append("direct_score_only", String(options.direct_score_only ?? false));
    formData.append("mw_min", String(options.mw_min ?? 200));
    formData.append("mw_max", String(options.mw_max ?? 500));
    // null → -1 sentinel (FormData can't carry null; backend converts -1 → None)
    formData.append(
        "max_lipinski_violations",
        String(options.max_lipinski_violations === null
            ? -1
            : (options.max_lipinski_violations ?? 1))
    );
    // ← NEW fields
    formData.append("solubility_filter", options.solubility_filter ?? "all");
    formData.append("toxicity_report_only", String(options.toxicity_report_only ?? false));

    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/upload`, {
        method: "POST",
        body: formData,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.detail || `File upload failed with status ${response.status}`);
    }
    return response.json();
}


export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/${jobId}/status`, {
        cache: "no-store",
    });
    if (!response.ok) {
        if (response.status === 404)
            throw new Error(`Job '${jobId}' not found. It may have expired.`);
        throw new Error(`Status fetch failed: HTTP ${response.status}`);
    }
    return response.json();
}


export async function getJobResults(jobId: string): Promise<JobResultsResponse | null> {
    const response = await fetch(`${BACKEND_URL}/api/v1/jobs/${jobId}/results`, {
        cache: "no-store",
    });
    if (response.status === 202) return null;
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.detail || `Results fetch failed: HTTP ${response.status}`);
    }
    return response.json();
}


export async function getScoreBreakdown(
    jobId: string,
    compoundIndex: number,
): Promise<ScoreBreakdown> {
    const response = await fetch(
        `${BACKEND_URL}/api/v1/jobs/${jobId}/score-breakdown/${compoundIndex}`,
        { cache: "no-store" },
    );
    if (!response.ok)
        throw new Error(`Score breakdown fetch failed: HTTP ${response.status}`);
    return response.json();
}


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


export async function fetchPdbMetadata(
    pdbId: string,
): Promise<{ title: string; resolution_angstrom: number | null; protein_chains: number } | null> {
    try {
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

export function getScoreColor(score: number): string {
    if (score >= 70) return "text-emerald-400";
    if (score >= 45) return "text-yellow-400";
    return "text-red-400";
}

export function getAffinityColor(affinity: number): string {
    if (affinity <= -8.0) return "text-emerald-400";
    if (affinity <= -6.0) return "text-yellow-400";
    return "text-red-400";
}

// ← NEW: colour for ADMET flag severity badges
export function getFlagSeverityColor(severity: "high" | "moderate" | "low"): string {
    if (severity === "high") return "text-red-400 bg-red-950/40 border-red-800";
    if (severity === "moderate") return "text-yellow-400 bg-yellow-950/40 border-yellow-800";
    return "text-gray-400 bg-gray-800/40 border-gray-700";
}

export function formatProbability(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}
