"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

/** Fetch a JSON file from /data once per page load; large files (maps, local races) load this way. */
export function useJson<T>(name: string | null): { data: T | null; error: boolean } {
  const [state, setState] = useState<{ name: string | null; data: T | null; error: boolean }>({
    name: null,
    data: null,
    error: false,
  });
  useEffect(() => {
    if (!name) return;
    let live = true;
    let p = cache.get(name);
    if (!p) {
      p = fetch(`/data/${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        return r.json();
      });
      cache.set(name, p);
    }
    p.then(
      (data) => live && setState({ name, data: data as T, error: false }),
      () => {
        cache.delete(name);
        if (live) setState({ name, data: null, error: true });
      },
    );
    return () => {
      live = false;
    };
  }, [name]);
  return state.name === name ? { data: state.data, error: state.error } : { data: null, error: false };
}

/** A filter kept in the URL query string, so every filtered view has a shareable link. */
export function useQueryState(key: string, fallback: string): [string, (v: string) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = sp.get(key) ?? fallback;
  const set = useCallback(
    (v: string) => {
      const p = new URLSearchParams(sp.toString());
      if (v === fallback || v === "") p.delete(key);
      else p.set(key, v);
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [sp, router, pathname, key, fallback],
  );
  return [value, set];
}
