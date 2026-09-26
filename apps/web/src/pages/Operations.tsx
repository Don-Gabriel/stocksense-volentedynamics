import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ClipboardCheck,
  Columns3,
  List,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { api, date, quantity, query, refresh } from '../lib/api';
import { useWorkspace } from '../lib/context';
import { useSearchText } from '../lib/useSearchText';
import {
  Kind,
  kindNames,
  kindPlurals,
  Operation,
  Page,
  Status,
  statusNames,
  units,
} from '../types';
import { Badge, Button, Empty, ErrorBox, Loading, Modal, PageTitle, Pager } from '../components/ui';
export function Operations() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { warehouseId, catalog, newOperation, user } = useWorkspace();
  const view = params.get('view') === 'kanban' ? 'kanban' : 'list';
  const setView = (value: string) => change('view', value);
  const type = (
      Object.keys(kindNames).includes(params.get('type') || '') ? params.get('type') : null
    ) as Kind | null,
    status = params.get('status') || '',
    search = params.get('search') || '',
    page = Number(params.get('page') || 1),
    categoryId = params.get('categoryId') || '',
    locationId = params.get('locationId') || '';
  const filter = {
    type,
    status,
    search,
    page,
    warehouseId,
    categoryId,
    locationId,
    late: params.get('late'),
    limit: view === 'kanban' ? 100 : 20,
  };
  const result = useQuery({
    queryKey: ['operations', filter],
    queryFn: () => api<Page<Operation>>('/operations?' + query(filter)),
    refetchInterval: 20000,
  });
  function change(key: string, value: string) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      value ? next.set(key, value) : next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });
  }
  const [searchText, setSearchText] = useSearchText(search, (value) => change('search', value));
  return (
    <>
      <PageTitle
        eyebrow="OPERATIONS"
        title={type ? kindPlurals[type] : 'All operations'}
        description={
          type === 'RECEIPT'
            ? 'Keep incoming goods moving from suppliers to shelves.'
            : type === 'DELIVERY'
              ? 'Pick, pack, and send the right stock to your customers.'
              : type === 'TRANSFER'
                ? 'Move stock between locations with a complete trail.'
                : type === 'ADJUSTMENT'
                  ? 'Keep recorded stock in sync with what is on the shelf.'
                  : 'Plan and follow every movement across your warehouses.'
        }
        actions={
          <Button
            disabled={type === 'ADJUSTMENT' && user.role !== 'MANAGER'}
            onClick={() => newOperation({ type: type || 'RECEIPT' })}
          >
            <Plus size={18} />
            New {type ? kindNames[type].toLowerCase() : 'operation'}
          </Button>
        }
      />
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search operations"
              placeholder="Search reference, contact, or product…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="toolbar-filters">
            {!type && (
              <select
                aria-label="Operation type"
                value={type || ''}
                onChange={(e) => change('type', e.target.value)}
              >
                <option value="">All types</option>
                {Object.entries(kindPlurals).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Operation status"
              value={status}
              onChange={(e) => change('status', e.target.value)}
            >
              <option value="">All statuses</option>
              {['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'].map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Operation category"
              value={categoryId}
              onChange={(e) => change('categoryId', e.target.value)}
            >
              <option value="">All categories</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Operation location"
              value={locationId}
              onChange={(e) => change('locationId', e.target.value)}
            >
              <option value="">All locations</option>
              {catalog.locations
                .filter((l) => !warehouseId || l.warehouseId === warehouseId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.warehouse.code}/{l.name}
                  </option>
                ))}
            </select>
            <div className="view-toggle">
              <button
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={view === 'list' ? 'selected' : ''}
                onClick={() => {
                  setView('list');
                }}
              >
                <List size={18} />
              </button>
              <button
                aria-label="Kanban view"
                aria-pressed={view === 'kanban'}
                className={view === 'kanban' ? 'selected' : ''}
                onClick={() => {
                  setView('kanban');
                }}
              >
                <Columns3 size={18} />
              </button>
            </div>
          </div>
        </div>
        {params.get('late') && (
          <div className="active-filter">
            Showing overdue operations{' '}
            <button onClick={() => change('late', '')} aria-label="Clear overdue filter">
              <X size={14} />
            </button>
          </div>
        )}
        <ErrorBox error={result.error} />
        {result.isPending ? (
          <Loading />
        ) : result.data?.items.length ? (
          view === 'list' ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Contact</th>
                    <th>From → to</th>
                    <th>Scheduled</th>
                    <th>Responsible</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((op) => (
                    <tr key={op.id}>
                      <td>
                        <Link
                          className="reference"
                          state={{ from: location.pathname + location.search }}
                          to={`/operations/${op.id}`}
                        >
                          {op.reference}
                        </Link>
                        <small>
                          {kindNames[op.type]} · {op.lines.length}{' '}
                          {op.lines.length === 1 ? 'product' : 'products'}
                        </small>
                      </td>
                      <td>{op.contact?.name || 'Internal operation'}</td>
                      <td>
                        <span className="route-label">
                          {op.source
                            ? `${op.source.warehouse.code}/${op.source.code}`
                            : op.type === 'ADJUSTMENT'
                              ? 'Physical count'
                              : 'Supplier'}
                          <ArrowRight size={12} />
                          {op.destination
                            ? `${op.destination.warehouse.code}/${op.destination.code}`
                            : 'Customer'}
                        </span>
                      </td>
                      <td
                        className={
                          !['DONE', 'CANCELED'].includes(op.status) &&
                          new Date(op.scheduledAt) < new Date()
                            ? 'overdue'
                            : ''
                        }
                      >
                        {date(op.scheduledAt, true)}
                      </td>
                      <td>{op.responsible.name}</td>
                      <td>
                        <Badge status={op.status} />
                      </td>
                      <td>
                        <Link
                          state={{ from: location.pathname + location.search }}
                          to={`/operations/${op.id}`}
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
          ) : (
            <div className="kanban">
              {(['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'] as Status[])
                .filter((s) => !status || s === status)
                .map((s) => (
                  <div className="kanban-column" key={s}>
                    <div className="kanban-heading">
                      <Badge status={s} />
                      <span>{result.data!.items.filter((o) => o.status === s).length}</span>
                    </div>
                    {result
                      .data!.items.filter((o) => o.status === s)
                      .map((op) => (
                        <Link
                          state={{ from: location.pathname + location.search }}
                          to={`/operations/${op.id}`}
                          key={op.id}
                          className="kanban-card"
                        >
                          <span className="reference">{op.reference}</span>
                          <strong>
                            {op.contact?.name || op.destination?.name || 'Internal operation'}
                          </strong>
                          <small>
                            {kindNames[op.type]} · {op.lines.length} product lines
                          </small>
                          <div>
                            <span>{date(op.scheduledAt)}</span>
                            <span className="mini-avatar">
                              {op.responsible.name
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                          </div>
                        </Link>
                      ))}
                  </div>
                ))}
            </div>
          )
        ) : (
          <Empty
            title="No operations found"
            text="Try different filters or create your first operation."
            action={
              <Button
                disabled={type === 'ADJUSTMENT' && user.role !== 'MANAGER'}
                onClick={() => newOperation({ type: type || 'RECEIPT' })}
              >
                <Plus size={16} />
                Create operation
              </Button>
            }
          />
        )}
        <Pager
          page={page}
          total={result.data?.total || 0}
          limit={filter.limit}
          onPage={(n) => change('page', String(n))}
        />
      </section>
    </>
  );
}
export function OperationDetail() {
  const location = useLocation();
  const { id } = useParams();
  const { newOperation, notify, user } = useWorkspace();
  const navigate = useNavigate();
  const [cancel, setCancel] = useState(false);
  const result = useQuery({
    queryKey: ['operation', id],
    placeholderData: undefined,
    queryFn: () => api<Operation>(`/operations/${id}`),
    refetchInterval: 20000,
  });
  const mutation = useMutation({
    mutationFn: (action: string) => api<Operation>(`/operations/${id}/${action}`, 'POST'),
    onSuccess: async (op, action) => {
      await refresh();
      notify(
        op.status === 'WAITING'
          ? 'Waiting for stock. Shortages are highlighted below.'
          : action === 'validate'
            ? 'Operation completed. Stock and history are up to date.'
            : action === 'cancel'
              ? 'Operation canceled. Reservations released.'
              : 'Operation updated.',
      );
      setCancel(false);
    },
  });
  if (result.isPending) return <Loading />;
  if (!result.data) return <ErrorBox error={result.error} />;
  const op = result.data;
  const canAct = op.type !== 'ADJUSTMENT' || user.role === 'MANAGER',
    pending = mutation.isPending;
  return (
    <div className="operation-detail">
      <Link
        className="back-link no-print"
        to={
          location.state?.from?.startsWith('/operations')
            ? location.state.from
            : `/operations?type=${op.type}`
        }
      >
        <ArrowLeft size={15} />
        Back to {kindPlurals[op.type].toLowerCase()}
      </Link>
      <PageTitle
        eyebrow={kindNames[op.type].toUpperCase()}
        title={op.reference}
        description={`${op.contact?.name || op.reason || 'Internal stock movement'} · Created ${date(op.createdAt, true)}`}
        actions={
          <>
            <Badge status={op.status} />
            {op.status === 'DONE' && (
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer size={16} />
                Print
              </Button>
            )}
          </>
        }
      />
      <ErrorBox error={mutation.error} />
      <section className="panel">
        <div className="document-toolbar no-print">
          <div className="document-actions">
            {canAct && op.status === 'DRAFT' && (
              <>
                <Button onClick={() => mutation.mutate('confirm')} disabled={pending}>
                  <Check size={16} />
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => newOperation({ operation: op })}
                  disabled={pending}
                >
                  <Pencil size={15} />
                  Edit draft
                </Button>
              </>
            )}
            {canAct && op.status === 'WAITING' && (
              <Button onClick={() => mutation.mutate('confirm')} disabled={pending}>
                <ClipboardCheck size={17} />
                Check availability
              </Button>
            )}
            {canAct && op.status === 'READY' && (
              <>
                {op.type === 'DELIVERY' && !op.pickedAt ? (
                  <Button onClick={() => mutation.mutate('pick')} disabled={pending}>
                    <PackageCheck size={17} />
                    Mark as picked
                  </Button>
                ) : op.type === 'DELIVERY' && !op.packedAt ? (
                  <Button onClick={() => mutation.mutate('pack')} disabled={pending}>
                    <PackageCheck size={17} />
                    Mark as packed
                  </Button>
                ) : (
                  <Button onClick={() => mutation.mutate('validate')} disabled={pending}>
                    <CheckCheck size={17} />
                    {pending ? 'Validating…' : 'Validate'}
                  </Button>
                )}
              </>
            )}
            {canAct && !['DONE', 'CANCELED'].includes(op.status) && (
              <Button variant="ghost" onClick={() => setCancel(true)} disabled={pending}>
                Cancel operation
              </Button>
            )}
            {op.status === 'DONE' && (
              <span className="completed-note">
                <CheckCheck size={17} />
                Validated {date(op.completedAt!, true)}
              </span>
            )}
            {op.status === 'CANCELED' && (
              <span className="muted">This operation was canceled.</span>
            )}
          </div>
          <div className="status-stepper">
            {[
              'DRAFT',
              ...(['DELIVERY', 'TRANSFER'].includes(op.type) ? ['WAITING'] : []),
              'READY',
              'DONE',
            ].map((s, i) => (
              <span key={s} className={op.status === s ? 'current' : ''}>
                {i > 0 && <span className="step-separator">›</span>}
                {statusNames[s]}
              </span>
            ))}
          </div>
        </div>
        {op.status === 'WAITING' && (
          <div className="waiting-banner">
            Some products don’t have enough available stock. Receive goods or release other
            reservations, then check availability again.
          </div>
        )}
        <div className="document-info">
          <div>
            <label>
              {op.type === 'RECEIPT'
                ? 'Receive from'
                : op.type === 'DELIVERY'
                  ? 'Deliver to'
                  : 'Movement'}
            </label>
            <strong>{op.contact?.name || op.reason || 'Internal transfer'}</strong>
            {op.deliveryAddress && <span>{op.deliveryAddress}</span>}
          </div>
          <div>
            <label>Scheduled date</label>
            <strong>{date(op.scheduledAt, true)}</strong>
          </div>
          <div>
            <label>From</label>
            <strong>
              {op.source
                ? `${op.source.warehouse.code} / ${op.source.name}`
                : op.type === 'ADJUSTMENT'
                  ? 'Physical count'
                  : 'Supplier'}
            </strong>
          </div>
          <div>
            <label>To</label>
            <strong>
              {op.destination
                ? `${op.destination.warehouse.code} / ${op.destination.name}`
                : 'Customer'}
            </strong>
          </div>
          <div>
            <label>Responsible</label>
            <strong>{op.responsible.name}</strong>
          </div>
          <div>
            <label>Operation type</label>
            <strong>{kindNames[op.type]}</strong>
          </div>
        </div>
        {op.type === 'DELIVERY' && (
          <div className="fulfillment-steps">
            <span className={op.pickedAt ? 'complete' : ''}>
              <Check size={15} />
              Picked{op.pickedAt && ` · ${date(op.pickedAt, true)}`}
            </span>
            <span className={op.packedAt ? 'complete' : ''}>
              <Check size={15} />
              Packed{op.packedAt && ` · ${date(op.packedAt, true)}`}
            </span>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU / category</th>
                {op.type === 'ADJUSTMENT' && <th className="number">Recorded</th>}
                <th className="number">
                  {op.type === 'ADJUSTMENT' ? 'Counted quantity' : 'Quantity'}
                </th>
                <th>Unit</th>
                {['DELIVERY', 'TRANSFER'].includes(op.type) && op.status !== 'DONE' && (
                  <th className="number">Available for this operation</th>
                )}
                {op.type === 'ADJUSTMENT' && <th className="number">Difference</th>}
              </tr>
            </thead>
            <tbody>
              {op.lines.map((line) => (
                <tr
                  key={line.id}
                  className={
                    ['DELIVERY', 'TRANSFER'].includes(op.type) &&
                    !['DONE', 'CANCELED'].includes(op.status) &&
                    Number(line.available) < Number(line.quantity)
                      ? 'shortage-row'
                      : ''
                  }
                >
                  <td>
                    <strong>{line.product.name}</strong>
                  </td>
                  <td>
                    <span className="sku">{line.product.sku}</span>
                    <small>{line.product.category.name}</small>
                  </td>
                  {op.type === 'ADJUSTMENT' && (
                    <td className="number">{quantity(line.systemQuantity)}</td>
                  )}
                  <td className="number">
                    <strong>{quantity(line.quantity)}</strong>
                  </td>
                  <td>{units[line.product.unit]}</td>
                  {['DELIVERY', 'TRANSFER'].includes(op.type) && op.status !== 'DONE' && (
                    <td className="number">
                      {quantity(line.available)}
                      {line.reservation && (
                        <small className="text-green">
                          {quantity(line.reservation.quantity)} reserved
                        </small>
                      )}
                    </td>
                  )}
                  {op.type === 'ADJUSTMENT' && (
                    <td
                      className={`number ${Number(line.quantity) - Number(line.systemQuantity) < 0 ? 'text-red' : 'text-green'}`}
                    >
                      {Number(line.quantity) - Number(line.systemQuantity) > 0 ? '+' : ''}
                      {quantity(Number(line.quantity) - Number(line.systemQuantity))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {op.notes && (
          <div className="document-notes">
            <label>Notes</label>
            <p>{op.notes}</p>
          </div>
        )}
        <div className="document-bottom">
          <span>
            {op.lines.length} product {op.lines.length === 1 ? 'line' : 'lines'} · {op.reference}
          </span>
          {op.status === 'DONE' && (
            <Link
              to={`/history?search=${encodeURIComponent(op.reference)}`}
              className="text-link no-print"
            >
              View movement history <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </section>
      {cancel && (
        <Modal
          title="Cancel this operation?"
          description="This releases any reserved stock. No physical stock will move."
          onClose={() => setCancel(false)}
        >
          <div className="modal-body">
            <p>{op.reference} will remain in history with a Canceled status.</p>
            <ErrorBox error={mutation.error} />
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setCancel(false)}>
              Keep operation
            </Button>
            <Button variant="danger" disabled={pending} onClick={() => mutation.mutate('cancel')}>
              Cancel operation
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
