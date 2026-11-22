import test from 'node:test';
import assert from 'node:assert/strict';
import {ProfilePhoto, PHOTO_BUCKET, validatePhotoFile} from '../dist/profile-photo.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const image = () => new Blob(['photo'], {type: 'image/webp'});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(handlers = {}, prepare = async () => image()) {
 const calls = []; const revoked = []; let serial = 0;
 const api = {
  download: async () => ({error: {message: 'Object not found'}}),
  upload: async () => ({error: null}), remove: async () => ({error: null}), ...handlers
 };
 const photo = new ProfilePhoto({
  getClient: () => ({storage: {from(bucket) { assert.equal(bucket, PHOTO_BUCKET); return Object.fromEntries(Object.entries(api).map(([key, fn]) => [key, (...args) => { calls.push({key, args}); return fn(...args); }])); }}}),
  prepare, urls: {createObjectURL: () => `blob:test-${++serial}`, revokeObjectURL: url => revoked.push(url)}
 });
 return {photo, calls, revoked};
}

test('invalid file types, empty files and excess upload sizes are rejected', () => {
 for (const file of [null, {type:'image/svg+xml',size:20}, {type:'image/jpeg',size:0}, {type:'image/png',size:8*1024*1024+1}]) assert.throws(() => validatePhotoFile(file));
 validatePhotoFile({type:'image/jpeg',size:1000});
});

test('save, replace and remove use only the current account private object', async () => {
 const {photo, calls, revoked} = fixture();
 photo.setUser('account-a'); await tick();
 assert.equal(await photo.save({}), true);
 const first = photo.url;
 assert.equal(await photo.save({}), true); assert.ok(revoked.includes(first));
 const upload = calls.find(call => call.key === 'upload');
 assert.equal(upload.args[0], 'account-a/profile.webp');
 assert.deepEqual(upload.args[2], {upsert:true,cacheControl:'0',contentType:'image/webp'});
 assert.equal(await photo.remove(), true); assert.equal(photo.url, '');
 assert.deepEqual(calls.find(call => call.key === 'remove').args, [['account-a/profile.webp']]);
});

test('logging out immediately clears the photo and ignores a previous account download', async () => {
 const pending = deferred(); const {photo} = fixture({download: () => pending.promise});
 photo.setUser('account-a'); photo.setUser(null);
 pending.resolve({data:image(),error:null}); await tick();
 assert.equal(photo.url,''); assert.equal(photo.userId,null);
 assert.equal(await photo.save({}),false);
});

test('an old download cannot overwrite a new account photo', async () => {
 const pending = deferred();
 const {photo} = fixture({download: path => path.startsWith('account-a') ? pending.promise : Promise.resolve({data:image(),error:null})});
 photo.setUser('account-a'); photo.setUser('account-b'); await tick();
 const current = photo.url; assert.ok(current);
 pending.resolve({data:image(),error:null}); await tick(); assert.equal(photo.url,current);
});

test('switching away and back during conversion cancels the old upload', async () => {
 const pending = deferred(); const {photo,calls} = fixture({}, () => pending.promise);
 photo.setUser('account-a'); await tick();
 const saving = photo.save({}); photo.setUser('account-b'); photo.setUser('account-a');
 pending.resolve(image()); assert.equal(await saving,false);
 assert.equal(calls.filter(call=>call.key==='upload').length,0);
});

test('late uploads cannot display the old account photo in the next account', async () => {
 const pending = deferred(); const {photo} = fixture({upload: () => pending.promise});
 photo.setUser('account-a'); await tick(); const saving = photo.save({}); await tick();
 photo.setUser('account-b'); pending.resolve({error:null}); await saving;
 assert.equal(photo.userId,'account-b'); assert.equal(photo.url,''); assert.equal(photo.busy,false);
});

test('offline refresh preserves current image and upload errors leave it intact', async () => {
 let online = true;
 const {photo} = fixture({download: async () => { if (!online) throw Error('offline'); return {data:image(),error:null}; }, upload: async () => ({error:{message:'unavailable'}})});
 photo.setUser('account-a'); await tick(); const original = photo.url;
 online = false; await photo.refresh(); assert.equal(photo.url,original);
 assert.equal(await photo.save({}),false); assert.equal(photo.url,original); assert.equal(photo.failed,true);
 photo.dispose(); assert.equal(photo.url,'');
});

test('photo failures and a not-yet-configured storage bucket do not reject account changes', async () => {
 const photo = new ProfilePhoto({getClient: () => ({})});
 photo.setUser('account-a'); await photo.refresh();
 assert.equal(photo.url,''); photo.dispose();
});
