export type Kind = 'RECEIPT' | 'DELIVERY' | 'TRANSFER' | 'ADJUSTMENT';
export type Status = 'DRAFT' | 'WAITING' | 'READY' | 'DONE' | 'CANCELED';
export type Num = number | string;
export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
}
export interface Named {
  id: string;
  name: string;
}
export interface Warehouse extends Named {
  code: string;
  address: string;
  _count?: { locations: number };
}
export interface Location extends Named {
  code: string;
  warehouseId: string;
  warehouse: Warehouse;
}
export interface Contact extends Named {
  type: 'SUPPLIER' | 'CUSTOMER';
  email: string;
  phone: string;
  address: string;
}
export interface Product extends Named {
  sku: string;
  categoryId: string;
  category: Named;
  unit: 'PCS' | 'KG' | 'L' | 'M';
  unitCost: Num;
  description: string;
  active: boolean;
  balances: { onHand: Num; locationId: string }[];
}
export interface Rule {
  id: string;
  productId: string;
  locationId: string;
  product: Product;
  location: Location;
  minimum: Num;
  target: Num;
}
export interface Catalog {
  products: Product[];
  categories: Named[];
  warehouses: Warehouse[];
  locations: Location[];
  contacts: Contact[];
  users: (Named & {
    role: 'MANAGER' | 'STAFF';
    status: 'PENDING' | 'ACTIVE' | 'DISABLED';
    emailVerifiedAt: string | null;
    email?: string;
  })[];
  rules: Rule[];
}
export interface OperationLine {
  id: string;
  productId: string;
  product: Product;
  quantity: Num;
  systemQuantity?: Num;
  available?: number;
  reservation?: { quantity: Num };
  ledger: { delta: Num }[];
}
export interface Operation {
  id: string;
  reference: string;
  type: Kind;
  status: Status;
  sourceId?: string;
  destinationId?: string;
  contactId?: string;
  responsibleId: string;
  source?: Location;
  destination?: Location;
  contact?: Contact;
  responsible: Named;
  createdBy?: Named;
  scheduledAt: string;
  createdAt: string;
  completedAt?: string;
  pickedAt?: string;
  packedAt?: string;
  notes: string;
  reason: string;
  deliveryAddress: string;
  lines: OperationLine[];
  _count?: { lines: number };
}
export interface StockRow {
  id: string;
  product: Product;
  location: Location;
  onHand: number;
  reserved: number;
  available: number;
  minimum: number;
  target: number;
  hasRule: boolean;
  suggested: number;
  status: string;
}
export interface Ledger {
  id: string;
  product: Product;
  location: Location;
  delta: Num;
  before: Num;
  after: Num;
  createdAt: string;
  actor: Named;
  line: { operation: Operation };
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
export interface Dashboard {
  metrics: {
    inStock: number;
    products: number;
    lowStock: number;
    outOfStock: number;
    pendingReceipts: number;
    pendingDeliveries: number;
    transfers: number;
  };
  cards: { type: Kind; total: number; ready: number; waiting: number; late: number }[];
  attention: Operation[];
  alerts: StockRow[];
  recent: Ledger[];
  activity: { date: string; received: number; delivered: number }[];
}
export const kindNames: Record<Kind, string> = {
  RECEIPT: 'Receipt',
  DELIVERY: 'Delivery',
  TRANSFER: 'Transfer',
  ADJUSTMENT: 'Adjustment',
};
export const kindPlurals: Record<Kind, string> = {
  RECEIPT: 'Receipts',
  DELIVERY: 'Deliveries',
  TRANSFER: 'Transfers',
  ADJUSTMENT: 'Adjustments',
};
export const statusNames: Record<string, string> = {
  DRAFT: 'Draft',
  WAITING: 'Waiting',
  READY: 'Ready',
  DONE: 'Done',
  CANCELED: 'Canceled',
  IN_STOCK: 'In stock',
  LOW_STOCK: 'Low stock',
  OUT_OF_STOCK: 'Out of stock',
};
export const units: Record<string, string> = { PCS: 'pcs', KG: 'kg', L: 'L', M: 'm' };
