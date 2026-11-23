import test from 'node:test';
import assert from 'node:assert/strict';
import {FolderWorkspace, FILE_NAME, mergeWorkspaces} from '../dist/folder-storage.js';
import {initialState, makeProject, makeNotebook} from '../dist/storage.js';

function harness() {
 const entries = new Map(); const directories = new Map(); const controls = {permission:'granted', failure:null, pause:null, writes:0};
 const vault = {get:async key=>entries.get(key), put:async(key,value)=>entries.set(key,value), remove:async key=>entries.delete(key), drafts:async owner=>[...entries].filter(([key])=>key.startsWith(`draft:${owner}:`)).map(([,value])=>value)};
 function directory(name) {
  const files = new Map();
  return {name, files, async getFileHandle(filename, {create=false}={}) {
   if (!files.has(filename) && !create) throw new DOMException('missing','NotFoundError');
   // A newly created file is empty, as in the File System Access API.
   if (!files.has(filename)) files.set(filename,'');
   return {getFile:async()=>({text:async()=>files.get(filename)}), createWritable:async()=> {
    if (controls.failure) throw controls.failure;
    let next;
    return {write:async value=>{next=value; if (controls.pause) await controls.pause;}, close:async()=>{files.set(filename,next);controls.writes++;}, abort:async()=>{}};
   }};
  }};
 }
 const root = {name:'Meu caderno', queryPermission:async()=>controls.permission, requestPermission:async()=>controls.permission, getDirectoryHandle:async name=>{if(!directories.has(name)) directories.set(name,directory(name)); return directories.get(name);}};
 const create = (extra={})=>new FolderWorkspace({vault, supported:true, picker:async()=>root, delay:60000, ...extra});
 return {entries, directories, controls, vault, root, create};
}
const edited = (engine, title='Estatística') => { const document = structuredClone(engine.document); document.notebooks[0].pages[1] = {title,html:'<p>P(A) = 0,5</p>',updatedAt:'2026-11-22T20:00:00Z',starred:true}; return document; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function connected(h, owner='visitante', extra={}) { const engine=h.create(extra); await engine.start(owner); assert.equal(await engine.choose(),true); return engine; }

test('a pasta escolhida recebe projetos, capas e anotações e reabre após reiniciar', async()=>{
 const h=harness(); const engine=await connected(h);
 const document=edited(engine); engine.queue(document);
 assert.equal(engine.phase,'pending'); assert.equal(await engine.flush(),true);
 const raw=h.directories.get('visitante').files.get(FILE_NAME);
 assert.deepEqual(JSON.parse(raw),document); assert.equal(engine.phase,'saved');
 const reopened=h.create(); assert.equal(await reopened.start('visitante'),true); assert.deepEqual(reopened.document,document);
 assert.equal((await h.vault.drafts('visitante')).length,0);
});
test('cancelar a seleção não cria arquivos nem altera a pasta anterior', async()=>{
 const h=harness(); const engine=await connected(h); const before=engine.root;
 engine.picker=async()=>{throw new DOMException('cancelled','AbortError');};
 await assert.rejects(engine.choose(),{name:'AbortError'}); assert.equal(engine.root,before); assert.equal(engine.phase,'saved');
});
test('ao voltar a autorização só é solicitada pelo botão de reconectar', async()=>{
 const h=harness(); await connected(h); h.controls.permission='prompt'; const engine=h.create();
 assert.equal(await engine.start(),false); assert.equal(engine.phase,'permission'); assert.equal(engine.ready,false);
 h.controls.permission='granted'; assert.equal(await engine.reconnect(),true);
});
test('falha de disco preserva arquivo anterior e rascunho; tentar novamente salva', async()=>{
 const h=harness(); const engine=await connected(h); const files=h.directories.get('visitante').files; const before=files.get(FILE_NAME);
 h.controls.failure=new DOMException('denied','NotAllowedError'); engine.queue(edited(engine));
 assert.equal(await engine.flush(),false); assert.equal(engine.phase,'error'); assert.equal(engine.pending,true); assert.equal(files.get(FILE_NAME),before);
 assert.equal((await h.vault.drafts('visitante')).length,1);
 h.controls.failure=null; assert.equal(await engine.reconnect(),true); assert.equal(engine.pending,false);
});
test('edições feitas durante gravação são salvas em sequência sem perder a última', async()=>{
 const h=harness(); const engine=await connected(h); let release; h.controls.pause=new Promise(resolve=>release=resolve);
 engine.queue(edited(engine,'primeira')); const saving=engine.flush(); await tick();
 engine.queue(edited(engine,'segunda')); h.controls.pause=null; release();
 assert.equal(await saving,true); assert.equal(JSON.parse(h.directories.get('visitante').files.get(FILE_NAME)).notebooks[0].pages[1].title,'segunda');
});
test('a mesma pasta separa visitante e duas contas e ignora callbacks antigos', async()=>{
 const h=harness(); const applied=[]; const engine=await connected(h,'A',{onApply:doc=>applied.push(doc)});
 engine.queue(edited(engine,'conta A')); await engine.flush(); await engine.start('B'); await engine.choose();
 assert.equal(engine.document.notebooks[0].pages[1],undefined); engine.queue(edited(engine,'conta B')); await engine.flush();
 assert.equal(JSON.parse(h.directories.get('conta-A').files.get(FILE_NAME)).notebooks[0].pages[1].title,'conta A');
 assert.equal(JSON.parse(h.directories.get('conta-B').files.get(FILE_NAME)).notebooks[0].pages[1].title,'conta B');
 await engine.start('A'); assert.equal(engine.document.notebooks[0].pages[1].title,'conta A');
});
test('uma leitura atrasada da conta anterior não aplica dados na seguinte', async()=>{
 const h=harness(); const engine=await connected(h,'A'); let release;
 const get=h.vault.get; h.vault.get=key=>key==='folder:A'?new Promise(resolve=>release=()=>resolve(h.root)):get(key);
 const previous=engine.start('A'); await tick(); await engine.start('B'); release(); await previous;
 assert.equal(engine.owner,'B'); assert.equal(engine.document,null);
});
test('duas abas detectam alteração do arquivo e preservam ambas as versões', async()=>{
 const h=harness(); const first=await connected(h); const second=h.create(); await second.start();
 first.queue(edited(first,'primeira aba')); await first.flush(); second.queue(edited(second,'segunda aba'));
 assert.equal(await second.flush(),false); assert.equal(second.phase,'conflict');
 assert.equal(JSON.parse(h.directories.get('visitante').files.get(FILE_NAME)).notebooks[0].pages[1].title,'primeira aba');
 assert.equal(second.document.notebooks[0].pages[1].title,'segunda aba');
 await second.reload(); assert.equal(second.document.notebooks[0].pages[1].title,'primeira aba'); assert.equal(second.recoveries.length,1);
 assert.equal(await second.import(second.recoveries[0].document,{recoveryKey:second.recoveries[0].key}),true);
 assert.ok(second.document.notebooks.some(book=>book.pages[1]?.title==='segunda aba')); assert.equal(second.recoveries.length,0);
});
test('arquivo corrompido nunca é substituído automaticamente', async()=>{
 const h=harness(); await connected(h); const files=h.directories.get('visitante').files; files.set(FILE_NAME,'{inválido');
 const engine=h.create(); assert.equal(await engine.start(),false); assert.equal(engine.ready,false); assert.equal(files.get(FILE_NAME),'{inválido');
 assert.throws(()=>engine.queue(initialState()));
});
test('importação combina dados, salva backup anterior e mantém cópias em conflitos', async()=>{
 const h=harness(); const engine=await connected(h); const incoming=edited(engine,'importado'); const before=structuredClone(engine.document);
 assert.equal(await engine.import(incoming),true); assert.equal(engine.document.notebooks.length,4);
 assert.deepEqual(engine.document.notebooks.slice(0,3),before.notebooks);
 const backups=[...h.directories.get('visitante').files].filter(([name])=>name.startsWith('backup-antes-importacao'));
 assert.equal(backups.length,1); assert.deepEqual(JSON.parse(backups[0][1]),before);
});
test('importar backup antigo não modifica o objeto de origem nem aceita referência órfã', ()=>{
 const current=initialState(); const incoming=initialState(); const before=structuredClone(incoming);
 incoming.projects.push(makeProject()); incoming.notebooks.push(makeNotebook({projectId:incoming.projects[1].id}));
 const source=structuredClone(incoming); const merged=mergeWorkspaces(current,incoming);
 assert.deepEqual(incoming,source); assert.equal(merged.notebooks.length,4);
 const broken=structuredClone(before); broken.notebooks[0].projectId='inexistente'; assert.throws(()=>mergeWorkspaces(current,broken));
});
test('restauração substitui somente após arquivar e recusa importação se backup falhar', async()=>{
 const h=harness(); const engine=await connected(h); const original=structuredClone(engine.document); const incoming=initialState(); incoming.notebooks=[];
 h.controls.failure=new Error('disco cheio'); await assert.rejects(engine.import(incoming,{replace:true}),/cheio/); assert.deepEqual(engine.document,original);
 h.controls.failure=null; assert.equal(await engine.import(incoming,{replace:true}),true); assert.equal(engine.document.notebooks.length,0);
});
test('rascunho de falha sobrevive a reinício e fica disponível sem sobrescrever o disco', async()=>{
 const h=harness(); const engine=await connected(h); h.controls.failure=new Error('offline'); engine.queue(edited(engine)); await engine.flush();
 const reopened=h.create(); await reopened.start(); assert.equal(reopened.recoveries.length,1); assert.equal(reopened.document.notebooks[0].pages[1],undefined);
 h.controls.failure=null; await reopened.import(reopened.recoveries[0].document,{recoveryKey:reopened.recoveries[0].key}); assert.equal(reopened.recoveries.length,0);
});
test('navegador incompatível não permite edição ou gravação implícita', async()=>{
 const h=harness(); const engine=h.create({supported:false}); assert.equal(await engine.start(),false); assert.equal(engine.phase,'unsupported'); assert.throws(()=>engine.queue(initialState())); assert.equal(h.controls.writes,0);
});
test('falha no IndexedDB permite gravar na pasta e informa que ela deve ser escolhida novamente', async()=>{
 const h=harness(); h.vault.put=async()=>{throw new Error('quota');}; const engine=h.create(); await engine.start(); assert.equal(await engine.choose(),true);
 engine.queue(edited(engine)); assert.equal(await engine.flush(),true); assert.equal(JSON.parse(h.directories.get('visitante').files.get(FILE_NAME)).notebooks[0].pages[1].title,'Estatística');
});

test('importar a mesma versão novamente não duplica projetos ou cópias de cadernos', async()=>{
 const h=harness(); const engine=await connected(h); const incoming=edited(engine,'versão importada');
 await engine.import(incoming); const count=engine.document.notebooks.length; const projects=engine.document.projects.length;
 await engine.import(incoming); assert.equal(engine.document.notebooks.length,count); assert.equal(engine.document.projects.length,projects);
});
test('repetir gravação inicial após falha de permissão não gera conflito com o arquivo vazio criado', async()=>{
 const h=harness(); h.controls.failure=new DOMException('denied','NotAllowedError'); const engine=h.create(); await engine.start();
 assert.equal(await engine.choose(),false); h.controls.failure=null;
 assert.equal(await engine.reconnect(),true); assert.equal(engine.phase,'saved');
});
test('o seletor de pasta aguarda a definição da conta', async()=>{
 const h=harness(); const engine=h.create(); await assert.rejects(engine.choose(),/identificação/); assert.equal(h.directories.size,0);
});
