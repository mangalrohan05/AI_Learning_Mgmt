import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI LMS — AI-Powered Learning Management System',
  description: 'Upload study material, chat with your documents, and learn smarter with AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ClerkProvider>
          {children}
          <Toaster richColors position="top-right" theme="dark" />
        </ClerkProvider>
      </body>
    </html>
  );
}
