import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, MapPin, Pencil, Plus, Shield, Warehouse } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { quantity } from '../lib/api';
import { units } from '../types';
import { Button, Empty, PageTitle } from '../components/ui';
import { CatalogForm, Entity } from '../components/CatalogForm';
const tabs = [
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'locations', label: 'Locations' },
  { id: 'categories', label: 'Categories' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'rules', label: 'Reordering rules' },
  { id: 'team', label: 'Team' },
];
export function Settings() {
  const { catalog, user } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'warehouses';
  const [edit, setEdit] = useState<{ entity: Entity; record?: Record<string, any> } | null>(null);
  const manager = user.role === 'MANAGER';
  const editButton = (entity: Entity, record: Record<string, any>) =>
    manager && (
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit ${record.name || 'reordering rule'}`}
        onClick={() => setEdit({ entity, record })}
      >
        <Pencil size={15} />
      </Button>
    );
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE SETTINGS"
        title="A place for everything"
        description="Organize the warehouses, people, and rules behind your inventory."
        actions={
          manager &&
          tab !== 'team' && (
            <Button onClick={() => setEdit({ entity: tab as Entity })}>
              <Plus size={18} />
              Add {tab === 'rules' ? 'rule' : tab === 'categories' ? 'category' : tab.slice(0, -1)}
            </Button>
          )
        }
      />
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id })}
          >
            {t.label}
            <span>
              {t.id === 'team'
                ? catalog.users.length
                : catalog[t.id as Exclude<Entity, 'products'>].length}
            </span>
          </button>
        ))}
      </div>
      {!manager && (
        <div className="info-strip">
          <Shield size={17} />
          Your manager maintains workspace settings. You can view them here.
        </div>
      )}
      {tab === 'warehouses' ? (
        <div className="warehouse-grid">
          {catalog.warehouses.map((w) => (
            <section className="panel warehouse-card" key={w.id}>
              <div className="warehouse-card-head">
                <span className="warehouse-icon">
                  <Warehouse size={27} />
                </span>
                {editButton('warehouses', w)}
              </div>
              <span className="sku">{w.code}</span>
              <h2>{w.name}</h2>
              <p>
                <MapPin size={15} />
                {w.address || 'No address added'}
              </p>
              <div className="warehouse-locations">
                {catalog.locations
                  .filter((l) => l.warehouseId === w.id)
                  .map((l) => (
                    <span key={l.id}>
                      <Boxes size={13} />
                      {l.name}
                    </span>
                  ))}
              </div>
              <div className="warehouse-card-foot">
                {catalog.locations.filter((l) => l.warehouseId === w.id).length} storage locations{' '}
                <button onClick={() => setParams({ tab: 'locations' })}>View locations →</button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
              <p>
                {tab === 'locations'
                  ? 'A warehouse can have multiple rooms, racks, or storage areas.'
                  : tab === 'categories'
                    ? 'Group similar products for easier filtering.'
                    : tab === 'contacts'
                      ? 'Suppliers send goods. Customers receive them.'
                      : tab === 'rules'
                        ? 'Set a minimum available quantity and a replenishment target.'
                        : 'Managers maintain settings and counts. Staff manage day-to-day movements.'}
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              {tab === 'locations' ? (
                <>
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Short code</th>
                      <th>Warehouse</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.locations.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.name}</strong>
                        </td>
                        <td>
                          <span className="sku">{l.code}</span>
                        </td>
                        <td>
                          {l.warehouse.name}
                          <small>{l.warehouse.code}</small>
                        </td>
                        <td>{editButton('locations', l)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : tab === 'categories' ? (
                <>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Products</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.categories.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>{catalog.products.filter((p) => p.categoryId === c.id).length}</td>
                        <td>{editButton('categories', c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : tab === 'contacts' ? (
                <>
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Type</th>
                      <th>Email / phone</th>
                      <th>Address</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.contacts.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                        </td>
                        <td>
                          <span
                            className={`badge ${c.type === 'SUPPLIER' ? 'badge-ready' : 'badge-draft'}`}
                          >
                            {c.type === 'SUPPLIER' ? 'Supplier' : 'Customer'}
                          </span>
                        </td>
                        <td>
                          {c.email || '—'}
                          <small>{c.phone}</small>
                        </td>
                        <td>{c.address || '—'}</td>
                        <td>{editButton('contacts', c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : tab === 'rules' ? (
                <>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Location</th>
                      <th className="number">Minimum</th>
                      <th className="number">Target</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.rules.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.product.name}</strong>
                          <small className="sku">{r.product.sku}</small>
                        </td>
                        <td>
                          {r.location.warehouse.code} / {r.location.name}
                        </td>
                        <td className="number">
                          {quantity(r.minimum)} {units[r.product.unit]}
                        </td>
                        <td className="number">
                          {quantity(r.target)} {units[r.product.unit]}
                        </td>
                        <td>{editButton('rules', r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>Team member</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.users.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <div className="product-cell">
                            <span className="avatar light">
                              {member.name
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                            <strong>
                              {member.name}
                              {member.id === user.id && (
                                <small className="inline-unit"> (you)</small>
                              )}
                            </strong>
                          </div>
                        </td>
                        <td>
                          {member.role === 'MANAGER' ? 'Inventory manager' : 'Warehouse staff'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
          {tab !== 'team' &&
            catalog[tab as Exclude<Entity, 'products' | 'warehouses'>].length === 0 && (
              <Empty
                title="Nothing added yet"
                text="Add your first record to set up this part of your workspace."
              />
            )}
        </section>
      )}
      {edit && (
        <CatalogForm entity={edit.entity} record={edit.record} onClose={() => setEdit(null)} />
      )}
    </>
  );
}
