// Preloaded into `next start` for screenshots only (via NODE_OPTIONS
// --require). Shifts the server's clock to FAKE_NOW so "this week" shows the
// demo week from Monday, whichever day the capture actually runs. The clock
// keeps ticking from that point. Never used by the real app.
const target = Date.parse(process.env.FAKE_NOW || "");
if (!Number.isNaN(target)) {
  const RealDate = Date;
  const offset = target - RealDate.now();
  const now = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    construct(t, args, newTarget) {
      return args.length ? Reflect.construct(t, args, newTarget) : new RealDate(now());
    },
    apply() {
      return new RealDate(now()).toString();
    },
    get(t, prop, receiver) {
      if (prop === "now") return now;
      return Reflect.get(t, prop, receiver);
    },
  });
}
