"use client";

/** Brief, static, skippable — a plain list, not a multi-step spotlight
 *  wizard. Shown once on first real entry into the app (from AppShell,
 *  wherever tourShown is still false), regardless of which /welcome
 *  choice was made. */
export function NavTour({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="screen-title" style={{ marginBottom: 14 }}>
          Getting around
        </div>
        <div className="stack">
          <p>
            <strong>Week</strong> — your bookings, day by day, in driving
            order.
          </p>
          <p>
            <strong>+</strong> — add a new job from anywhere in the app.
          </p>
          <p>
            <strong>Calendar</strong> — jump to any day, past or future.
          </p>
          <p>
            <strong>Account</strong> — working hours, travel range, and your
            calendar feed.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 18 }}
          onClick={onDismiss}
        >
          Got it, thanks
        </button>
      </div>
    </div>
  );
}
