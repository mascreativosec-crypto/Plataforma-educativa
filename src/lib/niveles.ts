export interface NivelInfo {
  codigo: string;
  etiqueta: string;
  grupo: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotColor: string;
}

const NIVELES_MAP: Record<string, NivelInfo> = {
  A1: {
    codigo: 'A1',
    etiqueta: 'A1 · Principiante',
    grupo: 'Básico',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-800',
    borderClass: 'border-sky-200',
    dotColor: '#0369a1',
  },
  A2: {
    codigo: 'A2',
    etiqueta: 'A2 · Elemental',
    grupo: 'Básico',
    bgClass: 'bg-teal-50',
    textClass: 'text-teal-800',
    borderClass: 'border-teal-200',
    dotColor: '#0f766e',
  },
  B1: {
    codigo: 'B1',
    etiqueta: 'B1 · Intermedio',
    grupo: 'Intermedio',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-800',
    borderClass: 'border-amber-200',
    dotColor: '#b45309',
  },
  B2: {
    codigo: 'B2',
    etiqueta: 'B2 · Intermedio Alto',
    grupo: 'Intermedio',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-800',
    borderClass: 'border-orange-200',
    dotColor: '#c2410c',
  },
  C1: {
    codigo: 'C1',
    etiqueta: 'C1 · Avanzado',
    grupo: 'Avanzado',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-800',
    borderClass: 'border-emerald-200',
    dotColor: '#047857',
  },
  C2: {
    codigo: 'C2',
    etiqueta: 'C2 · Maestría',
    grupo: 'Avanzado',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-800',
    borderClass: 'border-slate-300',
    dotColor: '#0f172a',
  },
  KIDS: {
    codigo: 'KIDS',
    etiqueta: 'KIDS · Infantil',
    grupo: 'Infantil',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-800',
    borderClass: 'border-rose-200',
    dotColor: '#be123c',
  },
  CAMBRIDGE: {
    codigo: 'CAMBRIDGE',
    etiqueta: 'CAMBRIDGE · Certificación',
    grupo: 'Certificación',
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-900',
    borderClass: 'border-blue-200',
    dotColor: '#1d4ed8',
  },
};

export const NIVELES_DISPONIBLES = Object.keys(NIVELES_MAP);

export function getNivelInfo(nivel?: string | null): NivelInfo {
  const key = (nivel || 'A1').toUpperCase().trim();
  return (
    NIVELES_MAP[key] || {
      codigo: key || 'GEN',
      etiqueta: key || 'General',
      grupo: 'General',
      bgClass: 'bg-slate-50',
      textClass: 'text-slate-700',
      borderClass: 'border-slate-200',
      dotColor: '#475569',
    }
  );
}
