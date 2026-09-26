import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useIsFetching, useMutation, useQuery } from '@tanstack/react-query';
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
import { api, ApiError, queryClient } from '../lib/api';
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
  const [warehouseId, updateWarehouse] = useState(
    () => sessionStorage.getItem('stocksense:warehouse') || '',
  );
  const setWarehouse = (id: string) => {
    updateWarehouse(id);
    sessionStorage.setItem('stocksense:warehouse', id);
    const next = new URLSearchParams(location.search);
    next.delete('warehouseId');
    next.delete('locationId');
    next.delete('page');
    navigate({ pathname: location.pathname, search: next.toString() });
  };
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const toastTimer = useRef<number>(undefined);
  const fetching = useIsFetching();
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const expired = () => {
      queryClient.clear();
      navigate('/login', {
        replace: true,
        state: { message: 'Your session has ended. Please sign in again.' },
      });
    };
    window.addEventListener('stocksense:expired', expired);
    return () => {
      window.removeEventListener('stocksense:expired', expired);
      window.clearTimeout(toastTimer.current);
    };
  }, [navigate]);
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLElement>('button,a')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobile(false);
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('a,button:not(:disabled)') || [],
      ).filter((x) => x.getClientRects().length);
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [mobile]);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  const catalog = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api<Catalog>('/catalog'),
    enabled: !!me.data,
  });
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', 'POST'),
    onSuccess: () => {
      sessionStorage.removeItem('stocksense:warehouse');
      queryClient.clear();
      navigate('/login');
    },
  });
  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 6000);
  };
  if (me.isPending) return <Loading />;
  if (!me.data)
    return me.error instanceof ApiError && me.error.status === 401 ? (
      <Navigate to="/login" replace />
    ) : (
      <div className="page">
        <ErrorBox error={me.error} />
        <Button onClick={() => me.refetch()}>Retry connection</Button>
      </div>
    );
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
  const detail = location.pathname.startsWith('/operations/');
  const pageName =
    location.pathname === '/'
      ? 'Overview'
      : location.pathname === '/stock'
        ? 'Stock on hand'
        : location.pathname === '/history'
          ? 'Move history'
          : location.pathname.startsWith('/operations')
            ? operations.find((x) => x.type === currentKind)?.label || 'All operations'
            : location.pathname.slice(1).replace(/^./, (c) => c.toUpperCase());
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
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {mobile && (
          <button
            className="sidebar-backdrop"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          ref={sidebar}
          id="main-navigation"
          aria-label="Workspace navigation"
          className={`sidebar ${mobile ? 'sidebar-open' : ''}`}
        >
          {mobile && (
            <button
              className="mobile-nav-close"
              aria-label="Close navigation"
              onClick={() => setMobile(false)}
            >
              <X size={20} />
            </button>
          )}
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
            {nav(
              '/operations',
              'All operations',
              ClipboardCheck,
              (location.pathname === '/operations' && !currentKind) || detail,
            )}
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
        <div className="main-shell" inert={mobile || undefined}>
          <header className="topbar">
            <div className="topbar-left">
              <Button
                variant="ghost"
                size="icon"
                className="mobile-menu"
                aria-label="Open navigation"
                aria-expanded={mobile}
                aria-controls="main-navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </Button>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                {location.pathname !== '/' && (
                  <>
                    <Link to="/">Overview</Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
                {detail && (
                  <>
                    <Link to="/operations">Operations</Link>
                    <span aria-hidden="true">/</span>
                  </>
                )}
                <strong aria-current="page">{detail ? 'Operation details' : pageName}</strong>
              </nav>
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
          {fetching > 0 && (
            <div className="fetch-progress" role="status" aria-label="Updating results" />
          )}
          <main className="page" id="main-content" tabIndex={-1}>
            <div className="route-page" key={location.pathname}>
              <Outlet />
            </div>
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
