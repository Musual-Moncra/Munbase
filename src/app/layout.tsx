import type {Metadata} from 'next';
import './globals.css';
import {ThemeProvider} from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Munbase — Chợ tuyển chọn từ Việt Nam',
  description: 'Khám phá sản phẩm Việt Nam và gặp gỡ những người làm ra chúng.'
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="vi" suppressHydrationWarning data-scroll-behavior="smooth"><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
