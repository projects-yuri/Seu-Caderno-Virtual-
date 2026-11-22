import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceSync, accountCacheKey, emptyWorkspace} from '../dist/cloud-sync.js';
import {initialState} from '../dist/storage.js';

const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const memory = () => { const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values}; };
function server() {
 const rows = new Map(); let offline = false;
 return {rows, set offline(value) { offline = value; },
  async read(id) { if (offline) throw Error('offline'); return clone(rows.get(id) || null); },
  async write(id, document, revision) {
   if (offline) throw Error('offline');
   if ((rows.get(id)?.revision || 0) !== revision) throw Object.assign(Error('WORKSPACE_CONFLICT'), {code: '40001'});
   const result = {document: clone(document), revision: revision + 1}; rows.set(id, result); return clone(result);
  }
 };
}
const workspace = title => { const document = initialState(); document.projects[0].title = title; return document; };
function sync(t, api, storage = memory(), options = {}) {
 const engine = new WorkspaceSync({api, storage, delay: 60000, ...options});
 t.after(() => engine.stop()); return engine;
}

test('accounts use isolated caches and a new account starts empty', async t => {
 const api = server(); const storage = memory(); const engine = sync(t, api, storage);
 await engine.start('A'); engine.queue(workspace('Faculdade')); await engine.flush();
 await engine.start('B'); assert.deepEqual(engine.document.projects, []);
 engine.queue(workspace('Trabalho')); await engine.flush();
 assert.equal(JSON.parse(storage.getItem(accountCacheKey('A'))).document.projects[0].title, 'Faculdade');
 assert.equal(api.rows.get('B').document.projects[0].title, 'Trabalho');
 await engine.start('A'); assert.equal(engine.document.projects[0].title, 'Faculdade');
});

test('an offline edit survives a reload and is sent after reconnecting', async t => {
 const api = server(); const storage = memory(); const first = sync(t, api, storage);
 await first.start('A'); api.offline = true;
 first.queue(workspace('Sem conexão')); assert.equal(await first.flush(), false);
 assert.equal(first.phase, 'offline'); assert.equal(first.pending, true); first.stop();
 const resumed = sync(t, api, storage); await resumed.start('A');
 assert.equal(resumed.ready, true); assert.equal(resumed.document.projects[0].title, 'Sem conexão');
 api.offline = false; assert.equal(await resumed.refresh(), true);
 assert.equal(resumed.pending, false); assert.equal(api.rows.get('A').revision, 1);
});

test('a failed first cloud load blocks editing without creating an empty cloud workspace', async t => {
 const api = server(); api.offline = true; const engine = sync(t, api);
 assert.equal(await engine.start('A'), false); assert.equal(engine.ready, false);
 assert.throws(() => engine.queue(workspace('Não deve sobrescrever')), /carregamento/);
 assert.equal(api.rows.size, 0);
});

test('two devices preserve both versions on a revision conflict', async t => {
 const api = server(); const a = sync(t, api); const storageB = memory(); const b = sync(t, api, storageB);
 await a.start('A'); await b.start('A');
 a.queue(workspace('Primeiro aparelho')); assert.equal(await a.flush(), true);
 b.queue(workspace('Segundo aparelho')); assert.equal(await b.flush(), false);
 assert.equal(b.phase, 'conflict'); assert.equal(b.document.projects[0].title, 'Segundo aparelho');
 assert.equal(b.conflict.document.projects[0].title, 'Primeiro aparelho');
 assert.equal(await b.resolve('remote'), true);
 assert.equal(b.document.projects[0].title, 'Primeiro aparelho');
 assert.equal(JSON.parse(storageB.getItem(accountCacheKey('A') + ':recuperacao')).document.projects[0].title, 'Segundo aparelho');
});

test('choosing a local conflict version still checks for a newer remote revision', async t => {
 const api = server(); const engine = sync(t, api); await engine.start('A');
 engine.queue(workspace('Meu texto')); await api.write('A', workspace('Outra edição'), 0);
 await engine.flush(); await api.write('A', workspace('Edição ainda mais recente'), 1);
 assert.equal(await engine.resolve('local'), false);
 assert.equal(engine.phase, 'conflict'); assert.equal(engine.document.projects[0].title, 'Meu texto');
 assert.equal(api.rows.get('A').document.projects[0].title, 'Edição ainda mais recente');
});

test('a late response from the previous account cannot apply to the next account', async t => {
 const readA = deferred(); const api = server(); const originalRead = api.read;
 api.read = id => id === 'A' ? readA.promise : originalRead(id);
 const applied = []; const engine = sync(t, api, memory(), {onApply: doc => applied.push(doc)});
 const previous = engine.start('A'); await engine.start('B');
 readA.resolve({document: workspace('Conta anterior'), revision: 1}); await previous;
 assert.equal(engine.userId, 'B'); assert.deepEqual(engine.document.projects, []);
 assert.equal(applied.some(doc => doc.projects[0]?.title === 'Conta anterior'), false);
});

test('an edit during a background read is preserved and checked against the remote revision', async t => {
 const api = server(); await api.write('A', workspace('Inicial'), 0);
 const engine = sync(t, api); await engine.start('A');
 const gate = deferred(); api.read = () => gate.promise;
 const refreshing = engine.refresh(); engine.queue(workspace('Editando agora'));
 gate.resolve({document: workspace('Outro aparelho'), revision: 2}); await refreshing;
 assert.equal(engine.phase, 'conflict'); assert.equal(engine.document.projects[0].title, 'Editando agora');
 assert.equal(engine.conflict.document.projects[0].title, 'Outro aparelho');
});

test('typing while a save is running sends the latest edit after the first acknowledgement', async t => {
 const api = server(); const engine = sync(t, api); await engine.start('A');
 const gate = deferred(); const originalWrite = api.write; let calls = 0;
 api.write = async (...args) => { if (++calls === 1) await gate.promise; return originalWrite(...args); };
 engine.queue(workspace('Primeira edição')); const flushing = engine.flush();
 engine.queue(workspace('Segunda edição')); gate.resolve();
 assert.equal(await flushing, true); assert.equal(calls, 2);
 assert.equal(api.rows.get('A').document.projects[0].title, 'Segunda edição');
 assert.equal(engine.pending, false);
});

test('navigation alone does not upload or create a new cloud revision', async t => {
 const api = server(); const engine = sync(t, api); await engine.start('A');
 const document = emptyWorkspace(); engine.queue(document); assert.equal(engine.pending, false);
 engine.queue(workspace('Aulas')); await engine.flush();
 const moved = clone(engine.document); moved.lastOpened = {notebookId: moved.notebooks[0].id, page: 2};
 engine.queue(moved); await engine.flush(); assert.equal(api.rows.get('A').revision, 1);
});

test('corrupted account cache is preserved and never uploaded over cloud data', async t => {
 const storage = memory(); storage.setItem(accountCacheKey('A'), 'original incompleto');
 const api = server(); const engine = sync(t, api, storage); await engine.start('A');
 assert.equal(engine.ready, false); assert.equal(engine.phase, 'error'); assert.equal(api.rows.size, 0);
 assert.equal(storage.getItem(accountCacheKey('A')), 'original incompleto');
});

test('storage quota errors do not claim a successful local save', async t => {
 const storage = memory(); const engine = sync(t, server(), storage); await engine.start('A');
 storage.setItem = () => { throw Error('QuotaExceededError'); };
 assert.throws(() => engine.queue(workspace('Ainda na memória')), /Quota/);
 assert.equal(engine.pending, true); assert.equal(engine.document.projects[0].title, 'Ainda na memória');
});

test('two offline tabs preserve the other tab pending draft before replacing a shared cache', async t => {
 const api = server(); const storage = memory();
 const first = sync(t, api, storage); const second = sync(t, api, storage);
 await first.start('A'); await second.start('A'); api.offline = true;
 first.queue(workspace('Rascunho da primeira aba'));
 second.queue(workspace('Rascunho da segunda aba'));
 const drafts = JSON.parse(storage.getItem(accountCacheKey('A') + ':rascunhos'));
 assert.equal(drafts[0].document.projects[0].title, 'Rascunho da primeira aba');
 assert.equal(JSON.parse(storage.getItem(accountCacheKey('A'))).document.projects[0].title, 'Rascunho da segunda aba');
 await first.flush(); assert.equal(first.phase, 'offline');
});
