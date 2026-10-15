import { useCallback, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "./auth";
import { useToast } from "./ui";
import { newId } from "../lib/utils";
import type { Compressed } from "../lib/images";
import type { SnippetImage } from "../lib/types";

/** Live list of a snippet's images (stored as base64 in a sub-collection, loaded only when asked for). */
export function useSnippetImages(snippetId: string | null | undefined) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [images, setImages] = useState<SnippetImage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid || !snippetId) { setImages([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(
      query(collection(db, "users", uid, "snippets", snippetId, "images"), orderBy("created_at")),
      (snap) => { setImages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SnippetImage, "id">) }))); setLoading(false); },
      () => setLoading(false),
    );
  }, [uid, snippetId]);

  return { images, loading };
}

export function useImageActions() {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user?.uid;
  const fail = useCallback((e: unknown) => toast("Image not saved: " + ((e as { code?: string }).code ?? "error"), { kind: "err" }), [toast]);

  const add = useCallback((snippetId: string, img: Compressed, id: string = newId()) => {
    if (!uid) return;
    const row = { data: img.data, w: img.w, h: img.h, size: img.size, created_at: new Date().toISOString() };
    // not awaited: with offline persistence the promise settles only after the server acks
    setDoc(doc(db, "users", uid, "snippets", snippetId, "images", id), row).catch(fail);
  }, [uid, fail]);

  const remove = useCallback((snippetId: string, imageId: string) => {
    if (!uid) return;
    deleteDoc(doc(db, "users", uid, "snippets", snippetId, "images", imageId)).catch(fail);
  }, [uid, fail]);

  return { add, remove };
}
