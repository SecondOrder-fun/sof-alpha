// src/components/infofi/MarketCarousel.jsx
import PropTypes from "prop-types";
import Carousel from "@/components/common/Carousel";

/**
 * MarketCarousel - Navigate between markets with swipe support
 * @param {Object} props
 * @param {Array} props.markets - Array of market objects
 * @param {number} props.currentIndex - Current market index
 * @param {function} props.onIndexChange - Callback when index changes
 * @param {function} props.renderMarket - Function to render market card
 */
const MarketCarousel = ({
  markets = [],
  currentIndex = 0,
  onIndexChange,
  renderMarket,
}) => {
  if (markets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No markets available</p>
        <p className="text-sm mt-2">
          Markets are created automatically when players cross the 1% threshold
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Market Counter */}
      <div className="text-center mb-2 text-sm text-muted-foreground">
        Market {currentIndex + 1} of {markets.length}
      </div>

      <Carousel
        items={markets}
        currentIndex={currentIndex}
        onIndexChange={onIndexChange}
        renderItem={renderMarket}
        className="w-full"
      />
    </div>
  );
};

MarketCarousel.propTypes = {
  markets: PropTypes.array,
  currentIndex: PropTypes.number,
  onIndexChange: PropTypes.func.isRequired,
  renderMarket: PropTypes.func.isRequired,
};

export default MarketCarousel;
