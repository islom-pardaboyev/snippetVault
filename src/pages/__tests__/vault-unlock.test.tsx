// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecryptionError } from "../../lib/crypto";
import { ModalProvider } from "../../components/Modal";
import { Vault } from "../Vault";

/**
 * The locked-vault screen, on a real (jsdom) DOM with the vault hook mocked. These cover the two
 * escape routes for a forgotten passphrase: resetting it from the recovery key, and erasing the
 * vault when there is no recovery key either. The crypto itself is tested in `crypto.test.ts`;
 * here the point is that the screen asks for the right things before it calls them.
 */

const mocks = vi.hoisted(() => ({
  vault: {} as Record<string, unknown>,
  toast: vi.fn(),
}));

vi.mock("../../hooks/vault", () => ({ useVault: () => mocks.vault }));
vi.mock("../../hooks/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/ui")>()),
  useToast: () => mocks.toast,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECOVERY_KEY = "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789";
const NEW_PASS = "correct horse battery";

let roots: Root[] = [];

beforeEach(() => {
  mocks.toast.mockReset();
  mocks.vault = {
    available: true,
    status: "locked",
    items: [{ id: "a" }, { id: "b" }],
    entries: [],
    gallery: [{ id: "g" }],
    recoveryAvailable: true,
    unlock: vi.fn().mockResolvedValue(undefined),
    resetPassphrase: vi.fn().mockResolvedValue(undefined),
    resetVault: vi.fn().mockResolvedValue(undefined),
    lock: vi.fn(),
  };
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  document.body.innerHTML = "";
});

async function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<MemoryRouter><ModalProvider><Vault /></ModalProvider></MemoryRouter>);
  });
}

const byText = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.trim().includes(text));
const button = (text: string) => byText("button", text) as HTMLButtonElement | undefined;
const input = (placeholder: string) => document.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;

/** React tracks the value itself, so set it through the native setter, then fire an input event. */
async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = (el: HTMLElement) => act(async () => { el.click(); });

describe("locked vault: forgotten passphrase", () => {
  it("offers the recovery key only when this vault has one", async () => {
    await render();
    expect(button("Use your recovery key")).toBeDefined();

    for (const root of roots) act(() => root.unmount());
    roots = [];
    document.body.innerHTML = "";
    mocks.vault.recoveryAvailable = false;
    await render();
    expect(button("Use your recovery key")).toBeUndefined();
    // …but the last-resort reset is always there.
    expect(button("Reset the vault")).toBeDefined();
  });

  it("resets the passphrase from the recovery key, once the new one is valid and confirmed", async () => {
    await render();
    await click(button("Use your recovery key")!);
    expect(document.body.textContent).toContain("Reset your passphrase");

    const submit = button("Set new passphrase and unlock")!;
    await type(input("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"), RECOVERY_KEY);
    await type(input("At least 8 characters"), NEW_PASS);
    expect(submit.disabled).toBe(true); // not confirmed yet

    await type(input("Type it again"), "something else entirely");
    expect(submit.disabled).toBe(true); // mismatch

    await type(input("Type it again"), NEW_PASS);
    expect(submit.disabled).toBe(false);

    await click(submit);
    const reset = mocks.vault.resetPassphrase as ReturnType<typeof vi.fn>;
    expect(reset).toHaveBeenCalledWith(RECOVERY_KEY, NEW_PASS);
    expect(mocks.toast).toHaveBeenCalled();
  });

  it("says so when the recovery key doesn't match this vault", async () => {
    (mocks.vault.resetPassphrase as ReturnType<typeof vi.fn>).mockRejectedValue(new DecryptionError());
    await render();
    await click(button("Use your recovery key")!);
    await type(input("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"), RECOVERY_KEY);
    await type(input("At least 8 characters"), NEW_PASS);
    await type(input("Type it again"), NEW_PASS);
    await click(button("Set new passphrase and unlock")!);

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("doesn't match");
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

describe("locked vault: reset", () => {
  it("warns what will be deleted and only erases once RESET is typed", async () => {
    await render();
    await click(button("Reset the vault")!);

    const text = document.body.textContent ?? "";
    expect(text).toContain("2 items");
    expect(text).toContain("1 image");
    expect(text).toContain("nothing can bring them back");

    const wipe = button("Delete vault and start over")!;
    expect(wipe.disabled).toBe(true);
    await type(input("RESET"), "reset me");
    expect(wipe.disabled).toBe(true);
    await type(input("RESET"), "RESET");
    expect(wipe.disabled).toBe(false);

    await click(wipe);
    expect(mocks.vault.resetVault).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled without deleting anything", async () => {
    await render();
    await click(button("Reset the vault")!);
    await type(input("RESET"), "RESET");
    await click(button("Cancel")!);

    expect(mocks.vault.resetVault).not.toHaveBeenCalled();
    expect(button("Delete vault and start over")).toBeUndefined();
  });

  it("keeps the vault and shows an error when the reset fails", async () => {
    (mocks.vault.resetVault as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    await render();
    await click(button("Reset the vault")!);
    await type(input("RESET"), "RESET");
    await click(button("Delete vault and start over")!);

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Couldn't reset the vault");
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
