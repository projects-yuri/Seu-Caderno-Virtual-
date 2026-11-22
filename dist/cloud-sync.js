import {STORAGE_KEY, initialState, validateState, newId} from './storage.js';

export const accountCacheKey = userId => `${STORAGE_KEY}:conta:${userId}`;
export function emptyWorkspace() {
 const state = initialState();
 return {...state, projects: [], notebooks: [], activeProjectId: null, lastOpened: null};
}
export function workspaceSignature(state) {
 const document = validateState(state);
 document.lastOpened = null; document.activeProjectId = null;
 const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
 return JSON.stringify(canonical(document));
}
export class WorkspaceSync {
 constructor({api, storage = globalThis.localStorage, onApply = () => {}, onStatus = () => {}, delay = 1000}) {
  Object.assign(this, {api, storage, onApply, onStatus, delay});
  this.epoch = 0; this.writerId = newId(); this.requests = new Set(); this.stop();
 }
 stop() {
  this.epoch++; clearTimeout(this.timer);
  for (const controller of this.requests) controller.abort();
  this.requests.clear(); this.userId = null; this.document = null; this.revision = 0;
  this.pending = false; this.ready = false; this.conflict = null; this.inFlight = null; this.phase = 'local';
 }
 status(phase, message = '') {
  this.phase = phase;
  this.onStatus({phase, message, userId: this.userId, revision: this.revision, pending: this.pending, ready: this.ready, conflict: !!this.conflict});
 }
 current(epoch, userId) { return this.epoch === epoch && this.userId === userId; }
 async request(method, ...args) {
  const controller = new AbortController(); this.requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 15000);
  try { return await this.api[method](...args, controller.signal); }
  finally { clearTimeout(timeout); this.requests.delete(controller); }
 }
 cache() {
  const key = accountCacheKey(this.userId);
  const previousRaw = this.storage.getItem(key);
  const previous = previousRaw ? JSON.parse(previousRaw) : null;
  // Two offline tabs share localStorage. Archive another tab's pending draft
  // before replacing the shared cache, even if neither can reach the server.
  if (previous?.userId === this.userId && previous.pending && previous.writerId !== this.writerId && workspaceSignature(previous.document) !== workspaceSignature(this.document)) {
   const archiveKey = `${key}:rascunhos`;
   const drafts = JSON.parse(this.storage.getItem(archiveKey) || '[]');
   if (!Array.isArray(drafts)) throw new Error('Guarde os rascunhos de recuperação antes de continuar.');
   const draftId = previous.writerId || 'anterior';
   this.storage.setItem(archiveKey, JSON.stringify([...drafts.filter(draft => draft.writerId !== draftId), {writerId: draftId, document: previous.document, revision: previous.revision, savedAt: new Date().toISOString()}]));
  }
  this.storage.setItem(key, JSON.stringify({version: 1, userId: this.userId, writerId: this.writerId, document: this.document, revision: this.revision, pending: this.pending}));
 }
 apply(document) { this.document = validateState(document); this.onApply(structuredClone(this.document)); }
 readCache(userId) {
  const raw = this.storage.getItem(accountCacheKey(userId));
  if (!raw) return null;
  const cache = JSON.parse(raw);
  if (cache.version !== 1 || cache.userId !== userId || !Number.isSafeInteger(cache.revision) || cache.revision < 0 || typeof cache.pending !== 'boolean') throw new Error('O cache desta conta precisa ser recuperado antes de sincronizar.');
  return {...cache, document: validateState(cache.document)};
 }
 validateRow(row) {
  if (!row) return {document: emptyWorkspace(), revision: 0};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('A versão recebida da nuvem é inválida.');
  return {...row, document: validateState(row.document)};
 }
 async start(userId) {
  this.stop(); this.userId = userId;
  const epoch = this.epoch;
  this.status('loading');
  let cache;
  try { cache = this.readCache(userId); }
  catch { this.status('error', 'Não foi possível ler a cópia desta conta. Baixe o arquivo de recuperação antes de continuar.'); return false; }
  if (cache) { this.revision = cache.revision; this.pending = cache.pending; this.apply(cache.document); }
  try {
   const remote = this.validateRow(await this.request('read', userId));
   if (!this.current(epoch, userId)) return false;
   this.ready = true;
   if (cache && ((cache.pending && remote.revision !== cache.revision) || remote.revision < cache.revision)) {
    this.conflict = remote; this.cache(); this.status('conflict'); return false;
   }
   if (cache?.pending) { this.status('pending'); return this.flush(); }
   this.revision = remote.revision; this.pending = false; this.apply(remote.document); this.cache(); this.status('synced');
   return true;
  } catch {
   if (!this.current(epoch, userId)) return false;
   this.ready = !!cache;
   this.status(cache ? 'offline' : 'error', cache ? 'Sua cópia neste aparelho está disponível. A nuvem será tentada novamente.' : 'Não foi possível carregar os dados da conta. Tente novamente antes de editar.');
   return false;
  }
 }
 queue(document) {
  if (!this.userId || !this.ready) throw new Error('Aguarde o carregamento da sua conta.');
  const next = validateState(document);
  const changed = !this.document || workspaceSignature(next) !== workspaceSignature(this.document);
  this.document = next;
  if (changed) this.pending = true;
  this.cache();
  if (this.pending) {
   this.status(this.conflict ? 'conflict' : 'pending');
   clearTimeout(this.timer);
   if (!this.conflict) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  return true;
 }
 async flush() {
  clearTimeout(this.timer);
  if (!this.userId || !this.ready || this.conflict) return false;
  if (this.inFlight) return this.inFlight;
  if (!this.pending) return true;
  const epoch = this.epoch; const userId = this.userId;
  const operation = (async () => {
   while (this.pending && this.current(epoch, userId)) {
    const snapshot = structuredClone(this.document); const signature = workspaceSignature(snapshot);
    this.status('syncing');
    try {
     const saved = await this.request('write', userId, snapshot, this.revision);
     if (!this.current(epoch, userId)) return false;
     if (!Number.isSafeInteger(saved.revision) || saved.revision <= this.revision) throw new Error('Revisão inválida.');
     this.revision = saved.revision;
     this.pending = workspaceSignature(this.document) !== signature;
     this.cache(); this.status(this.pending ? 'pending' : 'synced');
    } catch (error) {
     if (!this.current(epoch, userId)) return false;
     if (error.code === '40001' || String(error.message).includes('WORKSPACE_CONFLICT')) {
      try {
       const remote = this.validateRow(await this.request('read', userId));
       if (!this.current(epoch, userId)) return false;
       this.conflict = remote; this.cache(); this.status('conflict');
      } catch { if (this.current(epoch, userId)) this.status('offline', 'Não foi possível conferir a versão da nuvem. Sua cópia foi preservada.'); }
     } else this.status('offline', 'As alterações estão neste aparelho e ainda precisam chegar à nuvem.');
     return false;
    }
   }
   return this.current(epoch, userId) && !this.pending;
  })();
  this.inFlight = operation;
  try { return await operation; } finally { if (this.current(epoch, userId) && this.inFlight === operation) this.inFlight = null; }
 }
 async refresh() {
  if (!this.userId) return false;
  if (!this.ready) return this.start(this.userId);
  if (this.conflict) return false;
  if (this.pending || this.inFlight) return this.flush();
  const epoch = this.epoch; const userId = this.userId;
  try {
   const remote = this.validateRow(await this.request('read', userId));
   if (!this.current(epoch, userId)) return false;
   // A local edit made while this request was running must never be replaced.
   if (this.pending) { if (remote.revision !== this.revision) { this.conflict = remote; this.status('conflict'); return false; } return this.flush(); }
   if (remote.revision < this.revision) { this.conflict = remote; this.status('conflict'); return false; }
   if (remote.revision > this.revision) { this.revision = remote.revision; this.apply(remote.document); this.cache(); }
   this.status('synced'); return true;
  } catch { if (this.current(epoch, userId)) this.status('offline', 'A nuvem está temporariamente indisponível.'); return false; }
 }
 async resolve(choice) {
  if (!this.conflict || !this.userId) return false;
  const remote = this.conflict;
  // Preserve the replaced version before applying an explicit conflict choice.
  this.storage.setItem(`${accountCacheKey(this.userId)}:recuperacao`, JSON.stringify({document: choice === 'remote' ? this.document : remote.document, savedAt: new Date().toISOString()}));
  if (choice === 'remote') {
   this.revision = remote.revision; this.pending = false; this.conflict = null;
   this.apply(remote.document); this.cache(); this.status('synced'); return this.refresh();
  }
  if (choice !== 'local') throw new Error('Escolha uma versão válida.');
  this.revision = remote.revision; this.conflict = null; this.pending = true; this.cache();
  return this.flush();
 }
 externalChange() {
  // Other tabs are reconciled through the server's revision check, not by
  // replacing a live editor with an unverified localStorage event.
  if (this.userId && !this.inFlight) void this.refresh();
 }
}
