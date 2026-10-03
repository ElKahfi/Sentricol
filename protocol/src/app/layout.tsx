import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SENTRI Protocol',
  description: 'The SENTRI email phishing detection application.',
  verification: { google: 'gWTI-qz5u85IUsrGDgVPmPDJld7Si0xTO9ALSq_FBuw' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
