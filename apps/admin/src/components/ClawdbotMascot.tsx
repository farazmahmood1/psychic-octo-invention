export function ClawdbotMascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Body */}
      <ellipse cx="100" cy="170" rx="70" ry="90" fill="#1E3A5F" />
      <ellipse cx="100" cy="170" rx="60" ry="80" fill="#2A5080" />

      {/* Belly */}
      <ellipse cx="100" cy="190" rx="40" ry="45" fill="#3B7DD8" opacity="0.4" />

      {/* Head */}
      <ellipse cx="100" cy="85" rx="55" ry="50" fill="#1E3A5F" />
      <ellipse cx="100" cy="85" rx="48" ry="44" fill="#2A5080" />

      {/* Eyes */}
      <ellipse cx="78" cy="78" rx="16" ry="18" fill="white" />
      <ellipse cx="122" cy="78" rx="16" ry="18" fill="white" />
      <ellipse cx="82" cy="80" rx="8" ry="9" fill="#0F2942" />
      <ellipse cx="118" cy="80" rx="8" ry="9" fill="#0F2942" />
      {/* Eye shine */}
      <circle cx="85" cy="76" r="3" fill="white" opacity="0.9" />
      <circle cx="121" cy="76" r="3" fill="white" opacity="0.9" />

      {/* Mouth / smile */}
      <path
        d="M80 100 Q100 115 120 100"
        stroke="#3B7DD8"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Antenna */}
      <line x1="100" y1="38" x2="100" y2="18" stroke="#3B7DD8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="14" r="6" fill="#4A9FF5" />
      <circle cx="100" cy="14" r="3" fill="#7BBFFF" />

      {/* Left claw arm */}
      <path
        d="M30 155 Q15 140 20 120"
        stroke="#1E3A5F"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left claw pincer */}
      <path d="M16 120 L10 108 L20 114" fill="#4A9FF5" stroke="#3B7DD8" strokeWidth="2" />
      <path d="M20 120 L26 108 L20 114" fill="#4A9FF5" stroke="#3B7DD8" strokeWidth="2" />

      {/* Right claw arm - waving */}
      <path
        d="M170 155 Q185 130 175 105"
        stroke="#1E3A5F"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right claw pincer */}
      <path d="M171 105 L165 93 L175 99" fill="#4A9FF5" stroke="#3B7DD8" strokeWidth="2" />
      <path d="M175 105 L181 93 L175 99" fill="#4A9FF5" stroke="#3B7DD8" strokeWidth="2" />

      {/* Feet */}
      <ellipse cx="75" cy="258" rx="22" ry="10" fill="#1E3A5F" />
      <ellipse cx="125" cy="258" rx="22" ry="10" fill="#1E3A5F" />
    </svg>
  );
}
