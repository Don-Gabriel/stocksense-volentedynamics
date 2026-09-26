import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { api, date, quantity, query } from '../lib/api';
import { kindNames, kindPlurals, Ledger, Page, units } from '../types';
import { Badge, Empty, ErrorBox, Loading, PageTitle, Pager } from '../components/ui';
export function History() {
  const { catalog, warehouseId } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1),
    search = params.get('search') || '',
    type = params.get('type') || '',
    locationId = params.get('locationId') || '',
    productId = params.get('productId') || '',
    from =
      /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') &&
      !Number.isNaN(Date.parse(params.get('from')!))
        ? params.get('from')!
        : '',
    to =
      /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '') &&
      !Number.isNaN(Date.parse(params.get('to')!))
        ? params.get('to')!
        : '';
  const filter = {
    page,
    search,
    type,
    locationId,
    productId,
    warehouseId,
    limit: 20,
    from: from ? new Date(from + 'T00:00:00').toISOString() : '',
    to: to ? new Date(to + 'T23:59:59.999').toISOString() : '',
  };
  const result = useQuery({
    queryKey: ['ledger', filter],
    queryFn: () => api<Page<Ledger>>('/inventory/ledger?' + query(filter)),
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
  return (
    <>
      <PageTitle
        eyebrow="EVERY MOVE, ACCOUNTED FOR"
        title="Move history"
        description="A permanent record of validated stock movements, down to the product and location."
      />
      <div className="info-strip">
        <BookOpen size={17} />
        <span>
          Incoming quantities are green, outgoing quantities are red. Transfers have one entry for
          each location.{' '}
          <Link to="/operations">
            View planned operations <ArrowRight size={13} />
          </Link>
        </span>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search history"
              placeholder="Search reference, contact, or product…"
              value={search}
              onChange={(e) => change('search', e.target.value)}
            />
          </div>
          <div className="toolbar-filters">
            <select
              aria-label="History operation type"
              value={type}
              onChange={(e) => change('type', e.target.value)}
            >
              <option value="">All operations</option>
              {Object.entries(kindPlurals).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="History location"
              value={locationId}
              onChange={(e) => change('locationId', e.target.value)}
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
          </div>
        </div>
        <div className="date-toolbar">
          <label>
            From{' '}
            <input
              type="date"
              aria-label="History from date"
              value={from}
              onChange={(e) => change('from', e.target.value)}
            />
          </label>
          <label>
            To{' '}
            <input
              type="date"
              aria-label="History to date"
              value={to}
              onChange={(e) => change('to', e.target.value)}
            />
          </label>
          <select
            aria-label="History product"
            value={productId}
            onChange={(e) => change('productId', e.target.value)}
          >
            <option value="">All products</option>
            {catalog.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="muted">{result.data?.total || 0} movement entries</span>
        </div>
        <ErrorBox error={result.error} />
        {result.isPending ? (
          <Loading />
        ) : result.data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference / date</th>
                  <th>Product</th>
                  <th>Contact / movement</th>
                  <th>Location</th>
                  <th className="number">Change</th>
                  <th className="number">Before → after</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((entry) => {
                  const op = entry.line.operation;
                  return (
                    <tr key={entry.id}>
                      <td>
                        <Link className="reference" to={`/operations/${op.id}`}>
                          {op.reference}
                        </Link>
                        <small>{date(entry.createdAt, true)}</small>
                      </td>
                      <td>
                        <strong>{entry.product.name}</strong>
                        <small className="sku">{entry.product.sku}</small>
                      </td>
                      <td>
                        {op.contact?.name || kindNames[op.type]}
                        <small>
                          {op.source?.name ||
                            (op.type === 'ADJUSTMENT' ? 'Physical count' : 'Supplier')}{' '}
                          → {op.destination?.name || 'Customer'}
                        </small>
                      </td>
                      <td>
                        {entry.location.name}
                        <small>
                          {entry.location.warehouse.code} · {entry.actor.name}
                        </small>
                      </td>
                      <td
                        className={`number ${Number(entry.delta) < 0 ? 'text-red' : 'text-green'}`}
                      >
                        <strong>
                          {Number(entry.delta) > 0 ? '+' : ''}
                          {quantity(entry.delta)}
                        </strong>{' '}
                        <small className="inline-unit">{units[entry.product.unit]}</small>
                      </td>
                      <td className="number">
                        {quantity(entry.before)} <span className="muted">→</span>{' '}
                        {quantity(entry.after)}
                      </td>
                      <td>
                        <Badge status={op.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No movements found"
            text="Validated operations will appear here with their stock changes."
          />
        )}
        <Pager
          page={page}
          total={result.data?.total || 0}
          limit={20}
          onPage={(n) => change('page', String(n))}
        />
      </section>
    </>
  );
}
