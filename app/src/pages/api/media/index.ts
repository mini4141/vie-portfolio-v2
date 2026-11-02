import type { APIRoute } from 'astro';
import { listMedia, saveUpload, MAX_IMAGE_BYTES } from '../../../lib/media.ts';
import { json } from '../../../lib/http.ts';

export const GET: APIRoute = ({ url }) => {
  const k = url.searchParams.get('kind');
  return json(200, { media: listMedia(k === 'image' || k === 'file' ? k : undefined) });
};

export const POST: APIRoute = async ({ request }) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES + 1_000_000) return json(413, { error: 'too_large', message: 'That file is too large.' });
  let form: FormData;
  try { form = await request.formData(); } catch { return json(400, { error: 'invalid', message: 'Send the file as a form upload.' }); }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return json(400, { error: 'invalid', message: 'Choose a file to upload.' });
  const alt = typeof form.get('alt') === 'string' ? String(form.get('alt')) : '';
  const r = await saveUpload(Buffer.from(await file.arrayBuffer()), file.name, alt);
  return r.ok ? json(201, { media: r.value }) : json(r.status, { error: r.error, message: r.message });
};
