import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tooltipVariants = cva(
  "z-90 overflow-hidden rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 border-0",
  {
    variants: {
      color: {
        secondary: "bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-gray-100 shadow-gray-900/20 dark:shadow-gray-100/10",
        primary: "bg-primary/95 text-primary-foreground shadow-primary/30",
        warning: "bg-warning/95 text-warning-foreground shadow-warning/30",
        info: "bg-info/95 text-info-foreground shadow-info/30",
        success: "bg-success/95 text-success-foreground shadow-success/30",
        destructive:
          "bg-destructive/95 text-destructive-foreground shadow-destructive/30",
      },
    },
    defaultVariants: {
      color: "secondary",
    },
  }
);

const TooltipProvider = React.forwardRef(
  ({ delayDuration = 0, ...props }, ref) => (
    <TooltipPrimitive.Provider
      ref={ref}
      {...props}
      delayDuration={delayDuration}
    />
  )
);
TooltipProvider.displayName = TooltipPrimitive.Provider.displayName;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipArrow = TooltipPrimitive.Arrow;

const TooltipContent = React.forwardRef(
  ({ className, sideOffset = 8, color, children, ...props }, ref) => (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={16}
      className={cn(tooltipVariants({ color }), className)}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  )
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipArrow,
};
