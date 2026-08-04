"use client"

import { useSyncExternalStore } from "react"
import { DEFAULT_CHAT_MODEL, MODEL_ID_RE, shortModelName } from "@/lib/models"

/**
 * The sticky model choice, backed by localStorage and exposed through
 * useSyncExternalStore so SSR hydrates cleanly on the default instead of
 * flashing through a setState-in-effect.
 */

const MODEL_KEY = "miniscira:model"
const MODEL_NAME_KEY = "miniscira:model-name"
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}

function readModel() {
  const saved = window.localStorage.getItem(MODEL_KEY)
  // Loose shape check only — the server router validates picked ids against
  // the live gateway catalog and falls back to the default when unknown.
  return saved && MODEL_ID_RE.test(saved) ? saved : DEFAULT_CHAT_MODEL
}

function readModelName() {
  const id = readModel()
  // The stored display name comes from the gateway catalog at pick time; only
  // trust it while it still belongs to the stored id.
  const name = window.localStorage.getItem(MODEL_NAME_KEY)
  if (name && window.localStorage.getItem(MODEL_KEY) === id) return name
  return shortModelName(id)
}

function pickChatModel(id: string, name?: string) {
  try {
    window.localStorage.setItem(MODEL_KEY, id)
    if (name) window.localStorage.setItem(MODEL_NAME_KEY, name)
    else window.localStorage.removeItem(MODEL_NAME_KEY)
    // Storage can throw (private mode, quota). The pick still applies to this
    // session via the notify below; it just won't be remembered.
  } catch {}
  for (const cb of listeners) cb()
}

export function useChatModel() {
  const chatModel = useSyncExternalStore(
    subscribe,
    readModel,
    () => DEFAULT_CHAT_MODEL
  )
  const chatModelName = useSyncExternalStore(subscribe, readModelName, () =>
    shortModelName(DEFAULT_CHAT_MODEL)
  )
  return { chatModel, chatModelName, pickChatModel }
}
