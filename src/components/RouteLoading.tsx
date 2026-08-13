/** Instant feedback shown by a route's loading.tsx while its server data is
 *  still being fetched — replaces the frozen-screen gap navigation used to
 *  leave, without needing a per-page skeleton for every route's layout. */
export function RouteLoading() {
  return (
    <div className="shell">
      <div className="route-loading" aria-live="polite" aria-busy="true">
        <span className="route-loading-spinner" />
      </div>
    </div>
  );
}
