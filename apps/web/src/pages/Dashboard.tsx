import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Box,
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Plus,
} from 'lucide-react';
import { api, date, quantity, query } from '../lib/api';
import { useWorkspace } from '../lib/context';
import { Dashboard as DashboardData, kindPlurals, statusNames, units } from '../types';
import { Badge, Button, Empty, ErrorBox, Loading, PageTitle } from '../components/ui';
import { useEffect, useState } from 'react';
const icons = {
  RECEIPT: ArrowDownToLine,
  DELIVERY: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight,
  ADJUSTMENT: ClipboardCheck,
};
export function Dashboard() {
  const { warehouseId, catalog, newOperation } = useWorkspace();
  const [categoryId, setCategory] = useState('');
  const [type, setType] = useState(''),
    [status, setStatus] = useState(''),
    [locationId, setLocation] = useState('');
  useEffect(() => {
    if (
      locationId &&
      warehouseId &&
      !catalog.locations.some((l) => l.id === locationId && l.warehouseId === warehouseId)
    )
      setLocation('');
  }, [warehouseId, locationId, catalog.locations]);
  const scope = { warehouseId, categoryId, locationId, type, status };
  const operationLink = (selectedType = type, late = '') =>
    '/operations?' + query({ ...scope, type: selectedType, late });
  const stockLink = '/stock?' + query({ categoryId, locationId });
  const result = useQuery({
    queryKey: ['dashboard', scope],
    queryFn: () => api<DashboardData>('/dashboard?' + query(scope)),
    refetchInterval: 20000,
  });
  if (result.isPending) return <Loading />;
  if (!result.data) return <ErrorBox error={result.error} />;
  const d = result.data;
  const maxActivity = Math.max(1, ...d.activity.flatMap((x) => [x.received, x.delivered]));
  return (
    <>
      <PageTitle
        eyebrow="INVENTORY AT A GLANCE"
        title="Overview"
        description="Your stock, your operations, all in one place."
        actions={
          <>
            <span className="today">
              <CalendarDays size={16} />
              {new Date().toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <Button onClick={() => newOperation()}>
              <Plus size={18} />
              New operation
            </Button>
          </>
        }
      />
      <div className="dashboard-scope">
        <span className="live-label">
          <span />
          Live inventory
        </span>
        <div className="dashboard-filters">
          <select
            aria-label="Dashboard operation type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All operations</option>
            {Object.entries(kindPlurals).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Dashboard status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'].map((s) => (
              <option value={s} key={s}>
                {statusNames[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Dashboard location"
            value={locationId}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">All locations</option>
            {catalog.locations
              .filter((l) => !warehouseId || l.warehouseId === warehouseId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.warehouse.code} / {l.name}
                </option>
              ))}
          </select>
          <select
            aria-label="Dashboard category"
            value={categoryId}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="metric-grid">
        <Link to={stockLink} className="metric">
          <span className="metric-icon green">
            <Box size={20} />
          </span>
          <span className="metric-label">Products in stock</span>
          <strong>{d.metrics.inStock.toString().padStart(2, '0')}</strong>
          <small>of {d.metrics.products} active products</small>
        </Link>
        <Link to={stockLink} className="metric">
          <span className="metric-icon amber">
            <CircleAlert size={20} />
          </span>
          <span className="metric-label">Stock needs attention</span>
          <strong>{d.metrics.lowStock + d.metrics.outOfStock}</strong>
          <small>
            <span className="text-amber">{d.metrics.lowStock} low stock</span>
            <span className="dot-separator">·</span>
            {d.metrics.outOfStock} out of stock
          </small>
        </Link>
        <Link to={operationLink('RECEIPT')} className="metric">
          <span className="metric-icon blue">
            <ArrowDownToLine size={20} />
          </span>
          <span className="metric-label">Pending receipts</span>
          <strong>{d.metrics.pendingReceipts.toString().padStart(2, '0')}</strong>
          <small>Incoming stock to receive</small>
        </Link>
        <Link to={operationLink('DELIVERY')} className="metric">
          <span className="metric-icon purple">
            <ArrowUpFromLine size={20} />
          </span>
          <span className="metric-label">Pending deliveries</span>
          <strong>{d.metrics.pendingDeliveries.toString().padStart(2, '0')}</strong>
          <small>Orders to pick, pack & ship</small>
        </Link>
      </div>
      <div className="section-heading">
        <h2>Operations</h2>
        <Link to={operationLink()}>
          View all operations <ArrowRight size={15} />
        </Link>
      </div>
      <div className="operation-cards">
        {d.cards.map((card) => {
          const Icon = icons[card.type];
          return (
            <div className={`operation-card card-${card.type.toLowerCase()}`} key={card.type}>
              <div className="op-card-head">
                <span className="op-icon">
                  <Icon size={21} />
                </span>
                <Link to={operationLink(card.type)}>
                  <ArrowRight size={18} />
                  <span className="sr-only">View {kindPlurals[card.type]}</span>
                </Link>
              </div>
              <h3>{kindPlurals[card.type]}</h3>
              <div className="op-count">
                <strong>{card.total}</strong>
                <span>
                  {card.type === 'RECEIPT'
                    ? 'to receive'
                    : card.type === 'DELIVERY'
                      ? 'to deliver'
                      : card.type === 'TRANSFER'
                        ? 'scheduled'
                        : 'to review'}
                </span>
              </div>
              <div className="op-card-foot">
                <span>
                  {card.ready} ready{card.waiting > 0 && ` · ${card.waiting} waiting`}
                </span>
                {card.late > 0 && (
                  <Link to={operationLink(card.type, 'true')} className="late-pill">
                    <Clock3 size={12} />
                    {card.late} late
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Upcoming & overdue</h2>
                <p>The next moves on your team’s list.</p>
              </div>
              <Link to={operationLink()} className="text-link">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {!d.attention.length ? (
              <Empty title="You’re all caught up" text="New pending operations will appear here." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference / contact</th>
                      <th>Operation</th>
                      <th>Scheduled</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.attention.slice(0, 5).map((op) => (
                      <tr key={op.id}>
                        <td>
                          <Link className="reference" to={`/operations/${op.id}`}>
                            {op.reference}
                          </Link>
                          <small>
                            {op.contact?.name ||
                              `${op.source?.name || 'Physical count'} → ${op.destination?.name || '—'}`}
                          </small>
                        </td>
                        <td>
                          <span className="type-text">{kindPlurals[op.type]}</span>
                        </td>
                        <td className={new Date(op.scheduledAt) < new Date() ? 'overdue' : ''}>
                          {date(op.scheduledAt)}
                          {new Date(op.scheduledAt) < new Date() && <small>Overdue</small>}
                        </td>
                        <td>
                          <Badge status={op.status} />
                        </td>
                        <td>
                          <Link
                            to={`/operations/${op.id}`}
                            className="row-arrow"
                            aria-label={`Open ${op.reference}`}
                          >
                            <ArrowRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>Warehouse activity</h2>
                <p>Completed receipts and deliveries over the last 7 days.</p>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-receipt" />
                  Receipts
                </span>
                <span>
                  <i className="legend-delivery" />
                  Deliveries
                </span>
              </div>
            </div>
            <div className="activity-chart">
              {d.activity.map((day) => (
                <div className="chart-day" key={day.date}>
                  <div className="bars">
                    <div
                      className="bar bar-receipt"
                      style={{ height: `${Math.max(3, (day.received / maxActivity) * 100)}%` }}
                      title={`${day.received} receipts`}
                    >
                      <span>{day.received || ''}</span>
                    </div>
                    <div
                      className="bar bar-delivery"
                      style={{ height: `${Math.max(3, (day.delivered / maxActivity) * 100)}%` }}
                      title={`${day.delivered} deliveries`}
                    >
                      <span>{day.delivered || ''}</span>
                    </div>
                  </div>
                  <small>
                    {new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                  </small>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="dashboard-side">
          <section className="panel alert-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  <CircleAlert size={18} />
                  Replenishment watch
                </h2>
                <p>Products below their minimum level.</p>
              </div>
              <span className="count-bubble">{d.alerts.length}</span>
            </div>
            {d.alerts.length ? (
              d.alerts.slice(0, 4).map((row) => (
                <div className="stock-alert" key={row.id}>
                  <div className="alert-top">
                    <span className="product-monogram">
                      {row.product.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <Link to={`/stock?search=${row.product.sku}`}>{row.product.name}</Link>
                      <small>
                        {row.location.warehouse.code} / {row.location.name}
                      </small>
                    </div>
                  </div>
                  <div className="alert-quantities">
                    <span>
                      <strong className={row.onHand === 0 ? 'text-red' : 'text-amber'}>
                        {quantity(row.available)}
                      </strong>{' '}
                      {units[row.product.unit]} available
                    </span>
                    <span>Min. {quantity(row.minimum)}</span>
                  </div>
                  <div className="stock-meter">
                    <span
                      style={{
                        width: `${Math.min(100, (row.available / Math.max(1, row.minimum)) * 100)}%`,
                      }}
                    />
                  </div>
                  <button
                    className="replenish-action"
                    onClick={() =>
                      newOperation({ type: 'RECEIPT', stock: { ...row, onHand: row.suggested } })
                    }
                  >
                    Receive {quantity(row.suggested)} {units[row.product.unit]} <Plus size={14} />
                  </button>
                </div>
              ))
            ) : (
              <div className="small-empty">All configured stock levels look healthy.</div>
            )}
            <Link className="panel-bottom-link" to="/settings?tab=rules">
              Manage reordering rules <ArrowRight size={15} />
            </Link>
          </section>
          <section className="panel recent-panel">
            <div className="panel-heading">
              <h2>Recent movements</h2>
              <Link to="/history" aria-label="View move history">
                <ArrowRight size={17} />
              </Link>
            </div>
            {d.recent.slice(0, 4).map((entry) => (
              <Link
                className="recent-move"
                key={entry.id}
                to={`/operations/${entry.line.operation.id}`}
              >
                <span
                  className={`move-direction ${Number(entry.delta) >= 0 ? 'positive' : 'negative'}`}
                >
                  {Number(entry.delta) >= 0 ? (
                    <ArrowDownToLine size={16} />
                  ) : (
                    <ArrowUpFromLine size={16} />
                  )}
                </span>
                <div>
                  <strong>{entry.product.name}</strong>
                  <small>
                    {entry.location.name} · {date(entry.createdAt)}
                  </small>
                </div>
                <b className={Number(entry.delta) >= 0 ? 'text-green' : 'text-red'}>
                  {Number(entry.delta) > 0 ? '+' : ''}
                  {quantity(entry.delta)}
                </b>
              </Link>
            ))}
            {!d.recent.length && (
              <div className="small-empty">Your first validated movement will appear here.</div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
