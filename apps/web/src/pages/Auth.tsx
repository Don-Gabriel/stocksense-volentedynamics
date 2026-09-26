import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, Check, Eye, EyeOff, Layers3, ShieldCheck } from 'lucide-react';
import { api, ApiError, queryClient } from '../lib/api';
import { Button, ErrorBox } from '../components/ui';
import type { User } from '../types';
const password = z
  .string()
  .min(9, 'Use at least 9 characters.')
  .max(72)
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Use at most 72 UTF-8 bytes.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[^A-Za-z0-9]/, 'Include a special character.');
const code = z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your email.');
const schemas = {
  login: z.object({
    identity: z.string().min(1, 'Enter your login ID or email.'),
    password: z.string().min(1, 'Enter your password.'),
  }),
  register: z
    .object({
      name: z.string().trim().min(2).max(80),
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
    .object({ email: z.email(), code, password, confirm: z.string() })
    .refine((x) => x.password === x.confirm, {
      message: 'Passwords do not match.',
      path: ['confirm'],
    }),
  verify: z.object({
    email: z.email(),
    code,
    password: z.string().min(1, 'Enter the password you used to create your account.'),
  }),
};
type Mode = keyof typeof schemas;
type Feedback = {
  email?: string;
  message?: string;
  previewUrl?: string;
  delivery?: string;
  resendAfterSeconds?: number;
};
const titles: Record<Mode, string> = {
  login: 'Welcome back.',
  register: 'Create your account.',
  forgot: 'Forgot your password?',
  reset: 'Set a new password.',
  verify: 'Verify your email.',
};
const descriptions: Record<Mode, string> = {
  login: 'Sign in to your inventory workspace.',
  register: 'Verify your email, then a manager will approve your workspace access.',
  forgot: 'We’ll send a six-digit reset code to your registered email.',
  reset: 'Enter your code and choose a new password.',
  verify: 'Enter the email code and your account password. Codes expire after 10 minutes.',
};
const endpoints: Record<Mode, string> = {
  login: 'login',
  register: 'register',
  forgot: 'forgot-password',
  reset: 'reset-password',
  verify: 'verify-email',
};
export function AuthPage({ initial: mode = 'login' }: { initial?: Mode }) {
  const navigate = useNavigate(),
    location = useLocation();
  const state = (location.state || {}) as Feedback;
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/auth/me') });
  if (me.data) return <Navigate to="/" replace />;
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link to="/login" className="brand">
          <span className="brand-mark">
            <Boxes size={28} />
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
            <Layers3 size={20} />
            One workspace for every warehouse
          </div>
          <div className="auth-feature">
            <ShieldCheck size={20} />
            Verified people. Traceable movements.
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
          <p className="auth-subtitle">{descriptions[mode]}</p>
          {state.message && (
            <div className="success-box" role="status">
              <Check size={18} />
              {state.message}
            </div>
          )}
          <AuthForm
            key={mode}
            mode={mode}
            state={state}
            onUnverified={(email) => navigate('/verify-email', { state: { email } })}
            onSuccess={(value) => {
              if (mode === 'login') {
                queryClient.setQueryData(['me'], value);
                navigate('/', { replace: true });
              } else if (mode === 'register') navigate('/verify-email', { state: value });
              else if (mode === 'forgot') navigate('/reset-password', { state: value });
              else navigate('/login', { state: { message: value.message }, replace: true });
            }}
          />
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                <Link to="/signup">Create an account</Link>
                <Link to="/forgot-password">Forgot password?</Link>
                <Link to="/verify-email">Verify an existing account</Link>
              </>
            ) : (
              <Link to="/login">Back to sign in</Link>
            )}
          </div>
          <p className="auth-footnote">
            Access is limited to verified, approved members of this workspace.
          </p>
        </div>
      </main>
    </div>
  );
}
function AuthForm({
  mode,
  state,
  onSuccess,
  onUnverified,
}: {
  mode: Mode;
  state: Feedback;
  onSuccess: (value: any) => void;
  onUnverified: (email: string) => void;
}) {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(schemas[mode]) as any,
    defaultValues: { email: state.email || '' },
  });
  const [visible, setVisible] = useState<Record<string, boolean>>({}),
    [feedback, setFeedback] = useState<Feedback>(state),
    [resendAt, setResendAt] = useState(Date.now() + (state.resendAfterSeconds || 0) * 1000),
    [remaining, setRemaining] = useState(state.resendAfterSeconds || 0),
    [resendError, setResendError] = useState('');
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => {
      const { confirm, ...body } = values;
      return api<any>(`/auth/${endpoints[mode]}`, 'POST', body).then((result) => ({
        ...result,
        email: result.email || body.email,
      }));
    },
    onSuccess,
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'EMAIL_UNVERIFIED' && error.email)
        onUnverified(error.email);
    },
  });
  const resend = useMutation({
    mutationFn: (email: string) =>
      api<Feedback>(
        `/auth/${mode === 'verify' ? 'resend-verification' : 'forgot-password'}`,
        'POST',
        { email },
      ),
    onSuccess: (value) => {
      setFeedback(value);
      setResendAt(Date.now() + (value.resendAfterSeconds || 60) * 1000);
    },
  });
  const fields =
    mode === 'login'
      ? [
          ['identity', 'Login ID or email', 'text'],
          ['password', 'Password', 'password'],
        ]
      : mode === 'register'
        ? [
            ['name', 'Full name', 'text'],
            ['username', 'Login ID', 'text'],
            ['email', 'Email address', 'email'],
            ['password', 'Password', 'password'],
            ['confirm', 'Confirm password', 'password'],
          ]
        : mode === 'forgot'
          ? [['email', 'Email address', 'email']]
          : mode === 'verify'
            ? [
                ['email', 'Email address', 'email'],
                ['code', 'Verification code', 'text'],
                ['password', 'Account password', 'password'],
              ]
            : [
                ['email', 'Email address', 'email'],
                ['code', 'Reset code', 'text'],
                ['password', 'New password', 'password'],
                ['confirm', 'Confirm password', 'password'],
              ];
  return (
    <form className="stack-form" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      <ErrorBox error={mutation.error || resend.error || resendError} />
      {feedback.delivery === 'local' && (
        <p className="local-mail">
          Development email mode: messages arrive in the{' '}
          <a href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">
            local test inbox
          </a>
          . External delivery requires a configured sender.
        </p>
      )}
      {resend.isSuccess && (
        <div className="success-box" role="status">
          {feedback.message}
        </div>
      )}
      {fields.map(([name, label, type]) => (
        <div className="field" key={name}>
          <label htmlFor={`auth-${name}`}>{label}</label>
          <div className={type === 'password' ? 'password-input' : undefined}>
            <input
              id={`auth-${name}`}
              {...register(name)}
              type={type === 'password' && visible[name] ? 'text' : type}
              inputMode={name === 'code' ? 'numeric' : undefined}
              maxLength={name === 'code' ? 6 : name === 'username' ? 12 : undefined}
              autoComplete={
                name === 'password'
                  ? mode === 'login' || mode === 'verify'
                    ? 'current-password'
                    : 'new-password'
                  : name === 'identity' || name === 'username'
                    ? 'username'
                    : name === 'confirm'
                      ? 'new-password'
                      : name === 'code'
                        ? 'one-time-code'
                        : name === 'name'
                          ? 'name'
                          : 'email'
              }
              aria-invalid={!!errors[name]}
              aria-describedby={errors[name] ? `error-${name}` : undefined}
            />
            {type === 'password' && (
              <button
                type="button"
                aria-label={`${visible[name] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                onClick={() => setVisible({ ...visible, [name]: !visible[name] })}
              >
                {visible[name] ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            )}
          </div>
          {errors[name] && (
            <span id={`error-${name}`} className="field-error">
              {String(errors[name]?.message)}
            </span>
          )}
          {mode === 'register' && name === 'password' && (
            <small>9–72 characters with uppercase, lowercase, and a special character.</small>
          )}
          {mode === 'register' && name === 'username' && (
            <small>6–12 letters, numbers, or underscores.</small>
          )}
        </div>
      ))}
      <Button type="submit" className="full-width" disabled={mutation.isPending}>
        {mutation.isPending
          ? 'Please wait…'
          : {
              login: 'Sign in',
              register: 'Create account & send code',
              forgot: 'Send reset code',
              reset: 'Update password',
              verify: 'Verify email',
            }[mode]}
        <ArrowRight size={18} />
      </Button>
      {(mode === 'verify' || mode === 'reset') && (
        <div className="auth-resend">
          <small>Didn’t receive a code?</small>
          <Button
            variant="secondary"
            type="button"
            disabled={remaining > 0 || resend.isPending}
            onClick={() => {
              setResendError('');
              const email = getValues('email');
              if (!z.email().safeParse(email).success) {
                setResendError('Enter a valid email address first.');
                return;
              }
              resend.mutate(email);
            }}
          >
            {remaining > 0
              ? `Resend in ${remaining}s`
              : resend.isPending
                ? 'Sending…'
                : 'Resend code'}
          </Button>
        </div>
      )}
    </form>
  );
}
