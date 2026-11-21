import React from 'react';
import { getWorldPetMeta, resolveWorldPetSpecies } from '../../lib/world-pets';
import type { PetMood, PetSpecies } from '../../types/aula';

interface VirtualPetAvatarProps {
  especie: PetSpecies;
  etapa: 1 | 2 | 3 | 4;
  mood: PetMood;
  accesorioCabeza?: string | null;
  accesorioCuello?: string | null;
  fondoHabitat?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  celebrating?: boolean;
}

const HABITAT_STYLES: Record<string, { bg: string; accent: string; label: string }> = {
  aula: {
    bg: 'from-[#011f52] via-[#0b3375] to-[#134696]',
    accent: '#cf080d',
    label: 'Aula ALLEN',
  },
  biblioteca: {
    bg: 'from-[#1a1f36] via-[#2c2246] to-[#4a2e4b]',
    accent: '#f59e0b',
    label: 'Biblioteca Nocturna',
  },
  londres: {
    bg: 'from-[#0c2340] via-[#1c4b82] to-[#cf080d]/85',
    accent: '#ffffff',
    label: 'Londres & Big Ben',
  },
};

export function VirtualPetAvatar({
  especie,
  etapa,
  mood,
  accesorioCabeza,
  accesorioCuello,
  fondoHabitat = 'aula',
  size = 'md',
  celebrating = false,
}: VirtualPetAvatarProps) {
  const resolvedSpecies = resolveWorldPetSpecies(especie);
  const petMeta = getWorldPetMeta(resolvedSpecies);
  const bodyColors = petMeta.colores;
  const habitat = HABITAT_STYLES[fondoHabitat] || HABITAT_STYLES.aula;

  const dims =
    size === 'xs'
      ? 'w-14 h-14'
      : size === 'sm'
        ? 'w-20 h-20'
        : size === 'lg'
          ? 'w-48 h-48 sm:w-56 sm:h-56'
          : 'w-32 h-32';

  const animClass =
    celebrating || mood === 'EMOCIONADA'
      ? 'animate-pet-celebrate'
      : mood === 'DESCANSANDO'
        ? ''
        : 'animate-pet-float';

  const isBird =
    resolvedSpecies === 'BUHO_ALLEN' ||
    resolvedSpecies === 'CONDOR_ANDES' ||
    resolvedSpecies === 'PINGUINO_SUR';

  return (
    <div
      className={`relative ${dims} rounded-2xl bg-gradient-to-br ${habitat.bg} flex items-center justify-center overflow-hidden shadow-inner border border-white/15 shrink-0 select-none`}
      aria-label={`Mascota virtual ${petMeta.nombreEspecie} (etapa ${etapa}, estado ${mood})`}
    >
      <svg viewBox="0 0 200 200" className="w-full h-full" role="img" aria-hidden="true">
        <defs>
          <radialGradient id={`petAura-${resolvedSpecies}-${size}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={etapa >= 3 ? '0.32' : '0.18'} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Destellos de escenario */}
        {fondoHabitat === 'londres' && (
          <g opacity="0.18" fill="#ffffff">
            <rect x="148" y="42" width="18" height="120" rx="2" />
            <polygon points="145,42 157,18 169,42" />
            <circle cx="157" cy="64" r="6" fill="#011f52" />
          </g>
        )}
        {fondoHabitat === 'biblioteca' && (
          <g opacity="0.18" fill="#fde68a">
            <circle cx="36" cy="36" r="14" />
            <rect x="24" y="150" width="152" height="10" rx="3" />
          </g>
        )}

        {/* Aura evolutiva */}
        <circle
          cx="100"
          cy="112"
          r={etapa >= 4 ? 78 : etapa >= 3 ? 68 : 56}
          fill={`url(#petAura-${resolvedSpecies}-${size})`}
        />

        {/* Halo maestro etapa 4 */}
        {etapa >= 4 && size !== 'xs' && (
          <ellipse
            cx="100"
            cy="32"
            rx="34"
            ry="7"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3.5"
            opacity="0.9"
          />
        )}

        {/* Sombra suelo */}
        <ellipse cx="100" cy="172" rx="44" ry="8" fill="#000000" opacity="0.22" />

        {/* Cuerpo animado de la mascota */}
        <g className={animClass} style={{ transformOrigin: '100px 115px' }}>
          {/* Capa de maestro (detrás del cuerpo) */}
          {accesorioCuello === 'capa_maestro' && (
            <path
              d="M52 126 Q100 108 148 126 L160 168 Q100 176 40 168 Z"
              fill="#cf080d"
              stroke="#fbbf24"
              strokeWidth="2.5"
            />
          )}

          {/* Rasgos detrás del cuerpo por especie del mundo */}
          {resolvedSpecies === 'BUHO_ALLEN' && (
            <>
              <polygon points="56,78 48,46 78,64" fill={bodyColors.main} />
              <polygon points="144,78 152,46 122,64" fill={bodyColors.main} />
              <ellipse
                cx="50"
                cy="126"
                rx={etapa >= 3 ? 17 : 13}
                ry={etapa >= 3 ? 30 : 24}
                transform="rotate(14 50 126)"
                fill={bodyColors.dark}
              />
              <ellipse
                cx="150"
                cy="126"
                rx={etapa >= 3 ? 17 : 13}
                ry={etapa >= 3 ? 30 : 24}
                transform="rotate(-14 150 126)"
                fill={bodyColors.dark}
              />
            </>
          )}

          {resolvedSpecies === 'CONDOR_ANDES' && (
            <>
              {/* Grandes alas andinas */}
              <path
                d="M54 114 Q18 96 24 134 Q36 144 55 138 Z"
                fill={bodyColors.dark}
              />
              <path
                d="M146 114 Q182 96 176 134 Q164 144 145 138 Z"
                fill={bodyColors.dark}
              />
              {/* Plumas blancas en las alas */}
              <path d="M32 122 Q40 128 50 124" stroke="#f8fafc" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M168 122 Q160 128 150 124" stroke="#f8fafc" strokeWidth="3.5" strokeLinecap="round" />
              {/* Cresta andina sutil */}
              <path d="M90 65 Q100 50 110 65 Z" fill="#cf080d" />
            </>
          )}

          {resolvedSpecies === 'TORTUGA_GALAPAGOS' && (
            <>
              {/* Caparazón ancho detrás */}
              <ellipse cx="100" cy="126" rx="58" ry="44" fill="#14532d" stroke="#86efac" strokeWidth="3" />
              {/* Patrón hexagonal del caparazón */}
              <polygon points="82,112 100,104 118,112 118,132 100,140 82,132" fill="#166534" opacity="0.7" />
              {/* Aletas / patitas laterales */}
              <ellipse cx="46" cy="144" rx="14" ry="9" transform="rotate(-15 46 144)" fill="#22c55e" />
              <ellipse cx="154" cy="144" rx="14" ry="9" transform="rotate(15 154 144)" fill="#22c55e" />
            </>
          )}

          {resolvedSpecies === 'PANDA_ROJO' && (
            <>
              {/* Cola anillada esponjosa */}
              <path
                d="M140 152 Q182 146 174 110 Q162 102 144 128 Z"
                fill={bodyColors.main}
              />
              <path d="M154 134 Q166 132 171 124" stroke="#7c2d12" strokeWidth="5" strokeLinecap="round" />
              <path d="M148 144 Q162 144 170 138" stroke="#ffedd5" strokeWidth="4" strokeLinecap="round" />
              {/* Orejas puntiagudas con borde crema */}
              <polygon points="56,82 46,44 82,64" fill={bodyColors.main} />
              <polygon points="59,74 52,52 75,65" fill="#fff7ed" />
              <polygon points="144,82 154,44 118,64" fill={bodyColors.main} />
              <polygon points="141,74 148,52 125,65" fill="#fff7ed" />
            </>
          )}

          {resolvedSpecies === 'SHIBA_TOKIO' && (
            <>
              {/* Cola enroscada característica */}
              <path
                d="M142 146 Q176 138 168 112 Q158 104 150 120 Q158 124 144 134 Z"
                fill={bodyColors.main}
              />
              {/* Orejas triangulares Shiba */}
              <polygon points="55,84 46,42 84,64" fill={bodyColors.main} />
              <polygon points="60,76 54,52 76,66" fill="#fef3c7" />
              <polygon points="145,84 154,42 116,64" fill={bodyColors.main} />
              <polygon points="140,76 146,52 124,66" fill="#fef3c7" />
            </>
          )}

          {resolvedSpecies === 'ZORRO_ARTICO' && (
            <>
              {/* Cola nevada */}
              <path
                d="M142 150 Q180 144 172 112 Q160 104 144 128 Z"
                fill="#e2e8f0"
              />
              <circle cx="168" cy="116" r="8" fill="#ffffff" />
              {/* Orejas árticas */}
              <polygon points="56,82 44,40 84,64" fill="#e2e8f0" />
              <polygon points="60,75 53,50 76,65" fill="#bae6fd" />
              <polygon points="144,82 156,40 116,64" fill="#e2e8f0" />
              <polygon points="140,75 147,50 124,65" fill="#bae6fd" />
            </>
          )}

          {resolvedSpecies === 'KOALA_AUSSIE' && (
            <>
              {/* Grandes orejas redondas y esponjosas */}
              <circle cx="52" cy="82" r="22" fill={bodyColors.main} />
              <circle cx="52" cy="82" r="13" fill="#f1f5f9" />
              <circle cx="148" cy="82" r="22" fill={bodyColors.main} />
              <circle cx="148" cy="82" r="13" fill="#f1f5f9" />
            </>
          )}

          {resolvedSpecies === 'PINGUINO_SUR' && (
            <>
              {/* Aletas laterales */}
              <ellipse
                cx="48"
                cy="128"
                rx="13"
                ry="30"
                transform="rotate(16 48 128)"
                fill={bodyColors.dark}
              />
              <ellipse
                cx="152"
                cy="128"
                rx="13"
                ry="30"
                transform="rotate(-16 152 128)"
                fill={bodyColors.dark}
              />
            </>
          )}

          {/* Silueta principal */}
          <ellipse
            cx="100"
            cy="116"
            rx={resolvedSpecies === 'TORTUGA_GALAPAGOS' ? 42 : 48}
            ry={resolvedSpecies === 'TORTUGA_GALAPAGOS' ? 44 : 50}
            fill={resolvedSpecies === 'ZORRO_ARTICO' ? '#f8fafc' : bodyColors.main}
          />

          {/* Detalles faciales/pecho específicos de cada especie */}
          {resolvedSpecies === 'CONDOR_ANDES' ? (
            <>
              {/* Collar blanco esponjoso icónico del Cóndor Andino */}
              <path
                d="M56 122 Q70 114 82 124 Q100 114 118 124 Q130 114 144 122 Q132 138 100 138 Q68 138 56 122 Z"
                fill="#f8fafc"
              />
              <ellipse cx="100" cy="146" rx="26" ry="18" fill="#334155" />
            </>
          ) : resolvedSpecies === 'PINGUINO_SUR' ? (
            <>
              {/* Pecho blanco + mancha dorada emperador */}
              <ellipse cx="100" cy="132" rx="34" ry="33" fill="#ffffff" />
              <path d="M72 114 Q100 126 128 114 Q118 104 100 108 Q82 104 72 114 Z" fill="#f59e0b" opacity="0.9" />
            </>
          ) : resolvedSpecies === 'PANDA_ROJO' ? (
            <>
              {/* Máscara blanca y mejillas oscuras */}
              <ellipse cx="100" cy="132" rx="30" ry="26" fill={bodyColors.dark} />
              <ellipse cx="100" cy="108" rx="30" ry="18" fill="#fff7ed" />
            </>
          ) : resolvedSpecies === 'SHIBA_TOKIO' ? (
            <>
              {/* Máscara crema Shiba + cejitas */}
              <ellipse cx="100" cy="132" rx="32" ry="28" fill={bodyColors.light} />
              <ellipse cx="100" cy="109" rx="28" ry="16" fill="#fffbeb" />
              <circle cx="81" cy="79" r="4" fill="#fffbeb" />
              <circle cx="119" cy="79" r="4" fill="#fffbeb" />
            </>
          ) : (
            <ellipse cx="100" cy="130" rx="32" ry="30" fill={bodyColors.light} />
          )}

          {/* Detalle evolutivo etapa 2+ */}
          {etapa >= 2 && resolvedSpecies !== 'CONDOR_ANDES' && (
            <path
              d="M84 128 Q92 135 100 128 Q108 135 116 128"
              fill="none"
              stroke={bodyColors.main}
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.3"
            />
          )}

          {/* Patitas */}
          <ellipse
            cx="82"
            cy="164"
            rx="11"
            ry="6"
            fill={isBird ? '#f59e0b' : bodyColors.dark}
          />
          <ellipse
            cx="118"
            cy="164"
            rx="11"
            ry="6"
            fill={isBird ? '#f59e0b' : bodyColors.dark}
          />

          {/* Ojos y expresiones emocionales */}
          {mood === 'DESCANSANDO' ? (
            <>
              <path
                d="M72 96 Q81 102 90 96"
                fill="none"
                stroke={resolvedSpecies === 'ZORRO_ARTICO' ? '#334155' : '#ffffff'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M110 96 Q119 102 128 96"
                fill="none"
                stroke={resolvedSpecies === 'ZORRO_ARTICO' ? '#334155' : '#ffffff'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <text x="142" y="64" fill="#fde68a" fontSize="15" fontWeight="700">
                zZ
              </text>
            </>
          ) : mood === 'EMOCIONADA' ? (
            <>
              <circle cx="81" cy="95" r="11" fill="#ffffff" />
              <circle cx="119" cy="95" r="11" fill="#ffffff" />
              <path
                d="M74 96 Q81 88 88 96"
                fill="none"
                stroke="#0f172a"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <path
                d="M112 96 Q119 88 126 96"
                fill="none"
                stroke="#0f172a"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <polygon points="36,52 39,60 47,63 39,66 36,74 33,66 25,63 33,60" fill="#fbbf24" />
              <polygon points="164,48 167,55 174,58 167,61 164,68 161,61 154,58 161,55" fill="#fbbf24" />
            </>
          ) : mood === 'TRISTE' ? (
            <>
              <circle cx="81" cy="96" r="10.5" fill="#ffffff" />
              <circle cx="119" cy="96" r="10.5" fill="#ffffff" />
              <circle cx="81" cy="98" r="5" fill="#0f172a" />
              <circle cx="119" cy="98" r="5" fill="#0f172a" />
              <circle cx="79" cy="95" r="2" fill="#ffffff" />
              <circle cx="117" cy="95" r="2" fill="#ffffff" />
              <path
                d="M71 83 L86 86"
                stroke={resolvedSpecies === 'ZORRO_ARTICO' ? '#334155' : '#ffffff'}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M129 83 L114 86"
                stroke={resolvedSpecies === 'ZORRO_ARTICO' ? '#334155' : '#ffffff'}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <circle cx="81" cy="95" r="11.5" fill="#ffffff" />
              <circle cx="119" cy="95" r="11.5" fill="#ffffff" />
              <circle cx={mood === 'ESPERANDO' ? 83 : 81} cy="95" r="5.5" fill="#0f172a" />
              <circle cx={mood === 'ESPERANDO' ? 121 : 119} cy="95" r="5.5" fill="#0f172a" />
              <circle cx="79" cy="92" r="2.2" fill="#ffffff" />
              <circle cx="117" cy="92" r="2.2" fill="#ffffff" />
            </>
          )}

          {/* Mejillas */}
          <ellipse cx="66" cy="107" rx="6" ry="3.5" fill={bodyColors.cheek} opacity="0.55" />
          <ellipse cx="134" cy="107" rx="6" ry="3.5" fill={bodyColors.cheek} opacity="0.55" />

          {/* Pico / Nariz / Boca según especie */}
          {isBird ? (
            <polygon
              points={resolvedSpecies === 'CONDOR_ANDES' ? '92,102 108,102 100,117' : '94,104 106,104 100,115'}
              fill={resolvedSpecies === 'CONDOR_ANDES' ? '#eab308' : '#f59e0b'}
            />
          ) : resolvedSpecies === 'KOALA_AUSSIE' ? (
            <>
              {/* Nariz ovalada negra de koala */}
              <ellipse cx="100" cy="103" rx="7" ry="10" fill="#1e293b" />
              <path
                d={mood === 'TRISTE' ? 'M94 117 Q100 113 106 117' : 'M93 115 Q100 120 107 115'}
                fill="none"
                stroke="#0f172a"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </>
          ) : (
            <>
              <ellipse cx="100" cy="104" rx="4.8" ry="3.2" fill="#0f172a" />
              {mood === 'TRISTE' ? (
                <path
                  d="M93 114 Q100 109 107 114"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M92 110 Q100 118 108 110"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}
            </>
          )}

          {/* Vestimenta cuello: Bufanda institucional ALLEN */}
          {accesorioCuello === 'bufanda_allen' && (
            <g>
              <rect x="64" y="119" width="72" height="12" rx="6" fill="#cf080d" />
              <rect x="64" y="123" width="72" height="3" fill="#ffffff" opacity="0.85" />
              <path d="M114 128 L126 128 L130 152 L116 148 Z" fill="#cf080d" />
            </g>
          )}

          {/* Accesorios de cabeza */}
          {accesorioCabeza === 'lentes' && (
            <g fill="none" stroke="#f8fafc" strokeWidth="3">
              <circle cx="81" cy="95" r="13.5" />
              <circle cx="119" cy="95" r="13.5" />
              <line x1="94.5" y1="95" x2="105.5" y2="95" />
            </g>
          )}

          {accesorioCabeza === 'birrete' && (
            <g>
              <polygon points="100,42 142,56 100,70 58,56" fill="#011f52" stroke="#ffffff" strokeWidth="1.5" />
              <rect x="76" y="61" width="48" height="10" rx="3" fill="#011f52" />
              <line x1="136" y1="58" x2="142" y2="76" stroke="#fbbf24" strokeWidth="2.5" />
              <circle cx="142" cy="78" r="3.5" fill="#fbbf24" />
            </g>
          )}

          {accesorioCabeza === 'corona' && (
            <g>
              <polygon
                points="74,66 78,44 90,56 100,40 110,56 122,44 126,66"
                fill="#fbbf24"
                stroke="#b45309"
                strokeWidth="2"
              />
              <circle cx="100" cy="56" r="3" fill="#cf080d" />
            </g>
          )}

          {accesorioCabeza === 'audifonos' && (
            <g>
              <path
                d="M52 96 A48 48 0 0 1 148 96"
                fill="none"
                stroke="#cf080d"
                strokeWidth="5.5"
                strokeLinecap="round"
              />
              <rect x="44" y="84" width="12" height="24" rx="5" fill="#cf080d" stroke="#ffffff" strokeWidth="1.5" />
              <rect x="144" y="84" width="12" height="24" rx="5" fill="#cf080d" stroke="#ffffff" strokeWidth="1.5" />
            </g>
          )}
        </g>

        {/* Burbuja sutil si está esperando */}
        {mood === 'ESPERANDO' && size !== 'xs' && (
          <g>
            <circle cx="162" cy="44" r="14" fill="#ffffff" />
            <text x="157" y="49" fill="#cf080d" fontSize="16" fontWeight="800">
              !
            </text>
          </g>
        )}
      </svg>

      {size !== 'sm' && size !== 'xs' && (
        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/45 text-white text-[10px] font-bold tracking-wide backdrop-blur-xs">
          Etapa {etapa}/4
        </span>
      )}
    </div>
  );
}
