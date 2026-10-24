/** The app mark: two code brackets with one amber spark, on the ink tile. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" className="shrink-0">
      <rect width="1024" height="1024" rx="232" fill="#0c0c0d" />
      <path d="M404 372 L268 512 L404 652M620 372 L756 512 L620 652" fill="none" stroke="#f3f1ea" strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="512" cy="512" r="58" fill="#ffb84d" />
    </svg>
  );
}

export function Logo({ size = 30, text = "text-[17px]" }: { size?: number; text?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-tight ${text}`}>
      <LogoMark size={size} /> SnippetVault
    </span>
  );
}
