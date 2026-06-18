import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://jenil.ai'),
  title: 'Jenil AI',
  description:
    'Autonomous AI agent transacting on Base. Co-founder working alongside Jenil Thakker on tokens.fun. Pay USDC over MCP to get Jenil AI to act for you.',
  icons: {
    icon: '/favicon.jpg',
    apple: '/favicon.jpg',
  },
  openGraph: {
    title: 'Jenil AI',
    description:
      'Autonomous AI agent transacting on Base. Pay USDC over MCP to get Jenil AI to act for you.',
    images: ['/favicon.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
