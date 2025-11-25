// src/components/backgrounds/MeltyLines.jsx
import { useEffect, useRef, useCallback } from "react";

/**
 * MeltyLines - Animated SVG background with organic bezier curves
 * Uses setInterval + setAttribute pattern with CSS transitions for smooth motion
 * Colors: SecondOrder.fun brand palette
 */
const MeltyLines = () => {
  const svgRef = useRef(null);

  // Brand colors from tailwind.css
  const colors = [
    "#c82a54", // Cochineal Red
    "#e25167", // Fabric Red
    "#f9d6de", // Pastel Rose
    "#a89e99", // Cement
    "#c82a54", // Cochineal Red (repeat for more lines)
  ];

  // Generate random bezier curve path for organic movement
  const generatePath = useCallback((index, total) => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1920;
    const height = typeof window !== "undefined" ? window.innerHeight : 1080;
    const segmentHeight = height / (total + 1);
    const baseY = segmentHeight * (index + 1);

    // Random control points create the "melty" organic feel
    const variance = 80;
    const cp1x = width * 0.25 + (Math.random() - 0.5) * width * 0.2;
    const cp1y = baseY + (Math.random() - 0.5) * variance;
    const cp2x = width * 0.75 + (Math.random() - 0.5) * width * 0.2;
    const cp2y = baseY + (Math.random() - 0.5) * variance;
    const endY = baseY + (Math.random() - 0.5) * variance * 0.5;

    return `M 0 ${baseY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${width} ${endY}`;
  }, []);

  // Update all paths with new random curves
  const updatePaths = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const paths = svg.querySelectorAll("path");
    paths.forEach((path, i) => {
      path.setAttribute("d", generatePath(i, paths.length));
    });
  }, [generatePath]);

  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      // Set initial paths but don&apos;t animate
      updatePaths();
      return;
    }

    // Initial path generation
    updatePaths();

    // Update paths every 2.5 seconds for smooth, hypnotic motion
    const interval = setInterval(updatePaths, 2500);

    // Also update on click for interactivity
    const svg = svgRef.current;
    if (svg) {
      svg.addEventListener("click", updatePaths);
    }

    // Handle window resize
    const handleResize = () => updatePaths();
    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      if (svg) {
        svg.removeEventListener("click", updatePaths);
      }
    };
  }, [updatePaths]);

  return (
    <svg
      ref={svgRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{
        zIndex: 0,
        opacity: 0.25,
        mixBlendMode: "screen",
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Optional glow filter for extra visual effect */}
        <filter id="melty-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {colors.map((color, i) => (
        <path
          key={i}
          d={`M 0 ${(i + 1) * 150} L ${
            typeof window !== "undefined" ? window.innerWidth : 1920
          } ${(i + 1) * 150}`}
          stroke={color}
          strokeWidth={2 + Math.random()}
          fill="none"
          filter="url(#melty-glow)"
          style={{
            transition: "d 1.8s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      ))}
    </svg>
  );
};

export default MeltyLines;
