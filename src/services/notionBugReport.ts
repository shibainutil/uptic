const NOTION_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2022-06-28';
const DATABASE_ID = '388c5e96-9f25-80e3-a846-c55945bf4651';

// Set EXPO_PUBLIC_NOTION_TOKEN in your .env or app.config.js
const TOKEN = process.env.EXPO_PUBLIC_NOTION_TOKEN ?? '';

export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface BugReportPayload {
  title: string;
  description: string;
  screen: string;
  severity: BugSeverity;
}

export async function fileBugReport(payload: BugReportPayload): Promise<void> {
  if (!TOKEN) throw new Error('EXPO_PUBLIC_NOTION_TOKEN is not set');

  const body = {
    parent: { database_id: DATABASE_ID },
    properties: {
      Name: { title: [{ text: { content: payload.title } }] },
      Description: { rich_text: [{ text: { content: payload.description } }] },
      Screen: { rich_text: [{ text: { content: payload.screen } }] },
      Status: { select: { name: 'Open' } },
      Severity: { select: { name: payload.severity } },
    },
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
