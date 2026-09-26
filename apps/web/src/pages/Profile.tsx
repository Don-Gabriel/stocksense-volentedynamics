import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../lib/context';
import { api, refresh } from '../lib/api';
import { Button, ErrorBox, Field, PageTitle } from '../components/ui';
export function Profile() {
  const { user, notify } = useWorkspace();
  const { register, handleSubmit } = useForm({ defaultValues: { name: user.name } });
  const mutation = useMutation({
    mutationFn: (data: { name: string }) => api('/auth/profile', 'PATCH', data),
    onSuccess: async () => {
      await refresh();
      notify('Your profile is up to date.');
    },
  });
  return (
    <>
      <PageTitle
        eyebrow="YOUR ACCOUNT"
        title="Profile"
        description="The person behind your inventory movements."
      />
      <section className="panel profile-panel">
        <div className="profile-header">
          <span className="avatar profile-avatar">
            {user.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div>
            <h2>{user.name}</h2>
            <p>{user.role === 'MANAGER' ? 'Inventory manager' : 'Warehouse staff'}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="stack-form">
          <ErrorBox error={mutation.error} />
          <Field label="Full name">
            <input {...register('name')} minLength={2} maxLength={80} required />
          </Field>
          <Field label="Login ID">
            <input value={user.username} readOnly />
          </Field>
          <Field label="Email address">
            <input value={user.email} readOnly />
          </Field>
          <div className="info-strip">
            <ShieldCheck size={18} />
            <span>
              Your name is attached to the movements you validate. To reset your password, sign out
              and use “Forgot password?”.
            </span>
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </section>
    </>
  );
}
