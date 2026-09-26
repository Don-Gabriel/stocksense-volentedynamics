import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Info, Plus, Search } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { useSearchText } from '../lib/useSearchText';
import { api, money, quantity, query } from '../lib/api';
import { Page, StockRow, units } from '../types';
import { Badge, Button, Empty, ErrorBox, Loading, PageTitle, Pager } from '../components/ui';
export function Stock() {
  const { catalog, user, warehouseId, newOperation } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1),
    search = params.get('search') || '',
    categoryId = params.get('categoryId') || '',
    locationId = params.get('locationId') || '',
    productId = params.get('productId') || '',
    stockStatus = params.get('stockStatus') || '';
  const filter = {
    page,
    search,
    categoryId,
    locationId,
    productId,
    stockStatus,
    warehouseId,
    limit: 20,
  };
  const result = useQuery({
    queryKey: ['stock', filter],
    queryFn: () => api<Page<StockRow>>('/inventory/stock?' + query(filter)),
    refetchInterval: 15000,
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
        eyebrow="LIVE INVENTORY"
        title="Stock on hand"
        description="Know what you have, what’s reserved, and what’s free to use."
        actions={
          <Button onClick={() => newOperation({ type: 'RECEIPT' })}>
            <Plus size={18} />
            Receive stock
          </Button>
        }
      />
      <div className="info-strip">
        <Info size={17} />
        <span>
          <strong>Available = on hand − reserved.</strong> Stock changes when an operation is
          validated. Each quantity belongs to one location.
        </span>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search stock"
              placeholder="Search product name or SKU…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="toolbar-filters">
            <select
              aria-label="Stock category"
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
              aria-label="Stock location"
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
            <select
              aria-label="Stock availability"
              value={stockStatus}
              onChange={(e) => change('stockStatus', e.target.value)}
            >
              <option value="">All stock levels</option>
              <option value="IN_STOCK">In stock</option>
              <option value="LOW_STOCK">Low stock</option>
              <option value="OUT_OF_STOCK">Out of stock</option>
            </select>
          </div>
        </div>
        {productId && (
          <div className="active-filter">
            Product: {catalog.products.find((p) => p.id === productId)?.name}
            <button onClick={() => change('productId', '')}>Clear</button>
          </div>
        )}
        <ErrorBox error={result.error} />
        {result.isPending ? (
          <Loading />
        ) : result.data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Location</th>
                  <th className="number">Unit cost</th>
                  <th className="number">On hand</th>
                  <th className="number">Reserved</th>
                  <th className="number">Available</th>
                  <th>Stock level</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="reference" to={`/history?productId=${row.product.id}`}>
                        {row.product.name}
                      </Link>
                      <small className="sku">
                        {row.product.sku} · {units[row.product.unit]}
                      </small>
                    </td>
                    <td>
                      {row.location.name}
                      <small>{row.location.warehouse.name}</small>
                    </td>
                    <td className="number">{money(row.product.unitCost)}</td>
                    <td className="number">
                      <strong>{quantity(row.onHand)}</strong>
                    </td>
                    <td className="number muted">{quantity(row.reserved)}</td>
                    <td className="number">
                      <strong className={row.available === 0 ? 'text-red' : 'text-green'}>
                        {quantity(row.available)}
                      </strong>
                    </td>
                    <td>
                      <Badge status={row.status} />
                      {row.hasRule && (
                        <small>
                          Minimum {quantity(row.minimum)} {units[row.product.unit]}
                        </small>
                      )}
                    </td>
                    <td>
                      {user.role === 'MANAGER' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Adjust ${row.product.name} at ${row.location.name}`}
                          title="Update counted quantity"
                          onClick={() => newOperation({ type: 'ADJUSTMENT', stock: row })}
                        >
                          <ClipboardCheck size={17} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No stock matches these filters"
            text="Try another location, category, or product name."
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
