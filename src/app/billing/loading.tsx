import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="shell">
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>
      <SkeletonLine width="25%" />
      <div className="card" style={{ marginTop: 8 }}>
        <SkeletonLine width="55%" />
        <SkeletonLine width="35%" />
        <div style={{ marginTop: 12 }}>
          <SkeletonBlock height={44} />
        </div>
      </div>
    </div>
  );
}
