import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Inbox, LoaderCircle, X } from 'lucide-react';
import { statusNames } from '../types';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
const ModalCloseContext = React.createContext<() => void>(() => {});
export function ModalCancel() {
  const close = React.useContext(ModalCloseContext);
  return (
    <Button type="button" variant="secondary" onClick={close}>
      Cancel
    </Button>
  );
}
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      default: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    },
    size: { default: '', sm: 'btn-sm', icon: 'btn-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {status === 'DONE' && <Check size={12} />} {statusNames[status] || status}
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  ) : null;
}
export function Empty({
  title = 'Nothing here yet',
  text = 'New records will appear here.',
  action,
}: {
  title?: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
  dirty = false,
  busy = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  dirty?: boolean;
  busy?: boolean;
}) {
  const descriptionId = React.useId();
  const content = React.useRef<HTMLDivElement>(null);
  const [discard, setDiscard] = React.useState(false);
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          ref={content}
          onOpenAutoFocus={(event) => {
            const first = content.current?.querySelector<HTMLElement>(
              'input:not([type=hidden]),select,textarea',
            );
            if (first) {
              event.preventDefault();
              first.focus();
            }
          }}
          className={cn('modal', wide && 'modal-wide')}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id={descriptionId}>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
          {discard && (
            <div className="discard-warning" role="alert">
              <strong>Discard unsaved changes?</strong>
              <p>Your changes have not been saved.</p>
              <div>
                <Button variant="secondary" onClick={() => setDiscard(false)}>
                  Keep editing
                </Button>
                <Button variant="danger" onClick={onClose}>
                  Discard changes
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Pager({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {total
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`
          : '0 records'}
      </span>
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ArrowLeft size={15} />
        </Button>
        <span>Page {page}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page * limit >= total}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        typeof child.type === 'string' &&
        ['input', 'select', 'textarea'].includes(child.type)
          ? React.cloneElement(child as React.ReactElement<{ id: string }>, { id })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}
