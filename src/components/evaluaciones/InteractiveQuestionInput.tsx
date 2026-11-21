import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  RotateCcw,
  X,
} from 'lucide-react';
import { countWords } from '../../lib/drive';
import {
  countBlanksInTemplate,
  deterministicShuffle,
  extractColumnItems,
  extractPairs,
  extractSentencePool,
  extractWordBank,
  extractWordPool,
  splitBlankTemplate,
  type PairItem,
  type RelacionarColumnasOpciones,
} from '../../lib/exam-questions';
import type { PreguntaItem } from '../../types/aula';

interface InteractiveQuestionInputProps {
  pregunta: PreguntaItem;
  value: unknown;
  onChange: (nextValue: unknown) => void;
  disabled?: boolean;
}

const PAIR_COLORS = [
  '#011f52',
  '#cf080d',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#0369a1',
  '#be185d',
  '#15803d',
];

interface ArrowLineCoord {
  leftId: string;
  rightText: string;
  color: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface ArrowMatchBoardProps {
  preguntaId: string;
  list: PairItem[];
  rightChoices: string[];
  colALabel: string;
  colBLabel: string;
  currentMap: Record<string, string>;
  disabled: boolean;
  onAssign: (leftId: string, rightText: string) => void;
  onClearAll: () => void;
}

function ArrowMatchBoard({
  preguntaId,
  list,
  rightChoices,
  colALabel,
  colBLabel,
  currentMap,
  disabled,
  onAssign,
  onClearAll,
}: ArrowMatchBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftDotRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const rightDotRefs = useRef<Record<number, HTMLSpanElement | null>>({});

  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [draggingLeftId, setDraggingLeftId] = useState<string | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [hoverRightIdx, setHoverRightIdx] = useState<number | null>(null);
  const [lines, setLines] = useState<ArrowLineCoord[]>([]);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const colorByLeftId = useMemo(() => {
    const map: Record<string, string> = {};
    list.forEach((item, idx) => {
      map[item.id] = PAIR_COLORS[idx % PAIR_COLORS.length];
    });
    return map;
  }, [list]);

  const recomputeLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setSvgSize({ width: cRect.width, height: cRect.height });

    const nextLines: ArrowLineCoord[] = [];
    for (const item of list) {
      const matchedRight = currentMap[item.id];
      if (!matchedRight) continue;
      const rightIdx = rightChoices.indexOf(matchedRight);
      if (rightIdx === -1) continue;
      const leftEl = leftDotRefs.current[item.id];
      const rightEl = rightDotRefs.current[rightIdx];
      if (!leftEl || !rightEl) continue;

      const lRect = leftEl.getBoundingClientRect();
      const rRect = rightEl.getBoundingClientRect();
      nextLines.push({
        leftId: item.id,
        rightText: matchedRight,
        color: colorByLeftId[item.id] || '#011f52',
        x1: lRect.left + lRect.width / 2 - cRect.left,
        y1: lRect.top + lRect.height / 2 - cRect.top,
        x2: rRect.left + rRect.width / 2 - cRect.left,
        y2: rRect.top + rRect.height / 2 - cRect.top,
      });
    }
    setLines(nextLines);
  }, [list, rightChoices, currentMap, colorByLeftId]);

  useLayoutEffect(() => {
    recomputeLines();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputeLines());
    ro.observe(container);
    window.addEventListener('resize', recomputeLines);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recomputeLines);
    };
  }, [recomputeLines]);

  const findRightIdxAtPoint = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const target = el.closest('[data-right-idx]') as HTMLElement | null;
    if (!target) return null;
    const raw = target.getAttribute('data-right-idx');
    const parsed = raw !== null ? Number(raw) : NaN;
    return Number.isInteger(parsed) && parsed >= 0 && parsed < rightChoices.length ? parsed : null;
  };

  const handleStartDrag = (e: React.PointerEvent, leftId: string) => {
    if (disabled) return;
    const container = containerRef.current;
    const dotEl = leftDotRefs.current[leftId];
    if (!container || !dotEl) return;

    const cRect = container.getBoundingClientRect();
    const dRect = dotEl.getBoundingClientRect();
    const origin = {
      x: dRect.left + dRect.width / 2 - cRect.left,
      y: dRect.top + dRect.height / 2 - cRect.top,
    };
    const startPointer = {
      x: e.clientX - cRect.left,
      y: e.clientY - cRect.top,
    };

    setDraggingLeftId(leftId);
    setDragOrigin(origin);
    setDragPointer(startPointer);
    setHoverRightIdx(null);

    const onMove = (moveEvt: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      setDragPointer({
        x: moveEvt.clientX - rect.left,
        y: moveEvt.clientY - rect.top,
      });
      setHoverRightIdx(findRightIdxAtPoint(moveEvt.clientX, moveEvt.clientY));
    };

    const onUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      const dropIdx = findRightIdxAtPoint(upEvt.clientX, upEvt.clientY);
      const movedDist = Math.hypot(upEvt.clientX - e.clientX, upEvt.clientY - e.clientY);

      if (dropIdx !== null) {
        onAssign(leftId, rightChoices[dropIdx]);
        setSelectedLeftId(null);
      } else if (movedDist < 8) {
        // Clic simple: activar modo clic-para-conectar
        setSelectedLeftId((prev) => (prev === leftId ? null : leftId));
      }

      setDraggingLeftId(null);
      setDragOrigin(null);
      setDragPointer(null);
      setHoverRightIdx(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleRightClick = (choice: string) => {
    if (disabled) return;
    if (selectedLeftId) {
      onAssign(selectedLeftId, choice);
      setSelectedLeftId(null);
      return;
    }
    // Si la tarjeta derecha ya está conectada y no hay selección izquierda, desconectarla al hacer clic en su X
    const ownerLeft = Object.entries(currentMap).find(([, val]) => val === choice)?.[0];
    if (ownerLeft) {
      setSelectedLeftId(ownerLeft);
    }
  };

  const pairedCount = Object.values(currentMap).filter(Boolean).length;

  const buildCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="space-y-3" data-testid="arrow-matching-board">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Arrastra una flecha desde un elemento de la izquierda hasta su pareja en la derecha, o haz clic primero en la izquierda y luego en la derecha.
        </p>
        {pairedCount > 0 && !disabled && (
          <button
            type="button"
            onClick={() => {
              onClearAll();
              setSelectedLeftId(null);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-[#cf080d]"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Limpiar flechas ({pairedCount}/{list.length})</span>
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative select-none rounded-xl border border-[#d9d9d9] bg-[#f5f6f8]/60 p-3 sm:p-4"
      >
        {/* Capa SVG de flechas conectoras */}
        <svg
          width={svgSize.width}
          height={svgSize.height}
          className="pointer-events-none absolute inset-0 z-10 overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {list.map((item) => {
              const col = colorByLeftId[item.id] || '#011f52';
              return (
                <marker
                  key={`marker-${preguntaId}-${item.id}`}
                  id={`arrow-${preguntaId}-${item.id}`}
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill={col} />
                </marker>
              );
            })}
            <marker
              id={`arrow-drag-${preguntaId}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#cf080d" />
            </marker>
          </defs>

          {lines.map((line) => (
            <path
              key={`${line.leftId}-${line.rightText}`}
              d={buildCurvePath(line.x1, line.y1, line.x2, line.y2)}
              fill="none"
              stroke={line.color}
              strokeWidth={2.75}
              strokeLinecap="round"
              markerEnd={`url(#arrow-${preguntaId}-${line.leftId})`}
              data-testid="match-arrow-line"
            />
          ))}

          {draggingLeftId && dragOrigin && dragPointer && (
            <path
              d={buildCurvePath(dragOrigin.x, dragOrigin.y, dragPointer.x, dragPointer.y)}
              fill="none"
              stroke="#cf080d"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
              markerEnd={`url(#arrow-drag-${preguntaId})`}
            />
          )}
        </svg>

        {/* Dos columnas con espacio central para las flechas */}
        <div className="relative z-20 grid grid-cols-2 gap-10 sm:gap-16 md:gap-24 items-start">
          {/* Columna A (Izquierda) */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#011f52]/80 px-1">
              {colALabel}
            </p>
            {list.map((item, idx) => {
              const matched = currentMap[item.id] || '';
              const isSelected = selectedLeftId === item.id || draggingLeftId === item.id;
              const pairColor = colorByLeftId[item.id] || '#011f52';
              return (
                <div
                  key={item.id}
                  data-left-id={item.id}
                  onPointerDown={(e) => handleStartDrag(e, item.id)}
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onKeyDown={(e) => {
                    if (disabled) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedLeftId((prev) => (prev === item.id ? null : item.id));
                    }
                  }}
                  aria-pressed={isSelected}
                  className={`relative flex items-center gap-2.5 p-3 pr-5 rounded-xl border-2 bg-white transition-all touch-none ${
                    disabled ? 'opacity-70 cursor-default' : 'cursor-grab active:cursor-grabbing'
                  } ${
                    isSelected
                      ? 'border-[#cf080d] shadow-md ring-2 ring-[#cf080d]/20'
                      : matched
                        ? 'border-[#011f52]/60 shadow-xs'
                        : 'border-[#d9d9d9] hover:border-[#011f52]'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-md text-white text-xs font-bold flex items-center justify-center shrink-0"
                    style={{ backgroundColor: pairColor }}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs sm:text-sm font-semibold text-[#011f52] block leading-snug">
                      {item.left}
                    </span>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.left}
                        className="mt-1.5 h-14 w-20 object-cover rounded-lg border border-[#d9d9d9]"
                      />
                    )}
                  </div>
                  {matched && !disabled && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssign(item.id, '');
                      }}
                      aria-label={`Desconectar ${item.left}`}
                      title="Quitar flecha"
                      className="p-1 text-slate-400 hover:text-[#cf080d] rounded shrink-0"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {/* Punto conector derecho */}
                  <span
                    ref={(el) => {
                      leftDotRefs.current[item.id] = el;
                    }}
                    aria-hidden="true"
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-xs transition-transform"
                    style={{
                      backgroundColor: isSelected ? '#cf080d' : matched ? pairColor : '#011f52',
                      transform: isSelected ? 'translateY(-50%) scale(1.2)' : 'translateY(-50%)',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Columna B (Derecha) */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#011f52]/80 px-1">
              {colBLabel}
            </p>
            {rightChoices.map((choice, idx) => {
              const ownerEntry = Object.entries(currentMap).find(([, val]) => val === choice);
              const ownerLeftId = ownerEntry?.[0] || null;
              const ownerIndex = ownerLeftId ? list.findIndex((i) => i.id === ownerLeftId) : -1;
              const ownerColor = ownerLeftId ? colorByLeftId[ownerLeftId] : null;
              const isDropTarget = hoverRightIdx === idx;
              const letter = String.fromCharCode(65 + idx);

              return (
                <button
                  key={`${choice}-${idx}`}
                  type="button"
                  disabled={disabled}
                  data-right-idx={idx}
                  onClick={() => handleRightClick(choice)}
                  className={`relative w-full text-left flex items-center gap-2.5 p-3 pl-5 rounded-xl border-2 bg-white transition-all ${
                    isDropTarget
                      ? 'border-[#cf080d] bg-[#cf080d]/5 shadow-md scale-[1.01]'
                      : selectedLeftId
                        ? 'border-[#011f52]/50 hover:border-[#cf080d] hover:bg-[#011f52]/[0.03] cursor-pointer'
                        : ownerLeftId
                          ? 'border-[#011f52]/55 bg-white'
                          : 'border-[#d9d9d9] hover:border-[#011f52]/50'
                  }`}
                >
                  {/* Punto conector izquierdo */}
                  <span
                    ref={(el) => {
                      rightDotRefs.current[idx] = el;
                    }}
                    aria-hidden="true"
                    className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-xs"
                    style={{
                      backgroundColor: isDropTarget
                        ? '#cf080d'
                        : ownerColor || (selectedLeftId ? '#011f52' : '#94a3b8'),
                    }}
                  />

                  <span className="w-6 h-6 rounded-md bg-[#011f52]/10 text-[#011f52] text-xs font-bold flex items-center justify-center shrink-0">
                    {letter}
                  </span>
                  <span className="flex-1 text-xs sm:text-sm font-medium text-slate-800 leading-snug">
                    {choice}
                  </span>
                  {ownerIndex >= 0 && ownerColor && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[11px] font-bold text-white shrink-0"
                      style={{ backgroundColor: ownerColor }}
                    >
                      #{ownerIndex + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedLeftId && (
        <p className="text-xs font-semibold text-[#cf080d]">
          Elemento seleccionado: ahora haz clic en su pareja en {colBLabel} para trazar la flecha.
        </p>
      )}
    </div>
  );
}

export function InteractiveQuestionInput({
  pregunta,
  value,
  onChange,
  disabled = false,
}: InteractiveQuestionInputProps) {
  const [activeBlankIdx, setActiveBlankIdx] = useState<number>(0);

  const pairs = useMemo(() => extractPairs(pregunta.opciones), [pregunta.opciones]);
  const columnItems = useMemo(() => extractColumnItems(pregunta.opciones), [pregunta.opciones]);
  const wordPool = useMemo(() => extractWordPool(pregunta.opciones), [pregunta.opciones]);
  const sentencePool = useMemo(() => extractSentencePool(pregunta.opciones), [pregunta.opciones]);
  const wordBank = useMemo(() => extractWordBank(pregunta.opciones), [pregunta.opciones]);

  const shuffledPairRights = useMemo(
    () => deterministicShuffle(pairs.map((p) => p.right), `${pregunta.id}-pairs`),
    [pairs, pregunta.id],
  );
  const shuffledColumnRights = useMemo(
    () => deterministicShuffle(columnItems.map((p) => p.right), `${pregunta.id}-cols`),
    [columnItems, pregunta.id],
  );
  const shuffledWords = useMemo(
    () => deterministicShuffle(wordPool, `${pregunta.id}-words`),
    [wordPool, pregunta.id],
  );
  const shuffledSentences = useMemo(
    () => deterministicShuffle(sentencePool, `${pregunta.id}-sentences`),
    [sentencePool, pregunta.id],
  );
  const shuffledWordBank = useMemo(
    () => deterministicShuffle(wordBank, `${pregunta.id}-bank`),
    [wordBank, pregunta.id],
  );

  // 1. OPCION_MULTIPLE (Seleccionar la respuesta correcta)
  if (pregunta.tipo === 'OPCION_MULTIPLE') {
    const options = Array.isArray(pregunta.opciones) ? pregunta.opciones.map(String) : [];
    return (
      <div className="space-y-2.5" role="radiogroup" aria-label={pregunta.enunciado}>
        {options.map((opt, idx) => {
          const checked = value === opt;
          const letter = String.fromCharCode(65 + idx);
          return (
            <label
              key={`${opt}-${idx}`}
              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                checked
                  ? 'border-[#011f52] bg-[#011f52]/5 text-[#011f52]'
                  : 'border-[#d9d9d9] bg-white hover:bg-[#f5f6f8] text-slate-800'
              } ${disabled ? 'opacity-70 pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name={`q-${pregunta.id}`}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(opt)}
                className="accent-[#011f52]"
              />
              <span
                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                  checked ? 'bg-[#011f52] text-white' : 'bg-[#f5f6f8] text-[#011f52]'
                }`}
              >
                {letter}
              </span>
              <span className="text-sm font-medium">{opt}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // 2. SELECCION_MULTIPLE (Una o varias respuestas correctas)
  if (pregunta.tipo === 'SELECCION_MULTIPLE') {
    const options = Array.isArray(pregunta.opciones) ? pregunta.opciones.map(String) : [];
    const selected = Array.isArray(value) ? value.map(String) : [];

    const toggleOption = (opt: string) => {
      if (selected.includes(opt)) {
        onChange(selected.filter((x) => x !== opt));
      } else {
        onChange([...selected, opt]);
      }
    };

    return (
      <div className="space-y-2.5">
        <p className="text-xs font-medium text-slate-600">
          Marca todas las opciones que consideres correctas ({selected.length} seleccionada(s)).
        </p>
        {options.map((opt, idx) => {
          const checked = selected.includes(opt);
          return (
            <label
              key={`${opt}-${idx}`}
              className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                checked
                  ? 'border-[#011f52] bg-[#011f52]/5 text-[#011f52]'
                  : 'border-[#d9d9d9] bg-white hover:bg-[#f5f6f8] text-slate-800'
              } ${disabled ? 'opacity-70 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleOption(opt)}
                className="w-4 h-4 accent-[#011f52] rounded"
              />
              <span className="text-sm font-medium flex-1">{opt}</span>
              {checked && <Check className="w-4 h-4 text-[#011f52] shrink-0" aria-hidden="true" />}
            </label>
          );
        })}
      </div>
    );
  }

  // 3. UNIR_PAREJAS & 7. RELACIONAR_COLUMNAS (con flechas interactivas entre 2 columnas)
  if (pregunta.tipo === 'UNIR_PAREJAS' || pregunta.tipo === 'RELACIONAR_COLUMNAS') {
    const isColumns = pregunta.tipo === 'RELACIONAR_COLUMNAS';
    const list = isColumns ? columnItems : pairs;
    const rightChoices = isColumns ? shuffledColumnRights : shuffledPairRights;
    const colMeta = isColumns
      ? (pregunta.opciones as Partial<RelacionarColumnasOpciones> | null)
      : null;
    const colALabel = colMeta?.columnALabel || 'Columna A';
    const colBLabel = colMeta?.columnBLabel || 'Columna B';

    const currentMap: Record<string, string> =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, string>) }
        : {};

    const assignPair = (leftId: string, rightText: string) => {
      const next = { ...currentMap };
      if (!rightText) {
        delete next[leftId];
      } else {
        for (const key of Object.keys(next)) {
          if (next[key] === rightText && key !== leftId) {
            delete next[key];
          }
        }
        next[leftId] = rightText;
      }
      onChange(next);
    };

    return (
      <ArrowMatchBoard
        preguntaId={pregunta.id}
        list={list}
        rightChoices={rightChoices}
        colALabel={colALabel}
        colBLabel={colBLabel}
        currentMap={currentMap}
        disabled={disabled}
        onAssign={assignPair}
        onClearAll={() => onChange({})}
      />
    );
  }

  // 4. COMPLETAR_ESPACIOS (Escribir las palabras faltantes donde aparece ___)
  if (pregunta.tipo === 'COMPLETAR_ESPACIOS') {
    const segments = splitBlankTemplate(pregunta.enunciado);
    const blankCount = Math.max(1, countBlanksInTemplate(pregunta.enunciado));
    const answers = Array.isArray(value)
      ? Array.from({ length: blankCount }, (_, i) => String(value[i] ?? ''))
      : Array.from({ length: blankCount }, () => '');

    const updateBlank = (idx: number, text: string) => {
      const next = [...answers];
      next[idx] = text;
      onChange(next);
    };

    const hasInlineBlanks = segments.length > 1;

    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          Escribe la palabra correcta en cada espacio en blanco.
        </p>
        {hasInlineBlanks ? (
          <div className="p-4 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] text-base leading-loose text-[#011f52]">
            {segments.map((seg, idx) => (
              <React.Fragment key={idx}>
                <span>{seg}</span>
                {idx < segments.length - 1 && (
                  <input
                    type="text"
                    disabled={disabled}
                    aria-label={`Espacio ${idx + 1}`}
                    value={answers[idx] || ''}
                    onChange={(e) => updateBlank(idx, e.target.value)}
                    placeholder={`Espacio ${idx + 1}`}
                    className="inline-block w-36 mx-1.5 px-2.5 py-1 bg-white border-b-2 border-[#011f52] rounded-t text-sm font-semibold text-[#011f52] focus:outline-none focus:border-[#cf080d]"
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <input
            type="text"
            disabled={disabled}
            aria-label="Completar espacio"
            value={answers[0] || ''}
            onChange={(e) => updateBlank(0, e.target.value)}
            placeholder="Escribe la palabra faltante..."
            className="w-full px-3.5 py-2.5 border border-[#d9d9d9] rounded-xl text-sm text-[#011f52]"
          />
        )}
      </div>
    );
  }

  // 8. COMPLETAR_OPCIONES (Completar ___ seleccionando de un banco de palabras)
  if (pregunta.tipo === 'COMPLETAR_OPCIONES') {
    const segments = splitBlankTemplate(pregunta.enunciado);
    const blankCount = Math.max(1, countBlanksInTemplate(pregunta.enunciado));
    const answers = Array.isArray(value)
      ? Array.from({ length: blankCount }, (_, i) => String(value[i] ?? ''))
      : Array.from({ length: blankCount }, () => '');

    const safeActiveIdx = Math.min(activeBlankIdx, blankCount - 1);

    // Contar cuántas veces aparece cada palabra en el banco y cuántas veces se ha usado
    const bankCounts = new Map<string, number>();
    for (const w of shuffledWordBank) {
      bankCounts.set(w, (bankCounts.get(w) ?? 0) + 1);
    }
    const usedCounts = new Map<string, number>();
    for (const a of answers) {
      if (a) usedCounts.set(a, (usedCounts.get(a) ?? 0) + 1);
    }

    const pickWord = (word: string) => {
      const next = [...answers];
      let targetIdx = safeActiveIdx;
      if (next[targetIdx]) {
        const firstEmpty = next.findIndex((x) => !x);
        if (firstEmpty !== -1) targetIdx = firstEmpty;
      }
      next[targetIdx] = word;
      onChange(next);
      const nextEmpty = next.findIndex((x) => !x);
      if (nextEmpty !== -1) setActiveBlankIdx(nextEmpty);
    };

    const clearBlank = (idx: number) => {
      const next = [...answers];
      next[idx] = '';
      onChange(next);
      setActiveBlankIdx(idx);
    };

    return (
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Haz clic en una palabra del banco para completar cada espacio. Haz clic en un espacio lleno para liberarlo.
        </p>

        <div className="p-4 rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] text-base leading-loose text-[#011f52]">
          {segments.length > 1 ? (
            segments.map((seg, idx) => (
              <React.Fragment key={idx}>
                <span>{seg}</span>
                {idx < segments.length - 1 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => (answers[idx] ? clearBlank(idx) : setActiveBlankIdx(idx))}
                    className={`inline-flex items-center gap-1 mx-1.5 px-3 py-0.5 rounded-lg border text-sm font-semibold align-baseline transition-colors ${
                      answers[idx]
                        ? 'bg-[#011f52] text-white border-[#011f52]'
                        : safeActiveIdx === idx
                          ? 'bg-white text-[#cf080d] border-[#cf080d] border-dashed'
                          : 'bg-white text-slate-500 border-slate-400 border-dashed'
                    }`}
                  >
                    <span>{answers[idx] || `Espacio ${idx + 1}`}</span>
                    {answers[idx] && <X className="w-3 h-3" aria-hidden="true" />}
                  </button>
                )}
              </React.Fragment>
            ))
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => (answers[0] ? clearBlank(0) : setActiveBlankIdx(0))}
              className="px-3 py-1 rounded-lg border border-[#011f52] bg-white text-sm font-semibold text-[#011f52]"
            >
              {answers[0] || 'Selecciona una opción del banco'}
            </button>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#011f52]/75">
              Banco de palabras
            </span>
            {answers.some(Boolean) && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(Array.from({ length: blankCount }, () => ''));
                  setActiveBlankIdx(0);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#cf080d]"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {shuffledWordBank.map((word, idx) => {
              // Permitir palabras repetidas en el banco verificando índice de ocurrencia
              const priorSameCount = shuffledWordBank
                .slice(0, idx)
                .filter((w) => w === word).length;
              const usedCount = usedCounts.get(word) ?? 0;
              const isConsumed = priorSameCount < usedCount;

              return (
                <button
                  key={`${word}-${idx}`}
                  type="button"
                  disabled={disabled || isConsumed}
                  onClick={() => pickWord(word)}
                  className={`px-3.5 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    isConsumed
                      ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                      : 'bg-white text-[#011f52] border-[#011f52]/30 hover:border-[#011f52] hover:bg-[#011f52]/5'
                  }`}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 5. ORDENAR_PALABRAS (Construir oración seleccionando palabras en orden)
  if (pregunta.tipo === 'ORDENAR_PALABRAS') {
    const placed = Array.isArray(value) ? value.map(String) : [];

    // Calcular ocurrencias usadas para soportar palabras repetidas como "the"
    const remainingPool = shuffledWords.map((word, idx) => {
      const priorSame = shuffledWords.slice(0, idx).filter((w) => w === word).length;
      const usedTotal = placed.filter((w) => w === word).length;
      return { word, idx, used: priorSame < usedTotal };
    });

    const addWord = (word: string) => {
      onChange([...placed, word]);
    };

    const removeWordAt = (pos: number) => {
      onChange(placed.filter((_, i) => i !== pos));
    };

    return (
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Haz clic en las palabras en el orden correcto para formar la oración. Haz clic sobre una palabra colocada para devolverla.
        </p>

        <div className="min-h-[68px] p-3.5 rounded-xl bg-[#f5f6f8] border-2 border-dashed border-[#011f52]/30 flex flex-wrap items-center gap-2">
          {placed.length === 0 ? (
            <span className="text-xs text-slate-500">
              Tu oración aparecerá aquí a medida que elijas las palabras...
            </span>
          ) : (
            placed.map((word, idx) => (
              <button
                key={`placed-${word}-${idx}`}
                type="button"
                disabled={disabled}
                onClick={() => removeWordAt(idx)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#011f52] text-white text-sm font-semibold hover:bg-[#cf080d] transition-colors"
              >
                <span>{word}</span>
                <X className="w-3 h-3 opacity-80" aria-hidden="true" />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#011f52]/75">
            Palabras disponibles ({remainingPool.filter((r) => !r.used).length})
          </span>
          {placed.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([])}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[#cf080d]"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Reiniciar orden</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {remainingPool.map(({ word, idx, used }) => (
            <button
              key={`pool-${word}-${idx}`}
              type="button"
              disabled={disabled || used}
              onClick={() => addWord(word)}
              className={`px-3.5 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                used
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52] hover:bg-[#011f52]/5'
              }`}
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 6. ORDENAR_ORACIONES (Organizar frases o párrafos en orden lógico)
  if (pregunta.tipo === 'ORDENAR_ORACIONES') {
    const ordered: string[] =
      Array.isArray(value) && value.length === shuffledSentences.length
        ? value.map(String)
        : shuffledSentences;

    const moveItem = (fromIdx: number, toIdx: number) => {
      if (toIdx < 0 || toIdx >= ordered.length) return;
      const next = [...ordered];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onChange(next);
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            Ordena las oraciones del principio al final usando las flechas Subir / Bajar.
          </p>
          {!Array.isArray(value) && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange([...ordered])}
              className="text-xs font-semibold text-[#011f52] hover:text-[#cf080d]"
            >
              Confirmar este orden
            </button>
          )}
        </div>
        <ol className="space-y-2">
          {ordered.map((sentence, idx) => (
            <li
              key={`${sentence}-${idx}`}
              className="p-3.5 rounded-xl border border-[#d9d9d9] bg-white flex items-center gap-3"
            >
              <span className="w-7 h-7 rounded-lg bg-[#011f52] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <p className="text-sm text-slate-800 flex-1 leading-relaxed">{sentence}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={disabled || idx === 0}
                  onClick={() => moveItem(idx, idx - 1)}
                  aria-label={`Subir oración ${idx + 1}`}
                  className="p-1.5 rounded-lg border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8] disabled:opacity-35"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={disabled || idx === ordered.length - 1}
                  onClick={() => moveItem(idx, idx + 1)}
                  aria-label={`Bajar oración ${idx + 1}`}
                  className="p-1.5 rounded-lg border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8] disabled:opacity-35"
                >
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  // 9. VERDADERO_FALSO (True / False)
  if (pregunta.tipo === 'VERDADERO_FALSO') {
    return (
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={pregunta.enunciado}>
        {[
          { label: 'True', val: true },
          { label: 'False', val: false },
        ].map((item) => {
          const checked = value === item.val;
          return (
            <label
              key={item.label}
              className={`flex items-center justify-center gap-2.5 p-4 rounded-xl border cursor-pointer font-semibold text-sm transition-colors ${
                checked
                  ? 'border-[#011f52] bg-[#011f52]/5 text-[#011f52]'
                  : 'border-[#d9d9d9] bg-white hover:bg-[#f5f6f8] text-slate-800'
              } ${disabled ? 'opacity-70 pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name={`q-${pregunta.id}`}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(item.val)}
                className="accent-[#011f52]"
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  // 10. RESPUESTA_CORTA
  if (pregunta.tipo === 'RESPUESTA_CORTA') {
    return (
      <input
        type="text"
        disabled={disabled}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe tu respuesta breve aquí..."
        aria-label={`Respuesta para ${pregunta.enunciado}`}
        className="w-full px-4 py-3 border border-[#d9d9d9] rounded-xl text-sm text-[#011f52] focus:outline-none focus:border-[#011f52]"
      />
    );
  }

  // 11. WRITING
  const textVal = String(value ?? '');
  const words = countWords(textVal);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>Redacción evaluada por el docente</span>
        <span className="font-mono-data font-semibold tabular-nums text-[#011f52]">
          {words} palabras
          {pregunta.minPalabras || pregunta.maxPalabras
            ? ` · meta ${pregunta.minPalabras ?? 0}–${pregunta.maxPalabras ?? '∞'}`
            : ''}
        </span>
      </div>
      <textarea
        rows={8}
        disabled={disabled}
        value={textVal}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Redacta tu texto en inglés con buena estructura, vocabulario y coherencia..."
        aria-label={`Redacción para ${pregunta.enunciado}`}
        className="w-full px-4 py-3 border border-[#d9d9d9] rounded-xl text-sm text-[#011f52] leading-relaxed focus:outline-none focus:border-[#011f52]"
      />
    </div>
  );
}
