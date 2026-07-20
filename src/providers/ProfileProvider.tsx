import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { db } from '@/data';
import { type Result, type UserProfile, isProfileComplete } from '@/data';
import { useAuth } from './AuthProvider';

type ProfilePatch = Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>;

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  /** true quando o corretor ainda não completou o cadastro obrigatório. */
  needsOnboarding: boolean;
  refresh: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<Result<UserProfile>>;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = await db.profiles.get(user.id);
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<Result<UserProfile>> => {
      if (!user) return { ok: false, error: 'Não autenticado.' };
      const result = await db.profiles.upsert(user.id, patch);
      if (result.ok) setProfile(result.data);
      return result;
    },
    [user],
  );

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        needsOnboarding: Boolean(user) && !loading && !isProfileComplete(profile),
        refresh,
        updateProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile deve ser usado dentro de <ProfileProvider>.');
  return ctx;
}
