import { keepPreviousData, QueryClient } from '@tanstack/react-query';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public email?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-StockSense-Client': 'web' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response
    .json()
    .catch(() => ({ message: 'The server could not complete this request. Please try again.' }));
  if (response.status === 401 && !path.startsWith('/auth/'))
    window.dispatchEvent(new Event('stocksense:expired'));
  if (!response.ok)
    throw new ApiError(
      Array.isArray(result.message)
        ? result.message.join(' ')
        : result.message || 'Request failed.',
      response.status,
      result.code,
      result.email,
    );
  return result as T;
}
export function query(params: Record<string, unknown>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '' && value !== null) result.set(key, String(value));
  return result.toString();
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: false,
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
    },
  },
});
export const refresh = () => queryClient.invalidateQueries();
export const quantity = (n: number | string | undefined) =>
  Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
export const money = (n: number | string) =>
  Number(n).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
export const date = (value: string, time = false) =>
  new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
export const localDateTime = (value?: string) => {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
