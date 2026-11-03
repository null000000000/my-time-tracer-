import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { UserSettings } from '../types';
import {
  GuestSessionData,
  getGuestSession,
  initGuestSession,
  clearGuestSession,
  hasGuestData,
  saveGuestSession,
  defaultGuestSettings,
} from '../services/guestStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  settings: UserSettings;
  isGuest: boolean;
  guestSession: GuestSessionData | null;
  showMigrationModal: boolean;
  setShowMigrationModal: (show: boolean) => void;
  pendingGuestData: GuestSessionData | null;
  startGuestSession: () => void;
  exitGuestMode: () => void;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  cancelMigration: () => Promise<void>;
  discardGuestDataAndProceed: () => void;
  completeMigration: () => void;
}

const defaultSettings: UserSettings = {
  userId: '',
  timeFormat: '24h',
  weekStart: 'monday',
  pomodoroWorkMinutes: 25,
  pomodoroShortBreakMinutes: 5,
  pomodoroLongBreakMinutes: 15,
  pomodoroSessionsBeforeLong: 4,
  soundEnabled: true,
  notificationsEnabled: true,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function createSyntheticGuestUser(sessionId: string): User {
  return {
    uid: sessionId,
    displayName: 'Guest Engineer',
    email: null,
    phoneNumber: null,
    photoURL: null,
    providerId: 'guest',
    emailVerified: false,
    isAnonymous: false,
    metadata: {
      creationTime: new Date().toISOString(),
      lastSignInTime: new Date().toISOString(),
    },
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'guest_token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({ uid: sessionId }),
  } as unknown as User;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isGuest, setIsGuest] = useState(false);
  const [guestSession, setGuestSession] = useState<GuestSessionData | null>(null);
  const [pendingGuestData, setPendingGuestData] = useState<GuestSessionData | null>(null);
  const [showMigrationModal, setShowMigrationModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Check if there was an active guest session before this authentication
        const storedGuest = getGuestSession();
        if (storedGuest && hasGuestData(storedGuest)) {
          setPendingGuestData(storedGuest);
          setShowMigrationModal(true);
        } else {
          clearGuestSession();
        }

        setIsGuest(false);
        setUser(currentUser);

        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            setSettings(snap.data() as UserSettings);
          } else {
            const initial: UserSettings = {
              ...defaultSettings,
              userId: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, initial);
            setSettings(initial);
          }
        } catch (error) {
          console.error('Error fetching/setting user preferences:', error);
        }
      } else {
        // No Firebase user. Check if an active guest session exists in this tab's sessionStorage
        const existingGuest = getGuestSession();
        if (existingGuest) {
          setIsGuest(true);
          setGuestSession(existingGuest);
          setUser(createSyntheticGuestUser(existingGuest.sessionId));
          setSettings(existingGuest.preferences || defaultGuestSettings);
        } else {
          setIsGuest(false);
          setGuestSession(null);
          setUser(null);
          setSettings(defaultSettings);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const startGuestSession = () => {
    const newSession = initGuestSession();
    setIsGuest(true);
    setGuestSession(newSession);
    setUser(createSyntheticGuestUser(newSession.sessionId));
    setSettings(newSession.preferences);
  };

  const exitGuestMode = () => {
    clearGuestSession();
    setIsGuest(false);
    setGuestSession(null);
    setUser(null);
    setSettings(defaultSettings);
  };

  const cancelMigration = async () => {
    // User canceled migration: sign out of Firebase and restore guest workspace safely
    try {
      setShowMigrationModal(false);
      await signOut(auth);
      if (pendingGuestData) {
        saveGuestSession(pendingGuestData);
        setIsGuest(true);
        setGuestSession(pendingGuestData);
        setUser(createSyntheticGuestUser(pendingGuestData.sessionId));
        setSettings(pendingGuestData.preferences || defaultGuestSettings);
      }
    } catch (err) {
      console.error('Failed reverting to guest session:', err);
    }
  };

  const discardGuestDataAndProceed = () => {
    clearGuestSession();
    setPendingGuestData(null);
    setShowMigrationModal(false);
  };

  const completeMigration = () => {
    clearGuestSession();
    setPendingGuestData(null);
    setShowMigrationModal(false);
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    if (isGuest && guestSession) {
      const updatedPref: UserSettings = {
        ...settings,
        ...newSettings,
        updatedAt: new Date().toISOString(),
      };
      guestSession.preferences = updatedPref;
      saveGuestSession(guestSession);
      setSettings(updatedPref);
      return;
    }

    if (!user) return;
    try {
      const updated: UserSettings = {
        ...settings,
        ...newSettings,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
      };
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, updated, { merge: true });
      setSettings(updated);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google Sign-In failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (isGuest) {
      exitGuestMode();
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out failed:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        settings,
        isGuest,
        guestSession,
        showMigrationModal,
        setShowMigrationModal,
        pendingGuestData,
        startGuestSession,
        exitGuestMode,
        updateSettings,
        signInWithGoogle,
        logout,
        cancelMigration,
        discardGuestDataAndProceed,
        completeMigration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
