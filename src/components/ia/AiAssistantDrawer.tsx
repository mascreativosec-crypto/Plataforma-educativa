import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AulaRol } from '../../types/aula';

export type QuickAiAction = 'resumir' | 'explicar' | 'vocabulario' | 'saludo' | 'rubrica';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  rol: AulaRol;
  cursoNombre: string;
  nivelMcer?: string | null;
  leccionTitulo?: string | null;
  leccionContenido?: string | null;
  initialQuickAction?: {
    accion: QuickAiAction;
    nonce: number;
  } | null;
}

const ACTION_LABELS: Record<QuickAiAction, string> = {
  resumir: 'Resumir lección',
  explicar: 'Explicar paso a paso',
  vocabulario: 'Vocabulario clave MCER',
  saludo: 'Redactar saludo (Greeting)',
  rubrica: 'Rúbrica Cambridge',
};

export function AiAssistantDrawer({
  open,
  onClose,
  rol,
  cursoNombre,
  nivelMcer,
  leccionTitulo,
  leccionContenido,
  initialQuickAction,
}: AiAssistantDrawerProps) {
  const isDocente = rol === 'ADMIN' || rol === 'PROFESOR';

  const [mode, setMode] = useState<'chat' | 'quick'>('chat');
  const [activeAction, setActiveAction] = useState<QuickAiAction | null>(null);
  const [quickOutput, setQuickOutput] = useState<string>('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastNonceRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const runQuickAction = async (accion: QuickAiAction) => {
    setMode('quick');
    setActiveAction(accion);
    setQuickLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await apiFetch<{ respuesta: string }>('/api/ia/accion-leccion', {
        method: 'POST',
        body: JSON.stringify({
          accion,
          cursoNombre,
          nivelMcer: nivelMcer || 'A2',
          titulo: leccionTitulo || cursoNombre,
          contenido: leccionContenido || '',
        }),
      });
      setQuickOutput(data.respuesta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el asistente de IA.');
    } finally {
      setQuickLoading(false);
    }
  };

  useEffect(() => {
    if (open && initialQuickAction && initialQuickAction.nonce !== lastNonceRef.current) {
      lastNonceRef.current = initialQuickAction.nonce;
      runQuickAction(initialQuickAction.accion);
    }
  }, [open, initialQuickAction]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatLoading]);

  if (!open) return null;

  const handleSendChat = async (e?: React.FormEvent, presetText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (presetText ?? input).trim();
    if (textToSend.length < 2 || chatLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: textToSend,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setChatLoading(true);
    setMode('chat');

    try {
      const data = await apiFetch<{ respuesta: string }>('/api/ia/asistente', {
        method: 'POST',
        body: JSON.stringify({
          mensaje: textToSend,
          cursoNombre,
          nivelMcer: nivelMcer || 'A2',
          leccionTitulo: leccionTitulo || null,
          leccionContenido: leccionContenido || null,
          historial: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}`, role: 'model', text: data.respuesta },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener respuesta de la IA.');
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  };

  const suggestedPrompts = isDocente
    ? [
        'Redacta una actividad comunicativa de 15 min para esta lección',
        'Propón una consigna de Writing Cambridge con criterio de evaluación',
        'Sugiere 5 frases modelo y errores comunes del nivel',
      ]
    : [
        'Explícame esta gramática con 3 ejemplos fáciles',
        'Dame un ejercicio rápido de práctica y corrígeme',
        '¿Qué conectores debo usar en mi Writing de este nivel?',
      ];

  const quickButtons: QuickAiAction[] = isDocente
    ? ['resumir', 'explicar', 'vocabulario', 'rubrica', 'saludo']
    : ['resumir', 'explicar', 'vocabulario'];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35"
      role="dialog"
      aria-modal="true"
      aria-label="Asistente IA de ALLEN Aula"
    >
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
        {/* Header estilo Moodle 5.0 AI Drawer */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-[#f8fafc]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-[#2f5597] text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-[#0f172a] truncate">
                {isDocente ? 'Copiloto Docente IA' : 'Tutor de Inglés IA'}
              </h2>
              <p className="text-xs text-[#475569] truncate">
                {leccionTitulo || cursoNombre} · MCER {nivelMcer || 'A2'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente IA"
            className="p-1.5 rounded-lg text-[#475569] hover:text-[#0f172a] hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Selector de modo + Acciones rápidas */}
        <div className="px-5 py-3 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('chat')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                mode === 'chat'
                  ? 'bg-[#2f5597] text-white border-[#2f5597]'
                  : 'bg-white text-[#475569] border-slate-200 hover:bg-slate-50'
              }`}
            >
              Chat interactivo
            </button>
            <button
              type="button"
              onClick={() => setMode('quick')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                mode === 'quick'
                  ? 'bg-[#2f5597] text-white border-[#2f5597]'
                  : 'bg-white text-[#475569] border-slate-200 hover:bg-slate-50'
              }`}
            >
              Acciones rápidas
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {quickButtons.map((act) => (
              <button
                key={act}
                type="button"
                disabled={quickLoading}
                onClick={() => runQuickAction(act)}
                className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                  mode === 'quick' && activeAction === act
                    ? 'bg-sky-50 border-[#2f5597] text-[#2f5597]'
                    : 'bg-slate-50 border-slate-200 text-[#0f172a] hover:bg-slate-100'
                }`}
              >
                {ACTION_LABELS[act]}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido principal */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {error}
            </div>
          )}

          {mode === 'quick' ? (
            <div className="space-y-3">
              {!activeAction ? (
                <p className="text-sm text-[#475569]">
                  Elige una acción rápida arriba para resumir la lección, obtener una explicación
                  MCER o extraer vocabulario clave.
                </p>
              ) : quickLoading ? (
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-[#475569] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#2f5597]" aria-hidden="true" />
                  <span>Generando {ACTION_LABELS[activeAction].toLowerCase()}...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#2f5597]">
                      {ACTION_LABELS[activeAction]}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => runQuickAction(activeAction)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0f172a] bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        <RefreshCw className="w-3 h-3" aria-hidden="true" />
                        <span>Regenerar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(quickOutput)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0f172a] bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                            <span>Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-[#f8fafc] text-sm text-[#0f172a] whitespace-pre-wrap leading-relaxed">
                    {quickOutput}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 bg-[#f8fafc] text-sm text-[#0f172a]">
                    {isDocente
                      ? 'Hola, soy tu Copiloto Docente MCER. Pídeme actividades, rúbricas Cambridge, saludos para el aula o explicaciones adaptadas a tu grupo.'
                      : 'Hola, soy tu Tutor de Inglés IA. Pregúntame dudas de gramática, vocabulario o pega un borrador de tu Writing para recibir consejos de mejora.'}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#475569]">Sugerencias rápidas:</p>
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSendChat(undefined, prompt)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-[#2f5597] hover:bg-sky-50/40 text-xs text-[#0f172a] transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-xl text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#2f5597] text-white ml-8'
                        : 'bg-[#f8fafc] border border-slate-200 text-[#0f172a] mr-4'
                    }`}
                  >
                    {m.text}
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#475569] flex items-center gap-2 mr-8">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2f5597]" aria-hidden="true" />
                  <span>Elaborando respuesta pedagógica...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input de chat */}
        <form
          onSubmit={handleSendChat}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isDocente
                ? 'Pregunta o pide un recurso MCER...'
                : 'Escribe tu duda de inglés aquí...'
            }
            aria-label="Mensaje para el asistente IA"
            className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-[#2f5597]"
          />
          <button
            type="submit"
            disabled={chatLoading || input.trim().length < 2}
            aria-label="Enviar consulta al asistente IA"
            className="p-2.5 bg-[#2f5597] hover:bg-[#244378] text-white rounded-lg disabled:opacity-50"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
