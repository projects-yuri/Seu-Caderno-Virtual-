import {initialState, validateState, newId} from './storage.js';

export const FILE_NAME = 'cadernos.json';
export const canonical = value => JSON.stringify(value && typeof value === 'object' ? sort(value) : value);
function sort(value) {
 return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
}
export function mergeWorkspaces(current, incoming) {
 const result = validateState(current); const source = validateState(incoming); const projects = new Map();
 for (const project of source.projects) {
  const existing = result.projects.find(item => canonical({...item, id: ''}) === canonical({...project, id: ''}));
  const copy = {...project};
  if (existing) { projects.set(project.id, existing.id); continue; }
  if (result.projects.some(item => item.id === copy.id)) copy.id = newId();
  result.projects.push(copy); projects.set(project.id, copy.id);
 }
 for (const book of source.notebooks) {
  const copy = {...book, projectId: projects.get(book.projectId)};
  if (result.notebooks.some(item => [copy.title, `${copy.title.slice(0, 52)} (cópia)`].includes(item.title) && canonical({...item, id: '', title: ''}) === canonical({...copy, id: '', title: ''}))) continue;
  if (result.notebooks.some(item => item.id === copy.id)) { copy.id = newId(); copy.title = `${copy.title.slice(0, 52)} (cópia)`; }
  result.notebooks.push(copy);
 }
 return validateState(result);
}

// IndexedDB keeps the directory grant and emergency drafts, never a cloud copy.
export function createFolderVault(indexedDB = globalThis.indexedDB) {
 let database;
 async function db() {
  if (!database) database = new Promise((resolve, reject) => {
   const request = indexedDB.open('seu-caderno-pastas', 1);
   request.onupgradeneeded = () => request.result.createObjectStore('entries');
   request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return database;
 }
 async function run(mode, callback) {
  const database = await db();
  return new Promise((resolve, reject) => {
   const transaction = database.transaction('entries', mode); let result;
   const request = callback(transaction.objectStore('entries'));
   request.onsuccess = () => { result = request.result; };
   transaction.oncomplete = () => resolve(result);
   transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Armazenamento indisponível.'));
  });
 }
 return {
  get: key => run('readonly', store => store.get(key)),
  put: (key, value) => run('readwrite', store => store.put(value, key)),
  remove: key => run('readwrite', store => store.delete(key)),
  drafts: owner => run('readonly', store => store.getAll(globalThis.IDBKeyRange.bound(`draft:${owner}:`, `draft:${owner}:\uffff`)))
 };
}
export function folderError(error) {
 if (error?.name === 'AbortError') return 'Seleção cancelada. Escolha uma pasta para começar.';
 if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Autorize o acesso à pasta para salvar suas alterações.';
 if (error?.name === 'NotFoundError') return 'A pasta foi movida ou removida. Reconecte a pasta original.';
 if (error?.name === 'QuotaExceededError') return 'Não há espaço disponível para salvar. Libere espaço ou baixe um backup.';
 return error?.message || 'Não foi possível salvar na pasta. Baixe um backup antes de fechar.';
}
export class FolderWorkspace {
 constructor({vault = createFolderVault(), picker = options => globalThis.showDirectoryPicker(options), locks = globalThis.navigator?.locks, supported = !!globalThis.showDirectoryPicker && globalThis.isSecureContext, onApply = () => {}, onStatus = () => {}, delay = 350} = {}) {
  Object.assign(this, {vault, picker, locks, supported, onApply, onStatus, delay});
  this.epoch = 0; this.writer = newId(); this.draftWrite = Promise.resolve(); this.reset();
 }
 reset() {
  clearTimeout(this.timer); this.epoch++;
  this.owner = null; this.root = null; this.directory = null; this.document = null; this.raw = null;
  this.pending = false; this.ready = false; this.inFlight = null; this.recoveries = []; this.phase = 'loading'; this.message = '';
 }
 status(phase, message = '') { this.phase = phase; this.message = message; this.onStatus(this); }
 get dirty() { return this.pending || !!this.inFlight; }
 get draftKey() { return `draft:${this.owner}:${this.writer}`; }
 async start(owner = 'visitante') {
  if (!/^[\w-]{1,90}$/.test(owner)) throw new Error('Conta inválida.');
  this.reset(); this.owner = owner; const epoch = this.epoch;
  this.status(this.supported ? 'loading' : 'unsupported');
  if (!this.supported) return false;
  try {
   const [root, drafts] = await Promise.all([this.vault.get(`folder:${owner}`), this.vault.drafts(owner)]);
   if (epoch !== this.epoch) return false;
   this.recoveries = drafts || [];
   if (!root) { this.status('choose'); return false; }
   this.root = root;
   if (await root.queryPermission({mode: 'readwrite'}) !== 'granted') { if (epoch === this.epoch) this.status('permission'); return false; }
   return await this.mount(root, epoch);
  } catch (error) { if (epoch === this.epoch) this.status('error', folderError(error)); return false; }
 }
 async choose() {
  if (!this.owner) throw new Error('Aguarde a identificação da conta antes de escolher uma pasta.');
  if (!this.supported) return false;
  if (this.dirty) throw new Error('Salve as alterações ou baixe um backup antes de trocar de pasta.');
  const epoch = ++this.epoch;
  // Invoke the picker immediately inside the click's user activation.
  const root = await this.picker({id: 'seu-caderno', mode: 'readwrite', startIn: 'documents'});
  if (epoch !== this.epoch) return false;
  this.ready = false; this.status('loading');
  return this.mount(root, epoch);
 }
 async reconnect() {
  const epoch = this.epoch; const root = this.root;
  if (!root) return this.choose();
  // requestPermission also needs the direct click, with no await beforehand.
  const permission = await root.requestPermission({mode: 'readwrite'});
  if (epoch !== this.epoch) return false;
  if (permission !== 'granted') { this.status('permission'); return false; }
  if (this.pending) return this.flush();
  this.ready = false;
  return this.mount(root, epoch);
 }
 async read(directory) {
  try { return await (await directory.getFileHandle(FILE_NAME)).getFile().then(file => file.text()); }
  catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
 }
 async mount(root, epoch) {
  try {
   const directory = await root.getDirectoryHandle(this.owner === 'visitante' ? 'visitante' : `conta-${this.owner}`, {create: true});
   const raw = await this.read(directory);
   const document = raw === null ? initialState() : validateState(JSON.parse(raw));
   if (epoch !== this.epoch) return false;
   this.root = root; this.directory = directory; this.raw = raw; this.document = document; this.ready = true;
   // A failed grant cache must not prevent saving to the chosen directory.
   let remembered = true;
   try { await this.vault.put(`folder:${this.owner}`, root); } catch { remembered = false; }
   if (epoch !== this.epoch) return false;
   this.onApply(structuredClone(document));
   if (raw === null) { this.pending = true; await this.flush(); }
   else this.status('saved');
   if (!remembered) this.status(this.phase, 'A pasta funciona nesta sessão. Selecione-a novamente ao voltar.');
   return this.phase === 'saved';
  } catch (error) {
   if (epoch === this.epoch) { this.ready = false; this.status('error', error instanceof SyntaxError ? 'O arquivo cadernos.json está inválido. Ele foi preservado. Restaure um backup em outra pasta.' : folderError(error)); }
   return false;
  }
 }
 queue(document) {
  if (!this.ready || !this.directory || this.phase === 'conflict') throw new Error('Conecte sua pasta antes de editar.');
  const next = validateState(document);
  if (canonical(next) === canonical(this.document)) return true;
  this.document = next; this.pending = true;
  const key = this.draftKey; const draft = {key, owner: this.owner, document: next, savedAt: new Date().toISOString()};
  // Serialize cache operations so an older edit cannot replace a newer draft.
  this.draftWrite = this.draftWrite.catch(() => {}).then(() => this.vault.put(key, draft));
  this.draftWrite.catch(() => {}); // Disk remains usable if browser storage is full.
  this.status('pending'); clearTimeout(this.timer);
  this.timer = setTimeout(() => void this.flush(), this.delay);
  this.timer.unref?.();
  return true;
 }
 async flush() {
  clearTimeout(this.timer);
  if (this.inFlight) return this.inFlight;
  if (!this.pending) return this.ready;
  if (!this.directory || this.phase === 'conflict') return false;
  const epoch = this.epoch; const directory = this.directory; const owner = this.owner; const root = this.root;
  const operation = (async () => {
   while (this.pending && epoch === this.epoch) {
    const snapshot = structuredClone(this.document); const nextRaw = JSON.stringify(snapshot, null, 2) + '\n'; const expectedRaw = this.raw;
    const key = this.draftKey;
    this.status('saving');
    try {
     await this.draftWrite.catch(() => {});
     const write = async () => {
      if (epoch !== this.epoch) return;
      if (await this.read(directory) !== expectedRaw) { const error = new Error('A pasta foi alterada em outra aba ou programa. Baixe suas alterações e reabra a pasta antes de continuar.'); error.code = 'FOLDER_CONFLICT'; throw error; }
      const file = await directory.getFileHandle(FILE_NAME, {create: true});
      if (expectedRaw === null && epoch === this.epoch) this.raw = '';
      const stream = await file.createWritable();
      try { await stream.write(nextRaw); await stream.close(); }
      catch (error) { try { await stream.abort(); } catch {} throw error; }
     };
     if (this.locks) await this.locks.request(`seu-caderno:${owner}:${root.name}`, write); else await write();
     if (epoch !== this.epoch) return false;
     this.raw = nextRaw;
     this.pending = canonical(this.document) !== canonical(snapshot);
     if (!this.pending) {
      await this.draftWrite.catch(() => {});
      // An edit can arrive while the cache promise is resolving.
      if (canonical(this.document) !== canonical(snapshot)) { this.pending = true; continue; }
      this.draftWrite = this.draftWrite.catch(() => {}).then(() => this.vault.remove(key));
      await this.draftWrite.catch(() => {});
      if (canonical(this.document) !== canonical(snapshot)) { this.pending = true; continue; }
      this.status('saved');
     }
    } catch (error) {
     if (epoch === this.epoch) this.status(error.code === 'FOLDER_CONFLICT' ? 'conflict' : 'error', folderError(error));
     return false;
    }
   }
   return epoch === this.epoch && !this.pending;
  })();
  this.inFlight = operation;
  try { return await operation; } finally { if (this.inFlight === operation) this.inFlight = null; }
 }
 async reload() {
  if (!this.root) return false;
  const epoch = this.epoch;
  const permission = await this.root.requestPermission({mode: 'readwrite'});
  if (epoch !== this.epoch || permission !== 'granted') return false;
  clearTimeout(this.timer);
  await this.draftWrite.catch(() => {});
  if (this.pending) await this.vault.put(this.draftKey, {key: this.draftKey, owner: this.owner, document: this.document, savedAt: new Date().toISOString()});
  this.recoveries = await this.vault.drafts(this.owner);
  if (epoch !== this.epoch) return false;
  this.pending = false; this.ready = false;
  return this.mount(this.root, epoch);
 }
 async archive() {
  if (!this.ready || this.pending) throw new Error('Salve as alterações antes de importar.');
  const handle = await this.directory.getFileHandle(`backup-antes-importacao-${newId()}.json`, {create: true});
  const stream = await handle.createWritable();
  try { await stream.write(JSON.stringify(this.document, null, 2)); await stream.close(); }
  catch (error) { try { await stream.abort(); } catch {} throw error; }
 }
 async import(document, {replace = false, recoveryKey} = {}) {
  if (!await this.flush()) throw new Error('Conecte a pasta e salve antes de importar.');
  const epoch = this.epoch;
  const next = replace ? validateState(document) : mergeWorkspaces(this.document, document);
  await this.archive();
  if (epoch !== this.epoch) return false;
  this.queue(next);
  if (!await this.flush() || epoch !== this.epoch) return false;
  this.onApply(structuredClone(this.document));
  if (recoveryKey) { await this.vault.remove(recoveryKey); this.recoveries = this.recoveries.filter(item => item.key !== recoveryKey); }
  return true;
 }
}
