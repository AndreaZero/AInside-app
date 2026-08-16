export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className="mark"
    >
      <path
        d="M16 4.5 6 27h4.2l1.7-4.1h8.2L21.8 27H26L16 4.5Zm.05 7.2 2.85 6.8h-5.7l2.85-6.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
