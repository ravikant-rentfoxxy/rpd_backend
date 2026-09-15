import multer from 'multer';
import { badRequest } from '../lib/errors.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      cb(badRequest('Use a JPG, PNG or WebP photo'));
      return;
    }
    cb(null, true);
  },
});

const postMedia = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/3gpp',
  'video/mp4',
  'video/quicktime',
  'video/3gpp',
]);

const postDocuments = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const postMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'thumbnail') {
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream') {
        cb(null, true);
        return;
      }
      cb(badRequest('Use a JPG thumbnail'));
      return;
    }
    if (file.fieldname === 'document') {
      if (postDocuments.has(file.mimetype) || file.mimetype === 'application/octet-stream') {
        cb(null, true);
        return;
      }
      cb(badRequest('Use a PDF, Word or photo document'));
      return;
    }
    if (!postMedia.has(file.mimetype) && file.mimetype !== 'application/octet-stream') {
      cb(badRequest('Use a photo, audio or video file'));
      return;
    }
    cb(null, true);
  },
});

export const postMediaFields = postMediaUpload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
  { name: 'document', maxCount: 1 },
]);
