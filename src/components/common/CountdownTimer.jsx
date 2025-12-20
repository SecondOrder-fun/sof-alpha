// src/components/common/CountdownTimer.jsx
import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import NumberFlow from "@number-flow/react";
import { getCountdownParts } from "@/lib/utils";

/**
 * Animated countdown timer using number-flow
 * @param {number} targetTimestamp - Unix timestamp in seconds
 * @param {string} className - Additional CSS classes
 * @param {boolean} showSeconds - Whether to show seconds (default: true)
 * @param {boolean} compact - Use compact format (default: false)
 * @param {string} endedText - Text to show when countdown ends (default: "Ended")
 * @param {function} onEnd - Callback when countdown reaches zero
 */
const CountdownTimer = ({
  targetTimestamp,
  className = "",
  showSeconds = true,
  compact = false,
  endedText = "Ended",
  onEnd,
}) => {
  const [countdown, setCountdown] = useState(() =>
    getCountdownParts(targetTimestamp)
  );

  useEffect(() => {
    // Update immediately
    setCountdown(getCountdownParts(targetTimestamp));

    // Update every second
    const interval = setInterval(() => {
      const parts = getCountdownParts(targetTimestamp);
      setCountdown(parts);

      if (parts.isEnded && onEnd) {
        onEnd();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetTimestamp, onEnd]);

  if (countdown.isEnded) {
    return <span className={className}>{endedText}</span>;
  }

  const { days, hours, minutes, seconds } = countdown;

  // Compact format: 2d 5h or 5h 30m or 30m 15s
  if (compact) {
    if (days > 0) {
      return (
        <span className={`font-mono ${className}`}>
          <NumberFlow value={days} />d{" "}
          <NumberFlow value={hours} format={{ minimumIntegerDigits: 1 }} />h
        </span>
      );
    }
    if (hours > 0) {
      return (
        <span className={`font-mono ${className}`}>
          <NumberFlow value={hours} />h{" "}
          <NumberFlow value={minutes} format={{ minimumIntegerDigits: 2 }} />m
        </span>
      );
    }
    return (
      <span className={`font-mono ${className}`}>
        <NumberFlow value={minutes} />m{" "}
        {showSeconds && (
          <>
            <NumberFlow value={seconds} format={{ minimumIntegerDigits: 2 }} />s
          </>
        )}
      </span>
    );
  }

  // Full format: 02:05:30:15 or 05:30:15
  if (days > 0) {
    return (
      <span className={`font-mono ${className}`}>
        <NumberFlow value={days} format={{ minimumIntegerDigits: 2 }} />:
        <NumberFlow value={hours} format={{ minimumIntegerDigits: 2 }} />:
        <NumberFlow value={minutes} format={{ minimumIntegerDigits: 2 }} />
        {showSeconds && (
          <>
            :<NumberFlow value={seconds} format={{ minimumIntegerDigits: 2 }} />
          </>
        )}
      </span>
    );
  }

  return (
    <span className={`font-mono ${className}`}>
      <NumberFlow value={hours} format={{ minimumIntegerDigits: 2 }} />:
      <NumberFlow value={minutes} format={{ minimumIntegerDigits: 2 }} />
      {showSeconds && (
        <>
          :<NumberFlow value={seconds} format={{ minimumIntegerDigits: 2 }} />
        </>
      )}
    </span>
  );
};

CountdownTimer.propTypes = {
  targetTimestamp: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  className: PropTypes.string,
  showSeconds: PropTypes.bool,
  compact: PropTypes.bool,
  endedText: PropTypes.string,
  onEnd: PropTypes.func,
};

export default CountdownTimer;
