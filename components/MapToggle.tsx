"use client";

type Projection = "mercator" | "globe";

type Props = {
  projection: Projection;
  onChange: (p: Projection) => void;
};

export function MapToggle({ projection, onChange }: Props) {
  return (
    <div className="pointer-events-auto absolute right-4 top-20 z-20 flex overflow-hidden rounded-full border border-zinc-300/80 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/70">
      <ToggleButton active={projection === "mercator"} onClick={() => onChange("mercator")}>
        2D
      </ToggleButton>
      <ToggleButton active={projection === "globe"} onClick={() => onChange("globe")}>
        3D
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[44px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-500 text-white shadow"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}
