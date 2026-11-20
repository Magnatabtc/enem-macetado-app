import type { SubjectKey, Weights } from '../api'

export interface SubjectMeta {
  key: SubjectKey
  label: string
  accent: string
}

export const SUBJECTS: readonly SubjectMeta[] = [
  { key: 'matematica', label: 'Matemática', accent: '#7DD3FC' },
  { key: 'portugues', label: 'Português', accent: '#FDE68A' },
  { key: 'biologia', label: 'Biologia', accent: '#86EFAC' },
  { key: 'quimica', label: 'Química', accent: '#C4B5FD' },
  { key: 'fisica', label: 'Física', accent: '#67E8F9' },
  { key: 'historia', label: 'História', accent: '#FDBA74' },
  { key: 'geografia', label: 'Geografia', accent: '#A3E635' },
  { key: 'filosofia', label: 'Filosofia', accent: '#F0ABFC' },
  { key: 'sociologia', label: 'Sociologia', accent: '#FCA5A5' },
  { key: 'ingles', label: 'Inglês', accent: '#93C5FD' },
] as const

export const SUBJECT_KEYS: readonly SubjectKey[] = SUBJECTS.map((s) => s.key)

export const SUBJECT_LABELS: Record<SubjectKey, string> = SUBJECTS.reduce(
  (acc, subject) => {
    acc[subject.key] = subject.label
    return acc
  },
  {} as Record<SubjectKey, string>,
)

export const DEFAULT_WEIGHTS: Weights = {
  matematica: 3,
  portugues: 3,
  biologia: 3,
  quimica: 3,
  fisica: 3,
  historia: 3,
  geografia: 3,
  filosofia: 3,
  sociologia: 3,
  ingles: 3,
}

export const WEIGHT_LABELS: Record<number, string> = {
  1: 'Tranquilo',
  2: 'De boa',
  3: 'Na média',
  4: 'Preciso reforçar',
  5: 'Preciso muito',
}

export function subjectMeta(key: string): SubjectMeta {
  return SUBJECTS.find((s) => s.key === key) ?? { key: 'matematica', label: key, accent: '#C8FF4D' }
}

export function subjectLabel(key: string): string {
  return subjectMeta(key).label
}

export function isSubjectKey(value: string): value is SubjectKey {
  return SUBJECT_KEYS.includes(value as SubjectKey)
}

/** Normaliza o objeto de pesos vindo da API, sempre com as 10 matérias. */
export function normalizeWeights(input: Partial<Record<string, number>> | null | undefined): Weights {
  const result: Weights = { ...DEFAULT_WEIGHTS }
  if (!input) return result
  for (const meta of SUBJECTS) {
    const value = input[meta.key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[meta.key] = Math.min(5, Math.max(1, Math.round(value)))
    }
  }
  return result
}

export interface Preset {
  id: string
  name: string
  description: string
  weights: Weights
}

const balanced: Weights = { ...DEFAULT_WEIGHTS }

export const ONBOARDING_PRESETS: readonly Preset[] = [
  {
    id: 'exatas',
    name: 'Exatas me derrubam',
    description: 'Mais Matemática, Física e Química no feed.',
    weights: {
      matematica: 5,
      portugues: 3,
      biologia: 3,
      quimica: 4,
      fisica: 5,
      historia: 2,
      geografia: 2,
      filosofia: 2,
      sociologia: 2,
      ingles: 3,
    },
  },
  {
    id: 'humanas',
    name: 'Humanas é meu foco',
    description: 'História, Geografia, Filosofia e Sociologia na frente.',
    weights: {
      matematica: 3,
      portugues: 4,
      biologia: 3,
      quimica: 2,
      fisica: 2,
      historia: 5,
      geografia: 5,
      filosofia: 4,
      sociologia: 5,
      ingles: 3,
    },
  },
  {
    id: 'equilibrio',
    name: 'Equilíbrio total',
    description: 'Base igual para todas as matérias.',
    weights: balanced,
  },
]
