// src/components/ui/tabs.jsx
// Animated tabs with sliding highlight indicator
// Inspired by animate-ui.com/docs/components/headless/tabs
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import PropTypes from "prop-types";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef(({ className, children, ...props }, ref) => {
  const [indicatorStyle, setIndicatorStyle] = React.useState({ x: 0, width: 0, ready: false });
  const [hoverStyle, setHoverStyle] = React.useState(null);
  const listRef = React.useRef(null);

  // The indicator follows hover position, or falls back to active tab
  const displayStyle = hoverStyle || indicatorStyle;

  // Update active tab position
  const updateActivePosition = React.useCallback(() => {
    if (!listRef.current) return;
    const activeTab = listRef.current.querySelector('[data-state="active"]');
    if (activeTab) {
      const listRect = listRef.current.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      setIndicatorStyle({
        x: tabRect.left - listRect.left,
        width: tabRect.width,
        ready: true,
      });
    }
  }, []);

  // Observe for active state changes
  React.useEffect(() => {
    updateActivePosition();

    const observer = new MutationObserver(updateActivePosition);
    if (listRef.current) {
      observer.observe(listRef.current, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-state'],
      });
    }

    window.addEventListener('resize', updateActivePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateActivePosition);
    };
  }, [updateActivePosition]);

  // Clone children to add hover handlers for sliding indicator
  const enhancedChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;

    return React.cloneElement(child, {
      onMouseEnter: (e) => {
        const listRect = listRef.current?.getBoundingClientRect();
        const tabRect = e.currentTarget.getBoundingClientRect();
        if (listRect) {
          setHoverStyle({
            x: tabRect.left - listRect.left,
            width: tabRect.width,
          });
        }
        child.props.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        setHoverStyle(null);
        child.props.onMouseLeave?.(e);
      },
    });
  });

  return (
    <TabsPrimitive.List
      ref={(el) => {
        listRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      className={cn(
        "group relative inline-flex items-center rounded-full border border-primary",
        className,
      )}
      {...props}
    >
      {/* Sliding indicator - same cochineal red, slides on hover */}
      <span
        className={cn(
          "absolute left-0 rounded-full bg-primary",
          !displayStyle.ready && !hoverStyle && "opacity-0"
        )}
        style={{
          transform: `translateX(${displayStyle.x}px)`,
          width: displayStyle.width,
          height: `calc(100% - 2px)`,
          top: 1,
          transition: 'transform 300ms ease-out, width 300ms ease-out',
        }}
      />
      {enhancedChildren}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

TabsList.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base styles - z-10 to be above indicator
      "relative z-10 inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      // Inactive: transparent bg, primary text, underlined
      "bg-transparent hover:bg-transparent text-primary hover:text-white underline underline-offset-4",
      // Active: white text when indicator is behind it, no underline
      "data-[state=active]:text-white data-[state=active]:no-underline data-[state=active]:bg-transparent",
      // When hovering elsewhere in group: active tab text goes pink (indicator moved away)
      "group-hover:data-[state=active]:text-primary",
      // But when hovering the active tab itself: keep white text (indicator is still there)
      "data-[state=active]:hover:!text-white",
      // Override any Radix highlight state
      "data-[highlighted]:bg-transparent",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

TabsTrigger.propTypes = {
  className: PropTypes.string,
};

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

TabsContent.propTypes = {
  className: PropTypes.string,
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
