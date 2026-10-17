import clsx from "clsx";

/** Logo Panflight Sensors; a versão escura tem "SENSORS" em branco. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("block", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-panflight.png" alt="Panflight Sensors" width={800} height={161} className="h-auto w-full dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-panflight-dark.png"
        alt="Panflight Sensors"
        width={800}
        height={161}
        className="hidden h-auto w-full dark:block"
      />
    </span>
  );
}
