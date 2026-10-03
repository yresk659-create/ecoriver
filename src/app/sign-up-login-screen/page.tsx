import React from 'react';
import { AuthProvider } from '@/lib/authContext';
import AuthForm from './components/AuthForm';

interface SignUpLoginPageProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function SignUpLoginPage({ searchParams }: SignUpLoginPageProps) {
  const { mode } = await searchParams;
  const initialTab = mode === 'signup' ? 'signup' : 'login';

  return (
    <AuthProvider>
      <AuthForm initialTab={initialTab} />
    </AuthProvider>
  );
}
