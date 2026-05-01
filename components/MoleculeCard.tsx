'use client'

import { useState, useMemo } from 'react'
import {
    ChevronDown, ChevronUp, Copy, CheckCheck, FlaskConical, Activity,
    Dna, GitBranch, Info, AlertTriangle, AlertCircle, Lightbulb,
    Download, Loader2, BookOpen, Layers, Shield, CheckCircle2,
} from 'lucide-react'
import type { CompoundResult, ScoreBreakdown, ADMETFlagDetail, DockingFileType } from '@/lib/api'
import {
    getScoreColor, getAffinityColor, formatProbability, getScoreBreakdown,
    getFlagSeverityColor, downloadDockingFile,
} from '@/lib/api'

// ── Extended ADMET types ──────────────────────────────────────────────────────

interface ADMETNarrativeBlock {
    title: string
    level: 'info' | 'good' | 'warning' | 'danger'
    body: string
}

interface ADMETEndpointValue {
    key: string
    label: string
    category: 'absorption' | 'distribution' | 'metabolism' | 'excretion' | 'toxicity' | 'physchem' | 'other'
    value: number
    display_value: string
    unit?: string | null
    interpretation?: string | null
    threshold_applied?: string | null
    severity?: string | null
    hard_fail: boolean
    triggered: boolean
}

type OverallRisk = 'low' | 'moderate' | 'high'

interface ExtendedADMET {
    passed: boolean
    overall_risk?: OverallRisk
    herg_inhibition: number
    caco2_permeability: number
    bbb_penetration: number
    hepatotoxicity: number
    oral_bioavailability: number
    flags: ADMETFlagDetail[]
    flag_summary: string[]
    decision_basis?: string[]
    narrative?: ADMETNarrativeBlock[]
    endpoint_table?: ADMETEndpointValue[]
    extra_properties?: Record<string, number>
}

interface ExtendedRetrosynthesisResult {
    feasible: boolean
    num_steps: number
    route: Array<{
        step_number: number
        reaction_smarts: string
        starting_materials: string[]
        confidence: number
        reaction_name?: string
        yield_range?: string
        conditions?: string
        protocol_text?: string
    }>
    complexity_score: number
    sa_score?: number
    difficulty_label?: string
    synthesis_summary?: string
    estimated_total_yield?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['absorption', 'distribution', 'metabolism', 'excretion', 'toxicity', 'physchem', 'other'] as const

const CATEGORY_LABELS: Record<string, string> = {
    absorption: 'Absorption',
    distribution: 'Distribution',
    metabolism: 'Metabolism',
    excretion: 'Excretion',
    toxicity: 'Toxicity',
    physchem: 'Phys. Chem.',
    other: 'Other',
}

const BREAKDOWN_TIPS: Record<string, string> = {
    docking_affinity: 'Max 50pts. Normalized from −4 (no binding) to −12 kcal/mol (exceptional). More negative affinity = more points.',
    admet_safety: 'Max 20pts. 0 flags = full score. Each toxicity flag reduces the score. hERG (cardiac risk) applies an additional penalty.',
    solubility: 'Max 10pts. High=10, Medium=7, Low=3, Very Low=0 (global penalty applied). Poor solubility = drug can\'t dissolve in blood.',
    binding_prefilter: 'Max 10pts. GNN-predicted binding affinity + model confidence. Lower confidence = fewer points even if affinity is high.',
    synthesis_ease: 'Max 10pts. Based on SA Score complexity. Simpler molecules score higher; complexity >15 gets near-full points.',
}

const DIFFICULTY_STYLES: Record<string, string> = {
    Easy: 'text-emerald-400',
    Moderate: 'text-yellow-400',
    Hard: 'text-orange-400',
    Infeasible: 'text-red-400',
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const getRiskStyle = (risk: OverallRisk) => {
    switch (risk) {
        case 'high': return 'bg-red-950/50 border-red-800 text-red-400'
        case 'moderate': return 'bg-yellow-950/50 border-yellow-800 text-yellow-400'
        default: return 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
    }
}

const getNarrativeStyle = (level: ADMETNarrativeBlock['level']) => {
    switch (level) {
        case 'danger': return { wrap: 'bg-red-950/30 border-red-900/60', title: 'text-red-300', body: 'text-red-200/70' }
        case 'warning': return { wrap: 'bg-yellow-950/30 border-yellow-900/60', title: 'text-yellow-300', body: 'text-yellow-200/70' }
        case 'good': return { wrap: 'bg-emerald-950/30 border-emerald-900/60', title: 'text-emerald-300', body: 'text-emerald-200/70' }
        default: return { wrap: 'bg-gray-800/50 border-gray-700', title: 'text-gray-300', body: 'text-gray-400' }
    }
}

const getNarrativeIcon = (level: ADMETNarrativeBlock['level']) => {
    switch (level) {
        case 'danger': return <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-500 mt-0.5" />
        case 'warning': return <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-yellow-500 mt-0.5" />
        case 'good': return <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500 mt-0.5" />
        default: return <Info className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 mt-0.5" />
    }
}

const getEndpointStatusClass = (ep: ADMETEndpointValue) => {
    if (!ep.triggered) return 'text-emerald-400'
    if (ep.severity === 'high') return 'text-red-400'
    return 'text-yellow-400'
}

const getAffinityLabel = (kcal: number): { label: string; color: string } => {
    if (kcal <= -9.0) return { label: 'Outstanding', color: 'text-emerald-300' }
    if (kcal <= -7.0) return { label: 'Strong', color: 'text-emerald-400' }
    if (kcal <= -5.0) return { label: 'Moderate', color: 'text-yellow-400' }
    return { label: 'Weak', color: 'text-red-400' }
}

const getComplexityLabel = (score: number): { label: string; color: string } => {
    if (score <= 15) return { label: 'Very Easy', color: 'text-emerald-400' }
    if (score <= 25) return { label: 'Moderate', color: 'text-yellow-400' }
    if (score <= 40) return { label: 'Difficult', color: 'text-orange-400' }
    return { label: 'Infeasible', color: 'text-red-400' }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

const Tip = ({ text }: { text: string }) => (
    <span className="group relative inline-flex items-center ml-1 cursor-help">
        <Info className="w-3 h-3 text-gray-600 group-hover:text-gray-400 transition-colors" />
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-300 invisible group-hover:visible z-50 pointer-events-none leading-relaxed shadow-xl">
            {text}
        </span>
    </span>
)

// ── ADMET Flag Card ───────────────────────────────────────────────────────────

const ADMETFlagCard = ({ flag }: { flag: ADMETFlagDetail }) => {
    const [open, setOpen] = useState(false)
    const severityClasses = getFlagSeverityColor(flag.severity)

    return (
        <div className={`rounded-lg border px-2.5 py-2 text-xs ${severityClasses}`}>
            <div
                className="flex items-center justify-between gap-2 cursor-pointer select-none"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    {flag.severity === 'high'
                        ? <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        : <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    }
                    <span className="font-medium truncate">{flag.property_name}</span>
                    <span className="font-mono opacity-70">{flag.value} {flag.direction} {flag.threshold}</span>
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
    )
}

// ── Download Button ───────────────────────────────────────────────────────────

interface DownloadBtnProps {
    label: string
    fileType: DockingFileType
    tooltip: string
    jobId: string
    compoundIndex: number
}

const DownloadBtn = ({ label, fileType, tooltip, jobId, compoundIndex }: DownloadBtnProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleClick = async () => {
        setLoading(true)
        setError(null)
        try {
            await downloadDockingFile(jobId, compoundIndex, fileType)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Download failed'
            setError(msg)
            setTimeout(() => setError(null), 5000)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="group relative">
            <button
                onClick={handleClick}
                disabled={loading}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${error
                        ? 'border-red-700 bg-red-950/40 text-red-400 hover:bg-red-900/40'
                        : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>{label}</span>
            </button>
            {error
                ? <div className="absolute bottom-full left-0 mb-1.5 w-64 bg-gray-900 border border-red-800 rounded-lg px-2.5 py-2 text-[11px] text-red-400 z-50 shadow-xl leading-relaxed">{error}</div>
                : <span className="absolute bottom-full left-0 mb-1.5 w-60 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-300 invisible group-hover:visible z-50 pointer-events-none leading-relaxed shadow-xl">{tooltip}</span>
            }
        </div>
    )
}

// ── Narrative Block ───────────────────────────────────────────────────────────

const NarrativeCard = ({ block }: { block: ADMETNarrativeBlock }) => {
    const style = getNarrativeStyle(block.level)
    return (
        <div className={`rounded-lg border px-3 py-2.5 ${style.wrap}`}>
            <div className="flex items-start gap-2">
                {getNarrativeIcon(block.level)}
                <div className="min-w-0">
                    <p className={`text-xs font-semibold mb-0.5 ${style.title}`}>{block.title}</p>
                    <p className={`text-xs leading-relaxed ${style.body}`}>{block.body}</p>
                </div>
            </div>
        </div>
    )
}

// ── Endpoint Table ────────────────────────────────────────────────────────────

const EndpointTable = ({ endpoints }: { endpoints: ADMETEndpointValue[] }) => {
    const [activeCategory, setActiveCategory] = useState<string>('all')

    const presentCategories = useMemo(() => {
        const cats = new Set(endpoints.map(e => e.category))
        return ['all', ...CATEGORY_ORDER.filter(c => cats.has(c as typeof CATEGORY_ORDER[number]))]
    }, [endpoints])

    const filtered = useMemo(
        () => activeCategory === 'all' ? endpoints : endpoints.filter(e => e.category === activeCategory),
        [endpoints, activeCategory],
    )

    return (
        <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
                {presentCategories.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border transition-colors ${activeCategory === cat
                                ? 'bg-gray-700 border-gray-500 text-gray-200'
                                : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                            }`}
                    >
                        {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                    </button>
                ))}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-gray-700 bg-gray-800/80">
                            <th className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wider">Endpoint</th>
                            <th className="text-right px-3 py-2 text-gray-500 font-medium uppercase tracking-wider">Value</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wider hidden sm:table-cell">Threshold</th>
                            <th className="text-center px-3 py-2 text-gray-500 font-medium uppercase tracking-wider">Status</th>
                            <th className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wider hidden md:table-cell">Category</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((ep) => (
                            <tr
                                key={ep.key}
                                className={`border-b border-gray-800 last:border-0 transition-colors ${ep.triggered
                                        ? ep.severity === 'high'
                                            ? 'bg-red-950/20 hover:bg-red-950/30'
                                            : 'bg-yellow-950/10 hover:bg-yellow-950/20'
                                        : 'hover:bg-gray-800/40'
                                    }`}
                                title={ep.interpretation ?? undefined}
                            >
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-gray-300">{ep.label}</span>
                                        {ep.hard_fail && (
                                            <span className="text-[9px] uppercase tracking-wider text-red-500 border border-red-900 rounded px-1 py-0.5">hard fail</span>
                                        )}
                                        {ep.interpretation && (
                                            <span className="group relative inline-flex items-center cursor-help">
                                                <Info className="w-3 h-3 text-gray-700 group-hover:text-gray-500 transition-colors" />
                                                <span className="absolute bottom-full left-0 mb-1.5 w-60 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs text-gray-300 invisible group-hover:visible z-50 pointer-events-none leading-relaxed shadow-xl">
                                                    {ep.interpretation}
                                                </span>
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                    <span className={getEndpointStatusClass(ep)}>{ep.display_value}</span>
                                    {ep.unit && <span className="text-gray-600 ml-1 text-[10px]">{ep.unit}</span>}
                                </td>
                                <td className="px-3 py-2 text-gray-600 font-mono hidden sm:table-cell">{ep.threshold_applied ?? '—'}</td>
                                <td className="px-3 py-2 text-center">
                                    {ep.threshold_applied
                                        ? ep.triggered
                                            ? <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${ep.severity === 'high' ? 'text-red-400' : 'text-yellow-400'}`}>
                                                <AlertTriangle className="w-3 h-3" />{ep.severity}
                                            </span>
                                            : <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                                                <CheckCircle2 className="w-3 h-3" />pass
                                            </span>
                                        : <span className="text-gray-600 text-[10px]">—</span>
                                    }
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-600 border border-gray-800 rounded px-1.5 py-0.5">
                                        {CATEGORY_LABELS[ep.category] ?? ep.category}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// ── Full ADMET Report ─────────────────────────────────────────────────────────

const FullADMETReport = ({ admet }: { admet: ExtendedADMET }) => {
    const [endpointTableOpen, setEndpointTableOpen] = useState(false)

    const hasNarrative = (admet.narrative?.length ?? 0) > 0
    const hasEndpointTable = (admet.endpoint_table?.length ?? 0) > 0
    const hasDecisionBasis = (admet.decision_basis?.length ?? 0) > 0

    if (!hasNarrative && !hasEndpointTable) return null

    return (
        <div className="rounded-lg bg-gray-800/30 border border-gray-700 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-700 bg-gray-800/50">
                <BookOpen className="w-3.5 h-3.5 text-gray-500" />
                <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Full ADMET Report</p>
                <span className="text-[10px] text-gray-600 ml-auto">Powered by ADMET-AI · 41 TDC datasets</span>
            </div>
            <div className="p-3 space-y-4">
                {hasNarrative && (
                    <div className="space-y-2">
                        {admet.narrative!.map((block, i) => (
                            <NarrativeCard key={i} block={block} />
                        ))}
                    </div>
                )}
                {hasEndpointTable && (
                    <div>
                        <button
                            onClick={() => setEndpointTableOpen(!endpointTableOpen)}
                            className="w-full flex items-center justify-between gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors py-1"
                        >
                            <div className="flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-gray-500" />
                                <span className="font-medium uppercase tracking-wider">Full Endpoint Table</span>
                                <span className="text-gray-600">{admet.endpoint_table!.length} properties</span>
                            </div>
                            {endpointTableOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" />
                                : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                            }
                        </button>
                        {endpointTableOpen && (
                            <div className="mt-2 animate-slide-up">
                                <EndpointTable endpoints={admet.endpoint_table!} />
                            </div>
                        )}
                    </div>
                )}
                {hasDecisionBasis && (
                    <div>
                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Decision Basis</p>
                        <ul className="space-y-0.5">
                            {admet.decision_basis!.map((reason, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-700 flex-shrink-0" />
                                    {reason}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Retrosynthesis Step Card ──────────────────────────────────────────────────

const RetroStepCard = ({ step }: { step: ExtendedRetrosynthesisResult['route'][0] }) => {
    const [open, setOpen] = useState(false)
    return (
        <div className="rounded-lg bg-gray-800/60 border border-gray-700 px-3 py-2.5">
            <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">Step {step.step_number}</span>
                    <span className="font-mono text-[10px] text-gray-400 truncate">{step.reaction_smarts}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {step.yield_range && <span className="text-[10px] text-emerald-500">{step.yield_range}</span>}
                    <span className="text-[10px] text-gray-600">conf {(step.confidence * 100).toFixed0}%</span>
                    {open ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
                </div>
            </div>
            {open && (
                <div className="mt-2 pt-2 border-t border-gray-700 space-y-1.5 animate-slide-up">
                    {step.reaction_name && (
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{step.reaction_name}</p>
                    )}
                    {step.starting_materials.length > 0 && (
                        <div>
                            <p className="text-[10px] text-gray-600 mb-0.5">Starting materials</p>
                            {step.starting_materials.map((sm, i) => (
                                <p key={i} className="font-mono text-[10px] text-gray-400 break-all">{sm}</p>
                            ))}
                        </div>
                    )}
                    {step.conditions && (
                        <p className="text-xs text-gray-500">{step.conditions}</p>
                    )}
                    {step.protocol_text && (
                        <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">{step.protocol_text}</p>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Retrosynthesis Panel ──────────────────────────────────────────────────────

const RetrosynthesisPanel = ({ retro }: { retro: ExtendedRetrosynthesisResult }) => {
    const difficultyColor = DIFFICULTY_STYLES[retro.difficulty_label ?? 'unknown'] ?? 'text-gray-500'
    const complexityInfo = getComplexityLabel(retro.complexity_score)

    return (
        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
            <div className="flex items-center gap-1.5 mb-3">
                <GitBranch className="w-3.5 h-3.5 text-gray-500" />
                <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Retrosynthesis</p>
                <Tip text="Analyses whether this molecule can be synthesized in a chemistry lab using BRICS retrosynthetic fragmentation. SA Score rates synthetic accessibility from 1 (trivial) to 10 (infeasible)." />
            </div>
            {retro.feasible ? (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Synthesis steps</span>
                            <span className="text-gray-200 font-medium">{retro.num_steps}</span>
                        </div>
                        {retro.sa_score !== undefined && retro.sa_score > 0 && (
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500 flex items-center">SA Score <Tip text="Synthetic Accessibility Score: 1.0 = trivially easy, 10.0 = practically impossible. Below 3.5 = easy, 3.5–6.0 = feasible, above 6.0 = hard/infeasible." /></span>
                                <span className={difficultyColor}>{retro.sa_score.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-xs items-center">
                            <span className="text-gray-500 flex items-center">Difficulty <Tip text="Derived from SA Score. Easy ≤3.5, Moderate ≤5.0, Hard ≤6.0, Infeasible >6.0." /></span>
                            <span className={`font-medium capitalize ${difficultyColor}`}>
                                {retro.difficulty_label ?? getComplexityLabel(retro.complexity_score).label}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500 flex items-center">Complexity <Tip text="SA Score × 10. ≤15 = Very Easy, 15–25 = Moderate, 25–40 = Difficult, >40 = Infeasible." /></span>
                            <span className={complexityInfo.color}>{retro.complexity_score.toFixed(1)}</span>
                        </div>
                        {retro.estimated_total_yield && (
                            <div className="flex justify-between text-xs col-span-2">
                                <span className="text-gray-500 flex items-center">Estimated total yield <Tip text="Multiplicative estimate across all steps based on midpoint of per-step yield ranges. Rough approximation only." /></span>
                                <span className="text-emerald-400 font-medium">{retro.estimated_total_yield}</span>
                            </div>
                        )}
                    </div>
                    {retro.synthesis_summary && (
                        <div className="rounded-lg bg-gray-800/60 border border-gray-700 px-3 py-2.5">
                            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Summary</p>
                            <p className="text-xs text-gray-400 leading-relaxed">{retro.synthesis_summary}</p>
                        </div>
                    )}
                    {retro.route.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                                Synthesis Route · {retro.route.length} step{retro.route.length !== 1 ? 's' : ''}
                            </p>
                            {retro.route.map(step => <RetroStepCard key={step.step_number} step={step} />)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-lg bg-red-950/20 border border-red-900/50 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs font-medium text-red-400 mb-0.5">No feasible synthesis route</p>
                            {retro.synthesis_summary
                                ? <p className="text-xs text-red-300/60 leading-relaxed">{retro.synthesis_summary}</p>
                                : <p className="text-xs text-red-300/60">SA Score too high — molecular complexity exceeds practical synthesis limits.</p>
                            }
                            {retro.sa_score !== undefined && retro.sa_score > 0 && (
                                <p className="text-[10px] text-red-500/70 mt-1 font-mono">SA Score {retro.sa_score.toFixed(2)}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Main Card ─────────────────────────────────────────────────────────────────

interface MoleculeCardProps {
    compound: CompoundResult
    jobId: string
    index: number
}

export default function MoleculeCard({ compound, jobId, index }: MoleculeCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [copied, setCopied] = useState(false)
    const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null)
    const [breakdownLoading, setBreakdownLoading] = useState(false)
    // ▼ NEW: track expand errors so the card never blows up
    const [expandError, setExpandError] = useState<string | null>(null)

    const score = compound.final_score ?? 0
    const admet = compound.admet as ExtendedADMET | null | undefined
    const retro = compound.retrosynthesis as ExtendedRetrosynthesisResult | null | undefined

    const copySmiles = async () => {
        try {
            await navigator.clipboard.writeText(compound.canonical_smiles)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // clipboard permission denied — fail silently, no crash
        }
    }

    // ▼ FIXED: proper error handling so expand never crashes the page
    const handleExpand = async () => {
        const newExpanded = !expanded
        setExpanded(newExpanded)
        setExpandError(null)

        if (newExpanded && !breakdown) {
            setBreakdownLoading(true)
            try {
                const data = await getScoreBreakdown(jobId, index)
                setBreakdown(data)
            } catch (e: unknown) {
                // Score breakdown is non-critical — log it but never let it crash the card
                console.warn('[MoleculeCard] Score breakdown fetch failed (non-critical):', e)
                setExpandError(e instanceof Error ? e.message : 'Score breakdown unavailable')
            } finally {
                setBreakdownLoading(false)
            }
        }
    }

    const ringStyle = score >= 70
        ? 'border-emerald-500 text-emerald-400'
        : score >= 45
            ? 'border-yellow-500 text-yellow-400'
            : 'border-red-600 text-red-400'

    const flagCount = admet?.flags?.length ?? admet?.flag_summary?.length ?? 0

    return (
        <div className="card-hover animate-fade-in">
            {/* Compact row */}
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 text-center">
                    <div className={`score-ring ${ringStyle}`}>{score.toFixed(0)}</div>
                    <p className="text-xs text-gray-600 mt-1">#{compound.rank}</p>
                </div>

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
                            <span className={compound.lipinski.passed ? 'badge-pass' : 'badge-fail'}>
                                Lipinski {compound.lipinski.passed ? '✓' : '✗'}
                            </span>
                        )}
                        {admet && (
                            <span className={admet.passed ? 'badge-pass' : 'badge-warn'}>
                                ADMET {flagCount === 0 ? 'clean' : `${flagCount} flag${flagCount !== 1 ? 's' : ''}`}
                            </span>
                        )}
                        {admet?.overall_risk && admet.overall_risk !== 'low' && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${getRiskStyle(admet.overall_risk)}`}>
                                <Shield className="w-2.5 h-2.5" />{admet.overall_risk} risk
                            </span>
                        )}
                        {compound.docking && (
                            <span className={`text-xs font-mono font-medium ${getAffinityColor(compound.docking.best_affinity_kcal)}`}>
                                {compound.docking.best_affinity_kcal.toFixed(2)} kcal/mol
                            </span>
                        )}
                        {retro && (
                            <span className={`text-xs ${retro.feasible ? 'text-gray-500' : 'text-red-500/70'}`}>
                                {retro.feasible
                                    ? `${retro.num_steps} synthesis step${retro.num_steps !== 1 ? 's' : ''}${retro.difficulty_label ? ` · ${retro.difficulty_label}` : ''}`
                                    : 'synthesis infeasible'
                                }
                            </span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleExpand}
                    className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors p-1"
                    aria-label={expanded ? 'Collapse details' : 'Expand details'}
                >
                    {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-5 animate-slide-up">
                    {/* Canonical SMILES */}
                    <div>
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Canonical SMILES</p>
                        <p className="font-mono text-xs text-emerald-400 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 break-all">
                            {compound.canonical_smiles}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Drug-likeness */}
                        {compound.lipinski && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <FlaskConical className="w-3.5 h-3.5 text-gray-500" />
                                    <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Drug-likeness</p>
                                    <Tip text="Checks if this molecule has physical properties typical of orally absorbed drugs (Lipinski's Rule of 5). Failures here mean the drug likely can't be taken as a pill." />
                                </div>
                                <div className="space-y-1.5">
                                    {[
                                        { label: 'Mol. Weight', value: `${compound.lipinski.mw.toFixed(1)} Da`, ok: compound.lipinski.mw <= 350, tip: 'Ideal ≤350 Da. Heavier molecules struggle to cross cell membranes and absorb from the gut.' },
                                        { label: 'LogP', value: compound.lipinski.logp.toFixed(2), ok: compound.lipinski.logp <= 4.5, tip: 'Ideal ≤4.5. Measures fat-solubility. Too high = won\'t dissolve in blood; too low = won\'t cross membranes.' },
                                        { label: 'H-bond donors', value: compound.lipinski.hbd, ok: compound.lipinski.hbd <= 5, tip: 'Ideal ≤5. -OH and -NH groups. Too many prevent absorption through the gut lining.' },
                                        { label: 'H-bond acceptors', value: compound.lipinski.hba, ok: compound.lipinski.hba <= 10, tip: 'Ideal ≤10. N and O atoms. Too many reduce oral bioavailability.' },
                                        { label: 'LogS (solubility)', value: compound.lipinski.logs.toFixed(2), ok: compound.lipinski.logs >= -4, tip: 'Ideal ≥−4. Measures water solubility (ESOL model). More negative = less soluble in blood/gut fluid.' },
                                    ].map(({ label, value, ok, tip }) => (
                                        <div key={label} className="flex justify-between text-xs items-center">
                                            <span className="text-gray-500 flex items-center">{label}<Tip text={tip} /></span>
                                            <span className={ok ? 'text-emerald-400' : 'text-yellow-400'}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-xs pt-1 border-t border-gray-700 items-center mt-2">
                                    <span className="text-gray-500 flex items-center">
                                        Solubility class
                                        <Tip text="High (LogS≥0), Medium (−2 to 0), Low (−4 to −2), Very Low (<−4). Very Low solubility applies a score multiplier penalty." />
                                    </span>
                                    <span className={
                                        compound.lipinski.solubility_class === 'Very Low' ? 'text-red-400' :
                                            compound.lipinski.solubility_class === 'Low' ? 'text-yellow-400' :
                                                'text-gray-300'
                                    }>
                                        {compound.lipinski.solubility_class}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* ADMET compact panel */}
                        {admet && (
                            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-1.5">
                                        <Activity className="w-3.5 h-3.5 text-gray-500" />
                                        <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">ADMET Profile</p>
                                        <Tip text="Predicts how the drug is Absorbed, Distributed, Metabolized, Excreted, and whether it causes Toxicity. These are the main reasons drugs fail in clinical trials." />
                                    </div>
                                    {admet.overall_risk && (
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${getRiskStyle(admet.overall_risk)}`}>
                                            <Shield className="w-2.5 h-2.5" />{admet.overall_risk}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    {[
                                        { label: 'hERG inhibition', value: formatProbability(admet.herg_inhibition), risk: admet.herg_inhibition > 0.5, tip: 'Ideal <30%. Blocking the hERG channel causes fatal heart arrhythmia — the #1 reason drugs are withdrawn from markets.' },
                                        { label: 'Hepatotoxicity', value: formatProbability(admet.hepatotoxicity), risk: admet.hepatotoxicity > 0.5, tip: 'Ideal <30%. Probability of liver cell damage. Liver toxicity is the #1 reason drugs fail FDA approval after Phase II trials.' },
                                        { label: 'Oral bioavailability', value: formatProbability(admet.oral_bioavailability), risk: admet.oral_bioavailability < 0.3, tip: 'Ideal >70%. What percentage of the swallowed dose actually reaches the bloodstream.' },
                                        { label: 'BBB penetration', value: formatProbability(admet.bbb_penetration), risk: false, tip: 'Blood-Brain Barrier penetration. Desirable for CNS drugs, but a liability for non-CNS drugs.' },
                                        { label: 'Caco-2 permeability', value: admet.caco2_permeability.toFixed(2), risk: admet.caco2_permeability < -5.15, tip: 'Ideal >−5.15. Models how well the drug crosses intestinal wall cells. Key predictor of oral absorption.' },
                                    ].map(({ label, value, risk, tip }) => (
                                        <div key={label} className="flex justify-between text-xs items-center">
                                            <span className="text-gray-500 flex items-center">{label}<Tip text={tip} /></span>
                                            <span className={risk ? 'text-red-400' : 'text-emerald-400'}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                {admet.flags.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-700 space-y-1.5">
                                        <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Flags (click to expand)</p>
                                        {admet.flags.map((flag, i) => <ADMETFlagCard key={i} flag={flag} />)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Docking */}
                    {compound.docking && (
                        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Dna className="w-3.5 h-3.5 text-gray-500" />
                                <p className="text-xs font-medium text-gray-300 uppercase tracking-wider">Vina Docking</p>
                                <Tip text="AutoDock Vina simulates the drug physically fitting into the target protein's active site. More negative affinity = stronger binding." />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs items-center">
                                    <span className="text-gray-500 flex items-center">
                                        Best affinity
                                        <Tip text="≤−9.0 = Outstanding, −7.0 to −8.9 = Strong, −5.0 to −6.9 = Moderate, >−5.0 = Weak. Typical approved drugs score −7 to −10 kcal/mol." />
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono font-medium ${getAffinityColor(compound.docking.best_affinity_kcal)}`}>
                                            {compound.docking.best_affinity_kcal.toFixed(3)} kcal/mol
                                        </span>
                                        <span className={`text-xs ${getAffinityLabel(compound.docking.best_affinity_kcal).color}`}>
                                            {getAffinityLabel(compound.docking.best_affinity_kcal).label}
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
                                        {compound.docking.poses.slice(0, 4).map(pose => (
                                            <div key={pose.rank} className="flex justify-between text-xs font-mono">
                                                <span className="text-gray-600">#{pose.rank}</span>
                                                <span className="text-gray-400">{pose.affinity_kcal.toFixed(2)}</span>
                                                <span className="text-gray-600">rmsd {pose.rmsd_ub.toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Download className="w-3 h-3" />Download docking files
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <DownloadBtn label="Raw .pdbqt" fileType="pdbqt" jobId={jobId} compoundIndex={index} tooltip="All Vina poses — exact 3D coordinates. Load in PyMOL or pass to PLIP manually." />
                                    <DownloadBtn label="Pose 1 +H .pdb" fileType="pose_pdb" jobId={jobId} compoundIndex={index} tooltip="Best pose only, hydrogens added via obabel. Ready for PLIP or PyMOL." />
                                    <DownloadBtn label="PLIP Complex .pdb" fileType="complex_pdb" jobId={jobId} compoundIndex={index} tooltip="Receptor + docked ligand merged. Drop directly into PLIP or PyMOL — no manual merging needed." />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Retrosynthesis */}
                    {retro && <RetrosynthesisPanel retro={retro} />}

                    {/* Full ADMET report */}
                    {admet && <FullADMETReport admet={admet} />}

                    {/* Score breakdown */}
                    {breakdownLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                            <div className="w-3 h-3 border border-gray-600 border-t-gray-400 rounded-full animate-spin" />
                            Loading score breakdown...
                        </div>
                    )}
                    {/* ▼ NEW: show a soft error if breakdown failed, but never crash */}
                    {expandError && !breakdownLoading && (
                        <p className="text-[10px] text-gray-700 italic">Score breakdown unavailable: {expandError}</p>
                    )}
                    {breakdown && !breakdownLoading && (
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Score Breakdown</p>
                            <div className="space-y-2">
                                {Object.entries(breakdown)
                                    .filter(([k]) => k !== 'final_score' && k !== 'mw_fragment_penalty')
                                    .map(([key, val]) => {
                                        if (!val || typeof val !== 'object') return null
                                        const item = val as { raw: string; contribution: number; max_possible: number }
                                        const pct = (item.contribution / item.max_possible) * 100
                                        return (
                                            <div key={key}>
                                                <div className="flex justify-between text-xs mb-0.5 items-center">
                                                    <span className="text-gray-500 capitalize flex items-center">
                                                        {key.replace(/_/g, ' ')}
                                                        {BREAKDOWN_TIPS[key] && <Tip text={BREAKDOWN_TIPS[key]} />}
                                                    </span>
                                                    <span className="text-gray-400 font-mono">{item.contribution.toFixed(1)}/{item.max_possible}</span>
                                                </div>
                                                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${pct >= 70 ? 'bg-emerald-600' : pct >= 40 ? 'bg-yellow-600' : 'bg-red-700'}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <p className="text-xs text-gray-600 mt-0.5">{item.raw}</p>
                                            </div>
                                        )
                                    })}
                            </div>
                            {(breakdown as Record<string, unknown>).mw_fragment_penalty === true && (
                                <p className="text-xs text-yellow-500 mt-2">Fragment penalty applied — MW &lt;200 Da, score halved.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}