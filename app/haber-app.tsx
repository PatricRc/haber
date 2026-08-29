'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileUp,
  Filter,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Upload,
  WalletCards,
  Trash2,
  X,
} from 'lucide-react';
import { ImportFileError, ImportPreviewData, ParsedImportRow, parseImportFile, rowSignature } from './importers';
import { DATASET_ROW_COUNT, DATASET_UPDATED_THROUGH, MONTHLY_TOTALS, REAL_MOVEMENTS, USD_INCOME_TOTAL, withPenConversion, type SupportedCurrency } from './real-data';
import { YAPE_FX_MOVEMENTS, YAPE_FX_TOTAL } from './yape-fx-data';

type Screen = 'inicio' | 'movimientos' | 'revisar' | 'presupuestos' | 'cuentas' | 'importar' | 'informes' | 'ajustes';
type MovementType = 'Gasto' | 'Ingreso' | 'Transferencia';
type Currency = SupportedCurrency;

type Movement = {
  id: number;
  externalId?: string;
  date: string;
  description: string;
  merchant: string;
  category: string;
  group: string;
  account: string;
  amount: number;
  amountPen?: number;
  currency: Currency;
  type: MovementType;
  review?: boolean;
  duplicate?: boolean;
  fxMissing?: boolean;
};

type PendingChange = {
  action: 'update' | 'delete';
  externalId: string;
  movement?: Pick<Movement, 'date' | 'description' | 'merchant' | 'category' | 'account' | 'amount' | 'currency' | 'type'>;
};

const initialMovements: Movement[] = [...REAL_MOVEMENTS.map(withPenConversion), ...YAPE_FX_MOVEMENTS];

const initialBudgets = [
  { name: 'Vivienda', limit: 1800, spent: 0 },
  { name: 'Renta', limit: 1800, spent: 0 },
  { name: 'Comida', limit: 2200, spent: 0 },
  { name: 'Transporte', limit: 500, spent: 0 },
  { name: 'Suscripciones', limit: 80, spent: 0 },
  { name: 'Compras', limit: 600, spent: 0 },
  { name: 'Ocio', limit: 800, spent: 0 },
  { name: 'Salud', limit: 300, spent: 0 },
  { name: 'Educación', limit: 300, spent: 0 },
  { name: 'Servicios profesionales', limit: 500, spent: 0 },
  { name: 'Efectivo', limit: 500, spent: 0 },
  { name: 'Otros', limit: 500, spent: 0 },
];

const CATEGORY_OPTIONS = [
  { value: 'Food & Dining', label: 'Comida y restaurantes', group: 'Comida' },
  { value: 'Groceries', label: 'Supermercados', group: 'Comida' },
  { value: 'Transportation', label: 'Transporte', group: 'Transporte' },
  { value: 'Subscriptions & Digital', label: 'Suscripciones y digital', group: 'Suscripciones' },
  { value: 'Transfers', label: 'Transferencias', group: 'Transferencias' },
  { value: 'Refunds', label: 'Devoluciones', group: 'Devoluciones' },
  { value: 'Shopping', label: 'Compras', group: 'Compras' },
  { value: 'Bills & Utilities', label: 'Servicios del hogar', group: 'Vivienda' },
  { value: 'Rent', label: 'Renta', group: 'Renta' },
  { value: 'Cash', label: 'Efectivo', group: 'Efectivo' },
  { value: 'Travel', label: 'Viajes', group: 'Ocio' },
  { value: 'Income', label: 'Ingresos', group: 'Ingresos' },
  { value: 'Entertainment', label: 'Entretenimiento', group: 'Ocio' },
  { value: 'Health', label: 'Salud', group: 'Salud' },
  { value: 'Professional Services', label: 'Servicios profesionales', group: 'Servicios profesionales' },
  { value: 'Education', label: 'Educación', group: 'Educación' },
  { value: 'Other Expenses', label: 'Otros gastos', group: 'Otros' },
] as const;

function categoryGroup(category: string) {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.group ?? category;
}

const months = [
  { label: 'Mayo 2026', key: '2026-05' },
  { label: 'Junio 2026', key: '2026-06' },
  { label: 'Julio 2026', key: '2026-07' },
  { label: 'Agosto 2026', key: '2026-08' },
];
const LOCAL_DATA_KEY = 'haber-finanzas-ledger-v4';
const navItems = [
  { id: 'inicio' as Screen, label: 'Inicio', icon: LayoutDashboard },
  { id: 'movimientos' as Screen, label: 'Movimientos', icon: ListFilter },
  { id: 'revisar' as Screen, label: 'Revisar', icon: CheckCheck },
  { id: 'presupuestos' as Screen, label: 'Presupuestos', icon: CircleDollarSign },
  { id: 'cuentas' as Screen, label: 'Cuentas', icon: WalletCards },
  { id: 'importar' as Screen, label: 'Importar', icon: Upload },
  { id: 'informes' as Screen, label: 'Informes', icon: BarChart3 },
  { id: 'ajustes' as Screen, label: 'Ajustes', icon: Settings },
];

const screenMeta: Record<Screen, { eyebrow: string; title: string; description: string }> = {
  inicio: { eyebrow: 'Tu mes', title: 'Inicio', description: 'Lo importante de tus finanzas, sin mezclar monedas.' },
  movimientos: { eyebrow: 'Ledger', title: 'Movimientos', description: 'Cada ingreso, gasto y transferencia en un solo lugar.' },
  revisar: { eyebrow: 'Cola de trabajo', title: 'Revisar', description: 'Clasifica lo pendiente sin perder el dato original.' },
  presupuestos: { eyebrow: 'Topes por grupo', title: 'Presupuestos', description: 'Compara el gasto real con lo que planeaste.' },
  cuentas: { eyebrow: 'Soles y dólares', title: 'Cuentas', description: 'Actividad real por cuenta, sin inventar saldos.' },
  importar: { eyebrow: 'Ingesta local', title: 'Importar', description: 'Carga un PDF, CSV o Excel y revísalo antes de confirmar.' },
  informes: { eyebrow: '12 meses', title: 'Informes', description: 'Tendencias claras con PEN y USD siempre separados.' },
  ajustes: { eyebrow: 'Workspace personal', title: 'Ajustes', description: 'Privacidad, apariencia y datos de Haber.' },
};

function formatMoney(amount: number, currency: Currency, hidden = false, signed?: 'in' | 'out') {
  if (hidden) return '••••••••';
  const value = new Intl.NumberFormat('es-PE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  return signed === 'in' ? `+ ${value}` : signed === 'out' ? `− ${value}` : value;
}

function displayDate(isoDate: string) {
  return isoDate ? isoDate.split('-').reverse().join('/') : 'Sin fecha';
}

function movementSignature(movement: Movement) {
  const signedAmountMinor = Math.round(movement.amount * 100) * (movement.type === 'Ingreso' ? 1 : -1);
  const processDate = movement.date.split('/').reverse().join('-');
  return rowSignature({ account: movement.account, processDate, signedAmountMinor, currency: movement.currency, originalDescription: movement.description });
}

function movementMonthKey(movement: Movement) {
  const [, month, year] = movement.date.split('/');
  return `${year}-${month}`;
}

function StatusChip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'warn' | 'good' | 'bad' }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, copy, action, onAction }: { icon: typeof ReceiptText; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><Icon size={22} strokeWidth={1.7} /><strong>{title}</strong><p>{copy}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

export default function HaberApp() {
  const [screen, setScreen] = useState<Screen>('inicio');
  const [monthIndex, setMonthIndex] = useState(months.length - 1);
  const [hidden, setHidden] = useState(false);
  const [dark, setDark] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [movements, setMovements] = useState(initialMovements);
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [applyBusy, setApplyBusy] = useState(false);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [reviewIds, setReviewIds] = useState(() => initialMovements.filter((item) => item.review).map((item) => item.id));
  const [activeReview, setActiveReview] = useState(0);
  const [reviewTab, setReviewTab] = useState('Categorías amplias');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [currencyFilter, setCurrencyFilter] = useState('Todas');
  const [reportTab, setReportTab] = useState('P&L');
  const [importPreview, setImportPreview] = useState<ImportPreviewData | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<{ message: string; password: boolean } | null>(null);
  const [imports, setImports] = useState([
    { name: 'Dataset público de demostración', date: '24/08/2026', rows: String(DATASET_ROW_COUNT), status: 'Demo' },
  ]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [datasetRowCount, setDatasetRowCount] = useState(DATASET_ROW_COUNT);
  const [datasetUpdatedThrough, setDatasetUpdatedThrough] = useState(DATASET_UPDATED_THROUGH);
  const [lastSynced, setLastSynced] = useState('');
  const [toast, setToast] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedMonthKey = months[monthIndex].key;
  const monthMovements = movements.filter((movement) => movementMonthKey(movement) === selectedMonthKey);
  const pending = monthMovements.filter((movement) => reviewIds.includes(movement.id));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(LOCAL_DATA_KEY);
        if (saved) {
          const data = JSON.parse(saved) as { movements?: Movement[]; imports?: typeof imports; reviewIds?: number[]; pendingChanges?: PendingChange[] };
          if (Array.isArray(data.movements)) setMovements(data.movements);
          if (Array.isArray(data.imports)) setImports(data.imports);
          if (Array.isArray(data.reviewIds)) setReviewIds(data.reviewIds);
          if (Array.isArray(data.pendingChanges)) setPendingChanges(data.pendingChanges);
        }
      } catch {
        showToast('No pudimos recuperar los datos guardados en este navegador.');
      } finally {
        setStorageReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify({ movements, imports, reviewIds, pendingChanges }));
  }, [storageReady, movements, imports, reviewIds, pendingChanges]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input, select, textarea')) return;
      if (event.key === '.') setHidden((value) => !value);
      if (screen !== 'revisar' || pending.length === 0) return;
      if (event.key === 'j') setActiveReview((value) => Math.min(value + 1, pending.length - 1));
      if (event.key === 'k') setActiveReview((value) => Math.max(value - 1, 0));
      if (event.key === 'c') resolveReview(pending[activeReview]?.id, 'Food & Dining');
      if (event.key === 't') markTransfer(pending[activeReview]?.id, true);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function navigate(next: Screen) {
    setScreen(next);
    setMobileMenu(false);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${next}`);
  }

  function showToast(message: string) {
    setToast(message);
  }

  function queueMovementChange(action: PendingChange['action'], movement: Movement) {
    if (!movement.externalId) return;
    const change: PendingChange = action === 'delete'
      ? { action, externalId: movement.externalId }
      : {
          action,
          externalId: movement.externalId,
          movement: {
            date: movement.date,
            description: movement.description,
            merchant: movement.merchant,
            category: movement.category,
            account: movement.account,
            amount: movement.amount,
            currency: movement.currency,
            type: movement.type,
          },
        };
    setPendingChanges((changes) => [...changes.filter((item) => item.externalId !== movement.externalId), change]);
  }

  async function applyPendingChanges() {
    if (!pendingChanges.length) {
      showToast('No hay cambios pendientes por aplicar.');
      return;
    }
    setApplyBusy(true);
    setPendingChanges([]);
    showToast('Cambios guardados localmente en este navegador.');
    setApplyBusy(false);
  }

  async function refreshFromGoogleSheets() {
    setSyncBusy(true);
    setMovements(initialMovements);
    setReviewIds(initialMovements.filter((item) => item.review).map((item) => item.id));
    setDatasetRowCount(DATASET_ROW_COUNT);
    setDatasetUpdatedThrough(DATASET_UPDATED_THROUGH);
    setPendingChanges([]);
    setImports([{ name: 'Dataset público de demostración', date: '24/08/2026', rows: String(DATASET_ROW_COUNT), status: 'Demo' }]);
    setLastSynced(new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }));
    showToast('Datos de demostración restablecidos.');
    setSyncBusy(false);
  }

  function resolveReview(id: number | undefined, category: string) {
    if (!id) return;
    const current = movements.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, category, group: categoryGroup(category), review: false };
    setMovements((items) => items.map((item) => item.id === id ? updated : item));
    queueMovementChange('update', updated);
    setReviewIds((items) => items.filter((item) => item !== id));
    setActiveReview((value) => Math.max(0, value - 1));
    showToast(`Movimiento clasificado como ${CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category}.`);
  }

  function recategorizeMovement(id: number, category: string) {
    const current = movements.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, category, group: categoryGroup(category), review: false };
    setMovements((items) => items.map((item) => item.id === id ? updated : item));
    queueMovementChange('update', updated);
    setReviewIds((items) => items.filter((item) => item !== id));
    const label = CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
    showToast(`Categoría actualizada a ${label}.`);
  }

  function markTransfer(id: number | undefined, fromReview = false) {
    if (!id) return;
    const current = movements.find((item) => item.id === id);
    if (!current) return;
    const updated: Movement = { ...current, type: 'Transferencia', group: 'Transferencias', category: 'Transfers', review: false };
    setMovements((items) => items.map((item) => item.id === id ? updated : item));
    queueMovementChange('update', updated);
    setReviewIds((items) => items.filter((item) => item !== id));
    showToast(fromReview ? 'Marcado como transferencia y retirado de Revisar.' : 'Ahora cuenta como transferencia. El gasto del mes bajó.');
  }

  function saveMovement(updated: Movement) {
    const normalized = { ...updated, group: categoryGroup(updated.category), review: false };
    setMovements((items) => items.map((item) => item.id === normalized.id ? normalized : item));
    setReviewIds((items) => items.filter((id) => id !== normalized.id));
    queueMovementChange('update', normalized);
    setEditingMovement(null);
    showToast('Movimiento actualizado. Usa “Aplicar cambios” para confirmar el cambio local.');
  }

  function deleteMovement(movement: Movement) {
    if (!window.confirm(`¿Eliminar ${movement.merchant} por ${formatMoney(movement.amount, movement.currency)}?`)) return;
    setMovements((items) => items.filter((item) => item.id !== movement.id));
    setReviewIds((items) => items.filter((id) => id !== movement.id));
    queueMovementChange('delete', movement);
    showToast('Movimiento eliminado. El cambio queda pendiente en este navegador.');
  }

  function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const date = String(form.get('date') || '2026-08-24').split('-').reverse().join('/');
    const type = String(form.get('type')) as MovementType;
    const currency = String(form.get('currency')) as Currency;
    const amount = Number(form.get('amount'));
    const description = String(form.get('merchant') || 'Movimiento manual');
    const movement: Movement = {
      id: Date.now(), date, description: description.toUpperCase(), merchant: description,
      category: String(form.get('category') || 'Other Expenses'), group: categoryGroup(String(form.get('category') || 'Other Expenses')),
      account: String(form.get('account')), amount, currency, type,
      fxMissing: currency === 'USD',
    };
    setMovements((items) => [movement, ...items]);
    setAddOpen(false);
    showToast('Movimiento agregado al ledger.');
  }

  async function handleImportFile(file: File | null | undefined, password = '') {
    if (!file) return;
    setImportFile(file);
    setImportBusy(true);
    setImportError(null);
    setImportPreview(null);
    try {
      const parsed = await parseImportFile(file, password);
      const existing = new Set(movements.map(movementSignature));
      const seen = new Set<string>();
      const rows = parsed.rows.map((row) => {
        const signature = row.externalId ? `id:${row.externalId}` : rowSignature(row);
        const duplicate = existing.has(rowSignature(row)) || seen.has(signature);
        seen.add(signature);
        return { ...row, duplicate, included: duplicate ? false : row.included, review: duplicate || row.review };
      });
      setImportPreview({ ...parsed, rows });
      setImportPassword('');
    } catch (error) {
      const passwordError = error instanceof ImportFileError && ['PASSWORD_REQUIRED', 'PASSWORD_INCORRECT'].includes(error.code);
      setImportError({
        message: error instanceof Error ? error.message : 'No pudimos leer el archivo.',
        password: passwordError,
      });
    } finally {
      setImportBusy(false);
    }
  }

  function updateImportRow(id: string, patch: Partial<ParsedImportRow>) {
    setImportPreview((current) => current ? { ...current, rows: current.rows.map((row) => row.id === id ? { ...row, ...patch } : row) } : current);
  }

  function cancelImport() {
    setImportPreview(null);
    setImportFile(null);
    setImportPassword('');
    setImportError(null);
  }

  function commitImport() {
    if (!importPreview || !importPreview.reconciled) return;
    const fatalIssues = new Set(['Fecha inválida', 'Monto inválido', 'Descripción vacía']);
    const accepted = importPreview.rows.filter((row) => row.included && !row.duplicate && !row.issues.some((issue) => fatalIssues.has(issue)));
    if (!accepted.length) {
      showToast('No hay movimientos nuevos seleccionados.');
      return;
    }
    const baseId = Date.now();
    const imported: Movement[] = accepted.map((row, index) => ({
      id: baseId + index,
      date: displayDate(row.processDate),
      description: row.originalDescription,
      merchant: row.merchant || row.originalDescription,
      category: row.category || 'Por revisar',
      group: row.category === 'Por revisar' ? 'Otros' : categoryGroup(row.category),
      account: row.account || importPreview.sourceLabel,
      amount: Math.abs(row.signedAmountMinor) / 100,
      currency: row.currency,
      type: row.signedAmountMinor >= 0 ? 'Ingreso' : 'Gasto',
      review: row.review || row.category === 'Por revisar',
      fxMissing: row.currency === 'USD',
    }));
    setMovements((items) => [...imported, ...items]);
    setReviewIds((items) => [...imported.filter((row) => row.review).map((row) => row.id), ...items]);
    setImports((items) => [{ name: importPreview.filename, date: '24/08/2026', rows: String(imported.length), status: 'Importado' }, ...items]);
    const reviewCount = imported.filter((row) => row.review).length;
    cancelImport();
    showToast(`${imported.length} movimientos importados. ${reviewCount} necesitan revisión.`);
  }

  const filteredMovements = useMemo(() => monthMovements.filter((movement) => {
    const haystack = `${movement.description} ${movement.merchant} ${movement.category} ${movement.account}`.toLowerCase();
    return haystack.includes(search.toLowerCase())
      && (typeFilter === 'Todos' || movement.type === typeFilter)
      && (currencyFilter === 'Todas' || movement.currency === currencyFilter);
  }), [monthMovements, search, typeFilter, currencyFilter]);

  const penExpense = monthMovements.filter((item) => item.amountPen !== undefined && item.type === 'Gasto').reduce((sum, item) => sum + (item.amountPen ?? 0), 0);
  const penIncome = monthMovements.filter((item) => item.amountPen !== undefined && item.type === 'Ingreso').reduce((sum, item) => sum + (item.amountPen ?? 0), 0);
  const excluded = monthMovements.filter((item) => item.type === 'Transferencia' && item.amountPen !== undefined).reduce((sum, item) => sum + (item.amountPen ?? 0), 0);
  const usdIncome = (MONTHLY_TOTALS.find((item) => item.month === months[monthIndex].key && item.currency === 'USD')?.incomeMinor ?? 0) / 100;
  const liveBudgets = budgets.map((budget) => ({ ...budget, spent: monthMovements.filter((item) => item.amountPen !== undefined && item.type === 'Gasto' && item.group === budget.name).reduce((sum, item) => sum + (item.amountPen ?? 0), 0) }));
  const meta = screenMeta[screen];

  return (
    <main className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar desktop-sidebar">
        <div className="sidebar-brand"><button className="wordmark" type="button" onClick={() => navigate('inicio')}>{sidebarCollapsed ? 'H' : 'Haber'}</button><button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'} title={sidebarCollapsed ? 'Expandir navegación' : 'Contraer navegación'}>{sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div>
        <nav aria-label="Navegación principal">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${screen === id ? 'active' : ''}`} onClick={() => navigate(id)} type="button"><Icon size={18} strokeWidth={1.75} /><span>{label}</span>{id === 'revisar' && pending.length > 0 && <b>{pending.length}</b>}</button>)}
        </nav>
        <div className="sidebar-foot"><span className="avatar">DE</span><span><strong>Demo pública</strong><small>Datos sintéticos</small></span><ChevronDown size={15} /></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="page-title"><p className="eyebrow">{meta.eyebrow}</p><h1>{meta.title}</h1><p className="page-description">{meta.description}</p></div>
          <div className="top-actions">
            {screen !== 'ajustes' && <div className="month-stepper" aria-label="Seleccionar mes"><button type="button" aria-label="Mes anterior" disabled={monthIndex === 0} onClick={() => setMonthIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={17} /></button><span>{months[monthIndex].label}</span><button type="button" aria-label="Mes siguiente" disabled={monthIndex === months.length - 1} onClick={() => setMonthIndex((value) => Math.min(months.length - 1, value + 1))}><ChevronRight size={17} /></button><button className="today" type="button" onClick={() => setMonthIndex(months.length - 1)}>Hoy</button></div>}
            <button className="icon-button desktop-only" type="button" onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}>{hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            {['inicio', 'movimientos'].includes(screen) && <button className="primary" type="button" onClick={() => setAddOpen(true)}><Plus size={17} /> Agregar movimiento</button>}
            {screen === 'revisar' && pending.length > 0 && <button className="primary" type="button" onClick={() => resolveReview(pending[activeReview]?.id, 'Food & Dining')}><Check size={17} /> Resolver selección</button>}
            {screen === 'importar' && <button className="primary" type="button" onClick={() => fileRef.current?.click()}><FileUp size={17} /> Subir archivo</button>}
          </div>
        </header>

        {screen === 'inicio' && <HomeScreen monthIndex={monthIndex} hidden={hidden} pending={pending.length} penExpense={penExpense} penIncome={penIncome} usdIncome={usdIncome} budgets={liveBudgets} movements={monthMovements} datasetRowCount={datasetRowCount} datasetUpdatedThrough={datasetUpdatedThrough} lastSynced={lastSynced} syncBusy={syncBusy} onRefresh={refreshFromGoogleSheets} onNavigate={navigate} onImport={() => navigate('importar')} />}
        {screen === 'movimientos' && <MovementsScreen movements={filteredMovements} hidden={hidden} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} currencyFilter={currencyFilter} setCurrencyFilter={setCurrencyFilter} penExpense={penExpense} penIncome={penIncome} excluded={excluded} pendingChanges={pendingChanges.length} applyBusy={applyBusy} onApply={applyPendingChanges} onMarkTransfer={markTransfer} onRecategorize={recategorizeMovement} onEdit={setEditingMovement} onDelete={deleteMovement} />}
        {screen === 'revisar' && <ReviewScreen items={pending} hidden={hidden} active={activeReview} setActive={setActiveReview} tab={reviewTab} setTab={setReviewTab} onResolve={resolveReview} onTransfer={(id) => markTransfer(id, true)} />}
        {screen === 'presupuestos' && <BudgetsScreen budgets={liveBudgets} setBudgets={setBudgets} hidden={hidden} />}
        {screen === 'cuentas' && <AccountsScreen hidden={hidden} movements={monthMovements} onImport={() => navigate('importar')} />}
        {screen === 'importar' && <ImportScreen fileRef={fileRef} imports={imports} preview={importPreview} file={importFile} busy={importBusy} error={importError} password={importPassword} setPassword={setImportPassword} onFile={handleImportFile} onRetry={() => handleImportFile(importFile, importPassword)} onUpdateRow={updateImportRow} onCancel={cancelImport} onCommit={commitImport} />}
        {screen === 'informes' && <ReportsScreen tab={reportTab} setTab={setReportTab} hidden={hidden} movements={movements} />}
        {screen === 'ajustes' && <SettingsScreen dark={dark} setDark={setDark} hidden={hidden} setHidden={setHidden} onToast={showToast} />}
      </section>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navItems.slice(0, 4).map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span>{id === 'revisar' && pending.length > 0 && <b>{pending.length}</b>}</button>)}
        <button className={['cuentas', 'importar', 'informes', 'ajustes'].includes(screen) ? 'active' : ''} onClick={() => setMobileMenu(true)}><Menu size={19} /><span>Más</span></button>
      </nav>

      {mobileMenu && <div className="sheet-backdrop" onMouseDown={() => setMobileMenu(false)}><section className="mobile-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="section-heading"><div><p className="eyebrow">Navegación</p><h2>Más en Haber</h2></div><button className="icon-button" onClick={() => setMobileMenu(false)} aria-label="Cerrar"><X size={17} /></button></div>{navItems.slice(4).map(({ id, label, icon: Icon }) => <button className="sheet-link" key={id} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span><ChevronRight size={16} /></button>)}</section></div>}

      {addOpen && <AddMovementDialog onClose={() => setAddOpen(false)} onSubmit={submitMovement} />}
      {editingMovement && <EditMovementDialog movement={editingMovement} onClose={() => setEditingMovement(null)} onSave={saveMovement} />}
      {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}</div>}
    </main>
  );
}

function HomeScreen({ monthIndex, hidden, pending, penExpense, penIncome, usdIncome, budgets, movements, datasetRowCount, datasetUpdatedThrough, lastSynced, syncBusy, onRefresh, onNavigate, onImport }: { monthIndex: number; hidden: boolean; pending: number; penExpense: number; penIncome: number; usdIncome: number; budgets: typeof initialBudgets; movements: Movement[]; datasetRowCount: number; datasetUpdatedThrough: string; lastSynced: string; syncBusy: boolean; onRefresh: () => void; onNavigate: (screen: Screen) => void; onImport: () => void }) {
  const trend = MONTHLY_TOTALS.filter((item) => item.currency === 'PEN').slice(-12);
  const maxTrend = Math.max(...trend.map((item) => item.expenseMinor), 1);
  const merchants = Object.values(movements.filter((item) => item.currency === 'PEN' && item.type === 'Gasto').reduce<Record<string, { name: string; group: string; amount: number }>>((result, item) => {
    result[item.merchant] ??= { name: item.merchant, group: item.group, amount: 0 };
    result[item.merchant].amount += item.amount;
    return result;
  }, {})).sort((left, right) => right.amount - left.amount).slice(0, 4);
  return <>
    <div className="coverage-callout source-connected"><span className="success-mark"><ShieldCheck size={14} /></span><div><strong>Modo demostración seguro</strong><p>{datasetRowCount.toLocaleString('es-PE')} movimientos sintéticos · datos hasta {displayDate(datasetUpdatedThrough)} · sin cuentas, nombres ni transacciones reales{lastSynced ? ` · restablecido ${lastSynced}` : ''}.</p></div><div className="source-actions"><button type="button" onClick={onRefresh} disabled={syncBusy}><RefreshCw className={syncBusy ? 'spinner' : ''} size={14} />{syncBusy ? 'Restableciendo…' : 'Restablecer demo'}</button></div></div>
    <section className="kpi-row" aria-label="Resumen del mes">
      <article><span>Gasto equivalente en soles</span><strong className="money">{formatMoney(penExpense, 'PEN', hidden)}</strong><small>Incluye USD convertido · transferencias excluidas</small></article>
      <article><span>Ingresos USD validados</span><strong className="money income">{formatMoney(USD_INCOME_TOTAL, 'USD', hidden)}</strong><small>{formatMoney(usdIncome, 'USD', hidden)} en {months[monthIndex].label.toLowerCase()} · sin conversión</small></article>
      <article><span>Neto equivalente en soles</span><strong className="money">{formatMoney(Math.abs(penIncome - penExpense), 'PEN', hidden, penIncome - penExpense >= 0 ? 'in' : 'out')}</strong><small>Ingresos menos gastos con tipo de cambio mensual</small></article>
      <article><span>Por revisar</span><strong className="money warning">{pending}</strong><small>Clasificación pendiente</small></article>
    </section>
    {movements.length === 0 ? <EmptyState icon={ReceiptText} title={`${months[monthIndex].label} está vacío`} copy="Importa un estado BCP o agrega tu primer movimiento del mes." action="Importar estado" onAction={onImport} /> : <>
      <div className="home-grid">
        <section className="panel budget-panel"><div className="section-heading"><div><p className="eyebrow">{months[monthIndex].label}</p><h2>Topes del mes</h2></div><button type="button" onClick={() => onNavigate('presupuestos')}>Ver presupuestos <ArrowRight size={14} /></button></div><div className="budget-list">{budgets.slice(0, 4).map((budget) => <BudgetProgress key={budget.name} budget={budget} hidden={hidden} />)}</div></section>
        <aside className="panel merchants-panel"><div className="section-heading"><div><p className="eyebrow">Egresos PEN</p><h2>Top comercios</h2></div></div><ol>{merchants.map((merchant) => <li key={merchant.name}><span>{merchant.name}<small>{merchant.group}</small></span><strong className="money">{formatMoney(merchant.amount, 'PEN', hidden)}</strong></li>)}</ol></aside>
      </div>
      <section className="trend-section panel"><div className="section-heading"><div><p className="eyebrow">Últimos meses</p><h2>Gasto mensual en PEN</h2></div><StatusChip tone="good">Datos demo</StatusChip></div><div className="bar-chart" aria-label="Gráfico de gasto mensual en soles">{trend.map((item) => <div className="bar-column" key={item.month}><div className="bar" style={{ height: `${Math.max(8, (item.expenseMinor / maxTrend) * 100)}%` }} title={formatMoney(item.expenseMinor / 100, 'PEN')} /><span>{new Date(`${item.month}-02T00:00:00`).toLocaleDateString('es-PE', { month: 'narrow' })}</span></div>)}</div><p className="chart-caption">Fuente: dataset sintético incluido en el repositorio · transferencias excluidas del gasto.</p></section>
      <section className="movements-section"><div className="section-heading"><div><p className="eyebrow">Última actividad</p><h2>Movimientos recientes</h2></div><button type="button" onClick={() => onNavigate('movimientos')}>Ver todos <ArrowRight size={14} /></button></div><MovementTable movements={movements.slice(0, 6)} hidden={hidden} /></section>
    </>}
  </>;
}

function BudgetProgress({ budget, hidden }: { budget: { name: string; limit: number; spent: number }; hidden: boolean }) {
  const percent = Math.round((budget.spent / budget.limit) * 100);
  return <div className="budget-row"><div><strong>{budget.name}</strong><span className="money">{formatMoney(budget.spent, 'PEN', hidden)} de {formatMoney(budget.limit, 'PEN', hidden)}</span></div><div className="progress-track"><span className={percent >= 100 ? 'over' : percent > 80 ? 'near' : ''} style={{ width: `${Math.min(percent, 100)}%` }} /></div><em>{percent >= 100 ? 'Tope alcanzado' : percent > 80 ? 'Cerca del tope' : `${percent}% usado`}</em></div>;
}

function MovementsScreen({ movements, hidden, search, setSearch, typeFilter, setTypeFilter, currencyFilter, setCurrencyFilter, penExpense, penIncome, excluded, pendingChanges, applyBusy, onApply, onMarkTransfer, onRecategorize, onEdit, onDelete }: { movements: Movement[]; hidden: boolean; search: string; setSearch: (value: string) => void; typeFilter: string; setTypeFilter: (value: string) => void; currencyFilter: string; setCurrencyFilter: (value: string) => void; penExpense: number; penIncome: number; excluded: number; pendingChanges: number; applyBusy: boolean; onApply: () => void; onMarkTransfer: (id: number) => void; onRecategorize: (id: number, category: string) => void; onEdit: (movement: Movement) => void; onDelete: (movement: Movement) => void }) {
  return <><div className="filter-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar comercio, descripción o cuenta" aria-label="Buscar movimientos" /></label><label className="select-field"><Filter size={15} /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>Todos</option><option>Gasto</option><option>Ingreso</option><option>Transferencia</option></select></label><label className="select-field"><select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}><option>Todas</option><option>PEN</option><option>USD</option><option>CLP</option><option>EUR</option></select></label><button className="secondary-button"><ListFilter size={15} /> Más filtros</button></div>
    <section className="summary-strip"><div><span>Ingresos PEN</span><strong className="money income">{formatMoney(penIncome, 'PEN', hidden)}</strong></div><div><span>Egresos PEN</span><strong className="money expense">{formatMoney(penExpense, 'PEN', hidden)}</strong></div><div><span>Neto PEN</span><strong className="money">{formatMoney(Math.abs(penIncome - penExpense), 'PEN', hidden, penIncome - penExpense >= 0 ? 'in' : 'out')}</strong></div><div><span>Excluidos</span><strong className="money muted-amount">{formatMoney(excluded, 'PEN', hidden)}</strong><small>Transferencias</small></div></section>
    <div className="table-toolbar"><span>{movements.length} movimientos</span><div className="table-toolbar-actions">{pendingChanges > 0 && <span className="pending-copy">{pendingChanges} {pendingChanges === 1 ? 'cambio pendiente' : 'cambios pendientes'}</span>}<button className="primary save-changes" type="button" onClick={onApply} disabled={applyBusy || pendingChanges === 0}>{applyBusy ? <LoaderCircle className="spinner" size={15} /> : <Save size={15} />}{applyBusy ? 'Guardando…' : 'Aplicar cambios'}</button><button className="plain-button"><Download size={15} /> Exportar CSV</button></div></div>
    {movements.length ? <div className="movement-table-card"><MovementTable movements={movements} hidden={hidden} onMarkTransfer={onMarkTransfer} onRecategorize={onRecategorize} onEdit={onEdit} onDelete={onDelete} /></div> : <EmptyState icon={Search} title="No hay coincidencias" copy="Prueba con otro término o limpia los filtros." action="Limpiar búsqueda" onAction={() => setSearch('')} />}
  </>;
}

function MovementTable({ movements, hidden, onMarkTransfer, onRecategorize, onEdit, onDelete }: { movements: Movement[]; hidden: boolean; onMarkTransfer?: (id: number) => void; onRecategorize?: (id: number, category: string) => void; onEdit?: (movement: Movement) => void; onDelete?: (movement: Movement) => void }) {
  const hasActions = Boolean(onEdit || onDelete || onMarkTransfer);
  return <div className="table-wrap"><table className="data-table"><caption>Movimientos del ledger Haber</caption><thead><tr><th>Fecha</th><th>Descripción</th><th>Comercio</th><th>Categoría</th><th>Cuenta</th><th>Monto</th>{hasActions && <th><span className="sr-only">Acciones</span></th>}</tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.date}</td><td><span className="description-cell">{movement.description}</span>{movement.fxMissing && <StatusChip tone="warn">sin cambio</StatusChip>}</td><td>{movement.merchant}</td><td>{onRecategorize ? <select className="category-editor" aria-label={`Categoría de ${movement.merchant}`} value={movement.category} onChange={(event) => onRecategorize(movement.id, event.target.value)}>{!CATEGORY_OPTIONS.some((option) => option.value === movement.category) && <option value={movement.category}>{movement.category}</option>}{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <StatusChip tone={movement.type === 'Transferencia' ? 'neutral' : movement.review ? 'warn' : 'good'}>{CATEGORY_OPTIONS.find((option) => option.value === movement.category)?.label ?? movement.category}</StatusChip>}</td><td>{movement.account}</td><td className={`money amount-cell ${movement.type === 'Ingreso' ? 'income' : movement.type === 'Transferencia' ? 'muted-amount' : 'expense'}`}><span>{formatMoney(movement.amount, movement.currency, hidden, movement.type === 'Ingreso' ? 'in' : 'out')}</span>{movement.currency === 'USD' && movement.amountPen !== undefined && <small className="pen-equivalent">{hidden ? '••••' : `= ${formatMoney(movement.amountPen, 'PEN')}`}</small>}</td>{hasActions && <td className="action-cell"><div className="row-actions">{movement.type !== 'Transferencia' && movement.description.includes('YAPE') && onMarkTransfer && <button className="row-action transfer-action" onClick={() => onMarkTransfer(movement.id)}>Transferencia</button>}{onEdit && <button className="row-icon-action" type="button" onClick={() => onEdit(movement)} aria-label={`Editar ${movement.merchant}`} title="Editar movimiento"><Pencil size={14} /></button>}{onDelete && <button className="row-icon-action danger" type="button" onClick={() => onDelete(movement)} aria-label={`Eliminar ${movement.merchant}`} title="Eliminar movimiento"><Trash2 size={14} /></button>}</div></td>}</tr>)}</tbody></table></div>;
}

function ReviewScreen({ items, hidden, active, setActive, tab, setTab, onResolve, onTransfer }: { items: Movement[]; hidden: boolean; active: number; setActive: (value: number) => void; tab: string; setTab: (value: string) => void; onResolve: (id: number, category: string) => void; onTransfer: (id: number) => void }) {
  const tabs = ['Categorías amplias', 'Duplicados', 'Sin cuenta', 'USD sin PEN'];
  const visibleItems = tab === 'Duplicados' ? items.filter((item) => item.duplicate) : tab === 'USD sin PEN' ? items.filter((item) => item.fxMissing) : tab === 'Sin cuenta' ? [] : items;
  return <><div className="review-topline"><div className="tabs" role="tablist">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setActive(0); }} key={item}>{item}<span>{item === 'Categorías amplias' ? items.length : item === 'Duplicados' ? items.filter((row) => row.duplicate).length : item === 'USD sin PEN' ? items.filter((row) => row.fxMissing).length : 0}</span></button>)}</div><div className="keyboard-help"><kbd>J</kbd><kbd>K</kbd> navegar <kbd>C</kbd> categoría <kbd>T</kbd> transferencia</div></div>
    {visibleItems.length ? <div className="review-list">{visibleItems.map((item, index) => <article className={`review-row ${active === index ? 'selected' : ''}`} key={item.id} onClick={() => setActive(index)}><div className="review-raw"><p className="eyebrow">Descripción del banco</p><strong>{item.description}</strong><span>{item.date} · {item.account}</span></div><div><p className="eyebrow">Comercio</p><strong>{item.merchant}</strong></div><label><span className="eyebrow">Categoría</span><select value={item.category} onChange={(event) => onResolve(item.id, event.target.value)}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><strong className={`money review-amount ${item.type === 'Ingreso' ? 'income' : 'expense'}`}>{formatMoney(item.amount, item.currency, hidden, item.type === 'Ingreso' ? 'in' : 'out')}</strong><div className="review-actions"><button onClick={() => onTransfer(item.id)} title="Marcar como transferencia"><ArrowRight size={16} /></button><button onClick={() => onResolve(item.id, 'Other Expenses')} title="Dejar en Otros gastos"><Check size={16} /></button><button title="Más acciones"><MoreHorizontal size={16} /></button></div></article>)}</div> : <EmptyState icon={CheckCheck} title={tab === 'Sin cuenta' ? 'No hay movimientos sin cuenta' : 'Nada pendiente'} copy="El ledger está limpio en esta vista." />}
  </>;
}

function BudgetsScreen({ budgets, setBudgets, hidden }: { budgets: typeof initialBudgets; setBudgets: React.Dispatch<React.SetStateAction<typeof initialBudgets>>; hidden: boolean }) {
  const totalLimit = budgets.reduce((sum, item) => sum + item.limit, 0);
  const totalSpent = budgets.reduce((sum, item) => sum + item.spent, 0);
  return <><section className="budget-hero"><div><span>Topes del mes</span><strong className="money">{formatMoney(totalLimit, 'PEN', hidden)}</strong><small>{formatMoney(totalLimit - totalSpent, 'PEN', hidden)} disponibles</small></div><div className="hero-progress"><span style={{ width: `${Math.min(100, (totalSpent / totalLimit) * 100)}%` }} /></div><div className="budget-legend"><span><i className="dot accent" />Real {formatMoney(totalSpent, 'PEN', hidden)}</span><span><i className="dot muted" />Disponible {formatMoney(totalLimit - totalSpent, 'PEN', hidden)}</span></div></section>
    <div className="section-heading budget-heading"><div><p className="eyebrow">{budgets.length} grupos de gasto locales</p><h2>Detalle por grupo</h2></div><StatusChip tone="good">Catálogo demo</StatusChip></div>
    <div className="budget-table"><div className="budget-table-head"><span>Grupo</span><span>Tope</span><span>Real</span><span>Uso</span><span>Mes anterior</span><span>Recurrente</span></div>{budgets.map((budget, index) => { const percent = Math.round((budget.spent / budget.limit) * 100); return <div className="budget-table-row" key={`${budget.name}-${index}`}><div><span className={`group-icon group-${index % 5}`}>{budget.name.slice(0,1)}</span><strong>{budget.name}</strong></div><label className="inline-money"><span>S/</span><input aria-label={`Tope de ${budget.name}`} type="number" value={budget.limit} onChange={(event) => setBudgets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, limit: Number(event.target.value) } : item))} /></label><strong className="money">{formatMoney(budget.spent, 'PEN', hidden)}</strong><div className="percent-cell"><div className="progress-track"><span className={percent >= 100 ? 'over' : percent > 80 ? 'near' : ''} style={{ width: `${Math.min(percent,100)}%` }} /></div><span>{percent}% · {percent >= 100 ? 'Pasado' : percent > 80 ? 'Aviso' : 'Dentro'}</span></div><span className="money muted-amount">{formatMoney(budget.spent * .91, 'PEN', hidden)}</span><label className="switch"><input type="checkbox" defaultChecked /><span /></label></div>; })}</div>
  </>;
}

function AccountsScreen({ hidden, movements, onImport }: { hidden: boolean; movements: Movement[]; onImport: () => void }) {
  const accounts = Object.values(movements.reduce<Record<string, { name: string; currency: Currency; net: number; count: number; lastDate: string }>>((result, movement) => {
    const key = `${movement.account}|${movement.currency}`;
    result[key] ??= { name: movement.account, currency: movement.currency, net: 0, count: 0, lastDate: movement.date };
    result[key].count += 1;
    if (movement.type === 'Ingreso') result[key].net += movement.amount;
    if (movement.type === 'Gasto') result[key].net -= movement.amount;
    return result;
  }, {})).sort((left, right) => right.count - left.count);
  const netPen = accounts.filter((account) => account.currency === 'PEN').reduce((sum, account) => sum + account.net, 0);
  const netUsd = accounts.filter((account) => account.currency === 'USD').reduce((sum, account) => sum + account.net, 0);
  return <><div className="account-summary"><div><span>Neto observado PEN</span><strong className="money">{formatMoney(Math.abs(netPen), 'PEN', hidden, netPen >= 0 ? 'in' : 'out')}</strong></div><div><span>Neto observado USD</span><strong className="money">{formatMoney(Math.abs(netUsd), 'USD', hidden, netUsd >= 0 ? 'in' : 'out')}</strong><small>Sin convertir a soles</small></div><div><span>Cuentas con actividad</span><strong className="money">{accounts.length}</strong></div></div><div className="accounts-grid">{accounts.slice(0, 8).map((account) => <article className="account-card" key={`${account.name}-${account.currency}`}><div className="account-card-head"><span className="account-initials">{account.name.replace(/\D/g, '').slice(-2) || account.name.slice(0, 2).toUpperCase()}</span><StatusChip tone="good">{account.count} mov.</StatusChip></div><h2>{account.name}</h2><p>Actividad registrada · {account.currency}</p><strong className="money account-balance">{formatMoney(Math.abs(account.net), account.currency, hidden, account.net >= 0 ? 'in' : 'out')}</strong><div className="account-card-foot"><span>Último movimiento {account.lastDate}</span><button className="plain-button" onClick={onImport}>Importar <ArrowRight size={14} /></button></div></article>)}</div></>;
}

function ImportScreen({ fileRef, imports, preview, file, busy, error, password, setPassword, onFile, onRetry, onUpdateRow, onCancel, onCommit }: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  imports: { name: string; date: string; rows: string; status: string }[];
  preview: ImportPreviewData | null;
  file: File | null;
  busy: boolean;
  error: { message: string; password: boolean } | null;
  password: string;
  setPassword: (value: string) => void;
  onFile: (file?: File | null) => void;
  onRetry: () => void;
  onUpdateRow: (id: string, patch: Partial<ParsedImportRow>) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const selected = preview?.rows.filter((row) => row.included && !row.duplicate).length ?? 0;
  const duplicates = preview?.rows.filter((row) => row.duplicate).length ?? 0;
  const excluded = preview?.rows.filter((row) => !row.included).length ?? 0;
  const currency = preview?.currency ?? preview?.rows.find((row) => row.included)?.currency ?? 'PEN';
  return <>
    <input ref={fileRef} className="sr-only" type="file" accept=".pdf,.csv,.xlsx" onChange={(event) => { const selectedFile = event.target.files?.[0]; onFile(selectedFile); event.currentTarget.value = ''; }} />
    <section className="import-options">
      <button className="import-option" type="button" onClick={() => fileRef.current?.click()}><span className="import-icon"><FileUp size={20} /></span><span><strong>Estado de cuenta BCP</strong><small>PDF de ahorros en soles o dólares, incluso si está protegido.</small></span><ArrowRight size={17} /></button>
      <button className="import-option" type="button" onClick={() => fileRef.current?.click()}><span className="import-icon"><FileSpreadsheet size={20} /></span><span><strong>CSV o Excel</strong><small>Detectamos fecha, descripción, débito, crédito y moneda.</small></span><ArrowRight size={17} /></button>
    </section>

    {busy && <section className="import-progress" role="status"><LoaderCircle className="spinner" size={20} /><div><strong>Leyendo {file?.name}</strong><p>El archivo se procesa en este navegador.</p></div></section>}

    {error && <section className={`import-alert ${error.password ? 'password' : 'bad'}`} role="alert"><span>{error.password ? <LockKeyhole size={18} /> : <AlertTriangle size={18} />}</span><div><strong>{error.password ? 'PDF protegido' : 'No se pudo importar'}</strong><p>{error.message}</p>{error.password && <form className="password-form" onSubmit={(event) => { event.preventDefault(); onRetry(); }}><input aria-label="Contraseña del PDF" autoComplete="off" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Contraseña del estado" required /><button className="primary" type="submit" disabled={busy}>Abrir PDF</button><small>La contraseña solo vive durante esta lectura; no se guarda ni se envía.</small></form>}</div><button className="icon-button" type="button" onClick={onCancel} aria-label="Cerrar"><X size={16} /></button></section>}

    {preview && <section className={`import-preview ${preview.reconciled ? '' : 'unreconciled'}`}>
      <div className="preview-status"><span className={preview.reconciled ? 'success-mark' : 'warning-mark'}>{preview.reconciled ? <Check size={16} /> : <AlertTriangle size={16} />}</span><div><p className="eyebrow">{preview.reconciled ? 'Listo para revisar' : 'Revisión obligatoria'}</p><h2>{preview.filename}</h2><p>{preview.reconcileMessage}</p><div className="file-meta"><span>{preview.sourceLabel}</span>{preview.periodStart && preview.periodEnd && <span>{displayDate(preview.periodStart)} — {displayDate(preview.periodEnd)}</span>}<span>{preview.rows.length} filas detectadas</span></div></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Cancelar importación"><X size={16} /></button></div>
      <div className="preview-metrics"><div><span>Débitos</span><strong className="money">{formatMoney(preview.totalDebitsMinor / 100, currency)}</strong></div><div><span>Créditos</span><strong className="money income">{formatMoney(preview.totalCreditsMinor / 100, currency)}</strong></div><div><span>Duplicados</span><strong className="money warning">{duplicates}</strong></div><div><span>Excluidos</span><strong className="money">{excluded}</strong></div></div>
      <div className="preview-table-wrap"><table className="preview-table"><caption>Vista previa de movimientos a importar</caption><thead><tr><th>Importar</th><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Estado</th></tr></thead><tbody>{preview.rows.slice(0, 40).map((row) => <tr key={row.id} className={!row.included ? 'excluded-row' : ''}><td><input type="checkbox" aria-label={`Importar ${row.description}`} checked={row.included} disabled={row.duplicate} onChange={(event) => onUpdateRow(row.id, { included: event.target.checked })} /></td><td>{displayDate(row.processDate)}</td><td><strong>{row.description || 'Sin descripción'}</strong><small>{row.account}{row.valueDate ? ` · valor ${displayDate(row.valueDate)}` : ''}</small></td><td><select value={row.category} onChange={(event) => onUpdateRow(row.id, { category: event.target.value, review: event.target.value === 'Por revisar' })}><option value="Por revisar">Por revisar</option>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></td><td className={`money ${row.signedAmountMinor >= 0 ? 'income' : 'expense'}`}>{formatMoney(Math.abs(row.signedAmountMinor) / 100, row.currency, false, row.signedAmountMinor >= 0 ? 'in' : 'out')}</td><td>{row.duplicate ? <StatusChip tone="warn">Duplicado</StatusChip> : row.issues.length ? <span title={row.issues.join(', ')}><StatusChip tone="warn">Revisar</StatusChip></span> : <StatusChip tone="good">Lista</StatusChip>}</td></tr>)}</tbody></table>{preview.rows.length > 40 && <p className="preview-limit">Mostrando 40 de {preview.rows.length} filas. Todas las seleccionadas se importarán.</p>}</div>
      <div className="preview-actions"><span>{selected} movimientos nuevos seleccionados</span><button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="primary" type="button" onClick={onCommit} disabled={!preview.reconciled || selected === 0}><Check size={16} /> Confirmar {selected}</button></div>
    </section>}

    <div className="section-heading import-history-title"><div><p className="eyebrow">Fuente y cargas</p><h2>Historial de datos</h2></div></div><div className="import-history">{imports.map((item) => <div className="import-row" key={`${item.name}-${item.date}`}><span className="file-badge"><ReceiptText size={18} /></span><div><strong>{item.name}</strong><small>{item.date}</small></div><span>{item.rows} filas</span><StatusChip tone="good">{item.status}</StatusChip><button className="more-button"><MoreHorizontal size={17} /></button></div>)}</div>
  </>;
}

function ReportsScreen({ tab, setTab, hidden, movements }: { tab: string; setTab: (value: string) => void; hidden: boolean; movements: Movement[] }) {
  const ledger = movements.filter((item) => item.currency === 'PEN' || item.currency === 'USD');
  const reportMonths = [...new Set(ledger.map(movementMonthKey))].sort();
  const totals = (currency: 'PEN' | 'USD', type: MovementType) => ledger.filter((item) => item.currency === currency && item.type === type).reduce((sum, item) => sum + item.amount, 0);
  const penIncome = totals('PEN', 'Ingreso');
  const penExpense = totals('PEN', 'Gasto');
  const usdIncome = totals('USD', 'Ingreso');
  const usdExpense = totals('USD', 'Gasto');
  const monthRows = reportMonths.map((month) => {
    const rows = ledger.filter((item) => movementMonthKey(item) === month);
    const value = (currency: 'PEN' | 'USD', type: MovementType) => rows.filter((item) => item.currency === currency && item.type === type).reduce((sum, item) => sum + item.amount, 0);
    return { month, penIncome: value('PEN', 'Ingreso'), penExpense: value('PEN', 'Gasto'), penTransfers: value('PEN', 'Transferencia'), usdIncome: value('USD', 'Ingreso'), usdExpense: value('USD', 'Gasto'), usdTransfers: value('USD', 'Transferencia') };
  });
  const accountRows = Object.values(ledger.reduce<Record<string, { account: string; currency: 'PEN' | 'USD'; income: number; expense: number; transfers: number }>>((result, item) => {
    const key = `${item.account}|${item.currency}`;
    result[key] ??= { account: item.account, currency: item.currency as 'PEN' | 'USD', income: 0, expense: 0, transfers: 0 };
    if (item.type === 'Ingreso') result[key].income += item.amount;
    if (item.type === 'Gasto') result[key].expense += item.amount;
    if (item.type === 'Transferencia') result[key].transfers += item.amount;
    return result;
  }, {})).map((item) => ({ ...item, observed: item.income - item.expense })).sort((left, right) => Math.abs(right.observed) - Math.abs(left.observed));
  const period = reportMonths.length ? `${new Date(`${reportMonths[0]}-02T00:00:00`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })} — ${new Date(`${reportMonths.at(-1)}-02T00:00:00`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}` : 'Sin periodo disponible';
  const maxPenExpense = Math.max(...monthRows.map((row) => row.penExpense), 1);
  const maxUsdExpense = Math.max(...monthRows.map((row) => row.usdExpense), 1);
  return <>
    <section className="executive-summary"><p className="eyebrow">Executive Summary</p><h2>Resultado financiero por moneda</h2><div><p><strong>PEN:</strong> resultado observado de {formatMoney(Math.abs(penIncome - penExpense), 'PEN', hidden, penIncome - penExpense >= 0 ? 'in' : 'out')}.</p><p><strong>USD:</strong> resultado observado de {formatMoney(Math.abs(usdIncome - usdExpense), 'USD', hidden, usdIncome - usdExpense >= 0 ? 'in' : 'out')}.</p><p><strong>Lectura:</strong> las monedas se mantienen separadas; las transferencias no se reconocen como ingreso ni gasto.</p></div></section>
    <section className="fx-summary" aria-label="Histórico demo de cambios de moneda"><article><span>Cambios demo</span><strong>{YAPE_FX_TOTAL.operations}</strong><small>operaciones sintéticas</small></article><article><span>Dólares cambiados</span><strong className="money">{formatMoney(YAPE_FX_TOTAL.usd, 'USD', hidden)}</strong><small>periodo de demostración</small></article><article><span>Soles recibidos</span><strong className="money income">{formatMoney(YAPE_FX_TOTAL.pen, 'PEN', hidden)}</strong><small>TC ponderado {YAPE_FX_TOTAL.weightedRate.toFixed(4)}</small></article></section>
    <div className="tabs report-tabs">{['P&L','Flujo de caja','Balance general'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
    {tab === 'P&L' && <>
      <section className="statement-cards" aria-label="Resumen de pérdidas y ganancias"><StatementCard currency="PEN" income={penIncome} expense={penExpense} hidden={hidden} /><StatementCard currency="USD" income={usdIncome} expense={usdExpense} hidden={hidden} /></section>
      <section className="statement-panel panel"><div className="section-heading"><div><p className="eyebrow">{period}</p><h2>Estado de resultados (P&amp;L)</h2></div><StatusChip tone="good">Transferencias excluidas</StatusChip></div><StatementTable rows={monthRows} hidden={hidden} mode="pl" /></section>
    </>}
    {tab === 'Flujo de caja' && <>
      <section className="statement-cards" aria-label="Resumen de flujo de caja"><StatementCard currency="PEN" income={penIncome} expense={penExpense} hidden={hidden} label="Flujo operativo" /><StatementCard currency="USD" income={usdIncome} expense={usdExpense} hidden={hidden} label="Flujo operativo" /></section>
      <section className="statement-panel panel"><div className="section-heading"><div><p className="eyebrow">Entradas, salidas y transferencias</p><h2>Flujo de caja por mes</h2></div></div><StatementTable rows={monthRows} hidden={hidden} mode="cash" /></section>
    </>}
    {tab === 'Balance general' && <>
      <section className="balance-warning"><AlertTriangle size={17} /><div><strong>Balance general provisional</strong><p>La fuente no incluye saldos iniciales ni un registro completo de préstamos, tarjetas por pagar u otros pasivos. “Posición observada” equivale a ingresos menos gastos del periodo, no al saldo bancario real.</p></div></section>
      <section className="statement-panel panel"><div className="section-heading"><div><p className="eyebrow">{period}</p><h2>Posición observada por cuenta</h2></div><StatusChip tone="warn">Requiere saldos iniciales</StatusChip></div><div className="table-wrap"><table className="financial-table"><caption>Balance provisional por cuenta y moneda</caption><thead><tr><th>Cuenta</th><th>Moneda</th><th>Ingresos</th><th>Gastos</th><th>Transferencias</th><th>Posición observada</th></tr></thead><tbody>{accountRows.map((row) => <tr key={`${row.account}-${row.currency}`}><td>{row.account}</td><td>{row.currency}</td><td className="money income">{formatMoney(row.income, row.currency, hidden)}</td><td className="money expense">{formatMoney(row.expense, row.currency, hidden)}</td><td className="money muted-amount">{formatMoney(row.transfers, row.currency, hidden)}</td><td className={`money ${row.observed >= 0 ? 'income' : 'expense'}`}>{formatMoney(Math.abs(row.observed), row.currency, hidden, row.observed >= 0 ? 'in' : 'out')}</td></tr>)}</tbody></table></div></section>
    </>}
    <section className="report-chart panel"><div className="section-heading"><div><p className="eyebrow">Comparación discreta · escalas independientes</p><h2>Gastos mensuales por moneda</h2></div><div className="chart-legend"><span><i className="dot expense-dot" />PEN</span><span><i className="dot usd-expense-dot" />USD</span></div></div><div className="statement-bars">{monthRows.map((row) => <div className="statement-bar-row" key={row.month}><span>{new Date(`${row.month}-02T00:00:00`).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' })}</span><div><i className="pen" style={{ width: `${Math.max(1, (row.penExpense / maxPenExpense) * 100)}%` }} title={formatMoney(row.penExpense, 'PEN')} /><i className="usd" style={{ width: `${Math.max(1, (row.usdExpense / maxUsdExpense) * 100)}%` }} title={formatMoney(row.usdExpense, 'USD')} /></div></div>)}</div><p className="chart-caption">Fuente: dataset sintético. Cada moneda usa su propia escala; PEN nunca se suma con USD.</p></section>
    <section className="report-note"><ShieldCheck size={18} /><div><strong>Privacidad de la demo</strong><p>Este repositorio público contiene únicamente datos ficticios. Las importaciones permanecen en el navegador del visitante.</p></div></section>
  </>;
}

function StatementCard({ currency, income, expense, hidden, label = 'Resultado neto' }: { currency: 'PEN' | 'USD'; income: number; expense: number; hidden: boolean; label?: string }) {
  const net = income - expense;
  return <article><span>{currency}</span><div><small>Ingresos</small><strong className="money income">{formatMoney(income, currency, hidden)}</strong></div><div><small>Gastos</small><strong className="money expense">{formatMoney(expense, currency, hidden)}</strong></div><div><small>{label}</small><strong className={`money ${net >= 0 ? 'income' : 'expense'}`}>{formatMoney(Math.abs(net), currency, hidden, net >= 0 ? 'in' : 'out')}</strong></div></article>;
}

function StatementTable({ rows, hidden, mode }: { rows: Array<{ month: string; penIncome: number; penExpense: number; penTransfers: number; usdIncome: number; usdExpense: number; usdTransfers: number }>; hidden: boolean; mode: 'pl' | 'cash' }) {
  return <div className="table-wrap"><table className="financial-table"><caption>{mode === 'pl' ? 'Estado de resultados mensual' : 'Flujo de caja mensual'}</caption><thead><tr><th>Mes</th><th>Ingresos PEN</th><th>Gastos PEN</th>{mode === 'cash' && <th>Transfer. PEN</th>}<th>Neto PEN</th><th>Ingresos USD</th><th>Gastos USD</th>{mode === 'cash' && <th>Transfer. USD</th>}<th>Neto USD</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month}><td>{new Date(`${row.month}-02T00:00:00`).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}</td><td className="money income">{formatMoney(row.penIncome, 'PEN', hidden)}</td><td className="money expense">{formatMoney(row.penExpense, 'PEN', hidden)}</td>{mode === 'cash' && <td className="money muted-amount">{formatMoney(row.penTransfers, 'PEN', hidden)}</td>}<td className={`money ${row.penIncome - row.penExpense >= 0 ? 'income' : 'expense'}`}>{formatMoney(Math.abs(row.penIncome - row.penExpense), 'PEN', hidden, row.penIncome - row.penExpense >= 0 ? 'in' : 'out')}</td><td className="money income">{formatMoney(row.usdIncome, 'USD', hidden)}</td><td className="money expense">{formatMoney(row.usdExpense, 'USD', hidden)}</td>{mode === 'cash' && <td className="money muted-amount">{formatMoney(row.usdTransfers, 'USD', hidden)}</td>}<td className={`money ${row.usdIncome - row.usdExpense >= 0 ? 'income' : 'expense'}`}>{formatMoney(Math.abs(row.usdIncome - row.usdExpense), 'USD', hidden, row.usdIncome - row.usdExpense >= 0 ? 'in' : 'out')}</td></tr>)}</tbody></table></div>;
}

function SettingsScreen({ dark, setDark, hidden, setHidden, onToast }: { dark: boolean; setDark: (value: boolean) => void; hidden: boolean; setHidden: (value: boolean) => void; onToast: (message: string) => void }) {
  return <div className="settings-layout"><nav className="settings-nav"><button className="active">General</button><button>Categorías</button><button>Comercios</button><button>Privacidad</button><button>Exportar</button></nav><div className="settings-content"><section className="settings-section"><div><h2>Preferencias</h2><p>Afectan cómo ves el dinero en este dispositivo.</p></div><div className="setting-row"><div><strong>Ocultar montos</strong><small>Reemplaza las cifras por puntos. Atajo: <kbd>.</kbd></small></div><label className="switch"><input checked={hidden} onChange={(event) => setHidden(event.target.checked)} type="checkbox" /><span /></label></div><div className="setting-row"><div><strong>Tema oscuro</strong><small>Reduce el brillo sin cambiar el contraste.</small></div><label className="switch"><input checked={dark} onChange={(event) => setDark(event.target.checked)} type="checkbox" /><span /></label></div><div className="setting-row"><div><strong>Idioma y región</strong><small>Fechas y montos usan el formato peruano.</small></div><select><option>Español (Perú)</option></select></div></section><section className="settings-section"><div><h2>Workspace personal</h2><p>Monedas, zona horaria y propiedad del ledger.</p></div><div className="setting-row"><div><strong>Moneda principal</strong><small>Los gastos y topes se muestran en soles.</small></div><StatusChip>PEN · Sol peruano</StatusChip></div><div className="setting-row"><div><strong>Moneda secundaria</strong><small>No se convierte sin un tipo de cambio real.</small></div><StatusChip>USD · Dólar</StatusChip></div><div className="setting-row"><div><strong>Zona horaria</strong><small>Define el corte del mes.</small></div><span>America/Lima</span></div></section><section className="settings-section"><div><h2>Tus datos</h2><p>El ledger es tuyo. Puedes llevarte una copia cuando quieras.</p></div><div className="settings-actions"><button className="secondary-button" onClick={() => onToast('Exportación CSV preparada.') }><Download size={15} /> Exportar todo en CSV</button><button className="danger-button">Borrar workspace</button></div></section></div></div>;
}

function EditMovementDialog({ movement, onClose, onSave }: { movement: Movement; onClose: () => void; onSave: (movement: Movement) => void }) {
  const [type, setType] = useState<MovementType>(movement.type);
  const [currency, setCurrency] = useState<Currency>(movement.currency);
  const isoDate = movement.date.split('/').reverse().join('-');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      ...movement,
      date: String(form.get('date')).split('-').reverse().join('/'),
      description: String(form.get('description') || movement.description),
      merchant: String(form.get('merchant') || movement.merchant),
      account: String(form.get('account') || movement.account),
      amount: Number(form.get('amount')),
      currency,
      category: String(form.get('category') || movement.category),
      type,
      fxMissing: currency !== 'PEN' && movement.amountPen === undefined,
    });
  }
  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><p className="eyebrow">Editar registro</p><h2 id="edit-dialog-title">{movement.merchant}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></div><form onSubmit={submit}><div className="segmented" role="radiogroup">{(['Gasto','Ingreso','Transferencia'] as MovementType[]).map((item) => <button className={type === item ? 'active' : ''} type="button" onClick={() => setType(item)} key={item}>{item}</button>)}</div><div className="form-grid"><label><span>Cuenta</span><input name="account" defaultValue={movement.account} required /></label><label><span>Fecha</span><input name="date" type="date" defaultValue={isoDate} required /></label><label><span>Monto</span><div className="amount-input"><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>PEN</option><option>USD</option><option>CLP</option><option>EUR</option></select><input name="amount" inputMode="decimal" type="number" step="0.01" min="0.01" defaultValue={movement.amount} required /></div></label><label><span>Categoría</span><select name="category" defaultValue={movement.category} required>{!CATEGORY_OPTIONS.some((option) => option.value === movement.category) && <option value={movement.category}>{movement.category}</option>}{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="full-field"><span>Comercio</span><input name="merchant" defaultValue={movement.merchant} required /></label><label className="full-field"><span>Descripción</span><textarea name="description" rows={3} defaultValue={movement.description} required /></label></div><p className="inline-warning"><Save size={14} /> El cambio se guarda solo en este navegador al pulsar “Aplicar cambios”.</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit"><Save size={16} /> Guardar edición</button></div></form></section></div>;
}

function AddMovementDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [type, setType] = useState<MovementType>('Gasto');
  const [currency, setCurrency] = useState<Currency>('PEN');
  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-head"><div><p className="eyebrow">Nuevo registro</p><h2 id="dialog-title">Agregar movimiento</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={17} /></button></div><form onSubmit={onSubmit}><div className="segmented" role="radiogroup">{(['Gasto','Ingreso','Transferencia'] as MovementType[]).map((item) => <button className={type === item ? 'active' : ''} type="button" onClick={() => setType(item)} key={item}>{item}</button>)}<input type="hidden" name="type" value={type} /></div><div className="form-grid"><label><span>Cuenta</span><select name="account" required><option>Cuenta Demo PEN</option><option>Cuenta Demo USD</option><option>Billetera Demo</option><option>Otra cuenta</option></select></label><label><span>Fecha</span><input name="date" type="date" defaultValue="2026-08-24" required /></label><label><span>Monto</span><div className="amount-input"><select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>PEN</option><option>USD</option></select><input name="amount" inputMode="decimal" placeholder="0.00" type="number" step="0.01" min="0.01" required /></div></label><label><span>Categoría</span><select name="category" defaultValue={type === 'Ingreso' ? 'Income' : type === 'Transferencia' ? 'Transfers' : 'Food & Dining'} required>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="full-field"><span>Comercio</span><input name="merchant" placeholder="Ej. Mercado Central" required /></label>{type === 'Transferencia' && <label className="full-field"><span>Cuenta destino</span><select><option>Cuenta Demo PEN</option><option>Cuenta Demo USD</option></select></label>}<label className="full-field"><span>Nota <small>Opcional</small></span><textarea name="note" rows={2} placeholder="Añade un detalle útil" /></label></div>{currency === 'USD' && <p className="inline-warning"><AlertTriangle size={14} /> Se guardará en USD. Haber no inventará un monto en soles.</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary" type="submit"><Plus size={16} /> Agregar movimiento</button></div></form></section></div>;
}
