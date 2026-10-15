import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

export async function uploadImage(imagePath, pageId, propertyName = 'Bottle', {token = process.env.NOTION_TOKEN, fetchImpl = fetch} = {}) {
  if (!token) throw new Error('Set NOTION_TOKEN');
  if (!/^[a-f0-9-]{32,36}$/i.test(pageId ?? '')) throw new Error('Provide a Notion page ID');
  const types = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.heic':'image/heic'};
  const contentType = types[extname(imagePath).toLowerCase()];
  if (!contentType) throw new Error('Unsupported image format');
  const bytes = await readFile(imagePath);
  const filename = basename(imagePath);
  const headers = {'Authorization':`Bearer ${token}`, 'Notion-Version':'2022-06-28'};
  async function request(path, options) {
    const response = await fetchImpl(`https://api.notion.com/v1${path}`, options);
    if (!response.ok) throw new Error(`Notion request failed (${response.status})`);
    return response.json();
  }
  const created = await request('/file_uploads', {method:'POST', headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({filename,content_type:contentType})});
  const form = new FormData(); form.append('file',new Blob([bytes],{type:contentType}),filename);
  await request(`/file_uploads/${created.id}/send`, {method:'POST',headers,body:form});
  // Fetch existing entries so adding an image does not replace other images.
  const page = await request(`/pages/${pageId}`, {method:'GET',headers});
  const property = page.properties?.[propertyName];
  if (!property || property.type !== 'files') throw new Error('Target property must be a files property');
  const previous = property.files.map(file => {
    if (file.type === 'external') return {name:file.name, type:'external',external:{url:file.external.url}};
    if (file.type === 'file') return {name:file.name,type:'file',file:{url:file.file.url}};
    throw new Error('Unsupported existing attachment type');
  });
  await request(`/pages/${pageId}`, {method:'PATCH', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({properties:{[propertyName]:{files:[...previous,{name:filename,type:'file_upload',file_upload:{id:created.id}}]}}})});
  return {pageId, filename, uploadId:created.id};
}
