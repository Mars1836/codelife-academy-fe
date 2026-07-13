import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-header',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  title: 'CodeLife Academy - Nền Tảng Tự Học Kiến Thức Lập Trình & Hệ Thống',
  description: 'Trang web học tập trực quan và hiện đại về Kiến trúc Hệ thống, Cơ sở dữ liệu, DevOps, Thuật toán và Bảo mật dành cho lập trình viên chuyên nghiệp.',
  keywords: 'CodeLife, Học lập trình, Kiến trúc hệ thống, Database, PostgreSQL, Kafka, Redis, Docker, Kubernetes, DSA, SOLID, OWASP',
};

export default function RootLayout({ children }) {
  return (
    <html 
      lang="vi" 
      data-theme="dark" 
      className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
