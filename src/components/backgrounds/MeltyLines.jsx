// src/components/backgrounds/MeltyLines.jsx
import { useEffect, useRef, useCallback, useState } from "react";

/**
 * MeltyLines - Animated SVG background with organic bezier curves
 * Uses setInterval + setAttribute pattern with CSS transitions for smooth motion
 * Colors: SecondOrder.fun brand palette
 *
 * Mobile optimizations:
 * - Fewer lines on mobile (3 vs 5)
 * - No blur filter on mobile (expensive on GPU)
 * - Longer update interval on mobile
 * - will-change hint for GPU acceleration
 */
const MeltyLines = () => {
  const svgRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile for performance optimizations
    const checkMobile = () => {
      const mobile =
        window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Brand colors from tailwind.css - fewer on mobile
  const desktopColors = [
    "#c82a54", // Cochineal Red
    "#e25167", // Fabric Red
    "#f9d6de", // Pastel Rose
    "#a89e99", // Cement
    "#c82a54", // Cochineal Red (repeat for more lines)
  ];

  const mobileColors = [
    "#c82a54", // Cochineal Red
    "#e25167", // Fabric Red
    "#a89e99", // Cement
  ];

  const colors = isMobile ? mobileColors : desktopColors;

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
      updatePaths();
      return;
    }

    // Initial path generation
    updatePaths();

    // Longer interval on mobile for better performance (3.5s vs 2.5s)
    const intervalTime = isMobile ? 3500 : 2500;
    const interval = setInterval(updatePaths, intervalTime);

    // Handle window resize (debounced on mobile)
    let resizeTimeout;
    const handleResize = () => {
      if (isMobile) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updatePaths, 200);
      } else {
        updatePaths();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(interval);
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
    };
  }, [updatePaths, isMobile]);

  return (
    <svg
      ref={svgRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{
        zIndex: 0,
        opacity: 0.25,
        willChange: "contents",
        transform: "translateZ(0)", // Force GPU layer
      }}
      aria-hidden="true"
    >
      {!isMobile && (
        <defs>
          <filter id="melty-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}

      {colors.map((color, i) => (
        <path
          key={`${isMobile ? "m" : "d"}-${i}`}
          d={`M 0 ${(i + 1) * 150} L ${
            typeof window !== "undefined" ? window.innerWidth : 1920
          } ${(i + 1) * 150}`}
          stroke={color}
          strokeWidth={isMobile ? 2 : 2 + Math.random()}
          fill="none"
          filter={isMobile ? undefined : "url(#melty-glow)"}
          style={{
            transition: `d ${
              isMobile ? "2.5s" : "1.8s"
            } cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        />
      ))}
    </svg>
  );
};

export default MeltyLines;
