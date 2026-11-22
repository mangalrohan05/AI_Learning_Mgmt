import { SignUp } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading sign up...</div>}>
        <SignUp />
      </Suspense>
    </main>
  );
}
