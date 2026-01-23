import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { successResponse, errorResponseFromException } from '../../lib/api/response';
import { ValidationError } from '../../lib/errors/errorHandler';

export const dynamic = 'force-dynamic';

async function ensureDir(dirPath) {
  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) throw new Error('Not a directory');
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      throw new ValidationError('No file uploaded');
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'employees');
    await ensureDir(uploadsDir);

    const ext = path.extname(file.name || '').toLowerCase() || '.png';
    const fileName = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(buffer);
    });

    // Frontend will store this in Employee.photoUrl
    const publicPath = `/uploads/employees/${fileName}`;

    return successResponse({ url: publicPath }, 'File uploaded successfully', 201);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
