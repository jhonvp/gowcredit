import { useEffect } from 'react';

/** Each screen names the browser tab (and what a screen reader announces on navigation). */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · GowCredit`;
  }, [title]);
}
