import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '../AuthForm';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
