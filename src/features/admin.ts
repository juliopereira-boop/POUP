import { useEffect, useState } from 'react';

import { db } from '@/data';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Diz se a conta logada é administradora (dona) do app.
 *
 * A resposta vem do banco (`public.app_admins` via `is_app_admin()`), então
 * serve apenas para mostrar/esconder atalhos na UI: quem manda de verdade nas
 * escritas é o RLS.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    db.settings
      .isAdmin()
      .then((value) => {
        if (mounted) setIsAdmin(value);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  return { isAdmin, loading };
}
