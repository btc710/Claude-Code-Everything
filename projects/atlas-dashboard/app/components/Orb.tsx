/**
 * Orb — the pulsing center of the cockpit.
 *
 * Pure CSS animation:
 *  - the body bobs (translateY)
 *  - three rings spin around it at different durations & directions
 *  - a small "blip" overlays at the top
 *
 * Sizes match the mockup (230px wrap, orb inset 45px).
 */
export default function Orb({ stateText = 'Listening · scoping · 0:14:32' }: { stateText?: string }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 h-[230px] w-[230px] -translate-x-1/2 -translate-y-1/2">
      <div className="ring animate-spin-slow" />
      <div className="ring r2 animate-spin-mid" />
      <div className="ring r3 animate-spin-slow-long" />
      <div className="orb-body absolute inset-[45px] animate-bob rounded-full" />

      <div className="absolute left-1/2 top-[-22px] flex -translate-x-1/2 items-center gap-[6px] whitespace-nowrap text-[10.5px] uppercase tracking-[2px] text-accent">
        <span className="h-[6px] w-[6px] animate-pulse-orb rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
        {stateText}
      </div>

      <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] uppercase tracking-[3px] text-ink-dim">
        ATLAS · prompt engineering cockpit
      </div>
    </div>
  );
}
