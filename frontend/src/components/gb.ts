// Shared class strings for the GreenBranch UI, built on the --gb-* tokens in globals.css

export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-(--gb-text-3) focus-visible:ring-offset-2 focus-visible:ring-offset-(--gb-bg)";

const buttonBase = `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 ${focusRing}`;

const buttonSizes = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

const buttonTones = {
  primary: "bg-(--gb-btn) text-(--gb-btn-text) hover:bg-(--gb-btn-hover)",
  secondary:
    "border border-(--gb-line) bg-(--gb-card) text-(--gb-text) hover:bg-(--gb-raised)",
  ghost: "text-(--gb-text-2) hover:bg-(--gb-raised) hover:text-(--gb-text)",
};

export function button(
  tone: keyof typeof buttonTones = "primary",
  size: keyof typeof buttonSizes = "md"
) {
  return `${buttonBase} ${buttonSizes[size]} ${buttonTones[tone]}`;
}

export const iconButton = `inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--gb-text-3) transition-colors duration-150 hover:bg-(--gb-raised) hover:text-(--gb-text) [&_svg]:size-4 ${focusRing}`;

export const field =
  "h-9 w-full min-w-0 rounded-[10px] border border-(--gb-line) bg-(--gb-raised) px-3 text-sm text-(--gb-text) placeholder:text-(--gb-text-3) outline-none transition-colors duration-150 focus-visible:border-(--gb-line-strong) focus-visible:ring-2 focus-visible:ring-(--gb-line-strong)";

export const card = "rounded-2xl border border-(--gb-line) bg-(--gb-card)";
