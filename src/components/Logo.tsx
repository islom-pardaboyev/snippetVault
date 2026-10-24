import { Icon } from "./Icon";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[9px] bg-accent text-accent-ink"
      style={{ width: size, height: size }}
    >
      <Icon name="code" size={Math.round(size * 0.6)} className="[stroke-width:2.4]" />
    </span>
  );
}

export function Logo({ size = 30, text = "text-[17px]" }: { size?: number; text?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-bold tracking-tight ${text}`}>
      <LogoMark size={size} /> SnippetVault
    </span>
  );
}
