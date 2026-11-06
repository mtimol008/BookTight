"use client";

import Image, { type ImageLoader } from "next/image";

/** The widths each screenshot was exported at (scripts/landing-screenshots/export.mjs). */
const EXPORTED_WIDTHS = [780, 1170];

// Maps the width next/image asks for to the smallest pre-exported WebP that
// covers it, capped at the 1170px capture — so nothing is ever upscaled and
// no request goes through the image optimizer. `src` is the file's base
// name, e.g. "/landing/screenshot-add".
const screenshotLoader: ImageLoader = ({ src, width }) => {
  const exported = EXPORTED_WIDTHS.find((w) => w >= width) ?? EXPORTED_WIDTHS[EXPORTED_WIDTHS.length - 1];
  return `${src}-${exported}.webp`;
};

// The phone frame's screen is 280px wide on phones and 300px from 900px up
// (.landing-phone in globals.css, minus its 10px padding each side).
const SIZES = "(min-width: 900px) 300px, 280px";

export function LandingScreenshot({
  name,
  priority = false,
}: {
  name: "screenshot-add" | "screenshot-week";
  /** Above the fold: load straight away instead of lazily. */
  priority?: boolean;
}) {
  return (
    <Image
      loader={screenshotLoader}
      src={`/landing/${name}`}
      alt=""
      width={1170}
      height={2532}
      sizes={SIZES}
      priority={priority}
    />
  );
}
