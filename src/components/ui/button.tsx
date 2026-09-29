import * as React from 'react';
import {cva, type VariantProps} from 'class-variance-authority';
import {cn} from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'border border-primary bg-transparent text-primary hover:bg-primary/10',
        outline: 'border border-border bg-transparent hover:bg-muted',
        ghost: 'hover:bg-muted',
        destructive: 'bg-destructive text-white hover:opacity-90',
      },
      size: {
        default: 'min-h-10 px-4 py-2',
        sm: 'min-h-8 px-3 text-xs',
        lg: 'min-h-11 px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: {variant: 'default', size: 'default'},
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({className, variant, size, ...props}: ButtonProps) {
  return <button className={cn(buttonVariants({variant, size}), className)} {...props} />;
}

export {buttonVariants};
