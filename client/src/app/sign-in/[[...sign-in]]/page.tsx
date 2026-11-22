import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading sign in...</div>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
