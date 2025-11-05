import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mockup Generator - Component Preview',
  description: 'Preview and screenshot React/React Native components',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
