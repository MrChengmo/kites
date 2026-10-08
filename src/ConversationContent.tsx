import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Modal } from './ui';
import { t } from './i18n';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function Markdown({
  children,
  onFile,
}: {
  children: string;
  onFile?: (path: string) => void;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('/') ? (
              onFile ? (
                <button className="message-file-link" onClick={() => onFile(href)}>
                  {children}
                </button>
              ) : (
                <span className="local-file-reference" title={href}>
                  {children}
                </span>
              )
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
export function ContentImages({ content }: { content: unknown }) {
  const [preview, setPreview] = useState<{ source: string; name: string } | null>(null);
  if (!Array.isArray(content)) return null;
  return (
    <div className="content-images">
      {content.flat().map((part, index) => {
        if (
          !part ||
          part.type !== 'image' ||
          !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(part.mimeType)
        )
          return null;
        const source =
          typeof part.data === 'string'
            ? `data:${part.mimeType};base64,${part.data}`
            : typeof part.url === 'string' && /^https?:\/\//.test(part.url)
              ? part.url
              : undefined;
        return source ? (
          <button
            className="content-image-preview"
            key={index}
            onClick={() =>
              setPreview({ source, name: part.name || part.alt || t('Attached image') })
            }
            aria-label={t('Preview {name}', { name: part.name || part.alt || t('Attached image') })}
          >
            <img src={source} alt={part.name || part.alt || t('Attached image')} loading="lazy" />
          </button>
        ) : (
          <span key={index}>{t('Image attachment')}</span>
        );
      })}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)} wide>
          <img className="attachment-full-preview" src={preview.source} alt={preview.name} />
        </Modal>
      )}
    </div>
  );
}

export function UserContent({ text }: { text: string }) {
  const marker = '\n\nAttached files (in your environment):\n';
  const index = text.lastIndexOf(marker);
  const lines = index < 0 ? [] : text.slice(index + marker.length).split('\n');
  const files = lines.map((line) =>
    line.match(/^(.+?): (\/.*\/\.(?:kites|agentway)-uploads\/.*)$/),
  );
  if (!files.length || files.some((file) => !file)) return <Markdown>{text}</Markdown>;
  return (
    <>
      <Markdown>{text.slice(0, index)}</Markdown>
      <div className="message-file-cards">
        {files.map((file, i) => (
          <div className="message-file-card" key={i} title={file![2]}>
            <FileText size={20} />
            <span>
              <strong>{file![1]}</strong>
              <small>{t('Attached file')}</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
