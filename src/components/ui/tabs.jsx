// src/components/ui/tabs.jsx
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import PropTypes from "prop-types";

import { cn } from "@/lib/utils";

const TabsContext = React.createContext({
  activeValue: undefined,
});

const Tabs = React.forwardRef(
  ({ className, value, defaultValue, onValueChange, ...props }, ref) => {
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] =
      React.useState(defaultValue);

    const activeValue = isControlled ? value : uncontrolledValue;

    const handleValueChange = React.useCallback(
      (nextValue) => {
        if (!isControlled) {
          setUncontrolledValue(nextValue);
        }
        onValueChange?.(nextValue);
      },
      [isControlled, onValueChange],
    );

    return (
      <TabsContext.Provider value={{ activeValue }}>
        <TabsPrimitive.Root
          ref={ref}
          value={activeValue}
          defaultValue={defaultValue}
          onValueChange={handleValueChange}
          className={className}
          {...props}
        />
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = TabsPrimitive.Root.displayName;

Tabs.propTypes = {
  className: PropTypes.string,
  value: PropTypes.string,
  defaultValue: PropTypes.string,
  onValueChange: PropTypes.func,
};

const TabsList = React.forwardRef(({ className, children, ...props }, ref) => {
  const { activeValue } = React.useContext(TabsContext);

  const childrenArray = React.Children.toArray(children);
  const orderedTriggerValues = childrenArray
    .filter(
      (child) => React.isValidElement(child) && child.type === TabsTrigger,
    )
    .map((child) => child.props.value);

  const activeIndex =
    typeof activeValue === "string"
      ? orderedTriggerValues.indexOf(activeValue)
      : -1;

  const enhancedChildren = childrenArray.map((child) => {
    if (!React.isValidElement(child) || child.type !== TabsTrigger)
      return child;

    const idx = orderedTriggerValues.indexOf(child.props.value);

    return React.cloneElement(child, {
      __tabIndex: idx,
      __tabCount: orderedTriggerValues.length,
      __activeIndex: activeIndex,
    });
  });

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center text-muted-foreground",
        className,
      )}
      {...props}
    >
      {enhancedChildren}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

TabsList.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const TabsTrigger = React.forwardRef(
  (
    { className, __tabIndex, __tabCount, __activeIndex, value, ...props },
    ref,
  ) => {
    const isActive =
      typeof __activeIndex === "number" && __tabIndex === __activeIndex;

    let roundingClasses = "";

    if (
      typeof __tabIndex === "number" &&
      typeof __tabCount === "number" &&
      __tabIndex >= 0 &&
      __tabCount > 0
    ) {
      if (isActive) {
        roundingClasses =
          "!rounded-tl-md !rounded-tr-md !rounded-bl-md !rounded-br-md";
      } else if (typeof __activeIndex === "number" && __activeIndex >= 0) {
        const hasInactiveLeft =
          __tabIndex > 0 && __tabIndex - 1 !== __activeIndex;
        const hasInactiveRight =
          __tabIndex < __tabCount - 1 && __tabIndex + 1 !== __activeIndex;

        if (hasInactiveLeft && hasInactiveRight) {
          roundingClasses =
            "!rounded-tl-none !rounded-tr-none !rounded-bl-none !rounded-br-none";
        } else if (hasInactiveLeft) {
          roundingClasses =
            "!rounded-tl-none !rounded-tr-md !rounded-bl-none !rounded-br-md";
        } else if (hasInactiveRight) {
          roundingClasses =
            "!rounded-tl-md !rounded-tr-none !rounded-bl-md !rounded-br-none";
        } else {
          roundingClasses =
            "!rounded-tl-md !rounded-tr-md !rounded-bl-md !rounded-br-md";
        }
      }
    }

    const joinOverlapClass =
      typeof __tabIndex === "number" && __tabIndex > 0 ? "-ml-[1px]" : "";

    return (
      <TabsPrimitive.Trigger
        ref={ref}
        value={value}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-[#c82a54] data-[state=active]:underline data-[state=active]:underline-offset-4 data-[state=active]:text-base data-[state=active]:shadow-sm",
          roundingClasses,
          joinOverlapClass,
          className,
        )}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

TabsTrigger.propTypes = {
  className: PropTypes.string,
  value: PropTypes.string,
  __tabIndex: PropTypes.number,
  __tabCount: PropTypes.number,
  __activeIndex: PropTypes.number,
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
