/** Building blocks for route loading.tsx skeletons — composed per-page
 *  below into a rough shape of that page's real content, rather than one
 *  generic spinner everywhere. */

export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="skeleton skeleton-line" style={{ width }} />;
}

export function SkeletonRow() {
  return (
    <div className="skeleton-stop-row">
      <div className="skeleton skeleton-dot" />
      <div className="skeleton-stop-body">
        <SkeletonLine width="40%" />
        <SkeletonLine width="70%" />
      </div>
    </div>
  );
}

/** One day's worth of stops, in a .card — mirrors JobsTable's own shape. */
export function SkeletonDayCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <SkeletonLine width="35%" />
      <div style={{ marginTop: 14 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonBlock({ height = 80 }: { height?: number }) {
  return <div className="skeleton" style={{ height, borderRadius: "var(--radius)" }} />;
}
