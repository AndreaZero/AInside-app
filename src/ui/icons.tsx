import type { ReactNode } from "react";

type IconProps = {
  size?: number;
  className?: string;
};

function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 11 12 4.5 19.5 11" />
      <path d="M6.5 9.8V19h11V9.8" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H13l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z" />
    </Svg>
  );
}

export function IconModels(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
      <path d="M12 12 20 8M12 12v8.5M12 12 4 8" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 11l5 5 5-5M5 19.5h14" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v1.6M12 17.9v1.6M4.5 12h1.6M17.9 12h1.6M6.4 6.4l1.1 1.1M16.5 16.5l1.1 1.1M17.6 6.4l-1.1 1.1M7.5 16.5l-1.1 1.1" />
    </Svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12 19 5.5 14 18.5l-2.2-5.2L4.5 12Z" />
    </Svg>
  );
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8.5" y="8.5" width="10" height="10" rx="1.5" />
      <path d="M15.5 8.5V6.8A1.3 1.3 0 0 0 14.2 5.5H6.8A1.3 1.3 0 0 0 5.5 6.8v7.4A1.3 1.3 0 0 0 6.8 15.5H8.5" />
    </Svg>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M19 5.5V9h-3.5" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 3.5 3.5" />
    </Svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m8 10 4 4 4-4" />
    </Svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 7l10 10M17 7 7 17" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5.5 12.5 4 4 9-9" />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 3.8 19h16.4L12 4.5Z" />
      <path d="M12 10v4.5M12 16.8v.3" />
    </Svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8v.3" />
    </Svg>
  );
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8.5h6l1.6 1.8H20A1.5 1.5 0 0 1 21.5 11.8v6.2A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V10A1.5 1.5 0 0 1 4 8.5Z" />
    </Svg>
  );
}

export function IconCpu(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </Svg>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 6.5h15l-5.5 6.2V18l-4 2v-7.3L4.5 6.5Z" />
    </Svg>
  );
}

export function IconGrid3(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="4.5" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="4.5" width="4.2" height="4.2" rx="0.8" />
      <rect x="15.3" y="4.5" width="4.2" height="4.2" rx="0.8" />
      <rect x="4.5" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="15.3" y="9.9" width="4.2" height="4.2" rx="0.8" />
      <rect x="4.5" y="15.3" width="4.2" height="4.2" rx="0.8" />
      <rect x="9.9" y="15.3" width="4.2" height="4.2" rx="0.8" />
      <rect x="15.3" y="15.3" width="4.2" height="4.2" rx="0.8" />
    </Svg>
  );
}

export function IconGrid2(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1" />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1" />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1" />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1" />
    </Svg>
  );
}

export function IconRows(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="5" width="15" height="3.6" rx="1" />
      <rect x="4.5" y="10.2" width="15" height="3.6" rx="1" />
      <rect x="4.5" y="15.4" width="15" height="3.6" rx="1" />
    </Svg>
  );
}

export function IconCode(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m8 8-3.5 4L8 16M16 8l3.5 4L16 16M13 6.5 11 17.5" />
    </Svg>
  );
}

export function IconPen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.2 5.8 18.2 9.8 8 20H4v-4L14.2 5.8Z" />
      <path d="m12.8 7.2 4 4" />
    </Svg>
  );
}

export function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 13.6 9.2 19.5 12 13.6 14.8 12 20.5 10.4 14.8 4.5 12 10.4 9.2 12 3.5Z" />
    </Svg>
  );
}

export function IconFeather(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 5c-5 0-10.5 4.2-12.8 11.2L5 20l3.8-1.2C15.8 16.5 20 11 20 6.2 20 5.5 19.6 5 19 5Z" />
      <path d="M8.2 15.8 16 8" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 7.5h14M9.5 7.5V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4A1.3 1.3 0 0 1 14.5 5.8V7.5M8 7.5l.6 11.2A1.3 1.3 0 0 0 9.9 20h4.2a1.3 1.3 0 0 0 1.3-1.3L16 7.5" />
    </Svg>
  );
}

export function IconArchive(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 7.5h15v3H4.5v-3Z" />
      <path d="M6 10.5v8h12v-8M10 13.5h4" />
    </Svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 12S7 6.5 12 6.5 20.5 12 20.5 12 17 17.5 12 17.5 3.5 12 3.5 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </Svg>
  );
}

export function IconWindow(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 9h17M14.5 9v10" />
    </Svg>
  );
}
