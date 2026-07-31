import type { Metadata } from 'next';
import { Geist, Geist_Mono, Manrope, Outfit } from 'next/font/google';
import './globals.css';
import { ActionGuard } from '@/components/action-guard';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

const manropeHeading = Manrope({
  subsets: ['latin'],
  variable: '--font-heading',
});

const outfit = Outfit({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OSSPlay Dashboard',
  description: 'Self-hosted object storage & file management platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        'h-full',
        'antialiased',
        geistSans.variable,
        geistMono.variable,
        'font-sans',
        outfit.variable,
        manropeHeading.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster />
          <ActionGuard />
        </Providers>
      </body>
    </html>
  );
}
