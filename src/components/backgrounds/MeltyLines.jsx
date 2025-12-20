// src/components/backgrounds/MeltyLines.jsx
import { useEffect, useState } from "react";

/**
 * MeltyLines - Animated background with organic flowing lines
 *
 * MOBILE: Uses pure CSS animations (GPU-accelerated transforms)
 * DESKTOP: Uses CSS animations with optional blur filter
 *
 * Key optimizations:
 * - No JavaScript-driven animations (no setInterval, no path updates)
 * - Pure CSS keyframe animations using transform (GPU-accelerated)
 * - Simpler gradient lines instead of complex bezier paths on mobile
 * - Reduced number of elements on mobile
 */
const MeltyLines = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile =
        window.innerWidth <= 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
      setIsMobile(mobile);
    };
    checkMobile();

    // Only check on resize, no continuous updates
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    // Static version for reduced motion
    return (
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0, opacity: 0.15 }}
        aria-hidden="true"
      >
        <div
          className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#c82a54] to-transparent"
          style={{ top: "25%" }}
        />
        <div
          className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#e25167] to-transparent"
          style={{ top: "50%" }}
        />
        <div
          className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#a89e99] to-transparent"
          style={{ top: "75%" }}
        />
      </div>
    );
  }

  // Mobile: Fewer lines, simpler animation, no filters
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0, opacity: 0.45 }}
        aria-hidden="true"
      >
        <style>
          {`
            @keyframes melt-flow-1 {
              0%, 100% { transform: translateY(0) scaleY(1); }
              50% { transform: translateY(15px) scaleY(1.2); }
            }
            @keyframes melt-flow-2 {
              0%, 100% { transform: translateY(0) scaleY(1); }
              50% { transform: translateY(-12px) scaleY(0.9); }
            }
            @keyframes melt-flow-3 {
              0%, 100% { transform: translateY(0) scaleY(1.1); }
              50% { transform: translateY(10px) scaleY(0.85); }
            }
          `}
        </style>
        <div
          className="absolute w-full h-1.5 bg-gradient-to-r from-transparent via-[#c82a54] to-transparent"
          style={{
            top: "30%",
            animation: "melt-flow-1 8s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          className="absolute w-full h-1.5 bg-gradient-to-r from-transparent via-[#e25167] to-transparent"
          style={{
            top: "55%",
            animation: "melt-flow-2 10s ease-in-out infinite",
            animationDelay: "-3s",
            willChange: "transform",
          }}
        />
        <div
          className="absolute w-full h-1 bg-gradient-to-r from-transparent via-[#d4a5a5] to-transparent"
          style={{
            top: "78%",
            animation: "melt-flow-3 12s ease-in-out infinite",
            animationDelay: "-5s",
            willChange: "transform",
          }}
        />
      </div>
    );
  }

  // Desktop: More lines, blur effect, smoother animations
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0, opacity: 0.25 }}
      aria-hidden="true"
    >
      <style>
        {`
          @keyframes melt-desktop-1 {
            0%, 100% { transform: translateY(0) scaleY(1) rotate(0.5deg); }
            33% { transform: translateY(20px) scaleY(1.3) rotate(-0.3deg); }
            66% { transform: translateY(-10px) scaleY(0.9) rotate(0.2deg); }
          }
          @keyframes melt-desktop-2 {
            0%, 100% { transform: translateY(0) scaleY(1) rotate(-0.3deg); }
            33% { transform: translateY(-15px) scaleY(0.85) rotate(0.4deg); }
            66% { transform: translateY(25px) scaleY(1.2) rotate(-0.2deg); }
          }
          @keyframes melt-desktop-3 {
            0%, 100% { transform: translateY(0) scaleY(1.1) rotate(0.2deg); }
            50% { transform: translateY(18px) scaleY(0.8) rotate(-0.4deg); }
          }
          @keyframes melt-desktop-4 {
            0%, 100% { transform: translateY(0) scaleY(0.9) rotate(-0.2deg); }
            50% { transform: translateY(-20px) scaleY(1.15) rotate(0.3deg); }
          }
          @keyframes melt-desktop-5 {
            0%, 100% { transform: translateY(0) scaleY(1) rotate(0.1deg); }
            33% { transform: translateY(12px) scaleY(1.1) rotate(-0.2deg); }
            66% { transform: translateY(-8px) scaleY(0.95) rotate(0.15deg); }
          }
          .melty-line {
            filter: blur(1px);
            will-change: transform;
          }
        `}
      </style>
      <div
        className="melty-line absolute w-full h-1 bg-gradient-to-r from-transparent via-[#c82a54] to-transparent"
        style={{
          top: "18%",
          animation: "melt-desktop-1 12s ease-in-out infinite",
        }}
      />
      <div
        className="melty-line absolute w-full h-1 bg-gradient-to-r from-transparent via-[#e25167] to-transparent"
        style={{
          top: "35%",
          animation: "melt-desktop-2 15s ease-in-out infinite",
          animationDelay: "-4s",
        }}
      />
      <div
        className="melty-line absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#f9d6de] to-transparent"
        style={{
          top: "52%",
          animation: "melt-desktop-3 10s ease-in-out infinite",
          animationDelay: "-2s",
        }}
      />
      <div
        className="melty-line absolute w-full h-1 bg-gradient-to-r from-transparent via-[#a89e99] to-transparent"
        style={{
          top: "68%",
          animation: "melt-desktop-4 14s ease-in-out infinite",
          animationDelay: "-6s",
        }}
      />
      <div
        className="melty-line absolute w-full h-0.5 bg-gradient-to-r from-transparent via-[#c82a54] to-transparent"
        style={{
          top: "85%",
          animation: "melt-desktop-5 11s ease-in-out infinite",
          animationDelay: "-3s",
        }}
      />
    </div>
  );
};

export default MeltyLines;
