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
test('the cloud provider rejects a switched session before sending document data', async () => {
 let requests = 0;
 const client = {auth:{getSession:async()=>({data:{session:{user:{id:'B'}}}})},rpc(){ requests++; }};
 await assert.rejects(supabaseWorkspaceApi(client).write('A', {}, 1), /novamente/);
 assert.equal(requests, 0);
});
test('writes carry the expected owner and revision and require server acknowledgement', async () => {
 let sent;
 const client = {auth:{getSession:async()=>({data:{session:{user:{id:'A'}}}})},rpc(name, args){ sent={name,args}; return {abortSignal:async()=>({data:[{revision:8}]})}; }};
 assert.equal((await supabaseWorkspaceApi(client).write('A', {version:2}, 7)).revision, 8);
 assert.deepEqual(sent,{name:'save_notebook_workspace',args:{p_user_id:'A',p_document:{version:2},p_expected_revision:7}});
 client.rpc = () => ({abortSignal:async()=>({data:[]})});
 await assert.rejects(supabaseWorkspaceApi(client).write('A', {}, 8), /confirmou/);
});
