import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ClipboardCheck,
} from 'lucide-react';
import { useWorkspace, OperationDraft } from '../lib/context';
import { api, localDateTime, refresh } from '../lib/api';
import { Kind, kindNames, Operation, units } from '../types';
import { Button, ErrorBox, Field, Modal, ModalCancel } from './ui';
const icons = {
  RECEIPT: ArrowDownToLine,
  DELIVERY: ArrowUpFromLine,
  TRANSFER: ArrowLeftRight,
  ADJUSTMENT: ClipboardCheck,
};
export function OperationForm({
  draft,
  onClose,
  onCreated,
}: {
  draft: OperationDraft;
  onClose: () => void;
  onCreated: (op: Operation) => void;
}) {
  const { catalog, user, notify } = useWorkspace();
  const existing = draft.operation;
  const [type, setType] = useState<Kind>(existing?.type || draft.type || 'RECEIPT');
  const [lines, setLines] = useState<{ productId: string; quantity: string }[]>(
    existing?.lines.map((x) => ({ productId: x.productId, quantity: String(x.quantity) })) || [
      {
        productId: draft.stock?.product.id || '',
        quantity: draft.stock ? String(draft.stock.onHand) : '1',
      },
    ],
  );
  const [sourceId, setSource] = useState(existing?.sourceId || '');
  const [destinationId, setDestination] = useState(
    existing?.destinationId || draft.stock?.location.id || '',
  );
  const [contactId, setContact] = useState(existing?.contactId || '');
  const [responsibleId, setResponsible] = useState(existing?.responsibleId || user.id);
  const [scheduledAt, setScheduled] = useState(localDateTime(existing?.scheduledAt));
  const [notes, setNotes] = useState(existing?.notes || '');
  const [reason, setReason] = useState(existing?.reason || '');
  const [address, setAddress] = useState(existing?.deliveryAddress || '');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api<Operation>(
        existing ? `/operations/${existing.id}` : '/operations',
        existing ? 'PATCH' : 'POST',
        body,
      ),
    onSuccess: async (op) => {
      await refresh();
      notify(existing ? 'Draft updated.' : 'Operation created. Confirm it when you’re ready.');
      onCreated(op);
    },
  });
  const needsSource = type === 'DELIVERY' || type === 'TRANSFER',
    needsDestination = type !== 'DELIVERY',
    needsContact = type === 'RECEIPT' || type === 'DELIVERY';
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (
      lines.some(
        (l) =>
          !l.productId ||
          l.quantity === '' ||
          !Number.isFinite(Number(l.quantity)) ||
          Number(l.quantity) < 0 ||
          (type !== 'ADJUSTMENT' && Number(l.quantity) === 0),
      )
    ) {
      setError('Select a product and enter a valid quantity on every line.');
      return;
    }
    if (new Set(lines.map((l) => l.productId)).size !== lines.length) {
      setError('Each product can appear only once. Combine duplicate quantities.');
      return;
    }
    mutation.mutate({
      type,
      ...(needsSource ? { sourceId } : {}),
      ...(needsDestination ? { destinationId } : {}),
      ...(needsContact ? { contactId } : {}),
      responsibleId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      notes,
      reason,
      deliveryAddress: address,
      lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
    });
  }
  const locations = (
    <>
      <option value="">Select a location</option>
      {catalog.locations.map((l) => (
        <option value={l.id} key={l.id}>
          {l.warehouse.code} / {l.name}
        </option>
      ))}
    </>
  );
  return (
    <Modal
      title={existing ? `Edit ${existing.reference}` : `New ${kindNames[type].toLowerCase()}`}
      description="Save a draft first. Stock changes only when you validate."
      onClose={onClose}
      dirty={dirty}
      busy={mutation.isPending}
      wide
    >
      <form onSubmit={submit} onChangeCapture={() => setDirty(true)}>
        <div className="modal-body">
          <ErrorBox error={error || mutation.error} />
          {!existing && (
            <div className="type-picker">
              {(Object.keys(kindNames) as Kind[]).map((k) => {
                const Icon = icons[k];
                return (
                  <button
                    type="button"
                    key={k}
                    className={type === k ? 'selected' : ''}
                    disabled={k === 'ADJUSTMENT' && user.role !== 'MANAGER'}
                    onClick={() => {
                      setType(k);
                      setContact('');
                    }}
                  >
                    <Icon size={19} />
                    {kindNames[k]}
                  </button>
                );
              })}
            </div>
          )}
          <div className="form-grid">
            {needsSource && (
              <Field label="Source location">
                <select required value={sourceId} onChange={(e) => setSource(e.target.value)}>
                  {locations}
                </select>
              </Field>
            )}
            {needsDestination && (
              <Field label={type === 'ADJUSTMENT' ? 'Count location' : 'Destination location'}>
                <select
                  required
                  value={destinationId}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  {locations}
                </select>
              </Field>
            )}
            {needsContact && (
              <Field label={type === 'RECEIPT' ? 'Supplier' : 'Customer'}>
                <select
                  required
                  value={contactId}
                  onChange={(e) => {
                    setContact(e.target.value);
                    const c = catalog.contacts.find((c) => c.id === e.target.value);
                    if (type === 'DELIVERY' && c) setAddress(c.address);
                  }}
                >
                  <option value="">Select a {type === 'RECEIPT' ? 'supplier' : 'customer'}</option>
                  {catalog.contacts
                    .filter((c) => c.type === (type === 'RECEIPT' ? 'SUPPLIER' : 'CUSTOMER'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Scheduled date">
              <input
                required
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduled(e.target.value)}
              />
            </Field>
            <Field label="Responsible">
              <select value={responsibleId} onChange={(e) => setResponsible(e.target.value)}>
                {catalog.users
                  .filter((u) => u.status === 'ACTIVE' && u.emailVerifiedAt)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            {type === 'ADJUSTMENT' && (
              <Field label="Reason for adjustment">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  maxLength={200}
                  placeholder="e.g. Cycle count, damage, or loss"
                />
              </Field>
            )}
            {type === 'DELIVERY' && (
              <Field label="Delivery address">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={500}
                  placeholder="Customer delivery address"
                />
              </Field>
            )}
          </div>
          <div className="form-section-heading">
            <h3>{type === 'ADJUSTMENT' ? 'Physical count' : 'Products'}</h3>
            <span>
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          </div>
          {type === 'ADJUSTMENT' && (
            <p className="form-hint">
              Enter the quantity you physically counted, not the amount to add or remove.
            </p>
          )}
          <div className="line-header">
            <span>Product / SKU</span>
            <span>{type === 'ADJUSTMENT' ? 'Counted' : 'Quantity'}</span>
            <span />
          </div>
          {lines.map((line, index) => {
            const product = catalog.products.find((p) => p.id === line.productId);
            return (
              <div className="product-line" key={index}>
                <select
                  aria-label={`Product ${index + 1}`}
                  required
                  value={line.productId}
                  onChange={(e) =>
                    setLines(
                      lines.map((l, i) => (i === index ? { ...l, productId: e.target.value } : l)),
                    )
                  }
                >
                  <option value="">Select a product</option>
                  {catalog.products
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.sku}
                      </option>
                    ))}
                </select>
                <div className="quantity-input">
                  <input
                    aria-label={`Quantity ${index + 1}`}
                    required
                    type="number"
                    min={type === 'ADJUSTMENT' ? 0 : product?.unit === 'PCS' ? 1 : 0.001}
                    step={product?.unit === 'PCS' ? 1 : 0.001}
                    max={999999999}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)),
                      )
                    }
                  />
                  <span>{product ? units[product.unit] : '—'}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove product ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setLines([...lines, { productId: '', quantity: type === 'ADJUSTMENT' ? '0' : '1' }])
            }
            disabled={lines.length >= 50}
          >
            <Plus size={16} />
            Add product
          </Button>
          <Field label="Notes (optional)">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="Add instructions or context for your team"
            />
          </Field>
        </div>
        <div className="modal-footer">
          <ModalCancel />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : existing ? 'Save changes' : 'Create draft'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
