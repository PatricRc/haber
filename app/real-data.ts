export type SupportedCurrency = 'PEN' | 'USD' | 'CLP' | 'EUR';

export type RealMovement = {
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
  currency: SupportedCurrency;
  type: 'Gasto' | 'Ingreso' | 'Transferencia';
  review: boolean;
  fxMissing: boolean;
  source: string;
};

export type MonthlyTotal = {
  month: string;
  currency: SupportedCurrency;
  incomeMinor: number;
  expenseMinor: number;
  transferMinor: number;
  reviewCount: number;
  count: number;
};

export const FX_RATES_2026 = {
  '2026-05': { buy: 3.43, sell: 3.44, midpoint: 3.435 },
  '2026-06': { buy: 3.40, sell: 3.41, midpoint: 3.405 },
  '2026-07': { buy: 3.39, sell: 3.40, midpoint: 3.395 },
  '2026-08': { buy: 3.36, sell: 3.37, midpoint: 3.365 },
} as const;

export function withPenConversion(movement: RealMovement): RealMovement {
  if (movement.currency === 'PEN') return { ...movement, amountPen: movement.amount, fxMissing: false };
  if (movement.currency !== 'USD') return movement;
  const [day, month, year] = movement.date.split('/');
  void day;
  const rate = FX_RATES_2026[`${year}-${month}` as keyof typeof FX_RATES_2026];
  if (!rate) return movement;
  const selectedRate = movement.type === 'Ingreso' ? rate.buy : movement.type === 'Transferencia' ? rate.midpoint : rate.sell;
  return { ...movement, amountPen: Math.round(movement.amount * selectedRate * 100) / 100, fxMissing: false };
}

export const GOOGLE_SHEET_URL = '';
export const DATASET_UPDATED_THROUGH = '2026-08-24';

export const REAL_MOVEMENTS: RealMovement[] = [
  { id: 1, externalId: 'DEMO-001', date: '24/08/2026', description: 'Compra de supermercado', merchant: 'Mercado Central', category: 'Groceries', group: 'Comida', account: 'Cuenta Demo PEN', amount: 126.40, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 2, externalId: 'DEMO-002', date: '22/08/2026', description: 'Servicio de movilidad', merchant: 'Movilidad Urbana', category: 'Transportation', group: 'Transporte', account: 'Billetera Demo', amount: 24.90, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 3, externalId: 'DEMO-003', date: '20/08/2026', description: 'Pago por proyecto', merchant: 'Cliente Ejemplo', category: 'Income', group: 'Ingresos', account: 'Cuenta Demo USD', amount: 3200, currency: 'USD', type: 'Ingreso', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 4, externalId: 'DEMO-004', date: '18/08/2026', description: 'Suscripción mensual', merchant: 'Software Creativo', category: 'Subscriptions & Digital', group: 'Suscripciones', account: 'Cuenta Demo USD', amount: 18, currency: 'USD', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 5, externalId: 'DEMO-005', date: '16/08/2026', description: 'Consumo pendiente de clasificar', merchant: 'Comercio Local', category: 'Other Expenses', group: 'Otros', account: 'Cuenta Demo PEN', amount: 48, currency: 'PEN', type: 'Gasto', review: true, fxMissing: false, source: 'Datos demo' },
  { id: 6, externalId: 'DEMO-006', date: '12/08/2026', description: 'Pago de vivienda', merchant: 'Arrendamiento Demo', category: 'Rent', group: 'Renta', account: 'Cuenta Demo PEN', amount: 1800, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 7, externalId: 'DEMO-007', date: '08/08/2026', description: 'Transferencia entre cuentas', merchant: 'Cuenta propia', category: 'Transfers', group: 'Transferencias', account: 'Cuenta Demo PEN', amount: 500, currency: 'PEN', type: 'Transferencia', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 8, externalId: 'DEMO-008', date: '05/08/2026', description: 'Factura de internet', merchant: 'Internet Hogar', category: 'Bills & Utilities', group: 'Vivienda', account: 'Cuenta Demo PEN', amount: 119.90, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 9, externalId: 'DEMO-009', date: '28/07/2026', description: 'Cena con amigos', merchant: 'Restaurante Ejemplo', category: 'Food & Dining', group: 'Comida', account: 'Billetera Demo', amount: 94, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 10, externalId: 'DEMO-010', date: '21/07/2026', description: 'Curso en línea', merchant: 'Academia Digital', category: 'Education', group: 'Educación', account: 'Cuenta Demo USD', amount: 42, currency: 'USD', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 11, externalId: 'DEMO-011', date: '15/07/2026', description: 'Pago por proyecto', merchant: 'Cliente Ejemplo', category: 'Income', group: 'Ingresos', account: 'Cuenta Demo USD', amount: 3000, currency: 'USD', type: 'Ingreso', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 12, externalId: 'DEMO-012', date: '09/07/2026', description: 'Compra para el hogar', merchant: 'Tienda Hogar', category: 'Shopping', group: 'Compras', account: 'Cuenta Demo PEN', amount: 275, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 13, externalId: 'DEMO-013', date: '26/06/2026', description: 'Consulta médica', merchant: 'Centro de Salud', category: 'Health', group: 'Salud', account: 'Cuenta Demo PEN', amount: 160, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 14, externalId: 'DEMO-014', date: '18/06/2026', description: 'Servicio profesional', merchant: 'Asesoría Ejemplo', category: 'Professional Services', group: 'Servicios profesionales', account: 'Cuenta Demo USD', amount: 120, currency: 'USD', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 15, externalId: 'DEMO-015', date: '12/06/2026', description: 'Pago por proyecto', merchant: 'Cliente Ejemplo', category: 'Income', group: 'Ingresos', account: 'Cuenta Demo USD', amount: 3000, currency: 'USD', type: 'Ingreso', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 16, externalId: 'DEMO-016', date: '05/06/2026', description: 'Compras de la semana', merchant: 'Mercado Central', category: 'Groceries', group: 'Comida', account: 'Cuenta Demo PEN', amount: 181.30, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 17, externalId: 'DEMO-017', date: '29/05/2026', description: 'Entretenimiento', merchant: 'Cine Centro', category: 'Entertainment', group: 'Ocio', account: 'Billetera Demo', amount: 58, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 18, externalId: 'DEMO-018', date: '20/05/2026', description: 'Pago por proyecto', merchant: 'Cliente Ejemplo', category: 'Income', group: 'Ingresos', account: 'Cuenta Demo USD', amount: 2800, currency: 'USD', type: 'Ingreso', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 19, externalId: 'DEMO-019', date: '11/05/2026', description: 'Retiro para gastos menores', merchant: 'Cajero Demo', category: 'Cash', group: 'Efectivo', account: 'Cuenta Demo PEN', amount: 200, currency: 'PEN', type: 'Gasto', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 20, externalId: 'DEMO-020', date: '03/05/2026', description: 'Transferencia entre cuentas', merchant: 'Cuenta propia', category: 'Transfers', group: 'Transferencias', account: 'Cuenta Demo USD', amount: 250, currency: 'USD', type: 'Transferencia', review: false, fxMissing: false, source: 'Datos demo' },
];

export const DATASET_ROW_COUNT = REAL_MOVEMENTS.length + 2;

export const MONTHLY_TOTALS: MonthlyTotal[] = [
  { month: '2026-05', currency: 'PEN', incomeMinor: 0, expenseMinor: 25800, transferMinor: 0, reviewCount: 0, count: 2 },
  { month: '2026-05', currency: 'USD', incomeMinor: 280000, expenseMinor: 0, transferMinor: 25000, reviewCount: 0, count: 2 },
  { month: '2026-06', currency: 'PEN', incomeMinor: 0, expenseMinor: 34130, transferMinor: 0, reviewCount: 0, count: 2 },
  { month: '2026-06', currency: 'USD', incomeMinor: 300000, expenseMinor: 12000, transferMinor: 0, reviewCount: 0, count: 2 },
  { month: '2026-07', currency: 'PEN', incomeMinor: 0, expenseMinor: 36900, transferMinor: 0, reviewCount: 0, count: 2 },
  { month: '2026-07', currency: 'USD', incomeMinor: 300000, expenseMinor: 4200, transferMinor: 0, reviewCount: 0, count: 2 },
  { month: '2026-08', currency: 'PEN', incomeMinor: 0, expenseMinor: 213720, transferMinor: 50000, reviewCount: 1, count: 6 },
  { month: '2026-08', currency: 'USD', incomeMinor: 320000, expenseMinor: 1800, transferMinor: 0, reviewCount: 0, count: 2 },
];

export const USD_INCOME_BY_SOURCE = [
  { source: 'Cliente demo', amount: 12000, transactions: 4 },
] as const;
export const USD_INCOME_TOTAL = 12000;
