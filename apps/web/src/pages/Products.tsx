import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Layers3, Package, Pencil, Plus, Search } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { useSearchText } from '../lib/useSearchText';
import { money, quantity } from '../lib/api';
import { Product, units } from '../types';
import { Button, Empty, PageTitle, Pager } from '../components/ui';
import { CatalogForm } from '../components/CatalogForm';
export function Products() {
  const { catalog, user, warehouseId } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const [searchText, setSearchText] = useSearchText(search, (value) => {
    setParams(value ? { search: value } : {});
    setPage(1);
  });
  const [category, setCategory] = useState(''),
    [showArchived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Product | null | undefined>();
  const filtered = catalog.products.filter(
    (p) =>
      (showArchived || p.active) &&
      (!category || p.categoryId === category) &&
      `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
  );
  const items = filtered.slice((page - 1) * 15, page * 15);
  const total = (p: Product) =>
    p.balances
      .filter(
        (b) =>
          !warehouseId ||
          catalog.locations.find((l) => l.id === b.locationId)?.warehouseId === warehouseId,
      )
      .reduce((sum, b) => sum + Number(b.onHand), 0);
  return (
    <>
      <PageTitle
        eyebrow="PRODUCT CATALOG"
        title="Products"
        description="A well-organized catalog is where clear inventory begins."
        actions={
          user.role === 'MANAGER' && (
            <Button onClick={() => setEdit(null)}>
              <Plus size={18} />
              New product
            </Button>
          )
        }
      />
      <div className="catalog-summary">
        <span>
          <Package size={19} />
          <strong>{catalog.products.filter((p) => p.active).length}</strong> active products
        </span>
        <span>
          <Layers3 size={19} />
          <strong>{catalog.categories.length}</strong> categories
        </span>
        <span>Every product has its own movement history.</span>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Search products"
              placeholder="Search products or SKU…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="toolbar-filters">
            <select
              aria-label="Product category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPage(1);
                }}
              />
              Include archived
            </label>
          </div>
        </div>
        {items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th className="number">Unit cost</th>
                  <th className="number">On hand</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-cell">
                        <span className="product-monogram">{p.name.slice(0, 2).toUpperCase()}</span>
                        <div>
                          <Link className="reference" to={`/stock?productId=${p.id}`}>
                            {p.name}
                          </Link>
                          <small>{p.description || `Measured in ${units[p.unit]}`}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="sku">{p.sku}</span>
                    </td>
                    <td>
                      <span className="category-tag">{p.category.name}</span>
                    </td>
                    <td className="number">{money(p.unitCost)}</td>
                    <td className="number">
                      <strong>{quantity(total(p))}</strong>{' '}
                      <small className="inline-unit">{units[p.unit]}</small>
                    </td>
                    <td>
                      <span className={`product-status ${p.active ? 'active' : ''}`}>
                        {p.active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td>
                      {user.role === 'MANAGER' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEdit(p)}
                        >
                          <Pencil size={15} />
                        </Button>
                      ) : (
                        <Link
                          aria-label={`View stock for ${p.name}`}
                          to={`/stock?productId=${p.id}`}
                        >
                          <ArrowRight size={16} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No products found"
            text="Try another search or add a product to your catalog."
          />
        )}
        <Pager page={page} total={filtered.length} limit={15} onPage={setPage} />
      </section>
      {edit !== undefined && (
        <CatalogForm
          entity="products"
          record={edit || undefined}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
