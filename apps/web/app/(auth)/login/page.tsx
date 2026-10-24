import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
