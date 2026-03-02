'use client';

import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import type { AppUser } from '@/types';

interface AuthContextValue {
  user:         AppUser | null;
  firebaseUser: import('firebase/auth').User | null;
  loading:      boolean;
  signIn:       (email: string, password: string) => Promise<void>;
  logOut:       () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user:         null,
  firebaseUser: null,
  loading:      true,
  signIn:       async () => {},
  logOut:       async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);
  const [user,         setUser]         = useState<AppUser | null>(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        // Load role + profile from Firestore
        const snap = await getDoc(doc(db, COLLECTIONS.USERS, fbUser.uid));
        if (snap.exists()) {
          setUser(snap.data() as AppUser);
        } else {
          // User exists in Auth but not Firestore — treat as no access
          setUser(null);
          await signOut(auth);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred   = await signInWithEmailAndPassword(auth, email, password);
    const snap   = await getDoc(doc(db, COLLECTIONS.USERS, cred.user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      throw new Error('Account not found. Contact your supervisor.');
    }
    const appUser = snap.data() as AppUser;
    if (!appUser.active) {
      await signOut(auth);
      throw new Error('Account is deactivated. Contact your supervisor.');
    }
    setUser(appUser);
  };

  const logOut = async () => {
    await signOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
