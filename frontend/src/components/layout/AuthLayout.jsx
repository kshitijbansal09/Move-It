import React from 'react';

/**
 * Two-column layout for login and signup.
 * Left: Pine-900 brand moment with abstract transit route SVG.
 * Right: Clean form on paper background.
 */
export const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-paper">
      {/* Left Column: Brand & Route Line Graphic */}
      <div className="md:w-5/12 lg:w-4/12 bg-pine-900 text-paper p-8 sm:p-12 flex flex-col justify-between border-b md:border-b-0 md:border-r border-pine-700">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-marigold" />
            <span className="text-xs uppercase tracking-wider text-paper/60 font-medium">
              Transit Authority Portal
            </span>
          </div>
          <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-condensed text-paper leading-tight">
            Move It
          </h1>
          <p className="mt-2 text-sm text-paper/70 font-normal max-w-sm">
            Intelligent campus transit management, dynamic corridor scheduling, and seat allocation for Graphic Era commuters.
          </p>
        </div>

        {/* Abstract Route-Line Graphic (SVG: connected dots over valley topography) */}
        <div className="my-8 md:my-12 py-4">
          <svg
            className="w-full h-44 text-paper/40 overflow-visible"
            viewBox="0 0 320 160"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Abstract Doon Valley transit line"
          >
            {/* Topography Contour Lines */}
            <path
              d="M 10 130 Q 80 110 160 135 T 310 115"
              stroke="#1F4A3D"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <path
              d="M 10 95 Q 90 70 170 100 T 310 80"
              stroke="#1F4A3D"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />

            {/* Connected Route Line */}
            <path
              d="M 30 120 L 95 85 L 170 105 L 245 45 L 290 65"
              stroke="#CBCFC7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Active Corridor Segment */}
            <path
              d="M 95 85 L 170 105 L 245 45"
              stroke="#E8A23B"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Stop Waypoints */}
            <g className="cursor-default">
              {/* Waypoint 1: Prem Nagar */}
              <circle cx="30" cy="120" r="4.5" fill="#16302A" stroke="#CBCFC7" strokeWidth="2" />
              <text x="30" y="140" fill="#CBCFC7" fontSize="10" fontFamily="IBM Plex Sans" textAnchor="middle">
                Prem Nagar
              </text>

              {/* Waypoint 2: Campus */}
              <circle cx="95" cy="85" r="5.5" fill="#E8A23B" stroke="#16302A" strokeWidth="2" />
              <text x="95" y="70" fill="#E8A23B" fontSize="11" fontWeight="600" fontFamily="IBM Plex Sans" textAnchor="middle">
                GEU Campus
              </text>

              {/* Waypoint 3: Clock Tower */}
              <circle cx="170" cy="105" r="5" fill="#E8A23B" stroke="#16302A" strokeWidth="2" />
              <text x="170" y="125" fill="#CBCFC7" fontSize="10" fontFamily="IBM Plex Sans" textAnchor="middle">
                Clock Tower
              </text>

              {/* Waypoint 4: Jolly Grant */}
              <circle cx="245" cy="45" r="5" fill="#E8A23B" stroke="#16302A" strokeWidth="2" />
              <text x="245" y="32" fill="#CBCFC7" fontSize="10" fontFamily="IBM Plex Sans" textAnchor="middle">
                Airport Hub
              </text>

              {/* Waypoint 5: Rishikesh */}
              <circle cx="290" cy="65" r="4.5" fill="#16302A" stroke="#CBCFC7" strokeWidth="2" />
              <text x="290" y="85" fill="#CBCFC7" fontSize="10" fontFamily="IBM Plex Sans" textAnchor="middle">
                Rishikesh
              </text>
            </g>
          </svg>
        </div>

        {/* Utilitarian Footer Note */}
        <div className="text-xs text-paper/50 border-t border-pine-700/60 pt-4">
          <div>Operated for Graphic Era Deemed to be University</div>
          <div className="mt-0.5">Automated WhatsApp alerts active on registered lines</div>
        </div>
      </div>

      {/* Right Column: Form Area */}
      <div className="md:w-7/12 lg:w-8/12 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md">
          {/* Section Header */}
          <div className="mb-6 text-left">
            <h2 className="font-display font-bold text-3xl tracking-condensed text-pine-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-ink-muted">
                {subtitle}
              </p>
            )}
          </div>

          {/* Form Content */}
          <div className="bg-paper-raised p-6 sm:p-8 rounded border border-line-grey">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
