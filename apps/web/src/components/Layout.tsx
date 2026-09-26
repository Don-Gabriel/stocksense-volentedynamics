import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings2,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { api, queryClient } from '../lib/api';
import { OperationDraft, WorkspaceContext } from '../lib/context';
import { Catalog, Operation, User } from '../types';
import { Button, ErrorBox, Loading } from './ui';
import { OperationForm } from './OperationForm';

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/stock', label: 'Stock on hand', icon: Boxes },
];
const operations = [
  { type: 'RECEIPT', label: 'Receipts', icon: ArrowDownToLine },
  { type: 'DELIVERY', label: 'Deliveries', icon: ArrowUpFromLine },
  { type: 'TRANSFER', label: 'Internal transfers', icon: ArrowLeftRight },
  { type: 'ADJUSTMENT', label: 'Adjustments', icon: ClipboardCheck },
];
export function Layout() {
  const navigate = useNavigate(),
    location = useLocation();
  const [warehouseId, setWarehouse] = useState('');
  const [mobile, setMobile] = useState(false);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<Catalog>('/catalog'),
    enabled: !!me.data,
  });
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', 'POST'),
    onSuccess: () => {
      queryClient.clear();
      navigate('/login');
    },
  });
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? '' : current)), 6000);
  };
  if (me.isPending) return <Loading />;
  if (!me.data) return <Navigate to="/login" replace />;
  if (catalog.isPending) return <Loading />;
  if (!catalog.data)
    return (
      <div className="page">
        <ErrorBox error={catalog.error} />
        <Button onClick={() => catalog.refetch()}>Retry</Button>
      </div>
    );
  const user = me.data;
  const currentKind = new URLSearchParams(location.search).get('type');
  const nav = (to: string, label: string, Icon: typeof Package, active?: boolean) => (
    <NavLink
      key={label}
      to={to}
      end={to === '/'}
      onClick={() => setMobile(false)}
      className={({ isActive }) => `nav-item ${(active ?? isActive) ? 'active' : ''}`}
    >
      <Icon size={19} />
      <span>{label}</span>
    </NavLink>
  );
  return (
    <WorkspaceContext.Provider
      value={{
        user,
        catalog: catalog.data,
        warehouseId,
        setWarehouse,
        newOperation: (value = {}) => setDraft(value),
        notify,
      }}
    >
      <div className="workspace">
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
          <Link className="brand" to="/">
            <span className="brand-mark">
              <Boxes size={25} />
            </span>
            <span>
              Stock<span className="brand-light">Sense</span>
            </span>
          </Link>
          <div className="workspace-switch">
            <span className="workspace-avatar">VD</span>
            <div>
              <strong>Volente Dynamics</strong>
              <small>Inventory workspace</small>
            </div>
          </div>
          <nav aria-label="Main navigation">
            <span className="nav-section">WORKSPACE</span>
            {links.map((l) => nav(l.to, l.label, l.icon))}
            <span className="nav-section">OPERATIONS</span>
            {operations.map((l) =>
              nav(
                `/operations?type=${l.type}`,
                l.label,
                l.icon,
                location.pathname === '/operations' && currentKind === l.type,
              ),
            )}
            <span className="nav-section">MANAGEMENT</span>
            {nav('/history', 'Move history', Activity)}
            {nav('/settings', 'Settings', Settings2)}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-tip">
              <WarehouseIcon size={22} />
              <div>
                <strong>Everything in its place.</strong>
                <small>{catalog.data.warehouses.length} warehouses connected</small>
              </div>
            </div>
            <Link to="/profile" className="user-link">
              <span className="avatar">
                {user.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.role === 'MANAGER' ? 'Inventory manager' : 'Warehouse staff'}</small>
              </span>
              <ChevronDown size={16} />
            </Link>
            <button className="logout" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut size={15} />
              Sign out
            </button>
            <ErrorBox error={logout.error} />
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </Button>
              <span className="breadcrumb">
                Workspace <span>/</span>{' '}
                <strong>
                  {location.pathname === '/'
                    ? 'Overview'
                    : location.pathname.startsWith('/operations')
                      ? 'Operations'
                      : location.pathname.slice(1).replace(/^./, (c) => c.toUpperCase())}
                </strong>
              </span>
            </div>
            <div className="topbar-actions">
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(`/stock?search=${encodeURIComponent(search)}`);
                  setSearch('');
                }}
              >
                <Search size={17} />
                <input
                  aria-label="Search inventory"
                  placeholder="Search inventory…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
              <div className="warehouse-select">
                <WarehouseIcon size={16} />
                <select
                  aria-label="Warehouse scope"
                  value={warehouseId}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  <option value="">All warehouses</option>
                  {catalog.data.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <Link
                to="/settings?tab=rules"
                className="notification-button"
                aria-label="Stock alerts and reordering rules"
              >
                <Bell size={20} />
              </Link>
            </div>
          </header>
          <main className="page">
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>
              StockSense <span>·</span> A little more clarity. A lot more control.
            </span>
            <span>Volente Dynamics</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {draft && (
        <OperationForm
          draft={draft}
          onClose={() => setDraft(null)}
          onCreated={(op: Operation) => {
            setDraft(null);
            navigate(`/operations/${op.id}`);
          }}
        />
      )}
    </WorkspaceContext.Provider>
  );
}
