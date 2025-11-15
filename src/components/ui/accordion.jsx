// src/components/ui/accordion.jsx
// shadcn-style Accordion wrapper using Radix primitives, adapted for JSX

import * as React from "react";
import PropTypes from "prop-types";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn("border border-[#353e34] rounded-md bg-[#1b151b]", className)}
    {...props}
  />
));

AccordionItem.displayName = "AccordionItem";
AccordionItem.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const AccordionTrigger = React.forwardRef(
  ({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          "flex flex-1 items-center justify-between py-2 px-3 text-sm font-medium transition-all",
          // Default: Cement; Hover: black; Active/Open: white
          "text-[#a89e99] hover:text-[#130013] [&[data-state=open]]:text-white",
          "bg-transparent border-none outline-none",
          className
        )}
        {...props}
      >
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
);

AccordionTrigger.displayName = "AccordionTrigger";
AccordionTrigger.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

const AccordionContent = React.forwardRef(
  ({ className, children, ...props }, ref) => (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        "overflow-hidden text-sm text-[#a89e99]",
        "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
        className
      )}
      {...props}
    >
      <div className="px-3 pb-3 pt-1">{children}</div>
    </AccordionPrimitive.Content>
  )
);

AccordionContent.displayName = "AccordionContent";
AccordionContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
