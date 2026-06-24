import * as FileSystem from 'expo-file-system';

const NOTION_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_FILE_UPLOAD_URL = 'https://api.notion.com/v1/file-uploads';
const NOTION_VERSION = '2022-06-28';
const DATABASE_ID = '388c5e96-9f25-80e3-a846-c55945bf4651';

const TOKEN = process.env.EXPO_PUBLIC_NOTION_TOKEN ?? '';

export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface BugReportPayload {
  title: string;
  description: string;
  screen: string;
  severity: BugSeverity;
  reporter: string;
  capturedUri?: string;
  mediaType?: 'image' | 'video';
}

function pathnameToModule(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] ?? '';
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

async function uploadFileToNotion(uri: string, mediaType: 'image' | 'video'): Promise<string | null> {
  const isImage = mediaType === 'image';
  const filename = isImage ? `screenshot-${Date.now()}.jpg` : `recording-${Date.now()}.mp4`;
  const contentType = isImage ? 'image/jpeg' : 'video/mp4';

  // Step 1: Init the upload — Notion returns a presigned S3 URL
  const initRes = await fetch(NOTION_FILE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({ name: filename, content_type: contentType }),
  });

  if (!initRes.ok) return null;
  const { id, upload_url } = await initRes.json();
  if (!id || !upload_url) return null;

  // Step 2: PUT binary to the presigned URL
  const uploadRes = await FileSystem.uploadAsync(upload_url, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });

  if (uploadRes.status >= 400) return null;
  return id;
}

export async function fileBugReport(payload: BugReportPayload): Promise<void> {
  if (!TOKEN) throw new Error('EXPO_PUBLIC_NOTION_TOKEN is not set');

  // Upload media to Notion first (on submit, not on capture)
  let fileUploadId: string | null = null;
  if (payload.capturedUri && payload.mediaType) {
    try {
      fileUploadId = await uploadFileToNotion(payload.capturedUri, payload.mediaType);
    } catch {
      // Proceed without attachment — report still goes through
    }
  }

  const mediaBlock = fileUploadId && payload.mediaType
    ? [{
        type: payload.mediaType,
        [payload.mediaType]: {
          type: 'file_upload',
          file_upload: { id: fileUploadId },
        },
      }]
    : [];

  const body = {
    parent: { database_id: DATABASE_ID },
    properties: {
      Name: { title: [{ text: { content: payload.title } }] },
      Description: { rich_text: [{ text: { content: payload.description } }] },
      Module: { select: { name: pathnameToModule(payload.screen) } },
      Status: { select: { name: 'New' } },
      Severity: { select: { name: payload.severity } },
      Reporter: { email: payload.reporter || null },
    },
    children: mediaBlock,
  };

  const res = await fetch(NOTION_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error ${res.status}: ${err}`);
  }
}
