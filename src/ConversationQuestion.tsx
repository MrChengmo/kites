import { t } from './i18n';
import { useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import type { Entry } from './events';
import type { Input } from './types';
import { Form } from './ui';
export function Question({
  entry,
  reply,
}: {
  entry: Entry;
  reply: (input: Input) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const questions = entry.payload.questions || [];
  const multiSelect = questions.some(
    (q) => q.input?.multiple || q.input?.multiSelect || q.input?.type === 'array',
  );
  const [submitting, setSubmitting] = useState(false);
  const recorded = questions
    .map((q) => {
      const value = entry.payload.answers?.[q.id]?.value;
      if (value === undefined) return '';
      const label = (v: unknown) => q.options?.find((o) => o.id === String(v))?.label || String(v);
      return Array.isArray(value) ? value.map(label).join(', ') : label(value);
    })
    .filter(Boolean);
  if (!entry.pending)
    return (
      <details className="answered-question">
        <summary>
          <Check size={14} />
          <span>{recorded.length ? recorded.join(' · ') : t('Question resolved')}</span>
        </summary>
        <p>{entry.text}</p>
        {questions.map((q) => (
          <p key={q.id}>{q.prompt}</p>
        ))}
      </details>
    );
  return (
    <section
      id={`question-${entry.id}`}
      className={`conversation-question${multiSelect ? ' multi-select-question' : ''}`}
      aria-label={t('Bot question')}
      aria-busy={submitting}
    >
      <div className="question-kicker">
        <MessageCircle size={14} />
        {t('Your input is needed')}
      </div>
      <h3>{entry.text}</h3>
      {entry.payload.arguments !== undefined && (
        <details className="question-context">
          <summary>{t('Review request details')}</summary>
          <pre>{JSON.stringify(entry.payload.arguments, null, 2)}</pre>
        </details>
      )}
      <Form
        label={t(multiSelect ? 'Submit' : 'Send response')}
        submit={async () => {
          if (!questions.length)
            throw new Error(
              'The provider supplied no answer fields. Reply in the chat or stop the run.',
            );
          for (const q of questions)
            if (
              q.required &&
              !(typeof answers[q.id] === 'string'
                ? (answers[q.id] as string).trim().length
                : answers[q.id]?.length)
            )
              throw new Error(t('Please answer: {question}', { question: q.prompt }));
          setSubmitting(true);
          try {
            await reply({
              kind: 'ask/reply',
              requestId: entry.payload.requestId,
              to: entry.agentId ? [entry.agentId] : undefined,
              answers: Object.fromEntries(
                questions.map((q) => [q.id, { value: answers[q.id] ?? '' }]),
              ),
            });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {questions.map((q) => {
          const multiple = q.input?.multiple || q.input?.multiSelect || q.input?.type === 'array';
          return (
            <fieldset key={q.id} disabled={submitting}>
              <legend>{q.prompt}</legend>
              {multiple && <p className="question-help">{t('Choose all that apply')}</p>}
              {q.options?.length ? (
                <div className="question-options">
                  {q.options.map((o, index) => (
                    <label className="question-option" key={o.id}>
                      <input
                        type={multiple ? 'checkbox' : 'radio'}
                        name={`${entry.id}-${q.id}`}
                        value={o.id}
                        checked={
                          multiple
                            ? Array.isArray(answers[q.id]) && answers[q.id].includes(o.id)
                            : answers[q.id] === o.id
                        }
                        onChange={(e) =>
                          setAnswers((previous) => {
                            const value = previous[q.id];
                            const selected = Array.isArray(value) ? value : [];
                            return {
                              ...previous,
                              [q.id]: multiple
                                ? e.target.checked
                                  ? [...selected, o.id]
                                  : selected.filter((v) => v !== o.id)
                                : o.id,
                            };
                          })
                        }
                      />
                      <span className="question-letter" aria-hidden="true">
                        {index < 26 ? String.fromCharCode(65 + index) : index + 1}
                      </span>
                      <span className="question-option-copy">
                        {o.label}
                        {o.description && <small>{o.description}</small>}
                      </span>
                      <Check className="question-option-check" size={17} aria-hidden="true" />
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  aria-label={q.prompt}
                  required={q.required}
                  rows={2}
                  value={String(answers[q.id] || '')}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
              )}
              {!!q.options?.length && q.input?.allowCustom && (
                <input
                  className="question-custom"
                  aria-label={t('Custom answer: {question}', { question: q.prompt })}
                  placeholder={t('Type your own answer')}
                  value={
                    typeof answers[q.id] === 'string' &&
                    !q.options.some((o) => o.id === answers[q.id])
                      ? String(answers[q.id])
                      : ''
                  }
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                />
              )}
            </fieldset>
          );
        })}
      </Form>
    </section>
  );
}
