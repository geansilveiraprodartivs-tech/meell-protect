import { useEffect, useState, useCallback } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'recovery' }
  | { name: 'app' };

export interface ParsedRoute {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parseHash(): ParsedRoute {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs ?? '');
  const segments = path.split('/').filter(Boolean);
  return { path, segments, query };
}

export function useRouter() {
  const [route, setRoute] = useState<ParsedRoute>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((to: string) => {
    if (!to.startsWith('/')) to = '/' + to;
    if (window.location.hash === '#' + to) {
      setRoute(parseHash());
    } else {
      window.location.hash = to;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { route, navigate };
}
