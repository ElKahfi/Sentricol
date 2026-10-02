import type { QueueData } from './inbox-queue'

const DATABASE = 'sentri-protocol-vault'
const STORE = 'vault'
type Envelope = { iv: Uint8Array; ciphertext: ArrayBuffer }
function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = action(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local storage is unavailable.'))
  })
}
export async function accountId(email: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
export async function seal(key: CryptoKey, account: string, data: QueueData): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(account) }, key, new TextEncoder().encode(JSON.stringify(data)))
  return { iv, ciphertext }
}
export async function unseal(key: CryptoKey, account: string, value: Envelope): Promise<QueueData> {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: value.iv as Uint8Array<ArrayBuffer>, additionalData: new TextEncoder().encode(account) }, key, value.ciphertext)
  return JSON.parse(new TextDecoder().decode(bytes))
}
export async function openVault(account: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    let key = await transaction<CryptoKey | undefined>(db, 'readonly', store => store.get(account + ':key'))
    if (!key) {
      key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      await transaction(db, 'readwrite', store => store.put(key, account + ':key'))
    }
    const encryptionKey = key
    return {
      async load(): Promise<QueueData | null> {
        const value = await transaction<Envelope | undefined>(db, 'readonly', store => store.get(account + ':data'))
        return value ? unseal(encryptionKey, account, value) : null
      },
      async save(data: QueueData) {
        const value = await seal(encryptionKey, account, data)
        await transaction(db, 'readwrite', store => store.put(value, account + ':data'))
      },
      async clear() {
        await transaction(db, 'readwrite', store => store.delete(account + ':data'))
      },
      close() { db.close() },
    }
  } catch (error) { db.close(); throw error }
}
