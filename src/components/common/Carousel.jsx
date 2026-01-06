// src/components/common/Carousel.jsx
import PropTypes from "prop-types";
import { useSwipeable } from "react-swipeable";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Carousel - Base reusable carousel component with swipe support
 * @param {Object} props
 * @param {Array} props.items - Array of items to display
 * @param {number} props.currentIndex - Current active item index
 * @param {function} props.onIndexChange - Callback when index changes
 * @param {function} props.renderItem - Function to render each item
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.showArrows - Show navigation arrows (default: true)
 * @param {boolean} props.loop - Enable loop navigation (default: true)
 */
const Carousel = ({
  items = [],
  currentIndex = 0,
  onIndexChange,
  renderItem,
  className = "",
  showArrows = true,
  loop = true,
}) => {
  const handlePrevious = () => {
    if (items.length === 0) return;

    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    } else if (loop) {
      onIndexChange(items.length - 1);
    }
  };

  const handleNext = () => {
    if (items.length === 0) return;

    if (currentIndex < items.length - 1) {
      onIndexChange(currentIndex + 1);
    } else if (loop) {
      onIndexChange(0);
    }
  };

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleNext,
    onSwipedRight: handlePrevious,
    preventScrollOnSwipe: true,
    trackMouse: false, // Only track touch, not mouse drag
  });

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrevious();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    }
  };

  if (items.length === 0) {
    return null;
  }

  const currentItem = items[currentIndex];
  const canGoPrevious = currentIndex > 0 || loop;
  const canGoNext = currentIndex < items.length - 1 || loop;

  return (
    <div
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Carousel"
    >
      <div {...swipeHandlers} className="relative overflow-hidden">
        {/* Content */}
        <div className="transition-opacity duration-300">
          {renderItem(currentItem, currentIndex)}
        </div>
      </div>

      {/* Navigation Arrows */}
      {showArrows && items.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/80 hover:bg-background"
            onClick={handlePrevious}
            disabled={!canGoPrevious}
            aria-label="Previous item"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/80 hover:bg-background"
            onClick={handleNext}
            disabled={!canGoNext}
            aria-label="Next item"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}
    </div>
  );
};

Carousel.propTypes = {
  items: PropTypes.array,
  currentIndex: PropTypes.number,
  onIndexChange: PropTypes.func.isRequired,
  renderItem: PropTypes.func.isRequired,
  className: PropTypes.string,
  showArrows: PropTypes.bool,
  loop: PropTypes.bool,
};

export default Carousel;
