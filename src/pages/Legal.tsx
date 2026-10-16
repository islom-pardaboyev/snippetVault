import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogoMark } from "../components/Logo";
import { ADMIN_EMAIL } from "../lib/admin";

/**
 * Privacy Policy and Terms of Service. Public routes (rendered outside the auth gate — a
 * logged-out visitor must be able to read them before signing up). Typography reuses the
 * `.note-page .note-prose` scale so the documents read exactly like a SnippetVault Page.
 */

const UPDATED = "October 16, 2026";

type TocItem = { id: string; label: string };

/** Contact for data requests and legal questions — the configured operator address. */
function Contact() {
  if (ADMIN_EMAIL) return <a href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a>;
  return <span>the contact address published with the Service</span>;
}

function Shell({ title, toc, children }: { title: string; toc: TocItem[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const other = pathname === "/privacy" ? { to: "/terms", label: "Terms of Service" } : { to: "/privacy", label: "Privacy Policy" };
  const isPrivacy = pathname === "/privacy";

  useEffect(() => { document.title = `${title} · SnippetVault`; }, [title]);

  const navLink = (to: string, label: string, active: boolean) => (
    <Link to={to} aria-current={active ? "page" : undefined}
      className={`rounded-lg px-2.5 py-1.5 transition ${active ? "text-accent" : "text-muted hover:text-ink"}`}>
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[840px] items-center gap-3 px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-[15px] font-bold tracking-tight">SnippetVault</span>
          </Link>
          <nav aria-label="Legal documents" className="ml-auto flex items-center gap-1 text-[13.5px] font-semibold">
            {navLink("/privacy", "Privacy", isPrivacy)}
            {navLink("/terms", "Terms", !isPrivacy)}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[840px] px-4 pb-24 pt-9">
        <h1 className="text-[clamp(28px,5vw,38px)] font-bold tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[13px] text-faint">Last updated {UPDATED}</p>

        <nav aria-label="On this page" className="mt-6 rounded-card border border-line bg-surface p-4 sm:p-5">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[.12em] text-faint">On this page</p>
          <ul className="grid gap-y-1.5 text-[13.5px] sm:grid-cols-2 sm:gap-x-6">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="text-muted underline-offset-4 transition hover:text-ink hover:underline">{t.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="note-page mt-8">
          <article className="note-prose">{children}</article>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[13.5px]">
          <Link to={other.to} className="text-muted underline underline-offset-4 hover:text-ink">{other.label} →</Link>
          <Link to="/" className="text-muted underline underline-offset-4 hover:text-ink">Back to SnippetVault</Link>
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ privacy */

const PRIVACY_TOC: TocItem[] = [
  { id: "overview", label: "1. Overview" },
  { id: "collected", label: "2. Information we collect" },
  { id: "usage", label: "3. How we use information" },
  { id: "encryption", label: "4. Encryption & what “private” means" },
  { id: "sharing", label: "5. When information is shared" },
  { id: "retention", label: "6. Retention & deletion" },
  { id: "rights", label: "7. Your rights" },
  { id: "transfers", label: "8. International transfers" },
  { id: "children", label: "9. Children" },
  { id: "security", label: "10. Security" },
  { id: "cookies", label: "11. Cookies & local storage" },
  { id: "changes", label: "12. Changes to this policy" },
  { id: "contact", label: "13. Contact" },
];

export function Privacy() {
  return (
    <Shell title="Privacy Policy" toc={PRIVACY_TOC}>
      <p>
        <strong>The short version:</strong> SnippetVault stores what you put into it — no ads, no
        analytics SDKs, no tracking, no selling data. Everything you save in the <strong>Vault</strong> is
        encrypted on your device before it ever reaches a server, so nobody but you can read it.
      </p>

      <h2 id="overview">1. Overview</h2>
      <p>
        This Privacy Policy explains how SnippetVault (“the Service”, “we”, “us”) collects, uses,
        stores and protects information when you use our website, the installed app (PWA), and every
        feature: your account, your library of snippets and Pages, public share links, the optional
        encrypted Vault, the in-browser code runner, and offline sync.
      </p>
      <p>
        By creating an account or using the Service you agree to this policy, together with our{" "}
        <Link to="/terms">Terms of Service</Link>. If you do not agree, please do not use the Service.
      </p>

      <h2 id="collected">2. Information we collect</h2>
      <p><strong>Account information.</strong> Your email address; your display name and profile picture if you use third-party sign-in; and authentication records (sign-in times, sign-in provider) managed by our authentication service. Your password is converted into a salted cryptographic hash by that service — we never receive, store, or are able to see your password.</p>
      <p><strong>Your content.</strong> Everything you create in the Service: snippets (title, description, code, notes, Pages/rich-text documents, tags, groups, favourites), images you attach, version history used by the Restore feature, and created/updated timestamps.</p>
      <p><strong>Images.</strong> Images attached to ordinary snippets are stored inside your library data. Images used in the Vault are encrypted on your device first, then (optionally) uploaded to an image host as ciphertext, together with the deletion token that lets you remove them later.</p>
      <p><strong>Public share links.</strong> When you create a link we store: a random link token, the title and kind (snippet or group), your account id, creation time, an optional expiry time, and a view counter. The shared content itself is your existing snippet, rendered read-only.</p>
      <p><strong>The Vault.</strong> Ciphertext, initialization vectors, your KDF salt and iteration count, wrapped data keys, recovery material, and limited bookkeeping metadata (identifiers, item type, timestamps). Your passphrase and the keys derived from it never leave your device.</p>
      <p><strong>Device preferences &amp; local storage.</strong> Theme/accent choices, app-lock configuration and attempt state, recent searches, an offline copy of your data (IndexedDB/localStorage) so the app keeps working without a connection, and the service-worker cache of app files.</p>
      <p><strong>Service logs.</strong> Our infrastructure providers (our database and authentication provider, and our hosting provider) automatically process standard technical request data — IP address, browser/device type, requested pages, timestamps, and error reports — to deliver, secure, and debug the Service. We do not use this data for profiling.</p>
      <p><strong>What we do not collect:</strong> advertising identifiers, analytics or tracking SDKs, behavioural profiles, contacts, precise location, camera or microphone access (beyond images you deliberately attach), and payment information — the Service is free.</p>

      <h2 id="usage">3. How we use information</h2>
      <ul>
        <li>To provide the Service: realtime sync across your devices, offline access, search, rendering of your snippets and Pages, code sharing, and the Vault.</li>
        <li>To create, display, count, and expire the public links <em>you</em> choose to create.</li>
        <li>To manage your account: sign-in, password reset, settings, and support replies.</li>
        <li>To secure the Service: access rules that keep each account’s data private, abuse/spam prevention, debugging and reliability monitoring.</li>
        <li>To comply with applicable law and lawful requests.</li>
      </ul>
      <p>We do <strong>not</strong> use your content for advertising, do not sell or rent information, and do not use your snippets to train machine-learning models.</p>

      <h2 id="encryption">4. Encryption &amp; what “private” means</h2>
      <p>
        <strong>The Vault is end-to-end encrypted.</strong> Your passphrase is stretched on your device
        with PBKDF2-HMAC-SHA-256 (600,000 iterations) and used to wrap a random key; all vault contents
        (titles, code, notes, images, version history) are then encrypted with AES-256-GCM before upload.
        The server stores only ciphertext. We cannot decrypt your vault, cannot read your passphrase, and
        therefore cannot recover vault contents if you lose both your passphrase and your recovery key.
      </p>
      <p>
        <strong>Ordinary snippets are not end-to-end encrypted.</strong> They are stored readably so they
        can sync, search, and render everywhere, and are protected by authentication plus per-user
        security rules: only your account can read them, and only people you hand a share link to can see
        a shared item. If a secret truly must be unreadable by anyone else, keep it in the Vault.
      </p>

      <h2 id="sharing">5. When information is shared</h2>
      <p>We share information only with processors needed to run the Service:</p>
      <ul>
        <li><strong>Authentication &amp; database provider</strong> — stores your account and data under that provider’s privacy policy and data-processing terms.</li>
        <li><strong>Hosting provider</strong> — serves the app files and sees standard request logs.</li>
        <li><strong>Image host</strong> — receives only encrypted vault images and their deletion token; it never sees readable content or your account.</li>
        <li><strong>Content delivery network</strong> — delivers the runtime used by the in-browser Python runner; receives only ordinary script-request logs.</li>
        <li><strong>Legal requirement</strong> — if we are compelled by law, court order, or to protect the rights and safety of others.</li>
        <li><strong>Business transfer</strong> — if the Service is ever transferred in a merger or acquisition, this policy continues to apply unless you are notified otherwise.</li>
      </ul>
      <p>Additionally, content you deliberately expose through a share link is visible to whoever receives that link — see section 6 of the <Link to="/terms">Terms</Link>.</p>

      <h2 id="retention">6. Retention &amp; deletion</h2>
      <ul>
        <li>Your data is kept for as long as your account exists. You can delete individual snippets, shares, or the whole Vault at any time.</li>
        <li><strong>Deleting your account</strong> removes your authentication record and erases your app data: snippets, Pages, images, groups, versions, vault entries and share links. Deletion is permanent and cannot be undone — request a copy of your data first (section 7).</li>
        <li><strong>Revoked or expired share links</strong> become unreadable immediately (enforced server-side, not just hidden in the app).</li>
        <li>Service logs are retained by infrastructure providers for their operational periods.</li>
      </ul>

      <h2 id="rights">7. Your rights</h2>
      <p>
        Depending on where you live (GDPR, UK GDPR, CCPA/CPRA and similar laws), you may have the right
        to access, correct, delete, or export your personal data; to restrict or object to processing; to
        withdraw consent; and to lodge a complaint with a supervisory authority.
      </p>
      <p>
        To exercise any of these, email <Contact />. We respond within the deadline your law requires
        (30 days under the GDPR). You can also delete your account yourself, which performs most of
        these requests immediately.
      </p>

      <h2 id="transfers">8. International transfers</h2>
      <p>
        Our providers operate global infrastructure; your data may be processed in countries other than
        yours. Where personal data is transferred internationally, transfers rely on safeguards such as
        standard contractual clauses or adequacy decisions provided by the processor (each provider’s
        data-processing terms and equivalent contractual safeguards).
      </p>

      <h2 id="children">9. Children</h2>
      <p>
        The Service is not directed at children under 13 (or the higher age of digital consent in your
        country). We do not knowingly collect data from children. If you believe a child has provided us
        data, email <Contact /> and we will delete it.
      </p>

      <h2 id="security">10. Security</h2>
      <p>
        We protect the Service with encryption in transit (TLS), strict server-side access rules,
        client-side encryption for the Vault, a sandboxed code runner, and a Content-Security-Policy.
        The optional app lock is a privacy screen for an unlocked device — it is not an account security
        boundary. No method of transmission or storage is 100% secure: choose a strong, unique password,
        store your Vault recovery key somewhere safe, and treat share links like keys.
      </p>

      <h2 id="cookies">11. Cookies &amp; local storage</h2>
      <p>
        We do not use advertising or analytics cookies. Essential storage only: your sign-in session
        (held in your browser’s local storage), theme and app-lock preferences, recent searches, your
        offline data cache, and the service-worker cache that makes the app start instantly. A
        third-party sign-in popup may set cookies under that provider’s own policy. You can clear local
        data at any time in your browser settings — doing so removes your offline copy (your server data
        stays).
      </p>

      <h2 id="changes">12. Changes to this policy</h2>
      <p>
        We may update this policy; the “Last updated” date at the top always reflects the current
        version, which is published on this page. Material changes will be announced in the app with
        reasonable notice. Continued use after an update means you accept the revised policy.
      </p>

      <h2 id="contact">13. Contact</h2>
      <p>
        Questions, data requests, or concerns about privacy: <Contact />.
      </p>
    </Shell>
  );
}

/* -------------------------------------------------------------------- terms */

const TERMS_TOC: TocItem[] = [
  { id: "acceptance", label: "1. Acceptance of terms" },
  { id: "service", label: "2. The service" },
  { id: "accounts", label: "3. Accounts" },
  { id: "acceptable-use", label: "4. Acceptable use" },
  { id: "your-content", label: "5. Your content" },
  { id: "public-links", label: "6. Public share links" },
  { id: "vault", label: "7. The Vault & lost access" },
  { id: "runner", label: "8. The code runner" },
  { id: "third-parties", label: "9. Third-party services" },
  { id: "disclaimers", label: "10. Service changes & disclaimers" },
  { id: "liability", label: "11. Limitation of liability" },
  { id: "indemnity", label: "12. Indemnity" },
  { id: "termination", label: "13. Suspension & termination" },
  { id: "changes", label: "14. Changes to these terms" },
  { id: "disputes", label: "15. Governing law & disputes" },
  { id: "general", label: "16. General" },
  { id: "contact", label: "17. Contact" },
];

export function Terms() {
  return (
    <Shell title="Terms of Service" toc={TERMS_TOC}>
      <p>
        These Terms of Service (“Terms”) are a binding agreement between you and SnippetVault (“the
        Service”, “we”, “us”). Please read them together with our{" "}
        <Link to="/privacy">Privacy Policy</Link>, which is incorporated by reference.
      </p>

      <h2 id="acceptance">1. Acceptance of terms</h2>
      <p>
        By accessing or using the Service — including browsing it, creating an account, saving
        snippets, or opening a share link — you agree to these Terms and the Privacy Policy. If you do
        not agree, do not use the Service. If you use the Service on behalf of an organisation, you
        represent that you have authority to bind that organisation.
      </p>

      <h2 id="service">2. The service</h2>
      <p>
        SnippetVault is a personal snippet manager: a searchable library of code snippets and Pages with
        tags, groups, favourites, images, version history, realtime sync across devices, offline access,
        installable-app (PWA) support, read-only public share links, an optional client-side encrypted
        Vault, and an in-browser runner for JavaScript, TypeScript and Python. The Service is currently
        provided free of charge. Features may be added, changed, or removed at any time (section 10).
      </p>

      <h2 id="accounts">3. Accounts</h2>
      <ul>
        <li>You must be at least 13 years old, or the age of digital consent in your country, whichever is higher, and legally able to enter this agreement (or have guardian consent).</li>
        <li>Provide an accurate, working email address — it is used for sign-in, password reset, and service notices.</li>
        <li>You are responsible for keeping your credentials secret and for all activity under your account. Keep your Vault passphrase and recovery key safe; we cannot recover them (section 7).</li>
        <li>Tell us promptly at <Contact /> if your account is accessed without permission.</li>
        <li>We may suspend accounts that create a security, legal, or abuse risk while we investigate.</li>
      </ul>

      <h2 id="acceptable-use">4. Acceptable use</h2>
      <p>You agree not to, and not to attempt to:</p>
      <ul>
        <li>use the Service for any unlawful purpose, or to store or share content you have no right to use (infringing, malicious, or others’ private information);</li>
        <li>upload malware, or use the Service to attack, scan, or interfere with any system;</li>
        <li>interfere with or unduly burden the Service — including circumventing access controls, security rules, rate limits, or the Vault’s encryption;</li>
        <li>reverse engineer or resell the Service except where the law expressly permits it;</li>
        <li>use the Service to spam, harass, or impersonate others;</li>
        <li>use the code runner against systems you do not own or have permission to test;</li>
        <li>break the terms of third-party services you connect (e.g. your image-host account).</li>
      </ul>

      <h2 id="your-content">5. Your content</h2>
      <p>
        <strong>You keep ownership</strong> of everything you put into the Service. You grant us a
        worldwide, non-exclusive, royalty-free licence to host, store, process, reproduce, and display
        your content solely as needed to operate the Service — syncing your library, rendering your
        pages, restoring versions, and serving the share links <em>you</em> create. You are responsible
        for your content and for the consequences of sharing it, and you confirm you have the rights
        needed to store it. We may remove content that violates law or these Terms, with notice where
        reasonably possible.
      </p>

      <h2 id="public-links">6. Public share links</h2>
      <p>
        A share link is <strong>anyone-with-the-URL can read</strong> until you revoke it or it expires.
        The Service counts views; it cannot prevent the person you sent it to from forwarding it. You
        control link creation, expiry, and revocation, and you are responsible for what you publish
        through one — do not share secrets or other people’s personal data. We may disable links that
        violate law or these Terms. Revoked and expired links stop being readable immediately, enforced
        on the server.
      </p>

      <h2 id="vault">7. The Vault &amp; lost access</h2>
      <p>
        The Vault is encrypted entirely on your device; we never receive your passphrase or your keys.
        We <strong>cannot decrypt, reset, or recover</strong> vault contents — if you lose both your
        passphrase and your recovery key, your vault data is permanently unrecoverable, and that is not a
        defect or a breach of duty by us. Store your recovery key somewhere safe and separate from your
        devices. The app lock is a visual privacy screen, not account security.
      </p>

      <h2 id="runner">8. The code runner</h2>
      <p>
        Code you run executes <strong>in your own browser</strong>, inside a sandboxed frame with no
        access to your account session, your Vault, or your stored snippets; it never runs on our
        servers, and we do not review what you execute. You are responsible for the code you run —
        review untrusted code first. The sandbox isolates your session but does not make hostile code
        harmless: treat running unknown code with the same caution you would anywhere else.
      </p>

      <h2 id="third-parties">9. Third-party services</h2>
      <p>
        The Service relies on third parties — an authentication and database provider, a hosting
        provider, an image host for encrypted vault images, and a content delivery network for the
        in-browser Python runtime. Their terms and privacy policies govern your use of them, and we
        are not responsible for their acts or omissions. References to them are for convenience, not
        endorsement.
      </p>

      <h2 id="disclaimers">10. Service changes &amp; disclaimers</h2>
      <p>
        We may modify, suspend, or discontinue any part of the Service at any time, including ending the
        Service altogether. We may also update or remove content you or others have stored, where
        required for operation, security, or law.
      </p>
      <p>
        The Service is provided <strong>“as is” and “as available”</strong>, without warranties of any
        kind, express or implied — including warranties of merchantability, fitness for a particular
        purpose, accuracy (snippets and syntax highlighting are provided for convenience; review before
        you rely on them), non-infringement, uninterrupted or error-free operation, offline
        availability, or that data will never be lost or compromised. Some jurisdictions do not allow
        these exclusions, so they apply only to the extent the law permits.
      </p>

      <h2 id="liability">11. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we will not be liable for indirect, incidental,
        special, consequential, or punitive damages, or for loss of profits, business, goodwill, or data
        — even if advised of the possibility. Our total aggregate liability arising out of the Service
        will not exceed the greater of the amounts you paid us in the twelve months before the claim
        (currently zero, as the Service is free) or ten US dollars ($10). Nothing in these Terms limits
        liability that cannot be limited by law, including liability for fraud or wilful misconduct.
      </p>

      <h2 id="indemnity">12. Indemnity</h2>
      <p>
        You agree to indemnify and hold us harmless from claims, losses, and expenses (including
        reasonable legal fees) arising from your content, your use of the Service, or your violation of
        these Terms, to the extent permitted by law.
      </p>

      <h2 id="termination">13. Suspension &amp; termination</h2>
      <p>
        You may delete your account at any time from Settings — this permanently erases your data (see
        the Privacy Policy). We may suspend or terminate access if you violate these Terms, create a
        security or legal risk, or if required by law. On termination, provisions that by their nature
        should survive (ownership, disclaimers, liability limits, indemnity, disputes) survive.
      </p>

      <h2 id="changes">14. Changes to these terms</h2>
      <p>
        We may update these Terms; the current version and its effective date are always published on
        this page. Material changes will be announced in the Service with reasonable notice. Continued
        use after the effective date means you accept the changes. If you do not agree, stop using the
        Service and delete your account.
      </p>

      <h2 id="disputes">15. Governing law &amp; disputes</h2>
      <p>
        First, contact <Contact /> — most issues are resolved informally. If they are not, these Terms
        are governed by the laws of the jurisdiction where the operator of the Service is established,
        without regard to conflict-of-law rules, except that mandatory consumer-protection laws of your
        country of residence continue to apply. Any dispute must be brought within the limitation
        period the law allows.
      </p>

      <h2 id="general">16. General</h2>
      <ul>
        <li>These Terms, together with the Privacy Policy, are the entire agreement about the Service.</li>
        <li>If any provision is found unenforceable, the rest stays in effect; our failure to enforce a provision is not a waiver.</li>
        <li>We may assign these Terms in connection with a merger, acquisition, or sale of assets; you may not assign them without our consent.</li>
        <li>No third-party beneficiaries; headings are for convenience only.</li>
      </ul>

      <h2 id="contact">17. Contact</h2>
      <p>Questions about these Terms: <Contact />.</p>
    </Shell>
  );
}
