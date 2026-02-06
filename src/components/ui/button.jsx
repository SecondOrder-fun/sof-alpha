import React from 'react';
import PropTypes from 'prop-types';
import { cn } from '@/lib/utils';

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const resolvedVariant =
    variant === 'primary'
      ? 'default'
      : variant === 'danger'
        ? 'destructive'
        : variant;
  const Comp = asChild ? 'span' : 'button';
  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background',
        // Primary button: white text on Cochineal Red, Fabric Red on hover, darker red on active
        resolvedVariant === 'default' && 'bg-primary text-white hover:bg-primary/80 active:bg-primary/60',
        resolvedVariant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Outline: White border, transparent background
        resolvedVariant === 'outline' && 'border border-white text-white hover:bg-white/10',
        // Cancel: primary border/text on black, muted hover, inverted active
        resolvedVariant === 'cancel' && 'border border-primary text-primary bg-black hover:bg-muted hover:text-white active:bg-primary active:text-black',
        // Secondary button: Cement background, Asphalt text, primary border,
        // primary hover, darker active
        resolvedVariant === 'secondary' && 'bg-muted-foreground text-muted border border-primary hover:bg-primary/80 active:bg-primary/60',
        resolvedVariant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
        resolvedVariant === 'link' && 'underline-offset-4 hover:underline text-primary',
        (size === 'default' || !size) && 'h-10 py-2 px-4',
        size === 'sm' && 'h-9 px-3 rounded-md',
        size === 'lg' && 'h-11 px-8 rounded-md',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});

Button.displayName = 'Button';

Button.propTypes = {
  className: PropTypes.string,
  variant: PropTypes.oneOf([
    'default',
    'primary',
    'secondary',
    'outline',
    'cancel',
    'ghost',
    'link',
    'destructive',
    'danger',
  ]),
  size: PropTypes.oneOf(['default', 'sm', 'lg']),
  asChild: PropTypes.bool
};

export { Button };