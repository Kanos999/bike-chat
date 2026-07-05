import { StateCreator } from 'zustand';
import {
  getValidSession,
  requestSmsOtp,
  signOut,
  SupabaseSession,
  verifySmsOtp,
} from '../modules/auth/supabaseAuth';
import { startTokenManager, stopTokenManager } from '../modules/auth/tokenManager';

export interface AuthSlice {
  authReady: boolean;
  authLoading: boolean;
  authError: string | null;
  session: SupabaseSession | null;
  initializeAuth: () => Promise<void>;
  requestPhoneOtp: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const createAuthSlice: StateCreator<
  AuthSlice,
  [['zustand/devtools', never]],
  [],
  AuthSlice
> = (set, get) => ({
  authReady: false,
  authLoading: false,
  authError: null,
  session: null,
  initializeAuth: async () => {
    set({ authLoading: true, authError: null });
    try {
      const session = await getValidSession();
      // Keep the token fresh for the whole session; refreshes update the store too.
      startTokenManager(session, (next) => set({ session: next }));
      set({ session, authReady: true, authLoading: false });
    } catch (error) {
      set({
        authReady: true,
        authLoading: false,
        session: null,
        authError: error instanceof Error ? error.message : 'Unable to initialize auth',
      });
    }
  },
  requestPhoneOtp: async (phone) => {
    set({ authLoading: true, authError: null });
    try {
      await requestSmsOtp(phone);
      set({ authLoading: false });
    } catch (error) {
      set({ authLoading: false, authError: error instanceof Error ? error.message : 'OTP request failed' });
      throw error;
    }
  },
  verifyPhoneOtp: async (phone, code) => {
    set({ authLoading: true, authError: null });
    try {
      const session = await verifySmsOtp(phone, code);
      startTokenManager(session, (next) => set({ session: next }));
      set({ session, authLoading: false });
    } catch (error) {
      set({ authLoading: false, authError: error instanceof Error ? error.message : 'OTP verification failed' });
      throw error;
    }
  },
  logout: async () => {
    set({ authLoading: true, authError: null });
    try {
      await signOut(get().session);
      stopTokenManager();
      set({ session: null, authLoading: false });
    } catch (error) {
      set({ authLoading: false, authError: error instanceof Error ? error.message : 'Logout failed' });
    }
  },
});
