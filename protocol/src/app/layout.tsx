import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SENTRI Protocol',
  description: 'The SENTRI email phishing detection application.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
