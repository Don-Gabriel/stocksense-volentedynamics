import { createContext, useContext } from 'react';
import { Catalog, Kind, Operation, StockRow, User } from '../types';
export type OperationDraft = { type?: Kind; stock?: StockRow; operation?: Operation };
export interface Workspace {
  user: User;
  catalog: Catalog;
  warehouseId: string;
  setWarehouse: (id: string) => void;
  newOperation: (value?: OperationDraft) => void;
  notify: (message: string) => void;
}
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace is missing.');
  return context;
}
