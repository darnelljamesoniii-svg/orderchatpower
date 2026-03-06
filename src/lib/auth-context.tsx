'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { auth, db } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import type { AppUser } from '@/types';

interface AuthContextValue {
  user: AppUser | null;
  firebaseUser: import('firebase/auth').User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  firebaseUser: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] =
    useState<import('firebase/auth').User | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        const snap = await getDoc(doc(db, COLLECTIONS.USERS, fbUser.uid));

        if (snap.exists()) {
          setUser(snap.data() as AppUser);
        } else {
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
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      console.log('LOGIN EMAIL:', email);
      console.log('AUTH UID:', cred.user.uid);

      const userRef = doc(db, COLLECTIONS.USERS, cred.user.uid);
      console.log('LOOKING IN PATH:', userRef.path);

      const snap = await getDoc(userRef);
      console.log('USER DOC EXISTS:', snap.exists());
      console.log('USER DOC DATA:', snap.data());

      if (!snap.exists()) {
        await signOut(auth);
        throw new Error(`Account not found for uid: ${cred.user.uid}`);
      }

      const appUser = snap.data() as AppUser;

      if (!appUser.active) {
        await signOut(auth);
        throw new Error('Account is deactivated. Contact your supervisor.');
      }

      setUser(appUser);
    } catch (err) {
      console.error('SIGNIN ERROR:', err);
      throw err;
    }
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
