import type { OpenQuestion } from '@/lib/demo';

export default function OpenQuestions({ questions }: { questions: OpenQuestion[] }) {
  return (
    <section className="flex-1 overflow-y-auto border-b border-[rgba(120,170,255,0.10)] px-[18px] py-3">
      <div className="mb-[9px] flex items-center gap-[7px] text-[10.5px] font-semibold uppercase tracking-[1.6px] text-ink-dim">
        Open consultation
        <span className="ml-auto rounded-full bg-[rgba(255,184,107,0.12)] px-[7px] py-[1px] text-[10px] tracking-[0.5px] text-accent-warm">
          {questions.length} questions
        </span>
      </div>
      {questions.map((q) => (
        <div
          key={q.n}
          className="mb-[6px] cursor-pointer rounded-[8px] border border-[rgba(255,184,107,0.18)] bg-[rgba(20,36,70,0.55)] px-[11px] py-2 text-[12px] text-ink transition-colors hover:border-[rgba(255,184,107,0.4)]"
        >
          <span className="mr-[6px] inline-block min-w-[18px] text-[10.5px] font-bold text-accent-warm">
            {q.n}
          </span>
          {q.text}
        </div>
      ))}
    </section>
  );
}
