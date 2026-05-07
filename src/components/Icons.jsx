import React from 'react';

/**
 * Custom Premium Icons for Baby Tracker
 * Designed to match Lucide's stroke-based aesthetic (2px stroke, rounded caps)
 */

// Option 2: Modern Soft Diaper (Refined for weight)
export const Diaper = ({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <path d="M5 5c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v2c0 1.1-.9 2-2 2H7a2 2 0 0 1-2-2V5z" />
    <path d="M5 8v1c0 6 4.5 11 11 11" />
    <path d="M19 8v1c0 6-4.5 11-11 11" />
    <line x1="9" y1="3" x2="9" y2="9" />
    <line x1="15" y1="3" x2="15" y2="9" />
  </svg>
);

// Diaper Free / Tummy Time (Scaled up for weight)
export const TummyTime = ({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    {/* Baby Head - Scaled up */}
    <circle cx="6" cy="10" r="5" />
    <path d="M4 9c0-.5.5-1 1-1" /> 
    <path d="M6 5c0-1 .5-1.5 1-1.5" />
    
    {/* Body - Scaled up and adjusted */}
    <path d="M11 11c3 0 6-1.5 9-1.5s3 4 3 6c0 3-3 4-6 4H10" />
    <path d="M10 11v8" /> 
    <path d="M18 14c0 3-1.5 5-3.5 5.5" />

    {/* Leaf - Moved for balance */}
    <path 
      d="M6 22c5 0 10-2.5 14-2.5-5 0-9 1-14 1z" 
      fill={color} 
      stroke="none" 
      style={{ opacity: 0.3 }} 
    />
  </svg>
);

// Spit-up icon (Custom version)
export const SpitUp = ({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <path d="M7 12c1.5 0 3-1 3-3s-1.5-3-3-3-3 1-3 3 1.5 3 3 3z" /> {/* Face hint */}
    <path d="M10 15c2 0 4-2 6-2s4 2 4 4v1H10v-3z" /> {/* Spill/Splash */}
    <circle cx="15" cy="9" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="11" r="1" fill="currentColor" stroke="none" />
  </svg>
);

// Top Feed (Spoon/Bowl/Baby Profile)
export const TopFeed = ({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    {/* Baby Profile */}
    <path d="M15 6c0-1 .5-1.5 1-1.5" /> 
    <path d="M19 10c0-3.3-2.7-6-6-6s-6 2.7-6 6c0 1.5.5 3 1.5 4" /> 
    <path d="M7 10c0 1 .5 2 1 3" /> 
    
    {/* Bowl */}
    <path d="M4 18c0 2.2 1.8 4 4 4h8c2.2 0 4-1.8 4-4" />
    <line x1="3" y1="18" x2="21" y2="18" />

    {/* Spoon */}
    <path d="M2 12l4 2 1 1" />
    <path d="M7 15c1 0 2-.5 2-1.5s-1-1.5-2-1.5-2 .5-2 1.5 1 1.5 2 1.5z" />
    
    {/* Food particles */}
    <circle cx="10" cy="12" r="0.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11" r="0.5" fill="currentColor" stroke="none" />
  </svg>
);

// Breastfeed (Mother & Baby - inspired by User Reference)
export const Breastfeed = ({ size = 24, strokeWidth = 2, color = "currentColor", flip = false, ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ transform: flip ? 'scaleX(-1)' : 'none', ...props.style }}
    {...props}
  >
    {/* Mother's Head/Hair */}
    <path d="M12 4c-1 0-2 .5-2 1.5s1 2.5 1 2.5" />
    <path d="M11 8c-2 0-4 1.5-4 4s1 4 3 5" />
    
    {/* Mother's Shoulder/Arm */}
    <path d="M7 12c-2 0-3 2-3 5s1 4 4 4" />
    
    {/* Baby */}
    <circle cx="15" cy="14" r="3" /> {/* Baby Head */}
    <path d="M15 17c0 2-2 3-4 3" /> {/* Baby Body/Arm */}
    <path d="M12 14h-1" /> {/* Latch point hint */}

    {/* Mother's face profile hint */}
    <path d="M11 8c1 0 2 1 2 2" />
  </svg>
);

// Quick Log Header Icon (Clipboard + Plus - inspired by User Reference)
export const QuickLogIcon = ({ size = 24, strokeWidth = 2, color = "currentColor", ...props }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth={strokeWidth} 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    {/* Clipboard Base */}
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    
    {/* Lines on clipboard */}
    <line x1="8" y1="10" x2="12" y2="10" />
    <line x1="8" y1="14" x2="11" y2="14" />

    {/* Plus sign at bottom right */}
    <circle cx="17" cy="17" r="5" fill="white" stroke="none" /> {/* Backdrop for clarity */}
    <circle cx="17" cy="17" r="5" />
    <line x1="17" y1="15" x2="17" y2="19" />
    <line x1="15" y1="17" x2="19" y2="17" />
  </svg>
);
