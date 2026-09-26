import { useEffect, useRef, useState } from 'react';

// Router transitions can lag behind typing. Keep keystrokes in urgent local
// state, and only replace them when the URL changes outside this input.
export function useSearchText(value: string, commit: (value: string) => void) {
  const [text, setText] = useState(value);
  const pending = useRef(new Set<string>());
  const latest = useRef(value);

  useEffect(() => {
    if (pending.current.has(value)) {
      if (value === latest.current) pending.current.clear();
      return;
    }
    pending.current.clear();
    latest.current = value;
    setText(value);
  }, [value]);

  function change(next: string) {
    latest.current = next;
    pending.current.add(next);
    setText(next);
    commit(next);
  }

  return [text, change] as const;
}
