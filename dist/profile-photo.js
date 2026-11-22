export const PHOTO_BUCKET = 'caderno-profile-photos';
const INPUT_LIMIT = 8 * 1024 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validatePhotoFile(file) {
 if (!file || !PHOTO_TYPES.has(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
 if (!file.size || file.size > INPUT_LIMIT) throw new Error('A imagem deve ter até 8 MB.');
}

// Re-encode pixels, strip metadata and crop to a square before sending to Storage.
export async function prepareProfilePhoto(file) {
 validatePhotoFile(file);
 const source = URL.createObjectURL(file);
 try {
  const image = new Image();
  await new Promise((resolve, reject) => {
   image.onload = resolve;
   image.onerror = () => reject(new Error('Não foi possível abrir essa imagem. Escolha outra foto.'));
   image.src = source;
  });
  const width = image.naturalWidth; const height = image.naturalHeight;
  if (!width || !height || width * height > 40000000) throw new Error('Escolha uma imagem com até 40 megapixels.');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(512, width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a foto neste navegador.');
  const side = Math.min(width, height);
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (!blob || !PHOTO_TYPES.has(blob.type) || blob.size > OUTPUT_LIMIT) throw new Error('Não foi possível preparar a foto. Escolha outra imagem.');
  return blob;
 } finally { URL.revokeObjectURL(source); }
}

// Each account has a fixed private object; no public image URLs or local photo cache.
export class ProfilePhoto {
 constructor({getClient, onChange = () => {}, prepare = prepareProfilePhoto, urls = URL}) {
  Object.assign(this, {getClient, onChange, prepare, urls});
  this.userId = null; this.url = ''; this.busy = false; this.message = ''; this.failed = false;
  this.generation = 0; this.request = 0;
 }
 setUser(userId) {
  if (this.userId === userId) return;
  this.generation++; this.request++;
  this.userId = userId; this.busy = false; this.message = ''; this.failed = false;
  this.replacePhoto(null);
  if (userId) void this.refresh();
 }
 replacePhoto(blob) {
  if (this.url) this.urls.revokeObjectURL(this.url);
  this.url = blob ? this.urls.createObjectURL(blob) : '';
  this.onChange();
 }
 storage() { return this.getClient().storage.from(PHOTO_BUCKET); }
 path(owner = this.userId) { return `${owner}/profile.webp`; }
 async refresh() {
  if (!this.userId || this.busy) return;
  const generation = this.generation; const request = ++this.request; const owner = this.userId;
  try {
   const {data, error} = await this.storage().download(this.path(owner));
   if (generation !== this.generation || request !== this.request) return;
   if (!error && data && PHOTO_TYPES.has(data.type) && data.size <= OUTPUT_LIMIT) this.replacePhoto(data);
   else if (error?.code === 'NoSuchKey' || error?.message === 'Object not found') this.replacePhoto(null);
  } catch { /* Missing bucket or offline photo must never prevent account access. */ }
 }
 async save(file) {
  return this.mutate(async (owner, generation) => {
   const blob = await this.prepare(file);
   if (generation !== this.generation) return null;
   const {error} = await this.storage().upload(this.path(owner), blob, {upsert: true, cacheControl: '0', contentType: blob.type});
   if (error) throw new Error('Não foi possível salvar sua foto na nuvem. Tente novamente em instantes.');
   return blob;
  }, 'Foto salva na sua conta.');
 }
 async remove() {
  return this.mutate(async owner => {
   const {error} = await this.storage().remove([this.path(owner)]);
   if (error) throw new Error('Não foi possível remover a foto. Tente novamente em instantes.');
   return null;
  }, 'Foto removida da sua conta.');
 }
 async mutate(operation, success) {
  if (!this.userId || this.busy) return false;
  const owner = this.userId; const generation = this.generation;
  this.request++; this.busy = true; this.failed = false; this.message = 'Aguarde…'; this.onChange();
  try {
   const blob = await operation(owner, generation);
   if (generation !== this.generation) return false;
   this.message = success; this.replacePhoto(blob); return true;
  } catch (error) {
   if (generation !== this.generation) return false;
   this.failed = true; this.message = error.message || 'Não foi possível alterar a foto. Tente novamente.';
   this.onChange(); return false;
  } finally {
   if (generation === this.generation) { this.busy = false; this.onChange(); }
  }
 }
 dispose() { this.setUser(null); }
}
