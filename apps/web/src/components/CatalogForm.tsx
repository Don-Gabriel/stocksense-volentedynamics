import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, refresh } from '../lib/api';
import { useWorkspace } from '../lib/context';
import { Button, ErrorBox, Field, Modal, ModalCancel } from './ui';
import { Product } from '../types';

export type Entity = 'products' | 'categories' | 'warehouses' | 'locations' | 'contacts' | 'rules';
const singular = {
  products: 'product',
  categories: 'category',
  warehouses: 'warehouse',
  locations: 'location',
  contacts: 'contact',
  rules: 'reordering rule',
};
export function CatalogForm({
  entity,
  record,
  onClose,
}: {
  entity: Entity;
  record?: Record<string, any>;
  onClose: () => void;
}) {
  const { catalog, notify } = useWorkspace();
  const [dirty, setDirty] = useState(false);
  const defaults =
    entity === 'products'
      ? {
          name: '',
          sku: '',
          categoryId: catalog.categories[0]?.id || '',
          unit: 'PCS',
          unitCost: 0,
          description: '',
          ...(record || {}),
        }
      : entity === 'rules'
        ? {
            productId: record?.productId || catalog.products[0]?.id || '',
            locationId: record?.locationId || catalog.locations[0]?.id || '',
            minimum: 0,
            target: 10,
            ...(record || {}),
          }
        : entity === 'locations'
          ? { warehouseId: catalog.warehouses[0]?.id || '', ...(record || {}) }
          : entity === 'contacts'
            ? { type: 'SUPPLIER', ...(record || {}) }
            : record || {};
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Record<string, any>>({ defaultValues: defaults });
  const mutation = useMutation({
    mutationFn: (data: Record<string, any>) => {
      if (entity === 'rules' && record?.id)
        data = { ...data, productId: record.productId, locationId: record.locationId };
      const allowed: Record<Entity, string[]> = {
        products: [
          'name',
          'sku',
          'categoryId',
          'unit',
          'unitCost',
          'description',
          'active',
          'initialStock',
          'locationId',
        ],
        categories: ['name'],
        warehouses: ['name', 'code', 'address'],
        locations: ['name', 'code', 'warehouseId'],
        contacts: ['name', 'type', 'email', 'phone', 'address'],
        rules: ['productId', 'locationId', 'minimum', 'target'],
      };
      const body = Object.fromEntries(
        Object.entries(data).filter(
          ([key, value]) =>
            allowed[entity].includes(key) &&
            value !== undefined &&
            !Number.isNaN(value) &&
            !(key === 'locationId' && entity === 'products' && !value),
        ),
      );
      return api(
        `/catalog/${entity}${record?.id && entity !== 'rules' ? `/${record.id}` : ''}`,
        record?.id && entity !== 'rules' ? 'PATCH' : 'POST',
        body,
      );
    },
    onSuccess: async () => {
      await refresh();
      notify(`${singular[entity][0].toUpperCase() + singular[entity].slice(1)} saved.`);
      onClose();
    },
  });
  const input = (
    name: string,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      maxLength?: number;
      min?: number;
      step?: number;
      hint?: string;
    } = {},
  ) => (
    <Field label={label} key={name} hint={options.hint}>
      <input
        type={options.type || 'text'}
        {...register(name, {
          required: options.required === false ? false : `${label} is required.`,
          ...(options.type === 'number' ? { valueAsNumber: true } : {}),
          maxLength: options.maxLength || 100,
        })}
        required={options.required !== false}
        maxLength={options.maxLength || 100}
        min={options.min}
        step={options.step}
      />
      {errors[name] && <span className="field-error">{String(errors[name]?.message)}</span>}
    </Field>
  );
  const select = (name: string, label: string, items: { id: string; name: string }[]) => (
    <Field key={name} label={label}>
      <select
        {...register(name, { required: true })}
        required
        disabled={entity === 'rules' && !!record?.id}
      >
        {items.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <Modal
      title={`${record?.id ? 'Edit' : 'New'} ${singular[entity]}`}
      onClose={onClose}
      dirty={dirty}
      busy={mutation.isPending}
    >
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        onChangeCapture={() => setDirty(true)}
      >
        <div className="modal-body stack-form">
          <ErrorBox error={mutation.error} />
          {entity !== 'rules' && input('name', 'Name', { maxLength: 80 })}
          {entity === 'products' && (
            <>
              <div className="form-grid">
                {input('sku', 'SKU', { maxLength: 32 })}
                {select('categoryId', 'Category', catalog.categories)}
                {select('unit', 'Unit of measure', [
                  { id: 'PCS', name: 'Pieces (pcs)' },
                  { id: 'KG', name: 'Kilograms (kg)' },
                  { id: 'L', name: 'Litres (L)' },
                  { id: 'M', name: 'Metres (m)' },
                ])}
                {input('unitCost', 'Unit cost (₹)', { type: 'number', min: 0, step: 0.01 })}
              </div>
              {input('description', 'Description', { required: false, maxLength: 1000 })}
              {!record?.id && (
                <div className="opening-stock">
                  <h3>
                    Opening stock <span>Optional</span>
                  </h3>
                  <div className="form-grid">
                    {input('initialStock', 'Quantity', {
                      type: 'number',
                      min: 0,
                      step: watch('unit') === 'PCS' ? 1 : 0.001,
                      required: false,
                    })}
                    <Field label="Location">
                      <select
                        {...register('locationId')}
                        required={Number(watch('initialStock')) > 0}
                      >
                        <option value="">Select location</option>
                        {catalog.locations.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.warehouse.code} / {l.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <small>Opening quantities are recorded in move history.</small>
                </div>
              )}
              {record?.id && (
                <label className="checkbox-field">
                  <input type="checkbox" {...register('active')} />
                  Active product
                </label>
              )}
            </>
          )}
          {(entity === 'warehouses' || entity === 'locations') &&
            input('code', 'Short code', { maxLength: entity === 'warehouses' ? 12 : 20 })}
          {entity === 'warehouses' &&
            input('address', 'Address', { required: false, maxLength: 500 })}
          {entity === 'locations' && select('warehouseId', 'Warehouse', catalog.warehouses)}
          {entity === 'contacts' && (
            <>
              {select('type', 'Contact type', [
                { id: 'SUPPLIER', name: 'Supplier' },
                { id: 'CUSTOMER', name: 'Customer' },
              ])}
              {input('email', 'Email', { type: 'email', required: false, maxLength: 254 })}
              {input('phone', 'Phone', { required: false, maxLength: 30 })}
              {input('address', 'Address', { required: false, maxLength: 500 })}
            </>
          )}
          {entity === 'rules' && (
            <>
              {select(
                'productId',
                'Product',
                catalog.products
                  .filter((p: Product) => p.active)
                  .map((p) => ({ id: p.id, name: `${p.name} · ${p.sku}` })),
              )}
              {select(
                'locationId',
                'Location',
                catalog.locations.map((l) => ({
                  id: l.id,
                  name: `${l.warehouse.code} / ${l.name}`,
                })),
              )}
              <div className="form-grid">
                {input('minimum', 'Minimum quantity', { type: 'number', min: 0, step: 0.001 })}
                {input('target', 'Target quantity', { type: 'number', min: 0, step: 0.001 })}
              </div>
              <p className="form-hint">
                An alert appears when available stock reaches the minimum. The target is used to
                suggest how much to replenish.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <ModalCancel />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save ' + singular[entity]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
