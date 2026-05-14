import type { MindmapNode, NodeStatus } from '@/lib/demo';

const TAG_STYLES: Record<NodeStatus, string> = {
  confirmed: 'bg-[rgba(93,255,165,0.10)] text-good',
  system:    'bg-[rgba(78,197,255,0.14)] text-accent',
  open:      'bg-[rgba(255,184,107,0.12)] text-accent-warm',
  inferred:  'bg-[rgba(160,170,200,0.10)] text-[#9aa8c5]',
};

const NODE_STYLES: Record<NodeStatus, string> = {
  confirmed: 'border-[rgba(110,231,255,0.55)] shadow-[0_0_22px_rgba(78,197,255,0.32),_0_4px_20px_rgba(0,0,0,0.5)]',
  system:    'border-[rgba(120,170,255,0.32)] shadow-[0_4px_20px_rgba(0,0,0,0.4),_inset_0_1px_0_rgba(255,255,255,0.04)]',
  open:      'border-[rgba(255,184,107,0.45)] shadow-[0_0_18px_rgba(255,184,107,0.20),_0_4px_20px_rgba(0,0,0,0.5)]',
  inferred:  'border-[rgba(120,170,255,0.32)] shadow-[0_4px_20px_rgba(0,0,0,0.4),_inset_0_1px_0_rgba(255,255,255,0.04)]',
};

export default function Mindmap({ nodes }: { nodes: MindmapNode[] }) {
  return (
    <>
      {/* Connector curves — SVG overlays the full stage. preserveAspectRatio
          "none" stretches the 0..100 coord space to the container. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ln" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="rgba(110,231,255,0.55)" />
            <stop offset="100%" stopColor="rgba(110,231,255,0.05)" />
          </linearGradient>
        </defs>
        {/* spokes — orb (50,50) out to each of the 8 nodes */}
        <path d="M50,50 C36,40 26,30 18,24" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C32,50 22,50 18,50" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C36,60 26,72 20,78" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C50,36 50,20 50,13" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C50,66 50,82 50,87" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C66,42 76,30 82,24" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C68,50 78,50 83,50" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        <path d="M50,50 C66,58 76,70 82,78" stroke="url(#ln)" strokeWidth={0.22} fill="none" />
        {/* faint perimeter loops */}
        <path d="M18,24 C32,18 44,12 50,13" stroke="rgba(120,170,255,0.14)" strokeWidth={0.15} fill="none" />
        <path d="M82,24 C70,16 58,12 50,13" stroke="rgba(120,170,255,0.14)" strokeWidth={0.15} fill="none" />
        <path d="M20,78 C32,86 44,88 50,87" stroke="rgba(120,170,255,0.14)" strokeWidth={0.15} fill="none" />
        <path d="M82,78 C70,86 58,88 50,87" stroke="rgba(120,170,255,0.14)" strokeWidth={0.15} fill="none" />
      </svg>

      {nodes.map((n) => (
        <div
          key={n.id}
          className={`absolute min-w-[138px] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border bg-[rgba(20,36,70,0.78)] px-3 py-2 text-left backdrop-blur-[6px] ${NODE_STYLES[n.status]}`}
          style={{ left: `${n.left}%`, top: `${n.top}%` }}
        >
          <div className="flex items-center gap-[7px] text-[12px] font-semibold text-ink">
            {n.title}
          </div>
          <div className="mt-[3px] text-[10.5px] text-ink-dim">
            <span className={`mr-1 inline-block rounded-full px-[7px] py-[1px] text-[10px] ${TAG_STYLES[n.status]}`}>
              {n.tag}
            </span>
            {n.meta}
          </div>
        </div>
      ))}
    </>
  );
}
