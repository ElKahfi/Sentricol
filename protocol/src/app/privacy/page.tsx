import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy | SENTRI Protocol',
  description: 'How SENTRI Protocol handles Gmail data.',
}

export default function PrivacyPage() {
  return <main className="shell policy-page">
    <header className="topbar"><div className="brand">SENTRI <span>/ PROTOCOL</span></div><a href="/">BACK TO PROTOCOL</a></header>
    <section className="intro"><p className="eyebrow">DATA USE / GMAIL</p><h1>Privacy policy</h1><p className="lead">How SENTRI Protocol accesses and handles your Gmail data.</p></section>
    <article className="panel policy-content">
      <p>Last updated: 3 October 2026</p>
      <h2>Contact</h2>
      <p>SENTRI Protocol can be contacted at <a href="mailto:muhammadrafandi07@gmail.com">muhammadrafandi07@gmail.com</a> about access to or deletion of Protocol data.</p>
      <h2>What Protocol accesses</h2>
      <p>With your Google authorization, Protocol uses the Gmail read-only permission to retrieve the 20 newest messages in your Inbox. It reads message identifiers, sender and reply-to addresses, subject, date, body text, attachment names, and Gmail authentication information needed for sender checks. It does not read attachment contents, send mail, modify mail, or change Gmail labels.</p>
      <h2>How the data is used</h2>
      <p>Protocol checks approved sender addresses and Gmail authentication results. Other messages are sent through the Protocol application server to its configured Qwen model service for phishing analysis. Protocol displays a category, supporting evidence, and recommended next steps to you. The analysis is advisory and does not block actions in Gmail. Protocol does not use Gmail data for advertising or sell it.</p>
      <h2>Where information is stored and shared</h2>
      <p>Message content and analysis results are cached in encrypted form in this browser profile. A browser-held key allows Protocol to read that cache; it is not end-to-end encryption against Protocol code running in the same browser. The server holds a short-lived Google access token in memory while you are connected. Email content passes through the application server and the configured model service for analysis. Protocol does not send message subjects, sender addresses, bodies, attachments, or Google tokens to the company admin. For risky results, Deployment receives the employee account, risk level, detection time, and a derived message identifier. An encrypted server-side retry queue can retain those alert details until delivery.</p>
      <h2>Retention and your choices</h2>
      <p>Protocol keeps cached content for the current 20-message Inbox window and removes older message content from that cache as the window changes. You can disconnect Google access in Protocol. You can also remove Protocol from your Google Account connections and clear this site's browser data to delete the local cache and key. Disconnecting does not automatically remove an existing browser cache or company risk alerts. Contact us about company-held alert records or other deletion requests.</p>
      <h2>Security and limits</h2>
      <p>Protocol uses HTTPS for its public site and encrypts its local cache. Access to an Inbox requires a matching active employee account in SENTRI Deployment. No classification guarantees that a message is safe. This policy applies to Protocol's use of Google user data; your use of Gmail remains subject to Google's own terms and privacy practices.</p>
    </article>
  </main>
}
