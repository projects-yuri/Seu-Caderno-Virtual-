import test from 'node:test';
import assert from 'node:assert/strict';
import {publicConfiguration} from '../scripts/public-config.mjs';
import {supabaseWorkspaceApi} from '../dist/cloud-provider.js';
const env = {SUPABASE_URL:'https://exemplo.supabase.co', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_exemplo'};
const jwt = role => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;

test('an unconfigured build keeps local mode and serializes no unrelated secrets', () => {
 assert.deepEqual(publicConfiguration({SMTP_PASSWORD:'privado'}), {enabled:false, supabaseUrl:'', supabasePublishableKey:''});
 assert.deepEqual(publicConfiguration({...env, SUPABASE_SERVICE_ROLE_KEY:'privado'}), {enabled:true, supabaseUrl:env.SUPABASE_URL, supabasePublishableKey:env.SUPABASE_PUBLISHABLE_KEY});
});
test('partial configuration, unsafe URLs, and administrative keys fail the build', () => {
 for (const bad of [{SUPABASE_URL:env.SUPABASE_URL}, {...env,SUPABASE_URL:'http://exemplo.supabase.co'}, {...env,SUPABASE_URL:'https://user:pass@exemplo.supabase.co'}, {...env,SUPABASE_URL:'https://exemplo.supabase.co/rest/v1'}, {...env,SUPABASE_PUBLISHABLE_KEY:'sb_secret_privado'}, {...env,SUPABASE_PUBLISHABLE_KEY:jwt('service_role')}]) assert.throws(() => publicConfiguration(bad));
 assert.equal(publicConfiguration({...env, SUPABASE_PUBLISHABLE_KEY:jwt('anon')}).enabled, true);
});
test('cloud imports reject a switched session before reading data', async () => {
 let requests = 0;
 const client = {auth:{getSession:async()=>({data:{session:{user:{id:'B'}}}})},from(){ requests++; }};
 await assert.rejects(supabaseWorkspaceApi(client).read('A'), /novamente/);
 assert.equal(requests, 0);
});
test('cloud migration only reads the current account and exposes no write API', async () => {
 const calls = [];
 const chain = {select(value){calls.push(value);return this;},eq(key,value){calls.push([key,value]);return this;},abortSignal(){return this;},maybeSingle:async()=>({data:{document:{version:2},revision:7}})};
 const client = {auth:{getSession:async()=>({data:{session:{user:{id:'A'}}}})},from(name){calls.push(name);return chain;}};
 const api = supabaseWorkspaceApi(client);
 assert.equal((await api.read('A')).revision,7);
 assert.deepEqual(calls,['notebook_workspaces','document,revision,updated_at',['user_id','A']]);
 assert.equal(api.write,undefined);
});
