import { api, encode } from './api';
import type { Input, Session } from './types';
import { memberName } from './api';
export type Attachment = { name: string; mimeType: string; data: string };
export const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export async function readAttachments(
  files: File[],
  existing: Attachment[],
): Promise<Attachment[]> {
  if (files.length + existing.length > 8) throw new Error('Attach up to 8 files.');
  const added: Attachment[] = [];
  for (const file of files) {
    if (file.size > 1500000) throw new Error('Use files smaller than 1.5 MB.');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
    added.push({ name: file.name, mimeType: file.type || 'application/octet-stream', data });
  }
  const all = [...existing, ...added];
  if (all.reduce((sum, file) => sum + file.data.length, 0) > 3000000)
    throw new Error('Attachments must total less than 3 MB.');
  return all;
}
export function mentionedRecipients(text: string, members: Session['agents']) {
  return members
    .filter((member) => {
      const name = memberName(member).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\s)@${name}(?=$|[\\s,，。.!！?？:：])`, 'iu').test(text);
    })
    .map((member) => member.id);
}
export async function prepareAttachments(
  session: Session,
  attachments: Attachment[],
  recipients: string[],
): Promise<{ images: Input['images']; references: string }> {
  const images = attachments.filter((file) => imageTypes.includes(file.mimeType));
  const files = attachments.filter((file) => !imageTypes.includes(file.mimeType));
  if (!files.length) return { images, references: '' };
  const targets = recipients.length
    ? session.agents.filter((member) => recipients.includes(member.id))
    : session.agents.slice(0, 1);
  const environments = [
    ...new Set(
      targets.map(
        (member) => member.spec.EnvironmentID || String(session.spec.EnvironmentID || ''),
      ),
    ),
  ];
  if (environments.length !== 1 || !environments[0])
    throw new Error('Select bots in one environment to attach files.');
  const environment = environments[0];
  // Upload inside the pinned workspace when it belongs to the selected process environment.
  let directory = '';
  if (session.spec.WorkspaceID && session.spec.EnvironmentID === environment) {
    const { listEnvironments } = await import('./api');
    const record = (await listEnvironments()).find((item) => item.ID === environment);
    const root = record?.Spec.Roots?.[0]?.replace(/\/$/, '');
    const cwd = record?.Workspaces?.find((item) => item.id === session.spec.WorkspaceID)?.cwd;
    if (root && cwd && cwd !== root) {
      if (!cwd.startsWith(root + '/'))
        throw new Error('Workspace attachments must be inside the environment root.');
      directory = cwd.slice(root.length + 1);
    }
  }
  const paths: string[] = [];
  for (const file of files) {
    const result = await api<{ path: string }>(
      `/api/v1/environments/${encode(environment)}/files`,
      {
        method: 'POST',
        body: JSON.stringify({ name: file.name, data: file.data, directory }),
      },
    );
    paths.push(`${file.name}: ${result.path}`);
  }
  return { images, references: '\n\nAttached files (in your environment):\n' + paths.join('\n') };
}
