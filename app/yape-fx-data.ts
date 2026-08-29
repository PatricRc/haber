import type { RealMovement } from './real-data';

export const YAPE_FX_MOVEMENTS: RealMovement[] = [
  { id: 101, externalId: 'FX-DEMO-001', date: '14/08/2026', description: 'Cambio USD a PEN de demostración', merchant: 'Cambio Demo', category: 'Transfers', group: 'Transferencias', account: 'Cuenta Demo USD', amount: 150, amountPen: 504.75, currency: 'USD', type: 'Transferencia', review: false, fxMissing: false, source: 'Datos demo' },
  { id: 102, externalId: 'FX-DEMO-002', date: '10/07/2026', description: 'Cambio USD a PEN de demostración', merchant: 'Cambio Demo', category: 'Transfers', group: 'Transferencias', account: 'Cuenta Demo USD', amount: 200, amountPen: 679, currency: 'USD', type: 'Transferencia', review: false, fxMissing: false, source: 'Datos demo' },
];

export const YAPE_FX_BY_MONTH = [
  { month: '2026-07', operations: 1, usd: 200, pen: 679 },
  { month: '2026-08', operations: 1, usd: 150, pen: 504.75 },
] as const;

export const YAPE_FX_TOTAL = {
  operations: 2,
  usd: 350,
  pen: 1183.75,
  weightedRate: 3.3821,
} as const;
