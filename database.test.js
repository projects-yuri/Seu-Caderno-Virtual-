import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState} from '../dist/storage.js';

test('PostgreSQL enforces per-account ownership, notebook limits and optimistic saves', async t => {
 const db = new PGlite(); t.after(() => db.close());
 const sql = await readFile(new URL('../supabase/001_contas_e_cadernos.sql', import.meta.url),'utf8');
 const a = '11111111-1111-4111-8111-111111111111'; const b = '22222222-2222-4222-8222-222222222222';
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 insert into auth.users values ('${a}'), ('${b}');`);
 await db.exec(sql);
 const login = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); };
 const save = (id, doc, rev) => db.query('select * from public.save_notebook_workspace($1,$2::jsonb,$3)', [id,JSON.stringify(doc),rev]);
 const document = initialState();
 await t.test('new account can save its workspace and revisions are server assigned', async () => {
  await login(a); const result = await save(a,document,0); assert.equal(Number(result.rows[0].revision),1);
  assert.equal((await db.query('select * from public.notebook_workspaces')).rows.length,1);
 });
 await t.test('another account cannot read or update the first account', async () => {
  await login(b); assert.equal((await db.query('select * from public.notebook_workspaces')).rows.length,0);
  assert.equal((await db.query('update public.notebook_workspaces set revision=99 where user_id=$1 returning user_id',[a])).rows.length,0);
  await assert.rejects(save(a,document,1), error => error.code === '42501');
  await assert.rejects(db.query('insert into public.notebook_workspaces(user_id,document) values ($1,$2::jsonb)',[a,JSON.stringify(document)]), error => error.code === '42501');
  await save(b,document,0);
 });
 await t.test('stale writes fail without replacing the document', async () => {
  await login(a); const next = structuredClone(document); next.projects[0].title='Edição confirmada';
  assert.equal(Number((await save(a,next,1)).rows[0].revision),2);
  await assert.rejects(save(a,document,1),error=>error.code==='40001');
  await assert.rejects(save(a,document,0),error=>error.code==='40001');
  assert.equal((await db.query('select document from public.notebook_workspaces')).rows[0].document.projects[0].title,'Edição confirmada');
 });
 await t.test('the database rejects excess pages, extra notebooks and orphaned project references', async () => {
  for (const change of [doc=>{doc.notebooks[0].capacity=200;},doc=>{doc.notebooks.push({...doc.notebooks[0],id:'extra'});},doc=>{doc.notebooks[0].projectId='inexistente';},doc=>{doc.notebooks[0].pages['101']={title:'Fora',html:'',updatedAt:new Date().toISOString()};}]) {
   const invalid=structuredClone(document); change(invalid);
   await assert.rejects(save(a,invalid,2),error=>error.code==='23514');
  }
 });
 await t.test('direct updates cannot reset revision or transfer the workspace to another owner', async () => {
  const result = await db.query('update public.notebook_workspaces set revision=1 where user_id=$1 returning revision',[a]);
  assert.equal(Number(result.rows[0].revision),3);
  await assert.rejects(db.query('update public.notebook_workspaces set user_id=$1 where user_id=$2',[b,a]));
 });
 await t.test('anonymous users cannot read workspaces or execute the save function', async () => {
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select * from public.notebook_workspaces'),error=>error.code==='42501');
  await assert.rejects(save(a,document,3),error=>error.code==='42501');
 });
 await t.test('running the schema again preserves existing account data', async () => {
  await db.exec('reset role'); await db.exec(sql);
  assert.equal((await db.query('select * from public.notebook_workspaces')).rows.length,2);
  await login(a); assert.equal(Number((await db.query('select revision from public.notebook_workspaces')).rows[0].revision),3);
 });
});
