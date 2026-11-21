export type WorldPetSpecies =
  | 'CONDOR_ANDES'
  | 'TORTUGA_GALAPAGOS'
  | 'PANDA_ROJO'
  | 'KOALA_AUSSIE'
  | 'ZORRO_ARTICO'
  | 'PINGUINO_SUR'
  | 'SHIBA_TOKIO'
  | 'BUHO_ALLEN';

export type WorldPetRegion = 'América' | 'Asia' | 'Europa' | 'Oceanía' | 'Antártida';

export interface WorldPetMeta {
  id: WorldPetSpecies;
  nombreEspecie: string;
  nombreSugerido: string;
  region: WorldPetRegion;
  origen: string;
  rasgo: string;
  descripcion: string;
  colores: {
    main: string;
    light: string;
    dark: string;
    cheek: string;
    accent: string;
  };
}

export const WORLD_PET_REGIONS: Array<'Todas' | WorldPetRegion> = [
  'Todas',
  'América',
  'Asia',
  'Europa',
  'Oceanía',
  'Antártida',
];

export const WORLD_PETS_CATALOG: WorldPetMeta[] = [
  {
    id: 'CONDOR_ANDES',
    nombreEspecie: 'Cóndor Andino',
    nombreSugerido: 'Inti',
    region: 'América',
    origen: 'Ecuador · Andes',
    rasgo: 'Visión de alto vuelo',
    descripcion: 'Guardián andino que celebra tus exámenes aprobados y rachas largas.',
    colores: { main: '#1e293b', light: '#f8fafc', dark: '#0f172a', cheek: '#fb7185', accent: '#cf080d' },
  },
  {
    id: 'TORTUGA_GALAPAGOS',
    nombreEspecie: 'Tortuga de Galápagos',
    nombreSugerido: 'Darwin',
    region: 'América',
    origen: 'Ecuador · Galápagos',
    rasgo: 'Constancia legendaria',
    descripcion: 'Avanza sin pausa día tras día; experta en mantener tu hábito de estudio vivo.',
    colores: { main: '#15803d', light: '#dcfce7', dark: '#14532d', cheek: '#f97316', accent: '#ca8a04' },
  },
  {
    id: 'PANDA_ROJO',
    nombreEspecie: 'Panda Rojo',
    nombreSugerido: 'Kipu',
    region: 'Asia',
    origen: 'Himalaya · Asia',
    rasgo: 'Curioso y ágil',
    descripcion: 'Le encantan las rondas rápidas de repaso y descubrir vocabulario nuevo.',
    colores: { main: '#c2410c', light: '#ffedd5', dark: '#7c2d12', cheek: '#fb7185', accent: '#0f172a' },
  },
  {
    id: 'SHIBA_TOKIO',
    nombreEspecie: 'Shiba Inu',
    nombreSugerido: 'Mochi',
    region: 'Asia',
    origen: 'Japón · Tokio',
    rasgo: 'Leal y entusiasta',
    descripcion: 'Te recibe cada día con energía y te recuerda tus tareas antes de vencer.',
    colores: { main: '#d97706', light: '#fef3c7', dark: '#92400e', cheek: '#f43f5e', accent: '#ffffff' },
  },
  {
    id: 'ZORRO_ARTICO',
    nombreEspecie: 'Zorro Ártico',
    nombreSugerido: 'Nube',
    region: 'Europa',
    origen: 'Norte de Europa · Ártico',
    rasgo: 'Rápido en simuladores',
    descripcion: 'Mente veloz y precisa para retos contrarreloj y cuestionarios.',
    colores: { main: '#334155', light: '#f1f5f9', dark: '#1e293b', cheek: '#38bdf8', accent: '#e2e8f0' },
  },
  {
    id: 'KOALA_AUSSIE',
    nombreEspecie: 'Koala Australiano',
    nombreSugerido: 'Bindi',
    region: 'Oceanía',
    origen: 'Australia · Oceanía',
    rasgo: 'Calma y concentración',
    descripcion: 'Compañero sereno ideal para lecturas, redacciones y estudio enfocado.',
    colores: { main: '#64748b', light: '#f1f5f9', dark: '#334155', cheek: '#fb7185', accent: '#0f172a' },
  },
  {
    id: 'PINGUINO_SUR',
    nombreEspecie: 'Pingüino Emperador',
    nombreSugerido: 'Polo',
    region: 'Antártida',
    origen: 'Antártida · Sur',
    rasgo: 'Disciplina imparable',
    descripcion: 'Sobresale en metas semanales y nunca se rinde frente a una unidad difícil.',
    colores: { main: '#0f172a', light: '#ffffff', dark: '#020617', cheek: '#fb923c', accent: '#f59e0b' },
  },
  {
    id: 'BUHO_ALLEN',
    nombreEspecie: 'Búho ALLEN',
    nombreSugerido: 'Allie',
    region: 'Europa',
    origen: 'Clásico ALLEN Aula',
    rasgo: 'Sabiduría académica',
    descripcion: 'El compañero clásico institucional de ALLEN para dominar cada lección.',
    colores: { main: '#011f52', light: '#dbeafe', dark: '#001233', cheek: '#f43f5e', accent: '#cf080d' },
  },
];

const LEGACY_SPECIES_MAP: Record<string, WorldPetSpecies> = {
  ZORRO_ESTUDIO: 'ZORRO_ARTICO',
  DRAGON_LINGUA: 'PANDA_ROJO',
};

export function isValidWorldPetSpecies(raw: string): raw is WorldPetSpecies {
  return WORLD_PETS_CATALOG.some((p) => p.id === raw);
}

export function resolveWorldPetSpecies(raw: string | null | undefined): WorldPetSpecies {
  const upper = String(raw || '').trim().toUpperCase();
  if (isValidWorldPetSpecies(upper)) return upper;
  if (upper in LEGACY_SPECIES_MAP) return LEGACY_SPECIES_MAP[upper];
  return 'CONDOR_ANDES';
}

export function getWorldPetMeta(raw: string | null | undefined): WorldPetMeta {
  const resolved = resolveWorldPetSpecies(raw);
  return WORLD_PETS_CATALOG.find((p) => p.id === resolved) || WORLD_PETS_CATALOG[0];
}

export interface FallbackReviewQuestion {
  id: string;
  enunciado: string;
  opciones: string[];
  respuestaCorrecta: string;
  explicacion: string;
  tema: string;
  perfil?: 'TODOS' | 'PROFESIONAL';
}

export const FALLBACK_REVIEW_QUESTIONS: FallbackReviewQuestion[] = [
  {
    id: 'rev-1',
    enunciado: 'Completa la oración en pasado simple: "Yesterday, we ___ to the science museum."',
    opciones: ['went', 'go', 'going', 'gone'],
    respuestaCorrecta: 'went',
    explicacion: '"Went" es el pasado simple del verbo irregular "go".',
    tema: 'Past Simple',
    perfil: 'TODOS',
  },
  {
    id: 'rev-2',
    enunciado: '¿Cuál opción completa correctamente: "She has lived in Quito ___ 2021"?',
    opciones: ['since', 'for', 'during', 'from'],
    respuestaCorrecta: 'since',
    explicacion: 'Usamos "since" con un punto específico de inicio en el tiempo (2021).',
    tema: 'Present Perfect',
    perfil: 'TODOS',
  },
  {
    id: 'rev-3',
    enunciado: 'Elige la respuesta más natural a: "Could you send me the report before noon?"',
    opciones: [
      'Sure, I will email it to you by 11:30.',
      'Yes, I went yesterday.',
      'No, it is blue.',
      'I am having a pen.',
    ],
    respuestaCorrecta: 'Sure, I will email it to you by 11:30.',
    explicacion: '"I will..." se usa para compromisos y respuestas inmediatas en contexto cotidiano o laboral.',
    tema: 'Comunicación práctica',
    perfil: 'PROFESIONAL',
  },
  {
    id: 'rev-4',
    enunciado: '¿Qué significa el phrasal verb "follow up" en un entorno profesional?',
    opciones: [
      'Dar seguimiento a un tema o correo',
      'Cancelar una reunión',
      'Traducir un documento',
      'Llegar tarde a la oficina',
    ],
    respuestaCorrecta: 'Dar seguimiento a un tema o correo',
    explicacion: '"Follow up" significa hacer seguimiento después de una reunión o mensaje previo.',
    tema: 'Inglés profesional',
    perfil: 'PROFESIONAL',
  },
  {
    id: 'rev-5',
    enunciado: 'Selecciona la forma correcta: "If it rains tomorrow, we ___ the class online."',
    opciones: ['will have', 'had', 'having', 'would had'],
    respuestaCorrecta: 'will have',
    explicacion: 'El First Conditional usa Present Simple en la condición y "will + verbo" en el resultado.',
    tema: 'Conditionals',
    perfil: 'TODOS',
  },
  {
    id: 'rev-6',
    enunciado: '¿Cuál es el comparativo correcto de "clear" en "This explanation is ___ than the previous one"?',
    opciones: ['clearer', 'more clearer', 'clearest', 'most clear'],
    respuestaCorrecta: 'clearer',
    explicacion: 'Adjetivos cortos de una sílaba como "clear" forman el comparativo agregando "-er".',
    tema: 'Comparativos',
    perfil: 'TODOS',
  },
  {
    id: 'rev-7',
    enunciado: 'Elige la frase correcta para abrir una reunión en inglés:',
    opciones: [
      'Thank you all for joining today. Let us review the agenda.',
      'I am eat lunch before the meeting.',
      'Where you going yesterday?',
      'Very good morning to the chair.',
    ],
    respuestaCorrecta: 'Thank you all for joining today. Let us review the agenda.',
    explicacion: 'Es una fórmula clara, cordial y estándar para iniciar reuniones ejecutivas.',
    tema: 'Reuniones en inglés',
    perfil: 'PROFESIONAL',
  },
  {
    id: 'rev-8',
    enunciado: 'Completa con la preposición correcta: "The presentation starts ___ 9:00 AM."',
    opciones: ['at', 'on', 'in', 'to'],
    respuestaCorrecta: 'at',
    explicacion: 'Usamos "at" para horas exactas del día.',
    tema: 'Preposiciones de tiempo',
    perfil: 'TODOS',
  },
];
