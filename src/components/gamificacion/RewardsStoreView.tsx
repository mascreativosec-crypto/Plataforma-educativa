import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Coins,
  Crown,
  Gift,
  GraduationCap,
  Headphones,
  Heart,
  History,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatGuayaquilDateTime } from '../../lib/api';
import type {
  AulaUsuario,
  CanjeTiendaItem,
  StoreResponse,
  TiendaProductoItem,
} from '../../types/aula';

interface RewardsStoreViewProps {
  usuario: AulaUsuario;
  initialSaldo?: number;
  initialComodines?: number;
  onBalanceChanged: () => Promise<void>;
}

const CATEGORY_META: Record<
  string,
  { label: string; shortLabel: string; colorClass: string; icon: React.ReactNode }
> = {
  MASCOTA_ACCESORIO: {
    label: 'Accesorios mascota',
    shortLabel: 'Accesorios',
    colorClass: 'bg-sky-50 text-[#011f52] border-sky-200',
    icon: <GraduationCap className="w-5 h-5 text-[#011f52]" aria-hidden="true" />,
  },
  MASCOTA_VESTIMENTA: {
    label: 'Vestimenta mascota',
    shortLabel: 'Vestimenta',
    colorClass: 'bg-indigo-50 text-[#011f52] border-indigo-200',
    icon: <Sparkles className="w-5 h-5 text-indigo-700" aria-hidden="true" />,
  },
  PERFIL_VISUAL: {
    label: 'Hábitats y visual',
    shortLabel: 'Hábitats',
    colorClass: 'bg-amber-50 text-amber-900 border-amber-200',
    icon: <Layers className="w-5 h-5 text-amber-700" aria-hidden="true" />,
  },
  INSIGNIA: {
    label: 'Insignias especiales',
    shortLabel: 'Insignias',
    colorClass: 'bg-purple-50 text-purple-900 border-purple-200',
    icon: <Award className="w-5 h-5 text-purple-700" aria-hidden="true" />,
  },
  COMODIN_RACHA: {
    label: 'Comodines de racha',
    shortLabel: 'Comodines',
    colorClass: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    icon: <Shield className="w-5 h-5 text-emerald-700" aria-hidden="true" />,
  },
  BENEFICIO_ACADEMICO: {
    label: 'Beneficios académicos',
    shortLabel: 'Académicos',
    colorClass: 'bg-[#011f52]/8 text-[#011f52] border-[#011f52]/20',
    icon: <BookOpen className="w-5 h-5 text-[#011f52]" aria-hidden="true" />,
  },
  PREMIO_ALLEN: {
    label: 'Premios físicos ALLEN',
    shortLabel: 'Premios ALLEN',
    colorClass: 'bg-[#cf080d]/10 text-[#cf080d] border-[#cf080d]/25',
    icon: <Gift className="w-5 h-5 text-[#cf080d]" aria-hidden="true" />,
  },
};

function ProductVisualBadge({ imagenKey, categoria }: { imagenKey: string; categoria: string }) {
  const iconClass = 'w-7 h-7';
  let icon: React.ReactNode = <Gift className={`${iconClass} text-[#cf080d]`} aria-hidden="true" />;
  let bg = 'bg-[#f5f6f8] border-[#d9d9d9]';

  if (imagenKey.includes('crown') || imagenKey.includes('corona')) {
    icon = <Crown className={`${iconClass} text-amber-500`} aria-hidden="true" />;
    bg = 'bg-amber-50 border-amber-200';
  } else if (imagenKey.includes('shield') || categoria === 'COMODIN_RACHA') {
    icon = <Shield className={`${iconClass} text-emerald-600`} aria-hidden="true" />;
    bg = 'bg-emerald-50 border-emerald-200';
  } else if (imagenKey.includes('headphone') || imagenKey.includes('audifono')) {
    icon = <Headphones className={`${iconClass} text-[#cf080d]`} aria-hidden="true" />;
    bg = 'bg-rose-50 border-rose-200';
  } else if (imagenKey.includes('grad') || imagenKey.includes('birrete')) {
    icon = <GraduationCap className={`${iconClass} text-[#011f52]`} aria-hidden="true" />;
    bg = 'bg-sky-50 border-sky-200';
  } else if (categoria === 'INSIGNIA') {
    icon = <Award className={`${iconClass} text-purple-600`} aria-hidden="true" />;
    bg = 'bg-purple-50 border-purple-200';
  } else if (categoria === 'BENEFICIO_ACADEMICO') {
    icon = <BookOpen className={`${iconClass} text-[#011f52]`} aria-hidden="true" />;
    bg = 'bg-[#011f52]/8 border-[#011f52]/20';
  } else if (categoria === 'PERFIL_VISUAL') {
    icon = <Layers className={`${iconClass} text-amber-600`} aria-hidden="true" />;
    bg = 'bg-amber-50 border-amber-200';
  } else if (categoria === 'MASCOTA_VESTIMENTA' || categoria === 'MASCOTA_ACCESORIO') {
    icon = <Sparkles className={`${iconClass} text-indigo-600`} aria-hidden="true" />;
    bg = 'bg-indigo-50 border-indigo-200';
  }

  return (
    <div
      className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${bg}`}
    >
      {icon}
    </div>
  );
}

function StatusPill({ estado }: { estado: CanjeTiendaItem['estado'] }) {
  if (estado === 'PENDIENTE_APROBACION') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900">
        Pendiente de aprobación
      </span>
    );
  }
  if (estado === 'APROBADO' || estado === 'COMPLETADO') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
        {estado === 'APROBADO' ? 'Aprobado' : 'Entregado'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
      <XCircle className="w-3 h-3" aria-hidden="true" />
      Rechazado (reembolsado)
    </span>
  );
}

export function RewardsStoreView({
  usuario,
  initialSaldo,
  initialComodines,
  onBalanceChanged,
}: RewardsStoreViewProps) {
  const isDocente = usuario.rol === 'ADMIN' || usuario.rol === 'PROFESOR';

  const [store, setStore] = useState<StoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'catalogo' | 'historial' | 'aprobaciones'>(
    isDocente ? 'aprobaciones' : 'catalogo',
  );

  // Modal de confirmación de compra (Estudiante)
  const [confirmProduct, setConfirmProduct] = useState<TiendaProductoItem | null>(null);
  const [purchaseNote, setPurchaseNote] = useState('');

  // Formulario crear producto (Admin/Docente)
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [prodNombre, setProdNombre] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCategoria, setProdCategoria] = useState('PREMIO_ALLEN');
  const [prodPrecio, setProdPrecio] = useState(300);
  const [prodStock, setProdStock] = useState('15');
  const [prodRequiereAprob, setProdRequiereAprob] = useState(true);
  const [prodCondiciones, setProdCondiciones] = useState('');

  const loadStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<StoreResponse>('/api/tienda');
      setStore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la tienda.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  const visibleProducts = useMemo(() => {
    const all = store?.productos || [];
    return isDocente ? all : all.filter((p) => p.categoria !== 'INSIGNIA');
  }, [store?.productos, isDocente]);

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'ALL') return visibleProducts;
    return visibleProducts.filter((p) => p.categoria === selectedCategory);
  }, [visibleProducts, selectedCategory]);

  const pendingRedemptions = useMemo(
    () => (store?.canjes || []).filter((c) => c.estado === 'PENDIENTE_APROBACION'),
    [store?.canjes],
  );

  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmProduct) return;
    setBusyId(confirmProduct.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{
        canje: CanjeTiendaItem;
        nuevoSaldo: number;
        mensaje?: string;
      }>('/api/tienda/canjear', {
        method: 'POST',
        body: JSON.stringify({
          productoId: confirmProduct.id,
          notaEstudiante: purchaseNote.trim() || undefined,
        }),
      });
      setNotice(
        res.canje.estado === 'PENDIENTE_APROBACION'
          ? `Canje solicitado: ${confirmProduct.nombre}. Quedó pendiente de aprobación docente.`
          : `¡Canje completado! Desbloqueaste "${confirmProduct.nombre}".`,
      );
      setConfirmProduct(null);
      setPurchaseNote('');
      await Promise.all([loadStore(), onBalanceChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el canje.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewRedemption = async (canjeId: string, aprobar: boolean) => {
    setBusyId(canjeId);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/tienda/canjes/${canjeId}/validar`, {
        method: 'PATCH',
        body: JSON.stringify({
          aprobar,
          notaAdmin: aprobar
            ? 'Aprobado y coordinado en secretaría ALLEN.'
            : 'Rechazado por administración. Puntos reembolsados automáticamente.',
        }),
      });
      setNotice(
        aprobar
          ? 'Canje aprobado correctamente.'
          : 'Canje rechazado y ALLEN POINTS reembolsados automáticamente al estudiante.',
      );
      await Promise.all([loadStore(), onBalanceChanged()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar el canje.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId('new-product');
    setError(null);
    setNotice(null);
    try {
      await apiFetch('/api/tienda/productos', {
        method: 'POST',
        body: JSON.stringify({
          nombre: prodNombre.trim(),
          descripcion: prodDesc.trim(),
          categoria: prodCategoria,
          precioPuntos: Number(prodPrecio),
          stock: prodStock.trim() === '' ? null : Number(prodStock),
          requiereAprobacion: prodRequiereAprob,
          condiciones: prodCondiciones.trim() || null,
        }),
      });
      setProdNombre('');
      setProdDesc('');
      setProdCondiciones('');
      setShowNewProduct(false);
      setNotice('Producto agregado al catálogo de la tienda.');
      await loadStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el producto.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleProductActive = async (prod: TiendaProductoItem) => {
    setBusyId(prod.id);
    setError(null);
    try {
      await apiFetch(`/api/tienda/productos/${prod.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !prod.activo }),
      });
      setNotice(
        prod.activo
          ? `"${prod.nombre}" pausado del catálogo estudiantil.`
          : `"${prod.nombre}" publicado nuevamente en la tienda.`,
      );
      await loadStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el producto.');
    } finally {
      setBusyId(null);
    }
  };

  const saldo = store?.puntosSaldo ?? initialSaldo ?? 0;
  const comodines = store?.comodinesRacha ?? initialComodines ?? 0;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#d9d9d9]">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#011f52] flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-[#cf080d]" aria-hidden="true" />
            <span>Tienda de canjes</span>
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isDocente
              ? 'Gestiona premios, inventario y aprueba solicitudes de canje.'
              : 'Canjea tus ALLEN POINTS por accesorios, comodines, beneficios y premios.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isDocente ? (
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-[#011f52] text-white">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-300" aria-hidden="true" />
                <span className="font-display text-lg font-bold tabular-nums">{saldo}</span>
                <span className="text-xs text-white/80 font-medium">ALLEN POINTS</span>
              </div>
              <span className="h-4 w-px bg-white/20" aria-hidden="true" />
              <div className="flex items-center gap-1 text-xs text-emerald-300 font-semibold tabular-nums">
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{comodines} comodines</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewProduct((s) => !s)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Nuevo producto</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center justify-between gap-2"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar aviso"
            className="text-emerald-700 hover:text-emerald-950"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Formulario Nuevo Producto (Docente/Admin) */}
      {isDocente && showNewProduct && (
        <form
          onSubmit={handleCreateProduct}
          className="bg-white border border-[#011f52]/30 rounded-xl p-5 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#011f52]">
              Crear recompensa en la tienda
            </h2>
            <button
              type="button"
              onClick={() => setShowNewProduct(false)}
              className="text-xs text-slate-600 hover:text-[#011f52]"
            >
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label htmlFor="prod-nombre" className="block text-xs font-semibold text-[#011f52] mb-1">
                Nombre del producto
              </label>
              <input
                id="prod-nombre"
                type="text"
                required
                minLength={3}
                value={prodNombre}
                onChange={(e) => setProdNombre(e.target.value)}
                placeholder="Ej. Libreta Cambridge ALLEN"
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="prod-cat" className="block text-xs font-semibold text-[#011f52] mb-1">
                Categoría
              </label>
              <select
                id="prod-cat"
                value={prodCategoria}
                onChange={(e) => setProdCategoria(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d9d9d9] rounded-lg text-sm"
              >
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="prod-precio" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Precio (pts)
                </label>
                <input
                  id="prod-precio"
                  type="number"
                  min={10}
                  required
                  value={prodPrecio}
                  onChange={(e) => setProdPrecio(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="prod-stock" className="block text-xs font-semibold text-[#011f52] mb-1">
                  Stock (vacío=∞)
                </label>
                <input
                  id="prod-stock"
                  type="number"
                  min={0}
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm tabular-nums"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="prod-desc" className="block text-xs font-semibold text-[#011f52] mb-1">
                Descripción
              </label>
              <input
                id="prod-desc"
                type="text"
                required
                minLength={5}
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Detalle claro de la recompensa"
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="prod-cond" className="block text-xs font-semibold text-[#011f52] mb-1">
                Condiciones de entrega (opcional)
              </label>
              <input
                id="prod-cond"
                type="text"
                value={prodCondiciones}
                onChange={(e) => setProdCondiciones(e.target.value)}
                placeholder="Ej. Retiro en secretaría sede Quito"
                className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#011f52]">
              <input
                type="checkbox"
                checked={prodRequiereAprob}
                onChange={(e) => setProdRequiereAprob(e.target.checked)}
              />
              <span>Requiere aprobación administrativa antes de entrega</span>
            </label>
            <button
              type="submit"
              disabled={busyId === 'new-product'}
              className="px-4 py-2 bg-[#011f52] hover:bg-[#022a6e] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
            >
              {busyId === 'new-product' ? 'Guardando...' : 'Publicar producto'}
            </button>
          </div>
        </form>
      )}

      {/* Pestañas de Tienda */}
      <div
        role="tablist"
        aria-label="Secciones de la tienda de canjes"
        className="flex flex-wrap items-center gap-2 border-b border-[#d9d9d9] pb-3"
      >
        {isDocente && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'aprobaciones'}
            onClick={() => setActiveTab('aprobaciones')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
              activeTab === 'aprobaciones'
                ? 'bg-[#011f52] text-white'
                : 'bg-white border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8]'
            }`}
          >
            <Package className="w-4 h-4" aria-hidden="true" />
            <span>Solicitudes de canje</span>
            {pendingRedemptions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#cf080d] text-white text-[10px] font-bold tabular-nums">
                {pendingRedemptions.length}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'catalogo'}
          onClick={() => setActiveTab('catalogo')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'catalogo'
              ? 'bg-[#011f52] text-white'
              : 'bg-white border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8]'
          }`}
        >
          <Tag className="w-4 h-4" aria-hidden="true" />
          <span>{isDocente ? 'Inventario del catálogo' : 'Catálogo de recompensas'}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'historial'}
          onClick={() => setActiveTab('historial')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
            activeTab === 'historial'
              ? 'bg-[#011f52] text-white'
              : 'bg-white border border-[#d9d9d9] text-[#011f52] hover:bg-[#f5f6f8]'
          }`}
        >
          <History className="w-4 h-4" aria-hidden="true" />
          <span>{isDocente ? 'Historial completo' : 'Mis canjes y movimientos'}</span>
        </button>
      </div>

      {loading && !store ? (
        <div className="bg-white border border-[#d9d9d9] rounded-xl p-10 text-center text-sm text-slate-600 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#011f52]" aria-hidden="true" />
          <span>Cargando tienda de ALLEN POINTS...</span>
        </div>
      ) : (
        <>
          {/* TAB 1 (Docente): APROBACIONES PENDIENTES */}
          {isDocente && activeTab === 'aprobaciones' && (
            <section aria-label="Solicitudes de canje por aprobar" className="space-y-4">
              {pendingRedemptions.length === 0 ? (
                <div className="bg-white border border-[#d9d9d9] rounded-xl p-8 text-center text-sm text-slate-600">
                  No hay solicitudes de canje pendientes de aprobación.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRedemptions.map((c) => (
                    <article
                      key={c.id}
                      className="bg-white border border-[#cf080d]/35 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill estado={c.estado} />
                          <span className="text-xs font-bold text-[#011f52] tabular-nums">
                            {c.precioPagado} ALLEN POINTS
                          </span>
                        </div>
                        <h2 className="font-display text-base font-bold text-[#011f52]">
                          {c.productoNombre}
                        </h2>
                        <p className="text-xs text-slate-600">
                          Estudiante: <strong className="text-[#011f52]">{c.estudianteNombre}</strong> ·{' '}
                          {formatGuayaquilDateTime(c.createdAt)}
                        </p>
                        {c.notaEstudiante && (
                          <p className="text-xs text-slate-700 bg-[#f5f6f8] px-3 py-1.5 rounded-lg mt-1">
                            Nota: “{c.notaEstudiante}”
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => handleReviewRedemption(c.id, true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Aprobar</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === c.id}
                          onClick={() => handleReviewRedemption(c.id, false)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-lg disabled:opacity-60"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Rechazar</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: CATÁLOGO DE PRODUCTOS */}
          {activeTab === 'catalogo' && (
            <section aria-label="Catálogo de productos" className="space-y-4">
              {/* Filtros por categoría */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedCategory === 'ALL'
                      ? 'bg-[#011f52] text-white border-[#011f52]'
                      : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                  }`}
                >
                  Todas ({visibleProducts.length})
                </button>
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  if (!isDocente && key === 'INSIGNIA') return null;
                  const count = visibleProducts.filter((p) => p.categoria === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedCategory(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        selectedCategory === key
                          ? 'bg-[#011f52] text-white border-[#011f52]'
                          : 'bg-white text-[#011f52] border-[#d9d9d9] hover:border-[#011f52]'
                      }`}
                    >
                      {meta.shortLabel} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map((prod) => {
                  const catMeta = CATEGORY_META[prod.categoria] || CATEGORY_META.PREMIO_ALLEN;
                  const outOfStock = prod.stock !== null && prod.stock <= 0;
                  const canAfford = saldo >= prod.precioPuntos;
                  const disabledBuy =
                    !prod.activo || outOfStock || !canAfford || Boolean(prod.yaPosee);

                  return (
                    <article
                      key={prod.id}
                      className={`bg-white border rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                        prod.activo
                          ? 'border-[#d9d9d9] hover:border-[#011f52]'
                          : 'border-dashed border-slate-300 opacity-70'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <ProductVisualBadge
                            imagenKey={prod.imagenKey}
                            categoria={prod.categoria}
                          />
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${catMeta.colorClass}`}
                            >
                              {catMeta.shortLabel}
                            </span>
                            {prod.stock !== null && (
                              <span
                                className={`text-[11px] font-semibold tabular-nums ${
                                  outOfStock ? 'text-red-700' : 'text-slate-500'
                                }`}
                              >
                                {outOfStock ? 'Agotado' : `${prod.stock} disp.`}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="font-display text-base font-bold text-[#011f52]">
                            {prod.nombre}
                          </h3>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {prod.descripcion}
                          </p>
                          {prod.condiciones && (
                            <p className="text-[11px] text-slate-500 mt-2">
                              Condición: {prod.condiciones}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#d9d9d9]/70 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-[#011f52]">
                          <Coins className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                          <span className="font-display text-base font-bold tabular-nums">
                            {prod.precioPuntos}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">pts</span>
                        </div>

                        {isDocente ? (
                          <button
                            type="button"
                            disabled={busyId === prod.id}
                            onClick={() => handleToggleProductActive(prod)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                              prod.activo
                                ? 'bg-white border-[#d9d9d9] text-[#011f52] hover:border-[#cf080d] hover:text-[#cf080d]'
                                : 'bg-[#011f52] border-[#011f52] text-white'
                            }`}
                          >
                            {prod.activo ? 'Pausar' : 'Activar'}
                          </button>
                        ) : prod.yaPosee ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Desbloqueado</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={disabledBuy}
                            onClick={() => {
                              setConfirmProduct(prod);
                              setPurchaseNote('');
                            }}
                            className="px-3.5 py-1.5 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                          >
                            {outOfStock
                              ? 'Agotado'
                              : !canAfford
                                ? `Faltan ${prod.precioPuntos - saldo} pts`
                                : 'Canjear'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* TAB 3: HISTORIAL DE CANJES Y MOVIMIENTOS */}
          {activeTab === 'historial' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <section
                aria-label="Historial de canjes"
                className={`${isDocente ? 'lg:col-span-12' : 'lg:col-span-7'} bg-white border border-[#d9d9d9] rounded-xl overflow-hidden`}
              >
                <div className="px-5 py-3.5 border-b border-[#d9d9d9] flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[#011f52]">
                    Canjes registrados ({store?.canjes.length ?? 0})
                  </h2>
                </div>
                {!store || store.canjes.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-600">
                    Aún no se registran canjes en la tienda.
                  </div>
                ) : (
                  <ul className="divide-y divide-[#d9d9d9]/70">
                    {store.canjes.map((c) => (
                      <li key={c.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[#011f52]">{c.productoNombre}</p>
                            <StatusPill estado={c.estado} />
                          </div>
                          <p className="text-xs text-slate-600">
                            {isDocente && c.estudianteNombre ? `${c.estudianteNombre} · ` : ''}
                            {formatGuayaquilDateTime(c.createdAt)}
                          </p>
                          {c.notaAdmin && (
                            <p className="text-xs text-slate-600">Respuesta: {c.notaAdmin}</p>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[#cf080d] tabular-nums shrink-0">
                          -{c.precioPagado} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!isDocente && (
                <section
                  aria-label="Movimientos de ALLEN POINTS"
                  className="lg:col-span-5 bg-white border border-[#d9d9d9] rounded-xl overflow-hidden"
                >
                  <div className="px-5 py-3.5 border-b border-[#d9d9d9]">
                    <h2 className="font-display text-sm font-bold text-[#011f52]">
                      Movimientos de puntos
                    </h2>
                  </div>
                  {!store?.movimientos || store.movimientos.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-600">
                      Sin movimientos recientes.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#d9d9d9]/70">
                      {store.movimientos.map((m) => (
                        <li key={m.id} className="p-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#011f52] truncate">
                              {m.descripcion}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatGuayaquilDateTime(m.createdAt)} · Saldo: {m.saldoDespues} pts
                            </p>
                          </div>
                          <span
                            className={`text-xs font-bold tabular-nums shrink-0 ${
                              m.cantidad >= 0 ? 'text-emerald-700' : 'text-[#cf080d]'
                            }`}
                          >
                            {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal de confirmación de compra */}
      {confirmProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-buy-title"
          className="fixed inset-0 z-50 bg-[#011f52]/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleConfirmPurchase}
            className="bg-white border border-[#d9d9d9] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ProductVisualBadge
                  imagenKey={confirmProduct.imagenKey}
                  categoria={confirmProduct.categoria}
                />
                <div>
                  <h2 id="confirm-buy-title" className="font-display text-lg font-bold text-[#011f52]">
                    Confirmar canje
                  </h2>
                  <p className="text-xs text-slate-600">{confirmProduct.nombre}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmProduct(null)}
                aria-label="Cerrar modal de confirmación"
                className="p-1 rounded-lg text-slate-500 hover:bg-[#f5f6f8]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="rounded-xl bg-[#f5f6f8] border border-[#d9d9d9] p-3.5 text-xs space-y-1.5 tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">Saldo actual:</span>
                <strong className="text-[#011f52]">{saldo} ALLEN POINTS</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Costo del canje:</span>
                <strong className="text-[#cf080d]">-{confirmProduct.precioPuntos} ALLEN POINTS</strong>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-[#d9d9d9]">
                <span className="font-semibold text-[#011f52]">Saldo resultante:</span>
                <strong className="text-[#011f52]">
                  {saldo - confirmProduct.precioPuntos} ALLEN POINTS
                </strong>
              </div>
            </div>

            {confirmProduct.requiereAprobacion && (
              <div>
                <label
                  htmlFor="buy-note"
                  className="block text-xs font-semibold text-[#011f52] mb-1"
                >
                  Nota para coordinación / entrega (opcional)
                </label>
                <input
                  id="buy-note"
                  type="text"
                  value={purchaseNote}
                  onChange={(e) => setPurchaseNote(e.target.value)}
                  placeholder="Ej. Retiro jueves 18h en sede Quito"
                  className="w-full px-3 py-2 border border-[#d9d9d9] rounded-lg text-sm"
                />
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmProduct(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-[#011f52]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyId === confirmProduct.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#cf080d] hover:bg-[#ad060a] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
              >
                <Heart className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {busyId === confirmProduct.id ? 'Procesando...' : 'Confirmar canje'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
