interface TranscriptBarProps {
  text: string;
  openQuestions: number;
}

/**
 * Bottom transcript bar — animated wave on the left, the live transcript
 * snippet in the middle, mute + "Answer N questions" CTA on the right.
 *
 * `right-[420px]` keeps the bar clear of the 420px right panel; on small
 * screens we just let the panel overlap (this is a desktop cockpit, not
 * a mobile dashboard).
 */
export default function TranscriptBar({ text, openQuestions }: TranscriptBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-[420px] flex h-[100px] items-center gap-4 border-t border-[rgba(120,170,255,0.12)] bg-[linear-gradient(0deg,rgba(8,14,30,0.92),rgba(8,14,30,0.4))] px-7">
      <div className="flex flex-1 items-center gap-[14px] text-ink">
        <div className="wave flex h-[36px] items-end gap-[3px]">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="text-[12.5px] text-ink-dim">
          Transcribing: <b className="font-medium text-ink">{text}</b>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-[7px] rounded-[8px] border border-[rgba(120,170,255,0.22)] bg-[rgba(20,36,70,0.7)] px-[14px] py-2 text-[12.5px] text-ink"
        >
          <span className="h-2 w-2 rounded-full bg-good shadow-[0_0_6px_var(--good)]" />
          Mute
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-[7px] rounded-[8px] border border-[rgba(110,231,255,0.6)] bg-[linear-gradient(135deg,#1668ff,#2a8cff)] px-[14px] py-2 text-[12.5px] text-ink shadow-[0_4px_16px_rgba(40,120,255,0.4)]"
        >
          <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_8px_#fff]" />
          Answer {openQuestions} questions
        </button>
      </div>
    </div>
  );
}
