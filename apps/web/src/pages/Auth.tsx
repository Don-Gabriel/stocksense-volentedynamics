import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, Check, Layers3, ShieldCheck } from 'lucide-react';
import { api, queryClient } from '../lib/api';
import { Button, ErrorBox, Field } from '../components/ui';
import type { User } from '../types';

const password = z
  .string()
  .min(9, 'Use at least 9 characters.')
  .max(72)
  .refine((value) => new TextEncoder().encode(value).length <= 72, 'Use at most 72 UTF-8 bytes.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Include a special character.');
const schemas = {
  login: z.object({
    identity: z.string().min(1, 'Enter your login ID or email.'),
    password: z.string().min(1, 'Enter your password.'),
  }),
  register: z
    .object({
      name: z.string().trim().min(2),
      username: z
        .string()
        .regex(/^[a-zA-Z0-9_]{6,12}$/, 'Use 6–12 letters, numbers, or underscores.'),
      email: z.email(),
      password,
      confirm: z.string(),
    })
    .refine((x) => x.password === x.confirm, {
      message: 'Passwords do not match.',
      path: ['confirm'],
    }),
  forgot: z.object({ email: z.email() }),
  reset: z
    .object({
      email: z.email(),
      code: z.string().regex(/^\d{6}$/, 'Enter six digits.'),
      password,
      confirm: z.string(),
    })
    .refine((x) => x.password === x.confirm, {
      message: 'Passwords do not match.',
      path: ['confirm'],
    }),
};
type Mode = keyof typeof schemas;
export function AuthPage({ initial = 'login' }: { initial?: Mode }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState('');
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  if (me.data) return <Navigate to="/" replace />;
  const titles = {
    login: 'Welcome back.',
    register: 'Make room for better inventory.',
    forgot: 'Forgot your password?',
    reset: 'Set a new password.',
  };
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link to="/login" className="brand">
          <span className="brand-mark">
            <Boxes size={27} />
          </span>
          <span>
            Stock<span className="brand-light">Sense</span>
          </span>
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">YOUR INVENTORY. IN ORDER.</span>
          <h1>
            Every item.
            <br />
            Every move.
            <br />
            <span>Accounted for.</span>
          </h1>
          <p>A clear view of what’s in stock, where it belongs, and what needs your attention.</p>
          <div className="auth-feature">
            <Layers3 size={20} /> One workspace for every warehouse
          </div>
          <div className="auth-feature">
            <ShieldCheck size={20} /> A complete history of every stock movement
          </div>
        </div>
        <div className="auth-story-bottom">
          <span className="cube-outline">
            <Boxes size={100} strokeWidth={1} />
          </span>
          <span>
            Built for the people
            <br />
            who keep things moving.
          </span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          <span className="eyebrow">STOCKSENSE WORKSPACE</span>
          <h2>{titles[mode]}</h2>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Sign in to keep your operations moving.'
              : mode === 'register'
                ? 'Create your warehouse staff account.'
                : mode === 'forgot'
                  ? 'We’ll send a six-digit reset code to your registered email.'
                  : 'Enter your code and choose a strong password.'}
          </p>
          {notice && (
            <div className="success-box">
              <Check size={18} />
              {notice}
            </div>
          )}
          {preview && (
            <p className="local-mail">
              Local demo: emails arrive in the{' '}
              <a href={preview} target="_blank" rel="noreferrer">
                local test inbox
              </a>
              , not an external mailbox.
            </p>
          )}
          <AuthForm
            key={mode}
            mode={mode}
            email={email}
            onSuccess={(value) => {
              if (mode === 'login' || mode === 'register') {
                queryClient.setQueryData(['me'], value);
                navigate('/');
              } else if (mode === 'forgot') {
                setEmail(value.email);
                setPreview(value.previewUrl || '');
                setNotice(value.message);
                setMode('reset');
              } else {
                setNotice('Password updated. Sign in with your new password.');
                setPreview('');
                setMode('login');
              }
            }}
          />
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                New to StockSense?{' '}
                <button
                  onClick={() => {
                    setNotice('');
                    setMode('register');
                  }}
                >
                  Create an account <ArrowRight size={14} />
                </button>
                <button
                  className="forgot-link"
                  onClick={() => {
                    setNotice('');
                    setMode('forgot');
                  }}
                >
                  Forgot password?
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setNotice('');
                  setPreview('');
                  setMode('login');
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
          <p className="auth-footnote">Your workspace keeps stock and movement history together.</p>
        </div>
      </main>
    </div>
  );
}
function AuthForm({
  mode,
  email,
  onSuccess,
}: {
  mode: Mode;
  email: string;
  onSuccess: (value: any) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schemas[mode]) as any,
    defaultValues: { email },
  });
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const { confirm, ...body } = values;
      return api<any>(
        `/auth/${{ login: 'login', register: 'register', forgot: 'forgot-password', reset: 'reset-password' }[mode]}`,
        'POST',
        body,
      ).then((result) => ({ ...result, email: body.email || result.email }));
    },
    onSuccess,
  });
  const fields: { name: string; label: string; type: string; placeholder: string }[] =
    mode === 'login'
      ? [
          {
            name: 'identity',
            label: 'Login ID or email',
            type: 'text',
            placeholder: 'Enter your login ID',
          },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
            placeholder: 'Enter your password',
          },
        ]
      : mode === 'forgot'
        ? [{ name: 'email', label: 'Email address', type: 'email', placeholder: 'you@company.com' }]
        : mode === 'reset'
          ? [
              {
                name: 'email',
                label: 'Email address',
                type: 'email',
                placeholder: 'you@company.com',
              },
              { name: 'code', label: 'Reset code', type: 'text', placeholder: 'Six-digit code' },
              {
                name: 'password',
                label: 'New password',
                type: 'password',
                placeholder: 'At least 9 characters',
              },
              {
                name: 'confirm',
                label: 'Confirm password',
                type: 'password',
                placeholder: 'Re-enter your password',
              },
            ]
          : [
              { name: 'name', label: 'Full name', type: 'text', placeholder: 'Your name' },
              { name: 'username', label: 'Login ID', type: 'text', placeholder: '6–12 characters' },
              {
                name: 'email',
                label: 'Email address',
                type: 'email',
                placeholder: 'you@company.com',
              },
              {
                name: 'password',
                label: 'Password',
                type: 'password',
                placeholder: 'Uppercase, lowercase, and a special character',
              },
              {
                name: 'confirm',
                label: 'Confirm password',
                type: 'password',
                placeholder: 'Re-enter your password',
              },
            ];
  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="stack-form">
      <ErrorBox error={mutation.error} />
      {fields.map((f) => (
        <Field key={f.name} label={f.label}>
          <input
            {...register(f.name)}
            type={f.type}
            placeholder={f.placeholder}
            autoComplete={
              f.name === 'password'
                ? mode === 'login'
                  ? 'current-password'
                  : 'new-password'
                : f.name === 'identity'
                  ? 'username'
                  : f.name === 'confirm'
                    ? 'new-password'
                    : f.name === 'code'
                      ? 'one-time-code'
                      : f.name
            }
            aria-invalid={!!errors[f.name]}
          />
          {errors[f.name] && <span className="field-error">{String(errors[f.name]?.message)}</span>}
        </Field>
      ))}
      <Button type="submit" disabled={mutation.isPending} className="full-width">
        {mutation.isPending
          ? 'Please wait…'
          : {
              login: 'Sign in',
              register: 'Create account',
              forgot: 'Send reset code',
              reset: 'Update password',
            }[mode]}
        <ArrowRight size={18} />
      </Button>
    </form>
  );
}
