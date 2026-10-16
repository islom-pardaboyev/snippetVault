import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LangIcon } from "../components/LangIcon";
import { CodeBlock } from "../components/CodeBlock";
import { ImageGallery } from "../components/ImageGallery";
import { CopyMenu } from "../components/CopyMenu";
import { useModal } from "../components/Modal";
import { PwMeter, passwordValid } from "../components/PwMeter";
import { NoteView } from "../components/RichNote";
import { dropNoteImage, hasNoteText, noteImageIds, noteText } from "../lib/note";
import { useToast } from "../hooks/ui";
import { useVault } from "../hooks/vault";
import { useCopySnippet } from "../hooks/useCopy";
import { copyText, downloadFile, isPage, timeAgo } from "../lib/utils";
import { highlightLines } from "../lib/highlight";
import { DecryptionError } from "../lib/crypto";
import { hasImgbb } from "../lib/imgbb";
import type { SnippetImage } from "../lib/types";
import type { VaultEntry } from "../lib/vault";

const INPUT = "w-full rounded-[10px] border border-line bg-surface-2 px-3 py-3 outline-none transition placeholder:text-faint focus:border-accent focus:ring-[3px] focus:ring-accent/20";

/** How many vault images are decrypted (and downloaded) per click of "Load more". */
const IMAGE_PAGE = 4;

/** `/vault` — set up, unlock and browse the encrypted vault. */
export function Vault() {
  const { available, status, entries, items, lock } = useVault();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  if (!available) {
    return (
      <Card icon="shield" title="The Vault needs an account">
        Your private, encrypted vault is stored on your account, so it isn't available in demo mode
        (the same as publishing share links). Sign in with a real account to set it up.
      </Card>
    );
  }
  if (status === "loading") return <div className="skeleton mx-auto h-64 max-w-[820px] rounded-card" />;
  if (recoveryKey) return <RecoveryCard recoveryKey={recoveryKey} onDone={() => setRecoveryKey(null)} />;
  if (status === "unset") return <SetupCard onCreated={setRecoveryKey} />;
  if (status === "locked") return <UnlockCard />;

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="flex items-center gap-2.5 text-[clamp(26px,3.2vw,36px)] font-bold leading-[1.1] tracking-[-0.04em]">
            <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent"><Icon name="shield" size={22} /></span>
            Vault
          </h1>
          <p className="mt-1 text-sm text-muted">
            {entries.length} locked item{entries.length === 1 ? "" : "s"} · decrypted only in this tab, never stored in the clear
          </p>
        </div>
        <button className="btn" onClick={lock}><Icon name="lock" size={16} /> Lock now</button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-5 py-[64px] text-center">
          <div className="mx-auto mb-[18px] grid size-[54px] place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="shield" size={26} /></div>
          <h2 className="mb-1.5 text-[22px] font-bold tracking-tight">Your vault is empty</h2>
          <p className="mx-auto mb-[22px] max-w-[44ch] text-muted">
            Open any snippet and choose <b className="text-ink">Move to Vault</b> to lock it away. Locked items are
            encrypted on this device before they reach the server.
          </p>
          <Link to="/" className="btn btn-primary btn-lg"><Icon name="library" /> Go to library</Link>
        </div>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {entries.map((e, i) => <VaultCard key={e.id} entry={e} index={i} />)}
        </div>
      )}
      <SettingsFoot items={items.length} />
    </div>
  );
}

function SettingsFoot({ items }: { items: number }) {
  const { changePassphrase } = useVault();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setErr("New passphrase needs at least 8 characters.");
    setBusy(true); setErr("");
    try {
      await changePassphrase(current, next);
      toast("Vault passphrase updated");
      setOpen(false); setCurrent(""); setNext("");
    } catch (error) {
      setErr(error instanceof DecryptionError ? "That current passphrase is wrong." : "Couldn't update the passphrase.");
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-10 rounded-card border border-line bg-surface p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[.1em] text-faint">Vault settings</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="font-semibold">Change passphrase</div>
          <div className="text-[12.5px] text-muted">{items} item{items === 1 ? "" : "s"} stay encrypted — only the passphrase that unlocks them changes.</div>
        </div>
        <button className="btn" onClick={() => { setOpen((o) => !o); setErr(""); }}>{open ? "Cancel" : "Change…"}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 grid gap-2 sm:max-w-[420px]">
          <input type="password" autoComplete="current-password" placeholder="Current passphrase" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} />
          <input type="password" autoComplete="new-password" placeholder="New passphrase (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT} />
          <PwMeter pw={next} min={8} />
          {err && <p className="text-[13px] text-danger">{err}</p>}
          <button className="btn btn-primary" disabled={busy || !current || !passwordValid(next)}>{busy ? "Updating…" : "Update passphrase"}</button>
        </form>
      )}
    </section>
  );
}

function VaultCard({ entry, index }: { entry: VaultEntry; index: number }) {
  const page = isPage(entry.language);
  const preview: string[] = page ? [] : highlightLines(entry.code.split("\n").slice(0, 6).join("\n"), entry.language);
  return (
    <Link to={`/vault/${entry.id}`} style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      className="group anim-rise flex flex-col gap-3 rounded-card border border-line bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)]">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
        <LangIcon lang={entry.language} size={17} />
        {entry.language}
        <span className="ml-auto inline-flex items-center gap-1 text-accent"><Icon name="lock" size={14} /></span>
      </div>
      <h3 className="text-[16.5px] font-bold leading-snug tracking-tight">{entry.title}</h3>
      {entry.description && <p className="-mt-1 text-[13.5px] text-muted line-clamp-2">{entry.description}</p>}
      {page ? (
        <p className="relative max-h-[118px] overflow-hidden whitespace-pre-wrap break-words rounded-[11px] border border-line bg-bg px-3 py-2.5 text-[13px] leading-[1.65] text-muted after:absolute after:inset-x-0 after:bottom-0 after:h-9 after:bg-gradient-to-b after:from-transparent after:to-bg after:content-['']">
          {noteText(entry.notes) || "Empty page"}
        </p>
      ) : (
        <pre className="relative max-h-[118px] overflow-hidden rounded-[11px] border border-line bg-bg px-3 py-2.5 font-mono text-[12px] leading-[1.65] after:absolute after:inset-x-0 after:bottom-0 after:h-9 after:bg-gradient-to-b after:from-transparent after:to-bg after:content-['']">
          <code dangerouslySetInnerHTML={{ __html: preview.join("\n") }} />
        </pre>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-faint">
        {entry.tags.slice(0, 3).map((t) => <span key={t} className="text-[12.5px] text-muted">#{t}</span>)}
        <span>{timeAgo(entry.updated_at)}</span>
        {(entry.image_count ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-muted"><Icon name="image" size={13} />{entry.image_count}</span>}
      </div>
    </Link>
  );
}

function SetupCard({ onCreated }: { onCreated(key: string): void }) {
  const { setup } = useVault();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [withRecovery, setWithRecovery] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pass.length < 8) return setErr("Use at least 8 characters.");
    if (pass !== confirm) return setErr("The two passphrases don't match.");
    setBusy(true); setErr("");
    try {
      const key = await setup(pass, withRecovery);
      if (key) onCreated(key);
    } catch {
      setErr("Couldn't create the vault. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="anim-rise mx-auto max-w-[560px]">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="shield" size={24} /></div>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">Set up your Vault</h1>
      <p className="mb-5 text-muted">
        The Vault keeps your most sensitive snippets encrypted on this device before they ever reach the
        server. Even we can't read them — only your passphrase unlocks them.
      </p>
      <form onSubmit={submit} className="grid gap-3">
        <label className="relative block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Passphrase</span>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} className={`${INPUT} pr-11`} placeholder="At least 8 characters" />
          <button type="button" aria-label={show ? "Hide" : "Show"} onClick={() => setShow((s) => !s)}
            className="absolute bottom-0 right-1.5 grid h-[46px] w-9 place-items-center text-muted hover:text-ink">
            <Icon name={show ? "eyeoff" : "eye"} size={18} />
          </button>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">Confirm passphrase</span>
          <input type={show ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={INPUT} placeholder="Type it again" />
        </label>
        <div className="rounded-[10px] border border-line bg-surface-2/60 px-3.5 py-3">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-[.1em] text-faint">Passphrase requirements</span>
          <PwMeter pw={pass} confirm={confirm} min={8} />
        </div>
        <label className="flex items-start gap-2.5 rounded-[10px] border border-line bg-surface-2 px-3 py-2.5">
          <input type="checkbox" checked={withRecovery} onChange={(e) => setWithRecovery(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span className="text-[13px] text-muted">Generate a <b className="text-ink">recovery key</b> — a one-time code to get back in if you forget the passphrase. Recommended.</span>
        </label>
        <p className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
          <b>Important:</b> nobody can reset this passphrase. Without it — and without the recovery key — the locked
          snippets are gone for good.
        </p>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy || !passwordValid(pass, confirm)}>{busy ? "Creating…" : "Create vault"}</button>
      </form>
    </div>
  );
}

function RecoveryCard({ recoveryKey, onDone }: { recoveryKey: string; onDone(): void }) {
  const toast = useToast();
  const [ack, setAck] = useState(false);
  return (
    <div className="anim-rise mx-auto max-w-[560px]">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="key" size={24} /></div>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">Save your recovery key</h1>
      <p className="mb-5 text-muted">This is shown once. Store it somewhere safe and offline — a password manager or on paper. It's the only way back in if you forget your passphrase.</p>
      <div className="break-all rounded-[14px] border border-line-strong bg-surface-2 px-4 py-4 font-mono text-[15px] tracking-wider">{recoveryKey}</div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button className="btn" onClick={async () => { if (await copyText(recoveryKey)) toast("Recovery key copied"); }}><Icon name="copy" size={16} /> Copy</button>
        <button className="btn" onClick={() => downloadFile("snippetvault-recovery-key.txt", recoveryKey + "\n")}><Icon name="download" size={16} /> Download</button>
      </div>
      <label className="mt-5 flex items-center gap-2.5">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        <span className="text-sm">I've saved my recovery key</span>
      </label>
      <button className="btn btn-primary btn-lg mt-4" disabled={!ack} onClick={onDone}>Continue to my vault</button>
    </div>
  );
}

function UnlockCard() {
  const { unlock, unlockWithRecovery, recoveryAvailable } = useVault();
  const [mode, setMode] = useState<"pass" | "recovery">("pass");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      if (mode === "pass") await unlock(value);
      else await unlockWithRecovery(value);
    } catch (error) {
      setErr(error instanceof DecryptionError ? (mode === "pass" ? "Wrong passphrase." : "That recovery key doesn't match.") : "Couldn't unlock the vault.");
    } finally { setBusy(false); }
  };

  return (
    <div className="anim-rise mx-auto max-w-[460px]">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name="lock" size={24} /></div>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">Vault locked</h1>
      <p className="mb-5 text-muted">Enter your passphrase to decrypt your snippets for this session. The vault locks again when you close or background the tab.</p>
      <form onSubmit={submit} className="grid gap-3">
        <label className="relative block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-muted">{mode === "pass" ? "Passphrase" : "Recovery key"}</span>
          <input autoFocus type={mode === "recovery" || show ? "text" : "password"} autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className={`${INPUT} pr-11`} placeholder={mode === "pass" ? "Your passphrase" : "XXXX-XXXX-…"} />
          {mode === "pass" && (
            <button type="button" aria-label={show ? "Hide" : "Show"} onClick={() => setShow((s) => !s)}
              className="absolute bottom-0 right-1.5 grid h-[46px] w-9 place-items-center text-muted hover:text-ink"><Icon name={show ? "eyeoff" : "eye"} size={18} /></button>
          )}
        </label>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy || !value}>{busy ? "Unlocking…" : "Unlock"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        {mode === "pass" && recoveryAvailable && (
          <button className="link-btn" onClick={() => { setMode("recovery"); setValue(""); setErr(""); }}>Use a recovery key instead</button>
        )}
        {mode === "recovery" && (
          <button className="link-btn" onClick={() => { setMode("pass"); setValue(""); setErr(""); }}>Back to passphrase</button>
        )}
      </div>
    </div>
  );
}

/** `/vault/:id` — a single decrypted item (read-only, with move-out and delete). */
export function VaultDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { confirm } = useModal();
  const { status, entries, moveOut, deleteEntry, loadImages, addImages, removeImage, updateEntry } = useVault();
  const copySnippet = useCopySnippet();
  const entry = entries.find((e) => e.id === id);
  const [images, setImages] = useState<SnippetImage[]>([]);
  const [page, setPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  /** Ids a note points at that turned out not to exist — never offer to decrypt those again. */
  const [unreachable, setUnreachable] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const total = entry?.image_count ?? 0;
  const pageMode = isPage(entry?.language ?? "");
  // Depend on stable scalars, not the `entry` object: `entries` is rebuilt on every vault
  // snapshot, so a new object identity would reset the gallery to page 1 on unrelated churn.
  const entryId = entry?.id;
  const entryStamp = entry?.updated_at;

  // Decrypt only the first page — each image is its own encrypted download, so the rest is
  // fetched on demand. Re-runs only when the item actually changes (id, or a new updated_at).
  useEffect(() => {
    if (!entryId) { setImages([]); return; }
    let alive = true;
    setPage(1);
    setExhausted(false);
    setUnreachable(new Set());
    setDecrypting(true);
    loadImages(entryId, 0, IMAGE_PAGE)
      .then((list) => { if (alive) setImages(list); })
      .catch(() => { if (alive) setImages([]); })
      .finally(() => { if (alive) setDecrypting(false); });
    return () => { alive = false; };
  }, [entryId, entryStamp, loadImages]);

  const loadMore = async () => {
    if (!entry) return;
    setDecrypting(true);
    try {
      const next = await loadImages(entry.id, page * IMAGE_PAGE, IMAGE_PAGE);
      setImages((prev) => [...prev, ...next]);
      // A short or empty page means there is nothing left, even if image_count says otherwise.
      if (next.length) setPage((p) => p + 1);
      else setExhausted(true);
    } catch { /* already surfaced as a stale/offline image below */ }
    finally { setDecrypting(false); }
  };

  /**
   * Decrypt the images a note points at. Only the first page is decrypted on load, so a note can
   * reference an image that hasn't arrived yet — this walks the pages until they are all here.
   */
  const decryptNoteImages = async (wanted: string[]) => {
    if (!entry) return;
    setDecrypting(true);
    let list = images;
    let next = page;
    let stop = false;
    try {
      while (!stop && !wanted.every((id) => list.some((im) => im.id === id))) {
        const more = await loadImages(entry.id, next * IMAGE_PAGE, IMAGE_PAGE);
        if (!more.length) stop = true;
        else { list = [...list, ...more]; next += 1; }
      }
    } catch { /* offline or stale — the gallery above says so */ }
    setImages(list);
    if (next !== page) setPage(next);
    if (stop) {
      setExhausted(true);
      // Walking every page found nothing: the picture is gone, not merely still encrypted.
      setUnreachable((g) => new Set([...g, ...wanted.filter((id) => !list.some((im) => im.id === id))]));
    }
    setDecrypting(false);
  };

  const onAdd = async (files: File[]) => {
    if (!entry) return;
    setBusy(true);
    try {
      const { added, error } = await addImages(entry.id, files);
      if (added) toast(`Added ${added} image${added === 1 ? "" : "s"}`);
      if (error) toast(error, { kind: "err" });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't add the images", { kind: "err" });
    } finally { setBusy(false); }
  };

  const onRemoveImage = async (imageId: string) => {
    if (!entry) return;
    setBusy(true);
    try {
      await removeImage(entry.id, imageId);
      setImages((prev) => prev.filter((im) => im.id !== imageId));
    } catch {
      toast("Couldn't delete that image", { kind: "err" });
      setBusy(false);
      return;
    }
    // A note can show this image — drop the reference with the picture, so it never lingers.
    const notes = dropNoteImage(entry.notes, imageId);
    if (notes !== (entry.notes ?? "")) {
      try { await updateEntry({ ...entry, notes }); }
      catch { toast("Image deleted — but the note still refers to it", { kind: "err" }); }
    }
    setBusy(false);
  };

  // A locked vault (e.g. after a reload) sends you back to unlock first.
  if (status !== "unlocked") {
    return (
      <div className="mx-auto max-w-[560px] py-10 text-center">
        <p className="mb-4 text-muted">This item is locked.</p>
        <Link to="/vault" className="btn btn-primary"><Icon name="lock" size={16} /> Unlock the vault</Link>
      </div>
    );
  }
  if (!entry) return <Card icon="shield" title="Not in the vault">This item isn't in your vault (it may have been moved out).</Card>;

  const out = async () => {
    if (!(await confirm({ title: "Move out of the vault?", description: "It becomes a normal snippet again, stored unencrypted. Only do this once the snippet no longer needs to be secret.", confirmLabel: "Move out" }))) return;
    setBusy(true);
    try { await moveOut(entry.id); toast("Moved out of the vault"); nav("/vault"); }
    catch { toast("Couldn't move it out", { kind: "err" }); setBusy(false); }
  };
  const del = async () => {
    if (!(await confirm({ title: `Delete “${entry.title}”?`, description: "This permanently removes the encrypted item. It can't be undone.", confirmLabel: "Delete", danger: true }))) return;
    setBusy(true);
    try { await deleteEntry(entry.id); toast("Deleted from the vault"); nav("/vault"); }
    catch { toast("Couldn't delete it", { kind: "err" }); setBusy(false); }
  };

  // Images the note shows that this page hasn't decrypted yet (only the first page is loaded).
  const missingNoteImages = noteImageIds(entry.notes)
    .filter((nid) => !images.some((im) => im.id === nid) && !unreachable.has(nid));

  return (
    <div className="anim-rise mx-auto max-w-[1240px]">
      <Link to="/vault" className="mb-4 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="back" /> Vault</Link>
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2.5 text-[clamp(26px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.045em]">{entry.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[13.5px] text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12.5px] font-semibold text-ink"><LangIcon lang={entry.language} size={16} />{entry.language}</span>
            <span className="inline-flex items-center gap-1 text-accent"><Icon name="lock" size={14} /> encrypted</span>
            {entry.tags.map((t) => <span key={t}>#{t}</span>)}
            <span>updated {timeAgo(entry.updated_at)}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <CopyMenu snippet={entry} onRawCopy={() => copySnippet({ id: entry.id, title: entry.title, language: entry.language, code: entry.code, notes: entry.notes, favorite: entry.favorite, tags: entry.tags, description: entry.description, created_at: entry.created_at, updated_at: entry.updated_at })} className="flex-1 md:flex-none" />
          <button className="btn" disabled={busy} onClick={out}><Icon name="unlock" size={16} /> Move out</button>
          <button className="btn btn-icon btn-danger" aria-label="Delete" title="Delete" disabled={busy} onClick={del}><Icon name="trash" size={16} /></button>
        </div>
      </div>

      {entry.description && <p className="mt-[18px] max-w-[70ch] text-base text-muted">{entry.description}</p>}

      {pageMode ? (
        <div className="mt-[22px]">
          {hasNoteText(entry.notes) ? (
            <article className="rounded-card border border-line bg-surface px-5 py-6 sm:px-8 sm:py-8">
              <NoteView html={entry.notes} images={images} className="note-page" />
              {missingNoteImages.length > 0 && (
                <button className="btn mt-4 !h-8 !px-3 text-[12.5px]" onClick={() => decryptNoteImages(missingNoteImages)} disabled={decrypting}>
                  <Icon name="image" size={15} />
                  {decrypting ? "Decrypting…" : `Decrypt ${missingNoteImages.length} image${missingNoteImages.length === 1 ? "" : "s"} used in this page`}
                </button>
              )}
            </article>
          ) : (
            <div className="rounded-card border border-dashed border-line px-5 py-10 text-center text-[14px] text-muted">This encrypted page is empty.</div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-[22px]">
            <CodeBlock code={entry.code} lang={entry.language} title={entry.title} />
          </div>

          {hasNoteText(entry.notes) && (
            <div className="mt-6 rounded-card border border-line bg-surface p-5">
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[.1em] text-faint">Notes</h2>
              <NoteView html={entry.notes} images={images} />
              {missingNoteImages.length > 0 && (
                <button className="btn mt-3 !h-8 !px-3 text-[12.5px]" onClick={() => decryptNoteImages(missingNoteImages)} disabled={decrypting}>
                  <Icon name="image" size={15} />
                  {decrypting ? "Decrypting…" : `Decrypt ${missingNoteImages.length} image${missingNoteImages.length === 1 ? "" : "s"} used in this note`}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[.1em] text-faint">
          Images{total > 0 ? ` · ${images.length} of ${total} decrypted` : ""}
        </h2>
        <ImageGallery
          images={images}
          max={Infinity}
          busy={busy || decrypting}
          onAdd={onAdd}
          onRemove={onRemoveImage}
          hint={hasImgbb()
            ? "Unlimited · each image is encrypted here, then hosted off-Firestore and verified after upload."
            : "Unlimited, stored inline in Firestore. Add `IMB_API` to .env to host vault images on imgbb instead."}
        />
        {images.length < total && !exhausted && (
          <button className="btn mt-3" onClick={loadMore} disabled={decrypting}>
            <Icon name="download" size={16} />
            {decrypting ? "Decrypting…" : `Load more (${total - images.length} left)`}
          </button>
        )}
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: "shield" | "lock"; title: string; children: ReactNode }) {
  return (
    <div className="anim-rise mx-auto max-w-[560px]">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent/15 text-accent"><Icon name={icon} size={24} /></div>
      <h1 className="mb-1.5 text-[26px] font-bold tracking-tight">{title}</h1>
      <p className="text-muted">{children}</p>
      <Link to="/" className="btn mt-5"><Icon name="library" size={16} /> Back to library</Link>
    </div>
  );
}
